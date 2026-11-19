"""
K-Hop Subgraph Extractor & Candidate Pair Generator (FR-02).
TODO (Tấn - M1): Khoanh vùng lân cận K=2/3 hops quanh target_customer_ids và sinh cặp ứng viên
chưa có cạnh RELATED_TO (khoảng cách <= 4 hops).
"""

from typing import Any, Dict, List, Tuple
import torch


class SubgraphSampler:
    def extract_khop_and_candidates(
        self, hetero_g: Any, target_customer_ids: List[str], hop_depth: int = 2
    ) -> Tuple[Any, torch.Tensor, Dict[str, Any]]:
        """Trả về (sub_hetero_g, candidate_pairs [2, N_cand], id_mapping)."""
        raise NotImplementedError("TODO (Tấn - M1): Cài đặt K-hop Subgraph & Candidate Sampler")
