"""
Cytoscape.js Graph Payload Builder + Node/Edge Attribute Decoder.
- Tách biệt khỏi ModelRegistry, giới hạn <= 300 đỉnh UI.
- Giải mã trực tiếp các tensor node_features (6 lớp thực thể) và edge_attr từ file .pt
  thành các thuộc tính nghiệp vụ AML dễ đọc (One-hot/Binary chính xác 100%, Z-score theo tầng ±σ,
  và thống kê kết nối cục bộ trên subgraph).
"""

from typing import Any, Dict, List, Literal, Optional, Set, Tuple

from ..schemas import (
    CytoscapeEdge,
    CytoscapeEdgeData,
    CytoscapeGraphPayload,
    CytoscapeNode,
    CytoscapeNodeData,
    EdgeCategory,
    EntityAttributeItem,
    FeedbackStatus,
    NodeType,
    PredictedLinkItem,
)

ToneType = Literal["neutral", "info", "warning", "danger", "success"]

_RELATED_TO_LABELS = [
    "Giám đốc (Director)",
    "Cổ đông (Shareholder)",
    "Người thụ hưởng (Beneficiary)",
    "Bên liên quan (Related Party)",
    "Ủy thác (Trustee)",
]

_RELATION_LABELS_VI: Dict[str, str] = {
    "OWNS": "Sở hữu tài khoản",
    "rev_OWNS": "Thuộc sở hữu của",
    "BANKS_WITH": "Giao dịch tại ngân hàng",
    "rev_BANKS_WITH": "Quản lý khách hàng",
    "USES_DEVICE": "Đăng nhập qua thiết bị",
    "rev_USES_DEVICE": "Được sử dụng bởi TK",
    "USES_IP": "Truy cập từ địa chỉ IP",
    "rev_USES_IP": "Ghi nhận truy cập từ TK",
    "TRANSACTS": "Chuyển khoản nội địa",
    "rev_TRANSACTS": "Nhận chuyển khoản từ",
    "WIRES_TO": "Chuyển tiền quốc tế",
    "rev_WIRES_TO": "Nhận tiền quốc tế từ",
    "RELATED_TO": "Quan hệ khai báo KYC",
    "rev_RELATED_TO": "Quan hệ khai báo KYC",
    "PREDICTED_ACCOMPLICE": "Liên kết đồng phạm AI dự báo",
}


def infer_node_type_from_id(nid: str) -> NodeType:
    if nid.startswith("CUST_"):
        return NodeType.CUSTOMER
    if nid.startswith("ACC_"):
        return NodeType.ACCOUNT
    if nid.startswith("DEV_"):
        return NodeType.DEVICE
    if nid.startswith("IP_"):
        return NodeType.IP
    if nid.startswith("BEN_"):
        return NodeType.BENEFICIARY
    return NodeType.BANK


def _zscore_tier(
    z: float,
    high_tone: ToneType = "info",
    very_high_tone: ToneType = "warning",
    low_tone: ToneType = "neutral",
) -> Tuple[str, ToneType]:
    sign_str = f"{z:+.2f}σ"
    if z >= 1.5:
        return f"Rất cao ({sign_str})", very_high_tone
    if z >= 0.5:
        return f"Cao ({sign_str})", high_tone
    if z > -0.5:
        return f"Trung bình ({sign_str})", "neutral"
    if z > -1.5:
        return f"Thấp ({sign_str})", low_tone
    return f"Rất thấp ({sign_str})", low_tone


def _argmax_flag(vals: List[float]) -> Optional[int]:
    if not vals:
        return None
    best_i = max(range(len(vals)), key=lambda i: vals[i])
    return best_i if vals[best_i] > 0.5 else None


