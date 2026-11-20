"""
Bridge Path Extractor & Natural Language Explainer (FR-04).
Truy vết Top-3 đường đi bắc cầu ngắn nhất qua SHARED_DEVICE, SHARED_IP,
TRANSACTS (1-hop / 2-hop Mule), WIRES_TO (Beneficiary) và sinh giải thích tiếng Việt.
"""

from typing import Any, Dict, List, Optional, Set, Tuple
import torch

from ..schemas import EvidencePath, PairwiseSummary, RadarFeaturePoint, RiskLevel


class _AdjacencyIndex:
    """Chỉ mục kề nhẹ trên đồ thị dị thể để truy vết Top-3 Bridge Paths dưới < 5ms mỗi cặp."""

    def __init__(self, hetero_g: Any):
        self.cust_to_accs: Dict[int, List[int]] = {}
        self.acc_to_cust: Dict[int, int] = {}
        self.acc_to_devs: Dict[int, Set[int]] = {}
        self.dev_degree: Dict[int, int] = {}
        self.acc_to_ips: Dict[int, Set[int]] = {}
        self.ip_degree: Dict[int, int] = {}
        self.acc_to_bens: Dict[int, Set[int]] = {}
        self.acc_tx_nbrs: Dict[int, Set[int]] = {}

        owns = hetero_g[("customer", "OWNS", "account")].edge_index
        for c_i, a_i in zip(owns[0].tolist(), owns[1].tolist()):
            self.cust_to_accs.setdefault(c_i, []).append(a_i)
            self.acc_to_cust[a_i] = c_i

        ad = hetero_g[("account", "USES_DEVICE", "device")].edge_index
        dev_custs: Dict[int, Set[int]] = {}
        for a_i, d_i in zip(ad[0].tolist(), ad[1].tolist()):
            self.acc_to_devs.setdefault(a_i, set()).add(d_i)
            if a_i in self.acc_to_cust:
                dev_custs.setdefault(d_i, set()).add(self.acc_to_cust[a_i])
        self.dev_degree = {d_i: len(cs) for d_i, cs in dev_custs.items()}

        ai = hetero_g[("account", "USES_IP", "ip")].edge_index
        ip_custs: Dict[int, Set[int]] = {}
        for a_i, ip_i in zip(ai[0].tolist(), ai[1].tolist()):
            self.acc_to_ips.setdefault(a_i, set()).add(ip_i)
            if a_i in self.acc_to_cust:
                ip_custs.setdefault(ip_i, set()).add(self.acc_to_cust[a_i])
        self.ip_degree = {ip_i: len(cs) for ip_i, cs in ip_custs.items()}

        wb = hetero_g[("account", "WIRES_TO", "beneficiary")].edge_index
        for a_i, b_i in zip(wb[0].tolist(), wb[1].tolist()):
            self.acc_to_bens.setdefault(a_i, set()).add(b_i)

        tx = hetero_g[("account", "TRANSACTS", "account")].edge_index
        for a1, a2 in zip(tx[0].tolist(), tx[1].tolist()):
            if a1 != a2:
                self.acc_tx_nbrs.setdefault(a1, set()).add(a2)
                self.acc_tx_nbrs.setdefault(a2, set()).add(a1)


