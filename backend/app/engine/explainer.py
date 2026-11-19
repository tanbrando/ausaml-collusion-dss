"""
Bridge Path Extractor & Natural Language Explainer (FR-04).
TODO (Tấn - M1): Truy vết Top-3 đường đi bắc cầu ngắn nhất qua SHARED_DEVICE, SHARED_IP,
TRANSACTS, WIRES_TO bằng BFS/NetworkX và sinh giải thích tiếng Việt.
"""

from typing import Any, Dict, List, Optional
from ..schemas import EvidencePath, RadarFeaturePoint


class BridgePathExtractor:
    def extract_top3_paths(
        self, hetero_g: Any, source_cust: str, target_cust: str, attention_map: Optional[Dict] = None
    ) -> List[EvidencePath]:
        """Truy vết Top-3 đường đi bắc cầu qua các kênh ngầm."""
        raise NotImplementedError("TODO (Tấn - M1): Cài đặt BFS/Dijkstra tìm Top-3 meta-paths")

    @staticmethod
    def build_radar_features(pairwise_dict: Dict[str, float]) -> List[RadarFeaturePoint]:
        """Chuẩn hóa 6 trục đặc trưng cặp về [0, 1] phục vụ Recharts Radar Chart."""
        raise NotImplementedError("TODO (Tấn - M1): Chuẩn hóa 6 trục Radar cho Frontend")