class _SubgraphProfileHelper:
    """Chỉ mục nhẹ trích xuất thuộc tính đỉnh & cạnh từ PyG HeteroData."""

    def __init__(self, sub_g: Any, sub_id_maps: Dict[str, Dict[int, str]]):
        self.sub_g = sub_g
        self.id_maps = sub_id_maps
        self.rev_id_maps: Dict[str, Dict[str, int]] = {
            nt: {str_id: idx for idx, str_id in id_map.items()}
            for nt, id_map in sub_id_maps.items()
        }

        self.cust_acc_cnt: Dict[int, int] = {}
        self.cust_bank_cnt: Dict[int, int] = {}
        self.acc_owner: Dict[int, int] = {}
        self.acc_tx_nbrs: Dict[int, Set[int]] = {}
        self.acc_dev_cnt: Dict[int, int] = {}
        self.acc_ip_cnt: Dict[int, int] = {}
        self.dev_custs: Dict[int, Set[int]] = {}
        self.dev_accs: Dict[int, Set[int]] = {}
        self.ip_custs: Dict[int, Set[int]] = {}
        self.ip_accs: Dict[int, Set[int]] = {}
        self.ben_accs: Dict[int, Set[int]] = {}
        self.bank_custs: Dict[int, Set[int]] = {}

        self._build_topology()

    def _safe_edge_index(self, et: Tuple[str, str, str]) -> Optional[Any]:
        try:
            if et in self.sub_g.edge_types and "edge_index" in self.sub_g[et]:
                return self.sub_g[et].edge_index
        except Exception:
            return None
        return None

    def _build_topology(self) -> None:
        owns = self._safe_edge_index(("customer", "OWNS", "account"))
        if owns is not None and owns.size(1) > 0:
            for c_i, a_i in zip(owns[0].tolist(), owns[1].tolist()):
                self.cust_acc_cnt[c_i] = self.cust_acc_cnt.get(c_i, 0) + 1
                self.acc_owner[a_i] = c_i

        bw = self._safe_edge_index(("customer", "BANKS_WITH", "bank"))
        if bw is not None and bw.size(1) > 0:
            for c_i, b_i in zip(bw[0].tolist(), bw[1].tolist()):
                self.cust_bank_cnt[c_i] = self.cust_bank_cnt.get(c_i, 0) + 1
                self.bank_custs.setdefault(b_i, set()).add(c_i)

        ad = self._safe_edge_index(("account", "USES_DEVICE", "device"))
        if ad is not None and ad.size(1) > 0:
            for a_i, d_i in zip(ad[0].tolist(), ad[1].tolist()):
                self.acc_dev_cnt[a_i] = self.acc_dev_cnt.get(a_i, 0) + 1
                self.dev_accs.setdefault(d_i, set()).add(a_i)
                if a_i in self.acc_owner:
                    self.dev_custs.setdefault(d_i, set()).add(self.acc_owner[a_i])

        ai = self._safe_edge_index(("account", "USES_IP", "ip"))
        if ai is not None and ai.size(1) > 0:
            for a_i, ip_i in zip(ai[0].tolist(), ai[1].tolist()):
                self.acc_ip_cnt[a_i] = self.acc_ip_cnt.get(a_i, 0) + 1
                self.ip_accs.setdefault(ip_i, set()).add(a_i)
                if a_i in self.acc_owner:
                    self.ip_custs.setdefault(ip_i, set()).add(self.acc_owner[a_i])

        tx = self._safe_edge_index(("account", "TRANSACTS", "account"))
        if tx is not None and tx.size(1) > 0:
            for a1, a2 in zip(tx[0].tolist(), tx[1].tolist()):
                if a1 != a2:
                    self.acc_tx_nbrs.setdefault(a1, set()).add(a2)
                    self.acc_tx_nbrs.setdefault(a2, set()).add(a1)

        wb = self._safe_edge_index(("account", "WIRES_TO", "beneficiary"))
        if wb is not None and wb.size(1) > 0:
            for a_i, b_i in zip(wb[0].tolist(), wb[1].tolist()):
                self.ben_accs.setdefault(b_i, set()).add(a_i)

    def _get_node_vec(self, nt: str, idx: int) -> Optional[List[float]]:
        try:
            if nt in self.sub_g.node_types and "x" in self.sub_g[nt]:
                x = self.sub_g[nt].x
                if 0 <= idx < x.size(0):
                    return [float(v) for v in x[idx].tolist()]
        except Exception:
            return None
        return None

    def decode_node(
        self, nid: str, nt: NodeType
    ) -> Tuple[Optional[str], List[EntityAttributeItem]]:
        nt_key = nt.value
        idx = self.rev_id_maps.get(nt_key, {}).get(nid)
        if idx is None:
            return None, []
        vec = self._get_node_vec(nt_key, idx)
        if vec is None:
            return None, []

        attrs: List[EntityAttributeItem] = []

        if nt == NodeType.CUSTOMER and len(vec) >= 10:
            # x[0]=risk_score(z), x[1:4]=screening_flag(oh3), x[4]=status_flag,
            # x[5]=annual_income(logz), x[6:9]=cust_type(ind,comp,trust), x[9]=tenure_days(z)
            ctype_idx = _argmax_flag(vec[6:9])
            ctype_names = ["Cá nhân (Individual)", "Doanh nghiệp (Company)", "Quỹ tín thác (Trust)"]
            ctype_label = ctype_names[ctype_idx] if ctype_idx is not None else "Cá nhân / Khác"

            risk_text, risk_tone = _zscore_tier(
                vec[0], high_tone="warning", very_high_tone="danger"
            )
            scr_idx = _argmax_flag(vec[1:4])
            scr_map = [
                ("Mức 1 (Chuẩn)", "success"),
                ("Mức 2 (Theo dõi KYC)", "warning"),
                ("Mức 3 (Cảnh báo cao)", "danger"),
            ]
            scr_text, scr_tone = scr_map[scr_idx] if scr_idx is not None else ("Chưa phân mức", "neutral")

            inc_text, inc_tone = _zscore_tier(vec[5], high_tone="info", very_high_tone="info")
            tenure_text, _ = _zscore_tier(vec[9])
            n_acc = self.cust_acc_cnt.get(idx, 0)
            n_bank = self.cust_bank_cnt.get(idx, 0)

            attrs = [
                EntityAttributeItem(label="Loại khách hàng", value=ctype_label, tone="info"),
                EntityAttributeItem(label="Điểm rủi ro KYC", value=risk_text, tone=risk_tone),
                EntityAttributeItem(label="Mức sàng lọc", value=scr_text, tone=scr_tone),  # type: ignore[arg-type]
                EntityAttributeItem(label="Quy mô thu nhập", value=inc_text, tone=inc_tone),
                EntityAttributeItem(label="Thâm niên KH", value=tenure_text, tone="neutral"),
                EntityAttributeItem(
                    label="Tài sản liên kết",
                    value=f"{n_acc} tài khoản · {n_bank} ngân hàng",
                    tone="neutral",
                ),
            ]
            subtitle = f"{ctype_label.split(' (')[0]} · {n_acc} TK · Rủi ro KYC {risk_text.split(' (')[0]}"
            return subtitle, attrs

        if nt == NodeType.ACCOUNT and len(vec) >= 6:
            # x[0]=age_days(z), x[1]=last_act_missing(0/1), x[2]=last_act(logz), x[3:6]=binary_flags
            owner_idx = self.acc_owner.get(idx)
            owner_str = self.id_maps.get("customer", {}).get(owner_idx, "Không rõ") if owner_idx is not None else "Không rõ"
            age_text, _ = _zscore_tier(vec[0])
            is_missing = vec[1] > 0.5
            act_text = "Không có GD gần đây" if is_missing else _zscore_tier(vec[2])[0]
            active_flags = sum(1 for v in vec[3:6] if v > 0.5)
            n_tx = len(self.acc_tx_nbrs.get(idx, set()))
            n_dev = self.acc_dev_cnt.get(idx, 0)
            n_ip = self.acc_ip_cnt.get(idx, 0)

            attrs = [
                EntityAttributeItem(label="Chủ sở hữu", value=owner_str, tone="info"),
                EntityAttributeItem(label="Tuổi tài khoản", value=age_text, tone="neutral"),
                EntityAttributeItem(
                    label="Hoạt động gần nhất",
                    value=act_text,
                    tone="neutral" if is_missing else "info",
                ),
                EntityAttributeItem(
                    label="Cờ trạng thái TK",
                    value=f"{active_flags}/3 cờ kích hoạt",
                    tone="warning" if active_flags >= 2 else "neutral",
                ),
                EntityAttributeItem(
                    label="Kết nối cục bộ",
                    value=f"{n_tx} TK đối ứng · {n_dev} thiết bị · {n_ip} IP",
                    tone="neutral",
                ),
            ]
            subtitle = f"Thuộc {owner_str} · {n_tx} TK giao dịch"
            return subtitle, attrs

        if nt == NodeType.DEVICE and len(vec) >= 6:
            # x[0]=logz, x[1:4]=device_type_flags, x[4]=logz, x[5]=logz
            dtype_idx = _argmax_flag(vec[1:4])
            dtype_names = ["Thiết bị Nhóm 1 (Di động)", "Thiết bị Nhóm 2 (Desktop)", "Thiết bị Nhóm 3 (Khác)"]
            dtype_label = dtype_names[dtype_idx] if dtype_idx is not None else "Thiết bị tiêu chuẩn"
            n_cust = len(self.dev_custs.get(idx, set()))
            n_acc = len(self.dev_accs.get(idx, set()))
            share_tone: ToneType = "danger" if n_cust >= 3 else ("warning" if n_cust >= 2 else "neutral")
            freq_text, freq_tone = _zscore_tier(vec[0], high_tone="warning", very_high_tone="danger")
            act_text, _ = _zscore_tier(vec[5])

            attrs = [
                EntityAttributeItem(label="Phân loại thiết bị", value=dtype_label, tone="info"),
                EntityAttributeItem(
                    label="Mức độ dùng chung",
                    value=f"{n_cust} khách hàng ({n_acc} tài khoản)",
                    tone=share_tone,
                ),
                EntityAttributeItem(label="Tần suất sử dụng", value=freq_text, tone=freq_tone),
                EntityAttributeItem(label="Mật độ phiên", value=act_text, tone="neutral"),
            ]
            subtitle = f"{n_cust} KH dùng chung · {dtype_label.split(' (')[0]}"
            return subtitle, attrs

        if nt == NodeType.IP and len(vec) >= 4:
            n_cust = len(self.ip_custs.get(idx, set()))
            n_acc = len(self.ip_accs.get(idx, set()))
            if n_cust >= 10:
                ip_cat, ip_tone = "Hub IP công cộng (Bậc cao)", "info"
            elif n_cust >= 2:
                ip_cat, ip_tone = "IP dùng chung nhiều KH", "warning"
            else:
                ip_cat, ip_tone = "IP cá nhân riêng lẻ", "neutral"
            traffic_text, traffic_tone = _zscore_tier(vec[0], high_tone="info", very_high_tone="warning")
            sess_text, _ = _zscore_tier(vec[1])

            attrs = [
                EntityAttributeItem(label="Phân loại IP", value=ip_cat, tone=ip_tone),
                EntityAttributeItem(
                    label="Phạm vi chia sẻ",
                    value=f"{n_cust} khách hàng ({n_acc} tài khoản)",
                    tone=ip_tone,
                ),
                EntityAttributeItem(label="Lưu lượng truy cập", value=traffic_text, tone=traffic_tone),
                EntityAttributeItem(label="Tần suất phiên", value=sess_text, tone="neutral"),
            ]
            subtitle = f"{ip_cat} · {n_cust} KH"
            return subtitle, attrs

        if nt == NodeType.BENEFICIARY and len(vec) >= 8:
            # x[0]=logz, x[1]=fatf_flag, x[2:5]=ben_geo(oh3), x[5:8]=logz
            is_fatf = vec[1] > 0.5
            geo_idx = _argmax_flag(vec[2:5])
            geo_names = ["Khu vực Nội địa / Nhóm 1", "Khu vực Quốc tế Nhóm 2", "Khu vực Quốc tế Nhóm 3"]
            geo_label = geo_names[geo_idx] if geo_idx is not None else "Không xác định"
            vol_text, vol_tone = _zscore_tier(vec[0], high_tone="warning", very_high_tone="danger")
            n_acc = len(self.ben_accs.get(idx, set()))

            attrs = [
                EntityAttributeItem(
                    label="Cảnh báo Quốc gia FATF",
                    value="Có — Vùng rủi ro cao (FATF)" if is_fatf else "Không (Bình thường)",
                    tone="danger" if is_fatf else "success",
                ),
                EntityAttributeItem(label="Phân vùng địa lý", value=geo_label, tone="info"),
                EntityAttributeItem(label="Lưu lượng nhận tiền", value=vol_text, tone=vol_tone),
                EntityAttributeItem(
                    label="Tài khoản chuyển đến",
                    value=f"{n_acc} tài khoản trong vụ án",
                    tone="warning" if n_acc >= 2 else "neutral",
                ),
            ]
            subtitle = f"{'⚠ Vùng FATF · ' if is_fatf else ''}{n_acc} TK chuyển tiền đến"
            return subtitle, attrs

        if nt == NodeType.BANK and len(vec) >= 4:
            bk_idx = _argmax_flag(vec[:4])
            bk_name = f"Ngân hàng AusAML #{bk_idx + 1}" if bk_idx is not None else "Ngân hàng đối tác"
            n_cust = len(self.bank_custs.get(idx, set()))
            attrs = [
                EntityAttributeItem(label="Tổ chức tài chính", value=bk_name, tone="info"),
                EntityAttributeItem(
                    label="Khách hàng trong vụ án",
                    value=f"{n_cust} khách hàng",
                    tone="neutral",
                ),
            ]
            return bk_name, attrs

        return None, []

    def decode_observed_edge(
        self, u_id: str, v_id: str, rel: str
    ) -> Tuple[Optional[str], List[EntityAttributeItem]]:
        u_nt = infer_node_type_from_id(u_id).value
        v_nt = infer_node_type_from_id(v_id).value
        u_idx = self.rev_id_maps.get(u_nt, {}).get(u_id)
        v_idx = self.rev_id_maps.get(v_nt, {}).get(v_id)
        rel_vi = _RELATION_LABELS_VI.get(rel, rel)

        if u_idx is None or v_idx is None:
            return rel_vi, [EntityAttributeItem(label="Loại quan hệ", value=rel_vi, tone="info")]

        et = (u_nt, rel, v_nt)
        ei = self._safe_edge_index(et)
        ea = None
        if ei is not None and "edge_attr" in self.sub_g[et]:
            ea = self.sub_g[et].edge_attr

        feat: Optional[List[float]] = None
        if ei is not None and ea is not None and ei.size(1) > 0:
            # Tìm cạnh khớp (u_idx, v_idx) trong subgraph
            src_list = ei[0].tolist()
            dst_list = ei[1].tolist()
            for e_i, (s_i, d_i) in enumerate(zip(src_list, dst_list)):
                if s_i == u_idx and d_i == v_idx:
                    feat = [float(x) for x in ea[e_i].tolist()]
                    break

        attrs: List[EntityAttributeItem] = [
            EntityAttributeItem(label="Loại quan hệ", value=rel_vi, tone="info")
        ]
        detail_label = rel_vi

        base_rel = rel[4:] if rel.startswith("rev_") else rel
        if feat is not None:
            if base_rel == "RELATED_TO" and len(feat) >= 7:
                r_idx = _argmax_flag(feat[:5])
                r_name = _RELATED_TO_LABELS[r_idx] if r_idx is not None else "Quan hệ khai báo"
                has_pct = feat[6] > 0.5
                pct = feat[5] * 100.0
                detail_label = f"{r_name} ({pct:.0f}%)" if has_pct else r_name
                attrs.append(EntityAttributeItem(label="Chi tiết vai trò", value=r_name, tone="warning"))
                if has_pct:
                    attrs.append(
                        EntityAttributeItem(label="Tỷ lệ sở hữu", value=f"{pct:.1f}%", tone="info")
                    )
            elif base_rel in ("TRANSACTS", "WIRES_TO") and len(feat) >= 4:
                amt_text, amt_tone = _zscore_tier(feat[0], high_tone="warning", very_high_tone="danger")
                cnt_text, cnt_tone = _zscore_tier(feat[1], high_tone="info", very_high_tone="warning")
                detail_label = f"{rel_vi} · Quy mô {amt_text.split(' (')[0]}"
                attrs.append(EntityAttributeItem(label="Quy mô dòng tiền", value=amt_text, tone=amt_tone))
                attrs.append(EntityAttributeItem(label="Tần suất giao dịch", value=cnt_text, tone=cnt_tone))
            elif base_rel in ("USES_DEVICE", "USES_IP") and len(feat) >= 2:
                freq_text, freq_tone = _zscore_tier(feat[0], high_tone="info", very_high_tone="warning")
                recency_pct = max(0.0, min(100.0, feat[1] * 100.0))
                detail_label = f"{rel_vi} · Tần suất {freq_text.split(' (')[0]}"
                attrs.append(EntityAttributeItem(label="Tần suất đăng nhập", value=freq_text, tone=freq_tone))
                attrs.append(
                    EntityAttributeItem(
                        label="Mốc hoạt động",
                        value=f"{recency_pct:.0f}% cửa sổ quan sát",
                        tone="neutral",
                    )
                )

        return detail_label, attrs


