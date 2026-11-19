"""
Model Registry & Inference Orchestrator.
- Khi USE_MOCK_ENGINE=true: trả về dữ liệu Contract Mock chuẩn xác cho toàn bộ 5 Demo Cases & 6 Models
  để Frontend (Việt - M3/M4) phát triển song song ngay lập tức.
- Khi USE_MOCK_ENGINE=false: điều phối qua HomoLinkPredictor / HeteroLinkPredictor thật (Tấn - M1).
"""

import json
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

from ..config import DEFAULT_MODEL_ID, REGISTRY_PATH, USE_MOCK_ENGINE
from ..schemas import (
    CytoscapeEdge,
    CytoscapeEdgeData,
    CytoscapeGraphPayload,
    CytoscapeNode,
    CytoscapeNodeData,
    EdgeCategory,
    EvidencePath,
    ExplainPairRequest,
    ExplainPairResponse,
    FeedbackStatus,
    HardNegativeShowcaseItem,
    ModelComparisonScores,
    ModelInfo,
    ModelUsedInfo,
    NodeType,
    PairwiseSummary,
    PredictedLinkItem,
    PredictRequest,
    PredictResponse,
    RadarFeaturePoint,
    RiskLevel,
    SubgraphStats,
    compute_risk_level,
)


def _canonical_pair(u: str, v: str) -> str:
    a, b = sorted([u, v])
    return f"{a}__{b}"


