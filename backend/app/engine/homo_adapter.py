"""
Homogeneous Graph Adapter (60d customer features + 4 channels) cho CK GCN / GAT.
TODO (Tấn - M1): Kế thừa logic từ CK/src/data_validator.py (`build_homogeneous_customer_graph`)
và áp dụng frozen_scalers.pt (feat_mean, feat_std) từ tập Train khi chạy trên case mới.
"""

from typing import Any, Dict, Optional
import torch


class HomoGraphAdapter:
    def __init__(self, frozen_scalers: Optional[Dict[str, torch.Tensor]] = None):
        self.frozen_scalers = frozen_scalers or {}

    def transform(self, raw_hetero_data: Any) -> Dict[str, Any]:
        """Chuyển HeteroData sang đồ thị đồng nhất {'x': [N, 60], 'edge_index': [2, E], 'edge_channel': [E]}."""
        raise NotImplementedError("TODO (Tấn - M1): Cài đặt HomoGraphAdapter.transform từ CK/src/data_validator.py")