def build_cytoscape_payload(
    candidates: List[Dict[str, Any]],
    pred_items: List[PredictedLinkItem],
    include_node_types: List[NodeType],
    target_ids: List[str],
    max_ui_nodes: int = 300,
    sub_g: Optional[Any] = None,
    sub_id_maps: Optional[Dict[str, Dict[int, str]]] = None,
) -> CytoscapeGraphPayload:
    allowed = set(include_node_types)
    target_set = set(target_ids)
    nodes_map: Dict[str, CytoscapeNode] = {}
    edges_map: Dict[str, CytoscapeEdge] = {}

    profile_helper = (
        _SubgraphProfileHelper(sub_g, sub_id_maps)
        if sub_g is not None and sub_id_maps is not None
        else None
    )

    def _make_node(nid: str, nt: NodeType, risk_score: Optional[float]) -> CytoscapeNode:
        subtitle: Optional[str] = None
        attributes: List[EntityAttributeItem] = []
        if profile_helper is not None:
            subtitle, attributes = profile_helper.decode_node(nid, nt)
        return CytoscapeNode(
            data=CytoscapeNodeData(
                id=nid,
                label=nid,
                node_type=nt,
                risk_score=risk_score,
                is_target=nid in target_set,
                subtitle=subtitle,
                attributes=attributes,
            )
        )

    # 1) Ưu tiên các đỉnh khách hàng xuất hiện trong pred_items
    if NodeType.CUSTOMER in allowed:
        for item in pred_items:
            for cid in (item.source, item.target):
                if cid not in nodes_map and len(nodes_map) < max_ui_nodes:
                    nodes_map[cid] = _make_node(cid, NodeType.CUSTOMER, item.score)
            if item.source in nodes_map and item.target in nodes_map:
                ecat = (
                    EdgeCategory.CONFIRMED_LINK
                    if item.feedback_status == FeedbackStatus.CONFIRMED
                    else EdgeCategory.PREDICTED_LINK
                )
                edges_map[f"pred_{item.pair_id}"] = CytoscapeEdge(
                    data=CytoscapeEdgeData(
                        id=f"pred_{item.pair_id}",
                        source=item.source,
                        target=item.target,
                        relation="PREDICTED_ACCOMPLICE",
                        edge_category=ecat,
                        score=item.score,
                        risk_level=item.risk_level,
                        pair_id=item.pair_id,
                        feedback_status=item.feedback_status,
                        detail_label=f"Dự báo đồng phạm ({item.score * 100:.1f}%)",
                    )
                )

    # 2) Bổ sung các đỉnh & cạnh bắc cầu quan sát được từ EvidencePaths (tối đa max_ui_nodes)
    for c in candidates:
        for p in c["paths"]:
            p_nodes = p.nodes
            p_rels = p.relations
            for nid in p_nodes:
                nt = infer_node_type_from_id(nid)
                if nt not in allowed or nid in nodes_map or len(nodes_map) >= max_ui_nodes:
                    continue
                default_risk = 0.88 if nid in target_set else (0.72 if nt == NodeType.CUSTOMER else None)
                nodes_map[nid] = _make_node(nid, nt, default_risk)
            for idx in range(len(p_nodes) - 1):
                u_n, v_n = p_nodes[idx], p_nodes[idx + 1]
                rel = p_rels[idx] if idx < len(p_rels) else "RELATED"
                if rel == "NO_BEHAVIORAL_BRIDGE":
                    continue
                if u_n in nodes_map and v_n in nodes_map:
                    eid = f"obs_{u_n}__{rel}__{v_n}"
                    if eid not in edges_map:
                        detail_label: Optional[str] = _RELATION_LABELS_VI.get(rel, rel)
                        edge_attrs: List[EntityAttributeItem] = []
                        if profile_helper is not None:
                            detail_label, edge_attrs = profile_helper.decode_observed_edge(u_n, v_n, rel)
                        edges_map[eid] = CytoscapeEdge(
                            data=CytoscapeEdgeData(
                                id=eid,
                                source=u_n,
                                target=v_n,
                                relation=rel,
                                edge_category=EdgeCategory.OBSERVED_EDGE,
                                detail_label=detail_label,
                                attributes=edge_attrs,
                            )
                        )

    return CytoscapeGraphPayload(nodes=list(nodes_map.values()), edges=list(edges_map.values()))