class ModelRegistry:
    def __init__(self):
        self.use_mock: bool = USE_MOCK_ENGINE
        self.default_model_id: str = DEFAULT_MODEL_ID
        self.evaluation_protocol: Dict[str, Any] = {}
        self.models_by_id: Dict[str, ModelInfo] = {}
        self._load_registry()

    def _load_registry(self) -> None:
        with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
            raw = json.load(f)
        self.default_model_id = raw.get("default_model_id", DEFAULT_MODEL_ID)
        self.evaluation_protocol = raw.get("evaluation_protocol", {})
        self.models_by_id = {
            m["model_id"]: ModelInfo(**m) for m in raw.get("models", [])
        }

    def list_models(self) -> Tuple[str, List[ModelInfo]]:
        return self.default_model_id, list(self.models_by_id.values())

    def get_model(self, model_id: str) -> ModelInfo:
        if model_id == "auto_best":
            model_id = self.default_model_id
        if model_id not in self.models_by_id:
            raise KeyError(f"Model '{model_id}' không tồn tại trong model_registry.json")
        return self.models_by_id[model_id]

    def get_hard_negative_showcase(self) -> List[HardNegativeShowcaseItem]:
        return [
            HardNegativeShowcaseItem(
                pair_id="CUST_40111__CUST_45822",
                source="CUST_40111",
                target="CUST_45822",
                scenario_type="TYPE_1_AML_AML_DIFF_CASE",
                ground_truth_label=0,
                ck_gcn_score=0.7140,
                ck_gat_score=0.6620,
                hybrid_v3_score=0.2840,
                explanation_vi=(
                    "Bẫy Type 1: Cả 2 khách hàng đều có cờ AML cao nên GCN/GAT thuần bị cộng hưởng "
                    "nhầm là đồng phạm (> 0.66). Hybrid dùng 24d Pairwise Structural Features phát hiện "
                    "2 nút hoàn toàn không có đường đi chung và hạ xác suất về 28.4% (Lọc đúng)."
                ),
            ),
            HardNegativeShowcaseItem(
                pair_id="CUST_05120__CUST_05188",
                source="CUST_05120",
                target="CUST_05188",
                scenario_type="TYPE_4_SHARED_IP_DEVICE",
                ground_truth_label=0,
                ck_gcn_score=0.6290,
                ck_gat_score=0.5810,
                hybrid_v3_score=0.1420,
                explanation_vi=(
                    "Bẫy Type 4: Hai khách hàng sạch tình cờ dùng chung 1 địa chỉ IP công cộng bậc cao. "
                    "Hybrid giảm trọng số qua Adamic-Adar 1/log(1+deg) và GINEConv để hạ điểm xuống 14.2%."
                ),
            ),
            HardNegativeShowcaseItem(
                pair_id="CUST_41009__CUST_45822",
                source="CUST_41009",
                target="CUST_45822",
                scenario_type="TYPE_1_AML_AML_DIFF_CASE",
                ground_truth_label=0,
                ck_gcn_score=0.6845,
                ck_gat_score=0.6190,
                hybrid_v3_score=0.3120,
                explanation_vi=(
                    "Bẫy Type 1: Thuộc 2 kịch bản Smurfing tách rời; GCN đẩy xác suất 68.5% (dương giả) "
                    "trong khi Hybrid giữ dưới ngưỡng 50.0%."
                ),
            ),
        ]

    # ------------------------------------------------------------------
    # CONTRACT-COMPLIANT MOCK DATA (Cho Việt làm M3 & M4 song song)
    # ------------------------------------------------------------------
    def _mock_case_candidates(self, case_id: str) -> List[Dict[str, Any]]:
        if case_id == "case_03_hard_neg_type1_trap":
            return [
                {
                    "source": "CUST_40111",
                    "target": "CUST_45822",
                    "scores": {"ck_gcn_seed42": 0.7140, "ck_gat_seed42": 0.6620, "hybrid_v3_best": 0.2840, "hybrid_v4_full": 0.2610, "hetero_gat_v4": 0.2780, "hetero_sage_v4": 0.2950},
                    "summary": PairwiseSummary(shared_devices=0, shared_ips=0, direct_tx_count=0, weighted_aa=0.0, ppr_multi_hop_cos=0.01, node_risk_sim=0.92),
                    "paths": [
                        EvidencePath(
                            path_id="PATH_1", path_type="DISCONNECTED_DIFFERENT_CASES",
                            nodes=["CUST_40111", "CUST_45822"], relations=["NO_BEHAVIORAL_BRIDGE"],
                            attention_score=0.04,
                            description="Không tìm thấy cầu nối Thiết bị, IP hay Giao dịch trực tiếp giữa 2 đối tượng (bẫy Type 1).",
                        )
                    ],
                    "explanation_vi": "Lọc đúng bẫy Type 1: Tuy rủi ro cá nhân cao tương đương (0.92) nhưng hoàn toàn rời rạc trên đồ thị hành vi.",
                },
                {
                    "source": "CUST_40111",
                    "target": "CUST_41009",
                    "scores": {"ck_gcn_seed42": 0.7520, "ck_gat_seed42": 0.7910, "hybrid_v3_best": 0.8940, "hybrid_v4_full": 0.9120, "hetero_gat_v4": 0.9050, "hetero_sage_v4": 0.8890},
                    "summary": PairwiseSummary(shared_devices=1, shared_ips=1, direct_tx_count=2, weighted_aa=0.76, ppr_multi_hop_cos=0.41, node_risk_sim=0.89),
                    "paths": [
                        EvidencePath(
                            path_id="PATH_1", path_type="SHARED_DEVICE",
                            nodes=["CUST_40111", "ACC_7710", "DEV_8801", "ACC_7725", "CUST_41009"],
                            relations=["OWNS", "USES_DEVICE", "rev_USES_DEVICE", "rev_OWNS"],
                            attention_score=0.91,
                            description="Cùng sử dụng thiết bị DEV_8801 (tín hiệu chú ý GATv2 = 0.91).",
                        )
                    ],
                    "explanation_vi": "Cảnh báo CAO: Đồng phạm thực sự trong cùng kịch bản qua thiết bị DEV_8801 và 2 giao dịch chuyển khoản.",
                },
            ]

        if case_id == "case_04_hard_neg_type4_trap":
            return [
                {
                    "source": "CUST_05120",
                    "target": "CUST_05188",
                    "scores": {"ck_gcn_seed42": 0.6290, "ck_gat_seed42": 0.5810, "hybrid_v3_best": 0.1420, "hybrid_v4_full": 0.1180, "hetero_gat_v4": 0.1350, "hetero_sage_v4": 0.1590},
                    "summary": PairwiseSummary(shared_devices=0, shared_ips=1, direct_tx_count=0, weighted_aa=0.11, ppr_multi_hop_cos=0.22, node_risk_sim=0.18),
                    "paths": [
                        EvidencePath(
                            path_id="PATH_1", path_type="PUBLIC_IP_HUB",
                            nodes=["CUST_05120", "ACC_1201", "IP_PUB_99", "ACC_1288", "CUST_05188"],
                            relations=["OWNS", "USES_IP", "rev_USES_IP", "rev_OWNS"],
                            attention_score=0.19,
                            description="Dùng chung IP_PUB_99 (nút bậc cao deg=42) -> trọng số Adamic-Adar suy giảm còn 0.11.",
                        )
                    ],
                    "explanation_vi": "An toàn (Lọc đúng bẫy Type 4): Chỉ trùng IP công cộng bậc cao, không có dòng tiền hay thiết bị chung.",
                }
            ]

        # Default rich network (case_01, case_02, case_05, hoặc user uploaded)
        return [
            {
                "source": "CUST_10492",
                "target": "CUST_48210",
                "scores": {"ck_gcn_seed42": 0.7810, "ck_gat_seed42": 0.8125, "hybrid_v3_best": 0.9421, "hybrid_v4_full": 0.9510, "hetero_gat_v4": 0.9480, "hetero_sage_v4": 0.9340},
                "summary": PairwiseSummary(shared_devices=2, shared_ips=1, direct_tx_count=4, weighted_aa=0.84, ppr_multi_hop_cos=0.39, node_risk_sim=0.88),
                "paths": [
                    EvidencePath(
                        path_id="PATH_1", path_type="SHARED_DEVICE",
                        nodes=["CUST_10492", "ACC_0881", "DEV_0992", "ACC_0304", "CUST_48210"],
                        relations=["OWNS", "USES_DEVICE", "rev_USES_DEVICE", "rev_OWNS"],
                        attention_score=0.89,
                        description="Hai khách hàng đăng nhập cùng thiết bị DEV_0992 qua 2 tài khoản trung gian (attention = 0.89).",
                    ),
                    EvidencePath(
                        path_id="PATH_2", path_type="TRANSACTS_CHAIN",
                        nodes=["CUST_10492", "ACC_0881", "ACC_0304", "CUST_48210"],
                        relations=["OWNS", "TRANSACTS", "rev_OWNS"],
                        attention_score=0.76,
                        description="Chuyển khoản trực tiếp 4 lượt giữa ACC_0881 và ACC_0304 (chia nhỏ dưới ngưỡng báo cáo).",
                    ),
                    EvidencePath(
                        path_id="PATH_3", path_type="SHARED_IP",
                        nodes=["CUST_10492", "ACC_0881", "IP_4401", "ACC_0304", "CUST_48210"],
                        relations=["OWNS", "USES_IP", "rev_USES_IP", "rev_OWNS"],
                        attention_score=0.64,
                        description="Truy cập đồng thời từ địa chỉ IP_4401 trong cùng khung giờ.",
                    ),
                ],
                "explanation_vi": "Cảnh báo CAO (94.2%): Chưa khai báo KYC nhưng liên kết chặt qua thiết bị DEV_0992, IP_4401 và 4 giao dịch chia nhỏ.",
            },
            {
                "source": "CUST_48210",
                "target": "CUST_00912",
                "scores": {"ck_gcn_seed42": 0.6120, "ck_gat_seed42": 0.6540, "hybrid_v3_best": 0.8260, "hybrid_v4_full": 0.8490, "hetero_gat_v4": 0.8310, "hetero_sage_v4": 0.8190},
                "summary": PairwiseSummary(shared_devices=0, shared_ips=1, direct_tx_count=2, weighted_aa=0.58, ppr_multi_hop_cos=0.28, node_risk_sim=0.79),
                "paths": [
                    EvidencePath(
                        path_id="PATH_1", path_type="SHARED_BENEFICIARY",
                        nodes=["CUST_48210", "ACC_0304", "BEN_5501", "ACC_0912", "CUST_00912"],
                        relations=["OWNS", "WIRES_TO", "rev_WIRES_TO", "rev_OWNS"],
                        attention_score=0.81,
                        description="Cùng chuyển tiền ra bên thụ hưởng rủi ro cao BEN_5501 (cờ FATF).",
                    )
                ],
                "explanation_vi": "Cảnh báo CAO (82.6%): Hai đối tượng cùng chuyển dòng tiền về bên thụ hưởng BEN_5501 và trùng IP_4401.",
            },
            {
                "source": "CUST_10492",
                "target": "CUST_21804",
                "scores": {"ck_gcn_seed42": 0.4890, "ck_gat_seed42": 0.5020, "hybrid_v3_best": 0.6180, "hybrid_v4_full": 0.6450, "hetero_gat_v4": 0.6310, "hetero_sage_v4": 0.6080},
                "summary": PairwiseSummary(shared_devices=0, shared_ips=0, direct_tx_count=1, weighted_aa=0.34, ppr_multi_hop_cos=0.24, node_risk_sim=0.65),
                "paths": [
                    EvidencePath(
                        path_id="PATH_1", path_type="MULE_INTERMEDIARY",
                        nodes=["CUST_10492", "ACC_0881", "ACC_0304", "ACC_2180", "CUST_21804"],
                        relations=["OWNS", "TRANSACTS", "TRANSACTS", "rev_OWNS"],
                        attention_score=0.59,
                        description="Kết nối gián tiếp 2-hop qua tài khoản trung gian ACC_0304.",
                    )
                ],
                "explanation_vi": "Cảnh báo TRUNG BÌNH (61.8%): Xuất hiện cầu nối dòng tiền 2-hop qua tài khoản trung gian ACC_0304.",
            },
        ]

    def _build_graph_payload(
        self,
        candidates: List[Dict[str, Any]],
        pred_items: List[PredictedLinkItem],
        include_node_types: List[NodeType],
        target_ids: List[str],
    ) -> CytoscapeGraphPayload:
        allowed = set(include_node_types)
        nodes_map: Dict[str, CytoscapeNode] = {}
        edges_map: Dict[str, CytoscapeEdge] = {}

        def _infer_node_type(nid: str) -> NodeType:
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

        for c in candidates:
            for p in c["paths"]:
                p_nodes = p.nodes
                p_rels = p.relations
                filtered_nodes = [nid for nid in p_nodes if _infer_node_type(nid) in allowed]
                for nid in p_nodes:
                    nt = _infer_node_type(nid)
                    if nt not in allowed or nid in nodes_map:
                        continue
                    nodes_map[nid] = CytoscapeNode(
                        data=CytoscapeNodeData(
                            id=nid,
                            label=nid,
                            node_type=nt,
                            risk_score=0.88 if nid in target_ids else (0.72 if nt == NodeType.CUSTOMER else None),
                            is_target=nid in target_ids,
                        )
                    )
                for idx in range(len(p_nodes) - 1):
                    u_n, v_n = p_nodes[idx], p_nodes[idx + 1]
                    rel = p_rels[idx] if idx < len(p_rels) else "RELATED"
                    if rel == "NO_BEHAVIORAL_BRIDGE":
                        continue
                    if _infer_node_type(u_n) in allowed and _infer_node_type(v_n) in allowed:
                        eid = f"obs_{u_n}__{rel}__{v_n}"
                        if eid not in edges_map:
                            edges_map[eid] = CytoscapeEdge(
                                data=CytoscapeEdgeData(
                                    id=eid,
                                    source=u_n,
                                    target=v_n,
                                    relation=rel,
                                    edge_category=EdgeCategory.OBSERVED_EDGE,
                                )
                            )
                # Ensure all customer endpoints exist even if intermediates filtered
                _ = filtered_nodes

        if NodeType.CUSTOMER in allowed:
            for item in pred_items:
                for cid in (item.source, item.target):
                    if cid not in nodes_map:
                        nodes_map[cid] = CytoscapeNode(
                            data=CytoscapeNodeData(
                                id=cid,
                                label=cid,
                                node_type=NodeType.CUSTOMER,
                                risk_score=item.score,
                                is_target=cid in target_ids,
                            )
                        )
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
                    )
                )

        return CytoscapeGraphPayload(nodes=list(nodes_map.values()), edges=list(edges_map.values()))

    def predict(
        self,
        case_id: str,
        req: PredictRequest,
        feedback_map: Optional[Dict[str, FeedbackStatus]] = None,
    ) -> PredictResponse:
        t0 = time.perf_counter()
        model_info = self.get_model(req.model_id)
        applied_threshold = (
            req.probability_threshold if req.probability_threshold is not None else model_info.default_threshold
        )

        if not self.use_mock:
            raise NotImplementedError(
                "USE_MOCK_ENGINE=false nhưng PyTorch Real Engine chưa được cài đặt hoàn chỉnh (TODO Tấn - M1)."
            )

        feedback_map = feedback_map or {}
        candidates = self._mock_case_candidates(case_id)
        pred_items: List[PredictedLinkItem] = []

        for c in candidates:
            pid = _canonical_pair(c["source"], c["target"])
            score = float(c["scores"].get(model_info.model_id, c["scores"]["hybrid_v3_best"]))
            risk = compute_risk_level(score, applied_threshold)
            fb_status = feedback_map.get(pid, FeedbackStatus.PENDING)
            pred_items.append(
                PredictedLinkItem(
                    pair_id=pid,
                    source=c["source"],
                    target=c["target"],
                    score=round(score, 4),
                    risk_level=risk,
                    feedback_status=fb_status,
                    model_comparison=ModelComparisonScores(
                        ck_gcn_seed42=round(c["scores"]["ck_gcn_seed42"], 4),
                        ck_gat_seed42=round(c["scores"]["ck_gat_seed42"], 4),
                        hybrid_v3_best=round(c["scores"]["hybrid_v3_best"], 4),
                    ),
                    pairwise_summary=c["summary"],
                    evidence_paths=c["paths"],
                    explanation_vi=c["explanation_vi"],
                )
            )

        pred_items.sort(key=lambda x: x.score, reverse=True)
        pred_items = pred_items[: req.top_k]

        graph_payload = self._build_graph_payload(
            candidates, pred_items, req.include_node_types, req.target_customer_ids
        )
        elapsed_ms = round((time.perf_counter() - t0) * 1000.0 + 18.5, 2)

        return PredictResponse(
            run_id=f"RUN_{uuid.uuid4().hex[:10].upper()}",
            case_id=case_id,
            model_used=ModelUsedInfo(
                model_id=model_info.model_id,
                display_name=model_info.display_name,
                model_family=model_info.model_family,
                default_threshold=model_info.default_threshold,
                applied_threshold=applied_threshold,
            ),
            execution_time_ms=elapsed_ms,
            subgraph_stats=SubgraphStats(
                total_nodes=len(graph_payload.nodes),
                total_edges=len(graph_payload.edges),
                candidate_pairs_evaluated=max(len(pred_items) * 24, len(pred_items)),
                high_risk_pairs=sum(1 for p in pred_items if p.risk_level == RiskLevel.HIGH),
                medium_risk_pairs=sum(1 for p in pred_items if p.risk_level == RiskLevel.MEDIUM),
            ),
            predictions=pred_items,
            graph_payload=graph_payload,
        )

    def explain_pair(
        self,
        case_id: str,
        req: ExplainPairRequest,
        feedback_map: Optional[Dict[str, FeedbackStatus]] = None,
    ) -> ExplainPairResponse:
        model_info = self.get_model(req.model_id)
        feedback_map = feedback_map or {}
        pid = _canonical_pair(req.source, req.target)

        candidates = self._mock_case_candidates(case_id)
        matched = next((c for c in candidates if _canonical_pair(c["source"], c["target"]) == pid), candidates[0])

        score = float(matched["scores"].get(model_info.model_id, matched["scores"]["hybrid_v3_best"]))
        s: PairwiseSummary = matched["summary"]
        radar = [
            RadarFeaturePoint(axis="Shared Devices", value_normalized=min(s.shared_devices / 3.0, 1.0), raw_display=f"{s.shared_devices} thiết bị"),
            RadarFeaturePoint(axis="Shared IPs", value_normalized=min(s.shared_ips / 3.0, 1.0), raw_display=f"{s.shared_ips} IP"),
            RadarFeaturePoint(axis="Direct TX", value_normalized=min(s.direct_tx_count / 5.0, 1.0), raw_display=f"{s.direct_tx_count} giao dịch"),
            RadarFeaturePoint(axis="Weighted AA", value_normalized=min(s.weighted_aa, 1.0), raw_display=f"{s.weighted_aa:.2f}"),
            RadarFeaturePoint(axis="Multi-hop PPR", value_normalized=min(s.ppr_multi_hop_cos * 2.0, 1.0), raw_display=f"{s.ppr_multi_hop_cos:.2f}"),
            RadarFeaturePoint(axis="Node Risk Sim", value_normalized=min(s.node_risk_sim, 1.0), raw_display=f"{s.node_risk_sim:.2f}"),
        ]

        return ExplainPairResponse(
            case_id=case_id,
            pair_id=pid,
            source=req.source,
            target=req.target,
            model_id=model_info.model_id,
            score=round(score, 4),
            risk_level=compute_risk_level(score, model_info.default_threshold),
            feedback_status=feedback_map.get(pid, FeedbackStatus.PENDING),
            model_comparison=ModelComparisonScores(
                ck_gcn_seed42=round(matched["scores"]["ck_gcn_seed42"], 4),
                ck_gat_seed42=round(matched["scores"]["ck_gat_seed42"], 4),
                hybrid_v3_best=round(matched["scores"]["hybrid_v3_best"], 4),
            ),
            pairwise_summary=s,
            radar_features=radar,
            evidence_paths=matched["paths"],
            explanation_vi=matched["explanation_vi"],
        )


model_registry = ModelRegistry()
