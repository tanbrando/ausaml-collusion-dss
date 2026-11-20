"""
Kiểm thử Contract API, Gate Check 1 Upload (.pt) và Human-in-the-Loop DB Persistence.
Chạy trực tiếp: `pytest backend/tests/test_contract_and_feedback.py`
"""

import io
import torch
from fastapi.testclient import TestClient

from app.database import init_db_and_seed
from app.main import app


init_db_and_seed()
client = TestClient(app)


def test_health_models_cases_benchmarks():
    r_health = client.get("/health")
    assert r_health.status_code == 200
    assert r_health.json()["status"] == "ok"

    r_models = client.get("/api/v1/models")
    assert r_models.status_code == 200
    m_data = r_models.json()
    assert m_data["default_model_id"] == "hybrid_v4_full"
    assert len(m_data["models"]) == 5

    r_cases = client.get("/api/v1/cases")
    assert r_cases.status_code == 200
    assert len(r_cases.json()["cases"]) >= 5

    r_bench = client.get("/api/v1/benchmarks/summary")
    assert r_bench.status_code == 200
    assert len(r_bench.json()["hard_negative_showcase"]) >= 3


def test_predict_explain_feedback_and_export_lifecycle():
    case_id = "case_01_smurfing_ring"
    r_pred = client.post(
        f"/api/v1/cases/{case_id}/predict",
        json={
            "model_id": "hybrid_v4_full",
            "target_customer_ids": [],
            "inference_mode": "subgraph",
            "hop_depth": 2,
            "top_k": 10,
        },
    )
    assert r_pred.status_code == 200
    pred_data = r_pred.json()
    assert pred_data["model_used"]["applied_threshold"] == 0.5682
    assert len(pred_data["predictions"]) > 0
    first = pred_data["predictions"][0]
    assert "pairwise_summary" in first

    # Explain pair — kiểm tra điểm số nhất quán 100% với /predict
    r_exp = client.post(
        f"/api/v1/cases/{case_id}/explain-pair",
        json={"source": first["source"], "target": first["target"], "model_id": "hybrid_v4_full"},
    )
    assert r_exp.status_code == 200
    assert len(r_exp.json()["radar_features"]) == 6
    assert r_exp.json()["score"] == first["score"]

    # Submit CONFIRM feedback
    r_fb = client.post(
        f"/api/v1/cases/{case_id}/feedback",
        json={
            "pair_id": first["pair_id"],
            "source": first["source"],
            "target": first["target"],
            "model_id": "hybrid_v4_full",
            "predicted_score": first["score"],
            "action": "CONFIRM",
            "note": "Verified shared device DEV_0992",
            "reviewer_name": "Test_Investigator",
        },
    )
    assert r_fb.status_code == 200
    assert r_fb.json()["action"] == "CONFIRM"

    # Re-predict should reflect CONFIRMED status on both predictions & graph_payload
    r_pred2 = client.post(
        f"/api/v1/cases/{case_id}/predict",
        json={"model_id": "hybrid_v4_full", "target_customer_ids": [first["source"], first["target"]]},
    )
    assert r_pred2.status_code == 200
    updated_first = [p for p in r_pred2.json()["predictions"] if p["pair_id"] == first["pair_id"]][0]
    assert updated_first["feedback_status"] == "CONFIRMED"

    # Audit (cả /api/v1/audit và route alias /api/v1/cases/{case_id}/audit) & Export CSV/JSON
    r_audit = client.get(f"/api/v1/audit?case_id={case_id}")
    assert r_audit.status_code == 200
    assert len(r_audit.json()["feedbacks"]) >= 1

    r_audit_alias = client.get(f"/api/v1/cases/{case_id}/audit")
    assert r_audit_alias.status_code == 200
    assert len(r_audit_alias.json()["feedbacks"]) >= 1

    r_csv = client.get(f"/api/v1/cases/{case_id}/export?format=csv")
    assert r_csv.status_code == 200
    assert "pair_id,source,target" in r_csv.text


def test_upload_gate_check_1_validation():
    valid_graph = {
        "node_features": {
            "customer": torch.randn(10, 10),
            "account": torch.randn(12, 6),
            "device": torch.randn(5, 6),
            "ip": torch.randn(5, 4),
            "beneficiary": torch.randn(6, 8),
            "bank": torch.eye(4),
        },
        "edge_index": {
            ("customer", "OWNS", "account"): torch.tensor([[0, 1], [0, 1]], dtype=torch.long),
            ("customer", "BANKS_WITH", "bank"): torch.tensor([[0], [0]], dtype=torch.long),
            ("account", "USES_DEVICE", "device"): torch.tensor([[0], [0]], dtype=torch.long),
            ("account", "USES_IP", "ip"): torch.tensor([[0], [0]], dtype=torch.long),
            ("account", "TRANSACTS", "account"): torch.tensor([[0], [1]], dtype=torch.long),
            ("account", "WIRES_TO", "beneficiary"): torch.tensor([[0], [0]], dtype=torch.long),
            ("customer", "RELATED_TO", "customer"): torch.tensor([[0], [2]], dtype=torch.long),
        },
    }
    buf = io.BytesIO()
    torch.save(valid_graph, buf)
    buf.seek(0)

    r_up = client.post(
        "/api/v1/cases/upload",
        data={"title": "Test Upload Case", "description": "Gate Check 1 Pass"},
        files={"file": ("valid_case.pt", buf, "application/octet-stream")},
    )
    assert r_up.status_code == 200
    assert r_up.json()["gate_check"]["passed"] is True
    assert r_up.json()["gate_check"]["reverse_edges_added"] == 7

    # Invalid tensor with NaN must fail Gate Check 1 with 422
    valid_graph["node_features"]["customer"][0, 0] = float("nan")
    bad_buf = io.BytesIO()
    torch.save(valid_graph, bad_buf)
    bad_buf.seek(0)
    r_bad = client.post(
        "/api/v1/cases/upload",
        data={"title": "Bad NaN Case", "description": "Should fail"},
        files={"file": ("bad_case.pt", bad_buf, "application/octet-stream")},
    )
    assert r_bad.status_code == 422