class BridgePathExtractor:
    """Truy vết Top-3 Bridge Meta-paths, chuẩn hóa 6 trục Radar và sinh giải thích tiếng Việt."""

    def __init__(self):
        self._index_cache: Dict[int, _AdjacencyIndex] = {}

    def _get_index(self, hetero_g: Any) -> _AdjacencyIndex:
        key = id(hetero_g)
        if key not in self._index_cache:
            if len(self._index_cache) >= 8:
                self._index_cache.clear()
            self._index_cache[key] = _AdjacencyIndex(hetero_g)
        return self._index_cache[key]

    def extract_top3_paths(
        self,
        hetero_g: Any,
        u_idx: int,
        v_idx: int,
        node_id_maps: Dict[str, Dict[int, str]],
        attention_map: Optional[Dict[Tuple[int, int], float]] = None,
    ) -> List[EvidencePath]:
        idx = self._get_index(hetero_g)
        c_map = node_id_maps["customer"]
        a_map = node_id_maps["account"]
        d_map = node_id_maps["device"]
        i_map = node_id_maps["ip"]
        b_map = node_id_maps["beneficiary"]

        u_id = c_map.get(u_idx, f"CUST_{u_idx:05d}")
        v_id = c_map.get(v_idx, f"CUST_{v_idx:05d}")
        pair_key = (min(u_idx, v_idx), max(u_idx, v_idx))
        base_attn = attention_map.get(pair_key) if attention_map else None

        accs_u = idx.cust_to_accs.get(u_idx, [])
        accs_v = idx.cust_to_accs.get(v_idx, [])
        accs_v_set = set(accs_v)

        paths: List[EvidencePath] = []

        # 1. Kênh Thiết bị dùng chung (SHARED_DEVICE)
        best_dev = None
        for au in accs_u:
            for av in accs_v:
                common_d = idx.acc_to_devs.get(au, set()) & idx.acc_to_devs.get(av, set())
                for d_i in common_d:
                    deg = idx.dev_degree.get(d_i, 2)
                    if best_dev is None or deg < best_dev[0]:
                        best_dev = (deg, au, d_i, av)
        if best_dev is not None:
            deg, au, d_i, av = best_dev
            dev_id = d_map.get(d_i, f"DEV_{d_i:05d}")
            au_id = a_map.get(au, f"ACC_{au:05d}")
            av_id = a_map.get(av, f"ACC_{av:05d}")
            attn = round(float(base_attn if base_attn is not None else max(0.55, 0.92 - 0.03 * min(deg, 10))), 3)
            paths.append(
                EvidencePath(
                    path_id=f"PATH_{len(paths) + 1}",
                    path_type="SHARED_DEVICE",
                    nodes=[u_id, au_id, dev_id, av_id, v_id],
                    relations=["OWNS", "USES_DEVICE", "rev_USES_DEVICE", "rev_OWNS"],
                    attention_score=attn,
                    description=(
                        f"Hai khách hàng đăng nhập cùng thiết bị {dev_id} (bậc chia sẻ={deg}) "
                        f"qua tài khoản {au_id} và {av_id} (tín hiệu chú ý = {attn:.2f})."
                    ),
                )
            )

        # 2. Kênh Dòng tiền trực tiếp (TRANSACTS_CHAIN)
        direct_tx = None
        for au in accs_u:
            hit = idx.acc_tx_nbrs.get(au, set()) & accs_v_set
            if hit:
                direct_tx = (au, next(iter(hit)))
                break
        if direct_tx is not None and len(paths) < 3:
            au, av = direct_tx
            au_id = a_map.get(au, f"ACC_{au:05d}")
            av_id = a_map.get(av, f"ACC_{av:05d}")
            attn = round(float(base_attn if base_attn is not None else 0.78), 3)
            paths.append(
                EvidencePath(
                    path_id=f"PATH_{len(paths) + 1}",
                    path_type="TRANSACTS_CHAIN",
                    nodes=[u_id, au_id, av_id, v_id],
                    relations=["OWNS", "TRANSACTS", "rev_OWNS"],
                    attention_score=attn,
                    description=f"Phát hiện dòng tiền chuyển khoản trực tiếp giữa {au_id} và {av_id}.",
                )
            )

        # 3. Kênh Địa chỉ IP chung (SHARED_IP / PUBLIC_IP_HUB)
        best_ip = None
        for au in accs_u:
            for av in accs_v:
                common_ip = idx.acc_to_ips.get(au, set()) & idx.acc_to_ips.get(av, set())
                for ip_i in common_ip:
                    deg = idx.ip_degree.get(ip_i, 2)
                    if best_ip is None or deg < best_ip[0]:
                        best_ip = (deg, au, ip_i, av)
        if best_ip is not None and len(paths) < 3:
            deg, au, ip_i, av = best_ip
            ip_id = i_map.get(ip_i, f"IP_{ip_i:05d}")
            au_id = a_map.get(au, f"ACC_{au:05d}")
            av_id = a_map.get(av, f"ACC_{av:05d}")
            is_public_hub = deg >= 10
            ptype = "PUBLIC_IP_HUB" if is_public_hub else "SHARED_IP"
            attn = round(
                float(base_attn if base_attn is not None else (0.18 if is_public_hub else max(0.50, 0.82 - 0.04 * deg))),
                3,
            )
            desc = (
                f"Dùng chung IP công cộng bậc cao {ip_id} (deg={deg}) — trọng số Adamic-Adar suy giảm mạnh."
                if is_public_hub
                else f"Hai tài khoản {au_id} và {av_id} truy cập cùng địa chỉ IP {ip_id} (deg={deg})."
            )
            paths.append(
                EvidencePath(
                    path_id=f"PATH_{len(paths) + 1}",
                    path_type=ptype,
                    nodes=[u_id, au_id, ip_id, av_id, v_id],
                    relations=["OWNS", "USES_IP", "rev_USES_IP", "rev_OWNS"],
                    attention_score=attn,
                    description=desc,
                )
            )

        # 4. Kênh Người thụ hưởng chung (SHARED_BENEFICIARY)
        if len(paths) < 3:
            found_ben = None
            for au in accs_u:
                for av in accs_v:
                    common_b = idx.acc_to_bens.get(au, set()) & idx.acc_to_bens.get(av, set())
                    if common_b:
                        found_ben = (au, next(iter(common_b)), av)
                        break
                if found_ben:
                    break
            if found_ben is not None:
                au, b_i, av = found_ben
                ben_id = b_map.get(b_i, f"BEN_{b_i:05d}")
                au_id = a_map.get(au, f"ACC_{au:05d}")
                av_id = a_map.get(av, f"ACC_{av:05d}")
                attn = round(float(base_attn if base_attn is not None else 0.74), 3)
                paths.append(
                    EvidencePath(
                        path_id=f"PATH_{len(paths) + 1}",
                        path_type="SHARED_BENEFICIARY",
                        nodes=[u_id, au_id, ben_id, av_id, v_id],
                        relations=["OWNS", "WIRES_TO", "rev_WIRES_TO", "rev_OWNS"],
                        attention_score=attn,
                        description=f"Cùng chuyển tiền ra một bên thụ hưởng chung {ben_id}.",
                    )
                )

        # 5. Kênh Tài khoản trung gian 2-hop (MULE_INTERMEDIARY)
        if len(paths) < 3:
            mule_hit = None
            u_nbrs: Dict[int, int] = {}
            for au in accs_u:
                for mid in idx.acc_tx_nbrs.get(au, set()):
                    if mid not in accs_v_set and idx.acc_to_cust.get(mid) not in (u_idx, v_idx):
                        u_nbrs[mid] = au
            for av in accs_v:
                for mid in idx.acc_tx_nbrs.get(av, set()):
                    if mid in u_nbrs:
                        mule_hit = (u_nbrs[mid], mid, av)
                        break
                if mule_hit:
                    break
            if mule_hit is not None:
                au, mid, av = mule_hit
                au_id = a_map.get(au, f"ACC_{au:05d}")
                mid_id = a_map.get(mid, f"ACC_{mid:05d}")
                av_id = a_map.get(av, f"ACC_{av:05d}")
                attn = round(float(base_attn if base_attn is not None else 0.61), 3)
                paths.append(
                    EvidencePath(
                        path_id=f"PATH_{len(paths) + 1}",
                        path_type="MULE_INTERMEDIARY",
                        nodes=[u_id, au_id, mid_id, av_id, v_id],
                        relations=["OWNS", "TRANSACTS", "TRANSACTS", "rev_OWNS"],
                        attention_score=attn,
                        description=f"Kết nối dòng tiền bắc cầu 2-hop qua tài khoản trung gian {mid_id}.",
                    )
                )

        # 6. Nếu hoàn toàn rời rạc (ví dụ Bẫy Type 1)
        if not paths:
            paths.append(
                EvidencePath(
                    path_id="PATH_1",
                    path_type="DISCONNECTED_DIFFERENT_CASES",
                    nodes=[u_id, v_id],
                    relations=["NO_BEHAVIORAL_BRIDGE"],
                    attention_score=0.05,
                    description="Không tìm thấy cầu nối Thiết bị, IP, Thụ hưởng hay Giao dịch trực tiếp/2-hop giữa 2 đối tượng.",
                )
            )

        return paths[:3]

    @staticmethod
    def build_radar_features(summary: PairwiseSummary) -> List[RadarFeaturePoint]:
        """Chuẩn hóa 6 trục đặc trưng cặp về [0, 1] phục vụ Recharts Radar Chart."""
        return [
            RadarFeaturePoint(
                axis="Shared Devices",
                value_normalized=round(min(summary.shared_devices / 3.0, 1.0), 4),
                raw_display=f"{summary.shared_devices} thiết bị",
            ),
            RadarFeaturePoint(
                axis="Shared IPs",
                value_normalized=round(min(summary.shared_ips / 3.0, 1.0), 4),
                raw_display=f"{summary.shared_ips} IP",
            ),
            RadarFeaturePoint(
                axis="Direct TX",
                value_normalized=round(min(summary.direct_tx_count / 5.0, 1.0), 4),
                raw_display=f"{summary.direct_tx_count} giao dịch",
            ),
            RadarFeaturePoint(
                axis="Weighted AA",
                value_normalized=round(min(max(summary.weighted_aa, 0.0) / 2.0, 1.0), 4),
                raw_display=f"{summary.weighted_aa:.2f}",
            ),
            RadarFeaturePoint(
                axis="Multi-hop PPR",
                value_normalized=round(min(max(summary.ppr_multi_hop_cos, 0.0) * 1.5, 1.0), 4),
                raw_display=f"{summary.ppr_multi_hop_cos:.2f}",
            ),
            RadarFeaturePoint(
                axis="Node Risk Sim",
                value_normalized=round(min(max(summary.node_risk_sim, 0.0), 1.0), 4),
                raw_display=f"{summary.node_risk_sim:.2f}",
            ),
        ]

    @staticmethod
    def generate_explanation_vi(
        score: float,
        risk_level: RiskLevel,
        summary: PairwiseSummary,
        paths: List[EvidencePath],
    ) -> str:
        pct = score * 100.0
        clues: List[str] = []
        if summary.shared_devices > 0:
            clues.append(f"dùng chung {summary.shared_devices} thiết bị")
        if summary.shared_ips > 0:
            clues.append(f"trùng {summary.shared_ips} địa chỉ IP")
        if summary.direct_tx_count > 0:
            clues.append(f"có {summary.direct_tx_count} giao dịch chuyển khoản trực tiếp")
        if any(p.path_type == "SHARED_BENEFICIARY" for p in paths):
            clues.append("cùng chuyển tiền ra chung bên thụ hưởng")
        if any(p.path_type == "MULE_INTERMEDIARY" for p in paths):
            clues.append("kết nối dòng tiền 2-hop qua tài khoản trung gian")

        if risk_level == RiskLevel.HIGH:
            clue_str = ", ".join(clues) if clues else f"tín hiệu lan truyền đa bước PPR = {summary.ppr_multi_hop_cos:.2f}"
            return (
                f"Cảnh báo CAO ({pct:.1f}%): Hai khách hàng chưa khai báo quan hệ KYC nhưng {clue_str} "
                f"(Weighted AA = {summary.weighted_aa:.2f}, Risk Sim = {summary.node_risk_sim:.2f})."
            )
        if risk_level == RiskLevel.MEDIUM:
            clue_str = ", ".join(clues) if clues else f"độ tương đồng cấu trúc lân cận PPR = {summary.ppr_multi_hop_cos:.2f}"
            return (
                f"Cảnh báo TRUNG BÌNH ({pct:.1f}%): Vượt ngưỡng khuyến nghị nhờ {clue_str}; "
                "điều tra viên nên kiểm tra đường đi bắc cầu để xác minh."
            )

        if any(p.path_type == "PUBLIC_IP_HUB" for p in paths):
            return (
                f"Rủi ro THẤP ({pct:.1f}% — Lọc bẫy Type 4): Chỉ trùng IP công cộng bậc cao, "
                "không có thiết bị dùng chung hay dòng tiền bắc cầu bất thường."
            )
        if any(p.path_type == "DISCONNECTED_DIFFERENT_CASES" for p in paths):
            return (
                f"Rủi ro THẤP ({pct:.1f}% — Lọc bẫy Type 1): Hai đối tượng hoàn toàn tách rời trên đồ thị hành vi "
                f"(Weighted AA = {summary.weighted_aa:.2f}, PPR = {summary.ppr_multi_hop_cos:.2f})."
            )
        return (
            f"Rủi ro THẤP ({pct:.1f}%): Dưới ngưỡng cảnh báo của mô hình "
            f"(Weighted AA = {summary.weighted_aa:.2f}, PPR = {summary.ppr_multi_hop_cos:.2f})."
        )
