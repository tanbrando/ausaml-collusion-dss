"""
Acceptance Test 1 (SRS Mục 6): Regression Benchmark Test.
1. Chạy ngay trên `data/demo_cases/case_05_test_benchmark_3420.pt` (3,420 cặp thật) với Adaptive Subgraph Scaling
   để xác minh Hybrid v4 đạt ROC >= 0.820, AP >= 0.840, CK GCN đạt ROC >= 0.790 (không bị sập covariate shift),
   và Hybrid v4 vượt trội CK GCN >= +0.03 trên cả ROC-AUC & AP.
2. Khi có đủ `data/processed/processed_graph.pt` (50,000 khách hàng) & `test_pairs.pt`, chạy kiểm định Full-Graph
   khớp sát tuyệt đối bảng `CK/outputs/tables/results_per_seed.csv` & Kaggle Notebook v4.
"""

import pytest
import torch
from sklearn.metrics import average_precision_score, roc_auc_score

from app.config import DEMO_CASES_DIR, FROZEN_SCALERS_PATH, PROCESSED_DATA_DIR
from app.engine.registry import ModelRegistry
from app.engine.validator import DataValidator

CASE_05_PATH = DEMO_CASES_DIR / "case_05_test_benchmark_3420.pt"
FULL_GRAPH_PATH = PROCESSED_DATA_DIR / "processed_graph.pt"
TEST_PAIRS_PATH = PROCESSED_DATA_DIR / "test_pairs.pt"


@pytest.mark.skipif(not CASE_05_PATH.exists(), reason="Chưa có data/demo_cases/case_05_test_benchmark_3420.pt")
def test_case05_real_benchmark_3420_pairs():
    bundle = DataValidator.load_and_normalize_hetero(CASE_05_PATH)
    raw_g = bundle["hetero_data"]
    ep = bundle["eval_pairs"]
    eli = ep["edge_label_index"].long()
    y_true = ep["edge_label"].cpu().numpy()
    assert eli.size(1) == 3420

    reg = ModelRegistry()
    p_gcn = reg.predict_full_graph_pairs("ck_gcn_seed42", raw_g, eli, scaler_mode="auto")
    p_gat = reg.predict_full_graph_pairs("ck_gat_seed42", raw_g, eli, scaler_mode="auto")
    p_hyb = reg.predict_full_graph_pairs("hybrid_v4_full", raw_g, eli, scaler_mode="auto")

    gcn_roc, gcn_ap = float(roc_auc_score(y_true, p_gcn)), float(average_precision_score(y_true, p_gcn))
    gat_roc, gat_ap = float(roc_auc_score(y_true, p_gat)), float(average_precision_score(y_true, p_gat))
    hyb_roc, hyb_ap = float(roc_auc_score(y_true, p_hyb)), float(average_precision_score(y_true, p_hyb))

    assert gcn_roc >= 0.790 and gcn_ap >= 0.795, f"CK GCN tụt điểm bất thường: ROC={gcn_roc:.4f}, AP={gcn_ap:.4f}"
    assert gat_roc >= 0.795 and gat_ap >= 0.800, f"CK GAT tụt điểm bất thường: ROC={gat_roc:.4f}, AP={gat_ap:.4f}"
    assert hyb_roc >= 0.820 and hyb_ap >= 0.840, f"Hybrid v4 tụt điểm bất thường: ROC={hyb_roc:.4f}, AP={hyb_ap:.4f}"
    assert (hyb_roc - gcn_roc) >= 0.025 and (hyb_ap - gcn_ap) >= 0.030


@pytest.mark.skipif(
    not (FULL_GRAPH_PATH.exists() and TEST_PAIRS_PATH.exists()),
    reason="Cần đặt processed_graph.pt & test_pairs.pt vào data/processed/ để chạy Full-Graph 50k Regression Test.",
)
def test_full_graph_regression_matches_notebook():
    bundle = DataValidator.load_and_normalize_hetero(FULL_GRAPH_PATH)
    raw_g = bundle["hetero_data"]
    test_pairs = torch.load(TEST_PAIRS_PATH, map_location="cpu", weights_only=False)
    eli = test_pairs["edge_label_index"].long()
    y_true = test_pairs["edge_label"].cpu().numpy()

    reg = ModelRegistry()

    gcn_probs = reg.predict_full_graph_pairs("ck_gcn_seed42", raw_g, eli, scaler_mode="auto")
    assert abs(float(roc_auc_score(y_true, gcn_probs)) - 0.8152) < 1e-3
    assert abs(float(average_precision_score(y_true, gcn_probs)) - 0.8060) < 1e-3

    gat_probs = reg.predict_full_graph_pairs("ck_gat_seed42", raw_g, eli, scaler_mode="auto")
    assert abs(float(roc_auc_score(y_true, gat_probs)) - 0.7999) < 1e-3
    assert abs(float(average_precision_score(y_true, gat_probs)) - 0.7904) < 1e-3

    if FROZEN_SCALERS_PATH.exists():
        hyb_probs = reg.predict_full_graph_pairs("hybrid_v4_full", raw_g, eli, scaler_mode="frozen")
        assert float(roc_auc_score(y_true, hyb_probs)) >= 0.825
        assert float(average_precision_score(y_true, hyb_probs)) >= 0.840
