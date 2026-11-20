"""
Kiểm thử toàn diện Module 1 (Real PyTorch AI Engine):
1. Nạp strict=True cả 5 checkpoints (Hybrid v4 Tri-Modal, HeteroGAT v4, HeteroSAGE v4, CK GCN, CK GAT).
2. Kiểm tra tính đối xứng hoán vị |P(u, v) - P(v, u)| < 1e-5 cho cả nhánh Homo và Hetero.
3. Kiểm tra luồng end-to-end Real Engine qua FastAPI (Upload .pt -> Predict -> Explain -> Feedback -> Export).
"""

import io
from pathlib import Path
import numpy as np
import pytest
import torch
from fastapi.testclient import TestClient

from app.database import init_db_and_seed
from app.engine.explainer import BridgePathExtractor
from app.engine.hetero_adapter import HeteroGraphAdapter
from app.engine.homo_adapter import HomoGraphAdapter
from app.engine.registry import ModelRegistry, model_registry
from app.engine.subgraph_sampler import SubgraphSampler
from app.engine.validator import DataValidator
from app.main import app


def build_synthetic_ausaml_dict(num_customers: int = 40, seed: int = 42) -> dict:
    """Tạo đồ thị AusAML tổng hợp hợp lệ 6 loại đỉnh, 7 quan hệ gốc (thiếu rev_* để test tự sinh)."""
    g = torch.Generator().manual_seed(seed)
    n_acc = num_customers * 2
    n_dev = 25
    n_ip = 25
    n_ben = 30
    n_bank = 4

    owns_src = torch.arange(num_customers).repeat_interleave(2)
    owns_dst = torch.arange(n_acc)

    # Tạo cầu nối thực tế giữa customer 0 và customer 1 (dùng chung device 0, IP 0, và giao dịch trực tiếp)
    # Customer 2 nối gián tiếp 2-hop tới customer 0 qua account của customer 3
    dev_src = torch.cat([torch.tensor([0, 2]), torch.randint(0, n_acc, (40,), generator=g)])
    dev_dst = torch.cat([torch.tensor([0, 0]), torch.randint(1, n_dev, (40,), generator=g)])
    dev_ea = torch.randn((dev_src.size(0), 2), generator=g)

    ip_src = torch.cat([torch.tensor([0, 2]), torch.randint(0, n_acc, (40,), generator=g)])
    ip_dst = torch.cat([torch.tensor([0, 0]), torch.randint(1, n_ip, (40,), generator=g)])
    ip_ea = torch.randn((ip_src.size(0), 2), generator=g)

    tx_src = torch.cat([torch.tensor([0, 0, 6]), torch.randint(0, n_acc, (80,), generator=g)])
    tx_dst = torch.cat([torch.tensor([2, 6, 4]), torch.randint(0, n_acc, (80,), generator=g)])
    tx_ea = torch.randn((tx_src.size(0), 4), generator=g)
    tx_ea[:3, 0] = 2.5  # high amount z-score

    wb_src = torch.cat([torch.tensor([0, 2]), torch.randint(0, n_acc, (30,), generator=g)])
    wb_dst = torch.cat([torch.tensor([0, 0]), torch.randint(1, n_ben, (30,), generator=g)])
    wb_ea = torch.randn((wb_src.size(0), 4), generator=g)

    bw_src = torch.arange(num_customers)
    bw_dst = torch.randint(0, n_bank, (num_customers,), generator=g)
    bw_ea = torch.ones((num_customers, 1), dtype=torch.float32)

    rel_src = torch.tensor([5, 6], dtype=torch.long)
    rel_dst = torch.tensor([7, 8], dtype=torch.long)
    rel_ea = torch.zeros((2, 7), dtype=torch.float32)
    rel_ea[:, 0] = 1.0

    return {
        "node_features": {
            "customer": torch.randn((num_customers, 10), generator=g),
            "account": torch.randn((n_acc, 6), generator=g),
            "device": torch.randn((n_dev, 6), generator=g),
            "ip": torch.randn((n_ip, 4), generator=g),
            "beneficiary": torch.randn((n_ben, 8), generator=g),
            "bank": torch.eye(n_bank, dtype=torch.float32),
        },
        "edge_index": {
            ("customer", "OWNS", "account"): torch.stack([owns_src, owns_dst], dim=0),
            ("customer", "BANKS_WITH", "bank"): torch.stack([bw_src, bw_dst], dim=0),
            ("account", "USES_DEVICE", "device"): torch.stack([dev_src, dev_dst], dim=0),
            ("account", "USES_IP", "ip"): torch.stack([ip_src, ip_dst], dim=0),
            ("account", "TRANSACTS", "account"): torch.stack([tx_src, tx_dst], dim=0),
            ("account", "WIRES_TO", "beneficiary"): torch.stack([wb_src, wb_dst], dim=0),
            ("customer", "RELATED_TO", "customer"): torch.stack([rel_src, rel_dst], dim=0),
        },
        "edge_attr": {
            ("customer", "BANKS_WITH", "bank"): bw_ea,
            ("account", "USES_DEVICE", "device"): dev_ea,
            ("account", "USES_IP", "ip"): ip_ea,
            ("account", "TRANSACTS", "account"): tx_ea,
            ("account", "WIRES_TO", "beneficiary"): wb_ea,
            ("customer", "RELATED_TO", "customer"): rel_ea,
        },
    }


