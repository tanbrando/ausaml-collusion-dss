"""
Acceptance Test 1 (SRS Mục 6): Full-Graph Regression Test.
TODO (Tấn - M1/M2): Bật sau khi hoàn thiện PyTorch Real Engine (USE_MOCK_ENGINE=false)
để xác nhận ROC-AUC và AP khớp < 1e-5 so với Kaggle Notebook & CK/outputs.
"""

import pytest
from app.config import USE_MOCK_ENGINE


@pytest.mark.skipif(USE_MOCK_ENGINE, reason="Chờ Tấn hoàn thiện M1 Real PyTorch Engine (USE_MOCK_ENGINE=false)")
def test_full_graph_regression_matches_notebook():
    # TODO (Tấn): Load case_05_test_benchmark_3420, chạy inference_mode='full_graph',
    # kiểm tra abs(roc_auc - 0.8152) < 1e-5 (CK GCN seed42) và khớp Hybrid v3 seed42.
    assert False
