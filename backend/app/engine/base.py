"""Giao diện chuẩn Model-Agnostic BaseLinkPredictor cho mọi kiến trúc GNN."""

from abc import ABC, abstractmethod
from typing import Any, Dict
import torch


class BaseLinkPredictor(ABC):
    """Mọi wrapper mô hình (CK GCN, CK GAT, Hybrid GATv2+GINE...) phải kế thừa lớp này."""

    model_id: str
    model_family: str
    default_threshold: float

    @abstractmethod
    def load_checkpoint(self, checkpoint_path: str, device: str = "cpu") -> None:
        """Nạp trọng số đã huấn luyện lên CPU/GPU và chuyển sang chế độ eval()."""

    @abstractmethod
    @torch.no_grad()
    def predict_pairs(self, graph_bundle: Any, candidate_pairs: torch.Tensor) -> Dict[str, Any]:
        """
        Dự đoán xác suất đồng phạm cho danh sách cặp ứng viên [2, N_pairs].
        Trả về dictionary chuẩn:
        {
            "probabilities": np.ndarray [N_pairs],
            "attention_map": Optional[Dict],
            "pairwise_signals": Optional[np.ndarray],
        }
        """
