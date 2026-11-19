"""
Homogeneous Link Predictor Wrapper cho CK GCN & CK GAT.
TODO (Tấn - M1): Kế thừa GCNEncoder, GATEncoder, LinkDecoder, GNNLinkPredictor từ CK/src/models.py.
"""

from typing import Any, Dict
import torch

from .base import BaseLinkPredictor


class HomoLinkPredictor(BaseLinkPredictor):
    def __init__(self, model_id: str, model_family: str, default_threshold: float):
        self.model_id = model_id
        self.model_family = model_family
        self.default_threshold = default_threshold
        self.model = None
        self.device = "cpu"

    def load_checkpoint(self, checkpoint_path: str, device: str = "cpu") -> None:
        self.device = device
        raise NotImplementedError("TODO (Tấn - M1): Nạp checkpoint gcn_seed42.pt / gat_seed42.pt từ CK/src/models.py")

    @torch.no_grad()
    def predict_pairs(self, graph_bundle: Any, candidate_pairs: torch.Tensor) -> Dict[str, Any]:
        raise NotImplementedError("TODO (Tấn - M1): Chạy suy luận GNNLinkPredictor + encode_with_attention (nếu là GAT)")
