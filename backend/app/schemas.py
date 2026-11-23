"""
Single Source of Truth — Pydantic v2 Schemas cho toàn bộ 8 REST API Endpoints.
Phải giữ đồng bộ 1-đối-1 với frontend/src/types/contract.ts và docs/API_AND_DATA_CONTRACT.md.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


class NodeType(str, Enum):
    CUSTOMER = "customer"
    ACCOUNT = "account"
    DEVICE = "device"
    IP = "ip"
    BENEFICIARY = "beneficiary"
    BANK = "bank"


class EdgeCategory(str, Enum):
    OBSERVED_EDGE = "OBSERVED_EDGE"
    PREDICTED_LINK = "PREDICTED_LINK"
    CONFIRMED_LINK = "CONFIRMED_LINK"


class RiskLevel(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class FeedbackAction(str, Enum):
    CONFIRM = "CONFIRM"
    DISMISS = "DISMISS"


class FeedbackStatus(str, Enum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    DISMISSED = "DISMISSED"


class InferenceMode(str, Enum):
    SUBGRAPH = "subgraph"
    FULL_GRAPH = "full_graph"


def compute_risk_level(score: float, threshold: float) -> RiskLevel:
    """Phân tầng rủi ro động theo ngưỡng tau_val của checkpoint."""
    high_cutoff = max(0.75, threshold + 0.20)
    if score >= high_cutoff:
        return RiskLevel.HIGH
    if score >= threshold:
        return RiskLevel.MEDIUM
    return RiskLevel.LOW


# ==============================================================================
# 1. MODELS & BENCHMARKS SCHEMAS
# ==============================================================================
class OverallMetrics(BaseModel):
    roc_auc: str
    ap: str
    f1: str
    hits_at_10: str
    roc_auc_mean: float
    ap_mean: float
    f1_mean: float
    hits_at_10_mean: float


class ScenarioMetrics(BaseModel):
    roc_auc: Optional[float] = None
    ap: Optional[float] = None
    fpr_at_tau: Optional[float] = None


class ModelInfo(BaseModel):
    model_id: str
    display_name: str
    model_family: str
    architecture_summary: str
    params: int
    default_threshold: float
    supports_attention: bool
    is_recommended: bool = False
    metrics_overall: OverallMetrics
    metrics_scenarios: Dict[str, ScenarioMetrics]


class ModelListResponse(BaseModel):
    default_model_id: str
    models: List[ModelInfo]


class HardNegativeShowcaseItem(BaseModel):
    pair_id: str
    source: str
    target: str
    scenario_type: Literal["TYPE_1_AML_AML_DIFF_CASE", "TYPE_4_SHARED_IP_DEVICE"]
    ground_truth_label: int = 0
    ck_gcn_score: float
    ck_gat_score: float
    hybrid_v3_score: float
    explanation_vi: str


class BenchmarkSummaryResponse(BaseModel):
    evaluation_protocol: Dict[str, Any]
    models: List[ModelInfo]
    hard_negative_showcase: List[HardNegativeShowcaseItem]


# ==============================================================================
# 2. CASE MANAGEMENT & VALIDATION SCHEMAS
# ==============================================================================
class GateCheckReport(BaseModel):
    passed: bool
    node_dims_valid: bool
    edge_bounds_valid: bool
    nan_count: int = 0
    inf_count: int = 0
    reverse_edges_added: int = 0
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)


class CaseSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    case_id: str
    title: str
    description: str = ""
    source_type: Literal["BUILTIN_DEMO", "USER_UPLOAD"]
    num_customers: int
    total_nodes: int
    total_edges: int
    validation_passed: bool
    sample_customer_ids: List[str] = Field(default_factory=list)
    created_at: datetime


class CaseListResponse(BaseModel):
    cases: List[CaseSummary]


class CaseUploadResponse(BaseModel):
    case: CaseSummary
    gate_check: GateCheckReport


# ==============================================================================
# 3. INFERENCE, EXPLAINABILITY & CYTOSCAPE PAYLOAD SCHEMAS
# ==============================================================================
class PredictRequest(BaseModel):
    model_id: str = "hybrid_v4_full"
    target_customer_ids: List[str] = Field(default_factory=list)
    inference_mode: InferenceMode = InferenceMode.SUBGRAPH
    hop_depth: int = Field(default=2, ge=1, le=3)
    probability_threshold: Optional[float] = Field(default=None, ge=0.05, le=0.95)
    top_k: int = Field(default=20, ge=1, le=200)
    include_node_types: List[NodeType] = Field(
        default_factory=lambda: [
            NodeType.CUSTOMER,
            NodeType.ACCOUNT,
            NodeType.DEVICE,
            NodeType.IP,
            NodeType.BENEFICIARY,
            NodeType.BANK,
        ]
    )


class EvidencePath(BaseModel):
    path_id: str
    path_type: str
    nodes: List[str]
    relations: List[str]
    attention_score: Optional[float] = None
    description: str


class PairwiseSummary(BaseModel):
    shared_devices: int = 0
    shared_ips: int = 0
    direct_tx_count: int = 0
    weighted_aa: float = 0.0
    ppr_multi_hop_cos: float = 0.0
    node_risk_sim: float = 0.0


class RadarFeaturePoint(BaseModel):
    axis: str
    value_normalized: float = Field(ge=0.0, le=1.0)
    raw_display: str


class ModelComparisonScores(BaseModel):
    ck_gcn_seed42: float
    ck_gat_seed42: float
    hybrid_v3_best: float


class PredictedLinkItem(BaseModel):
    pair_id: str
    source: str
    target: str
    score: float
    risk_level: RiskLevel
    feedback_status: FeedbackStatus = FeedbackStatus.PENDING
    model_comparison: ModelComparisonScores
    pairwise_summary: PairwiseSummary
    evidence_paths: List[EvidencePath]
    explanation_vi: str


class EntityAttributeItem(BaseModel):
    label: str
    value: str
    tone: Literal["neutral", "info", "warning", "danger", "success"] = "neutral"


class CytoscapeNodeData(BaseModel):
    id: str
    label: str
    node_type: NodeType
    risk_score: Optional[float] = None
    is_target: bool = False
    subtitle: Optional[str] = None
    attributes: List[EntityAttributeItem] = Field(default_factory=list)


class CytoscapeNode(BaseModel):
    data: CytoscapeNodeData


class CytoscapeEdgeData(BaseModel):
    id: str
    source: str
    target: str
    relation: str
    edge_category: EdgeCategory
    score: Optional[float] = None
    risk_level: Optional[RiskLevel] = None
    pair_id: Optional[str] = None
    feedback_status: Optional[FeedbackStatus] = None
    detail_label: Optional[str] = None
    attributes: List[EntityAttributeItem] = Field(default_factory=list)


class CytoscapeEdge(BaseModel):
    data: CytoscapeEdgeData


class CytoscapeGraphPayload(BaseModel):
    nodes: List[CytoscapeNode]
    edges: List[CytoscapeEdge]


class ModelUsedInfo(BaseModel):
    model_id: str
    display_name: str
    model_family: str
    default_threshold: float
    applied_threshold: float


class SubgraphStats(BaseModel):
    total_nodes: int
    total_edges: int
    candidate_pairs_evaluated: int
    high_risk_pairs: int
    medium_risk_pairs: int


class PredictResponse(BaseModel):
    run_id: str
    case_id: str
    model_used: ModelUsedInfo
    execution_time_ms: float
    subgraph_stats: SubgraphStats
    predictions: List[PredictedLinkItem]
    graph_payload: CytoscapeGraphPayload


class ExplainPairRequest(BaseModel):
    source: str
    target: str
    model_id: str = "hybrid_v4_full"


class ExplainPairResponse(BaseModel):
    case_id: str
    pair_id: str
    source: str
    target: str
    model_id: str
    score: float
    risk_level: RiskLevel
    feedback_status: FeedbackStatus
    model_comparison: ModelComparisonScores
    pairwise_summary: PairwiseSummary
    radar_features: List[RadarFeaturePoint]
    evidence_paths: List[EvidencePath]
    explanation_vi: str


# ==============================================================================
# 4. HUMAN-IN-THE-LOOP FEEDBACK & AUDIT LOG SCHEMAS
# ==============================================================================
class FeedbackRequest(BaseModel):
    pair_id: str
    source: str
    target: str
    model_id: str
    predicted_score: float = Field(ge=0.0, le=1.0)
    action: FeedbackAction
    note: str = ""
    reviewer_name: str = "Investigator"


class FeedbackRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    case_id: str
    pair_id: str
    source_cust_id: str
    target_cust_id: str
    model_id: str
    predicted_score: float
    action: FeedbackAction
    note: str
    reviewer_name: str
    updated_at: datetime


class AuditLogItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    case_id: str
    event_type: str
    payload_json: str
    created_at: datetime


class AuditTrailResponse(BaseModel):
    feedbacks: List[FeedbackRecord]
    audit_logs: List[AuditLogItem]