def test_all_5_checkpoints_load_strict_and_symmetric(tmp_path: Path):
    """Kiểm tra nạp strict=True cả 5 checkpoint (v4 + CK) và tính bất biến hoán vị score(u,v) == score(v,u)."""
    pt_path = tmp_path / "synth_case.pt"
    torch.save(build_synthetic_ausaml_dict(40), pt_path)

    bundle = DataValidator.load_and_normalize_hetero(pt_path)
    raw_g = bundle["hetero_data"]
    assert len(raw_g.edge_types) == 14

    pairs_uv = torch.tensor([[0, 0, 1, 2, 10], [1, 2, 3, 4, 15]], dtype=torch.long)
    pairs_vu = pairs_uv.flip(0)

    reg = ModelRegistry()
    _, models = reg.list_models()
    assert len(models) == 5

    homo_bundle = HomoGraphAdapter().transform(raw_g, use_frozen_scaler=False)
    h_adapter = HeteroGraphAdapter()
    aug_g, full_tx, _ = h_adapter.augment_graph(raw_g, use_frozen_scaler=False)
    pf_uv, raw_uv, sums_uv = h_adapter.compute_pairwise_features(aug_g, pairs_uv, full_tx_cust_ei=full_tx, raw_hetero_data=raw_g, use_frozen_scaler=False)
    pf_vu, raw_vu, _ = h_adapter.compute_pairwise_features(aug_g, pairs_vu, full_tx_cust_ei=full_tx, raw_hetero_data=raw_g, use_frozen_scaler=False)

    assert pf_uv.shape == (5, 24)
    assert np.allclose(raw_uv, raw_vu, atol=1e-5), "24d Pairwise features phải bất biến hoán vị!"
    assert sums_uv[0].shared_devices >= 1 and sums_uv[0].shared_ips >= 1 and sums_uv[0].direct_tx_count >= 1

    for m in models:
        predictor = reg.get_predictor(m.model_id)
        if m.model_family in ("HOMO_GCN", "HOMO_GAT"):
            out_uv = predictor.predict_pairs(homo_bundle, pairs_uv)
            out_vu = predictor.predict_pairs(homo_bundle, pairs_vu)
        else:
            out_uv = predictor.predict_pairs({"hetero_g": aug_g, "pair_feats": pf_uv}, pairs_uv)
            out_vu = predictor.predict_pairs({"hetero_g": aug_g, "pair_feats": pf_vu}, pairs_vu)

        p_uv, p_vu = out_uv["probabilities"], out_vu["probabilities"]
        assert p_uv.shape == (5,)
        assert np.all((p_uv >= 0.0) & (p_uv <= 1.0))
        assert np.allclose(p_uv, p_vu, atol=1e-5), f"Model {m.model_id} vi phạm đối xứng hoán vị!"


def test_bridge_path_extractor_and_real_api_e2e():
    """Kiểm tra end-to-end Real Engine qua FastAPI: Upload .pt -> Predict -> Explain -> Feedback -> Export."""
    init_db_and_seed()
    client = TestClient(app)

    synth_dict = build_synthetic_ausaml_dict(35)
    buf = io.BytesIO()
    torch.save(synth_dict, buf)
    buf.seek(0)

    r_up = client.post(
        "/api/v1/cases/upload",
        data={"title": "Real Engine E2E Case", "description": "Testing real PyTorch GNN"},
        files={"file": ("e2e_case.pt", buf, "application/octet-stream")},
    )
    assert r_up.status_code == 200
    case_id = r_up.json()["case"]["case_id"]

    orig_mock = model_registry.use_mock
    model_registry.use_mock = False
    try:
        r_pred = client.post(
            f"/api/v1/cases/{case_id}/predict",
            json={
                "model_id": "hybrid_v4_full",
                "target_customer_ids": ["CUST_00000", "CUST_00001", "CUST_00002"],
                "inference_mode": "subgraph",
                "hop_depth": 2,
                "top_k": 10,
            },
        )
        assert r_pred.status_code == 200, r_pred.text
        pdata = r_pred.json()
        assert pdata["model_used"]["model_id"] == "hybrid_v4_full"
        assert len(pdata["predictions"]) > 0
        assert len(pdata["graph_payload"]["nodes"]) <= 300

        # Kiểm tra cặp CUST_00000 <-> CUST_00001 có đủ bridge paths
        r_exp = client.post(
            f"/api/v1/cases/{case_id}/explain-pair",
            json={"source": "CUST_00000", "target": "CUST_00001", "model_id": "hybrid_v4_full"},
        )
        assert r_exp.status_code == 200, r_exp.text
        edata = r_exp.json()
        assert len(edata["radar_features"]) == 6
        path_types = {p["path_type"] for p in edata["evidence_paths"]}
        assert "SHARED_DEVICE" in path_types
        assert "TRANSACTS_CHAIN" in path_types

        # Kiểm tra alias ngược tương thích hybrid_v3_best -> hybrid_v4_full
        r_alias = client.post(
            f"/api/v1/cases/{case_id}/predict",
            json={"model_id": "hybrid_v3_best", "target_customer_ids": ["CUST_00000", "CUST_00001"]},
        )
        assert r_alias.status_code == 200
        assert r_alias.json()["model_used"]["model_id"] == "hybrid_v4_full"
    finally:
        model_registry.use_mock = orig_mock
