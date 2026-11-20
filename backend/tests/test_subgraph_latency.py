"""
Acceptance Test 2 (SRS Mục 6): Subgraph Inference Latency <= 3.0s trên CPU.
Đo trực tiếp thời gian phản hồi thực của Real PyTorch Engine (Hybrid v4 + đối chiếu GCN/GAT + Bridge Paths)
trên vụ án mẫu (hoặc đồ thị tổng hợp 250 khách hàng nếu chưa copy case_01 từ Kaggle).
"""

from pathlib import Path
import torch

from app.config import DEMO_CASES_DIR
from app.engine.registry import ModelRegistry
from app.schemas import PredictRequest
from tests.test_checkpoint_loading import build_synthetic_ausaml_dict


def test_subgraph_inference_latency_under_3_seconds(tmp_path: Path):
    reg = ModelRegistry()
    reg.use_mock = False

    demo_path = DEMO_CASES_DIR / "case_01_smurfing_ring.pt"
    if demo_path.exists():
        case_id = "case_01_smurfing_ring"
        graph_path = str(demo_path)
        targets = []
    else:
        synth_path = tmp_path / "latency_250cust.pt"
        torch.save(build_synthetic_ausaml_dict(num_customers=250, seed=7), synth_path)
        case_id = "latency_250cust"
        graph_path = str(synth_path)
        targets = ["CUST_00000", "CUST_00001", "CUST_00002", "CUST_00003"]

    # Warm-up nạp checkpoints vào RAM (tương đương startup server)
    for mid in ("hybrid_v4_full", "ck_gcn_seed42", "ck_gat_seed42"):
        reg.get_predictor(mid)

    res = reg.predict(
        case_id,
        PredictRequest(
            model_id="hybrid_v4_full",
            target_customer_ids=targets,
            hop_depth=2,
            top_k=20,
        ),
        graph_file_path=graph_path,
    )
    assert len(res.predictions) > 0
    assert res.execution_time_ms <= 3000.0, f"Độ trễ vượt 3.0s: {res.execution_time_ms} ms"
