"""
Heterogeneous Link Predictor Wrapper cho HybridGATGIN (v3/v4), HeteroSAGE & HeteroGATOnly.
TODO (Tấn - M1): Port định nghĩa HybridGATGIN, HeteroGATBlock, HeteroGINBlock, LinkPredictorHead
từ AML_Hybrid_GAT_GIN.ipynb.
"""

from typing import Any, Dict
import torch

from .base import BaseLinkPredictor


class HeteroLinkPredictor(BaseLinkPredictor):
    def __init__(self, model_id: str, model_family: str, default_threshold: float):
        self.model_id = model_id
        self.model_family = model_family
        self.default_threshold = default_threshold
        self.model = None
        self.device = "cpu"

    def load_checkpoint(self, checkpoint_path: str, device: str = "cpu") -> None:
        self.device = device
        raise NotImplementedError("TODO (Tấn - M1): Nạp checkpoint Hybrid v3/v4 từ AML_Hybrid_GAT_GIN.ipynb")

    @torch.no_grad()
    def predict_pairs(self, graph_bundle: Any, candidate_pairs: torch.Tensor) -> Dict[str, Any]:
        raise NotImplementedError("TODO (Tấn - M1): Chạy suy luận encode_customers + StructureGatedLinkPredictor")
