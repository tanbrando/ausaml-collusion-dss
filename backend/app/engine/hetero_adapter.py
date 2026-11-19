"""
Heterogeneous Graph Adapter (Meta-path Shortcuts + Multi-Scale PE + Pairwise Structural Features)
cho Hybrid GATv2+GINE (v3/v4), HeteroSAGE và HeteroGAT-Only.
TODO (Tấn - M1): Port từ AML_Hybrid_GAT_GIN.ipynb (Cell 1.7 & Cell 1.8),
đóng băng tr_mean/tr_std trong frozen_scalers.pt để suy luận quy nạp không bị rò rỉ.
"""

from typing import Any, Dict, Optional, Tuple
import torch


class HeteroGraphAdapter:
    def __init__(self, frozen_scalers: Optional[Dict[str, torch.Tensor]] = None):
        self.frozen_scalers = frozen_scalers or {}

    def augment_graph(self, raw_hetero_data: Any) -> Tuple[Any, torch.Tensor]:
        """Tạo customer.x (tổng hợp + PE), 4 Meta-paths, cắt rev_BANKS_WITH, trả về (hetero_g, full_tx_cust_ei)."""
        raise NotImplementedError("TODO (Tấn - M1): Cài đặt HeteroGraphAdapter.augment_graph từ Cell 1.7")

    def compute_pairwise_features(
        self, hetero_g: Any, candidate_pairs: torch.Tensor, full_tx_cust_ei: Optional[torch.Tensor] = None
    ) -> torch.Tensor:
        """Trích xuất vector Pairwise Structural Features chuẩn hóa bằng tr_mean/tr_std đóng băng."""
        raise NotImplementedError("TODO (Tấn - M1): Cài đặt HeteroGraphAdapter.compute_pairwise_features từ Cell 1.8")
