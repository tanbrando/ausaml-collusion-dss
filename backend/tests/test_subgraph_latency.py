"""
Acceptance Test 2 (SRS Mục 6): Subgraph Inference Latency <= 3.0s trên CPU.
TODO (Tấn - M1/M2): Bật sau khi hoàn thiện SubgraphSampler & Real PyTorch Engine.
"""

import pytest
from app.config import USE_MOCK_ENGINE


@pytest.mark.skipif(USE_MOCK_ENGINE, reason="Chờ Tấn hoàn thiện M1 Real PyTorch Engine (USE_MOCK_ENGINE=false)")
def test_subgraph_inference_latency_under_3_seconds():
    # TODO (Tấn): Đo execution_time_ms cho <= 500 customers (K=2 hop) và assert <= 3000.0
    assert False
