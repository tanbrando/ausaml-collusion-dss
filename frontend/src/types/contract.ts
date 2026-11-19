/**
 * Single Source of Truth (Frontend TypeScript Contract).
 * Khớp 1-đối-1 với backend/app/schemas.py và docs/API_AND_DATA_CONTRACT.md.
 * KHÔNG tự ý đổi tên trường JSON nếu chưa đồng bộ với Backend (Tấn).
 */

export type NodeType =
  | "customer"
  | "account"
  | "device"
  | "ip"
  | "beneficiary"
  | "bank";

export type EdgeCategory =
  | "OBSERVED_EDGE"
  | "PREDICTED_LINK"
  | "CONFIRMED_LINK";

export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

export type FeedbackAction = "CONFIRM" | "DISMISS";

export type FeedbackStatus = "PENDING" | "CONFIRMED" | "DISMISSED";

export type InferenceMode = "subgraph" | "full_graph";

export const NODE_VISUAL_STYLES: Record<
  NodeType,
  { labelVi: string; shape: string; color: string }
> = {
  customer: { labelVi: "Khách hàng", shape: "ellipse", color: "#2563eb" },
  account: { labelVi: "Tài khoản", shape: "round-rectangle", color: "#10b981" },
  device: { labelVi: "Thiết bị", shape: "diamond", color: "#7c3aed" },
  ip: { labelVi: "Địa chỉ IP", shape: "hexagon", color: "#f97316" },
  beneficiary: { labelVi: "Thụ hưởng", shape: "triangle", color: "#eab308" },
  bank: { labelVi: "Ngân hàng", shape: "star", color: "#64748b" },
};

export function computeRiskLevel(score: number, threshold: number): RiskLevel {
  const highCutoff = Math.max(0.75, threshold + 0.2);
  if (score >= highCutoff) return "HIGH";
  if (score >= threshold) return "MEDIUM";
  return "LOW";
}

// ==============================================================================
// 1. MODELS & BENCHMARKS
// ==============================================================================
export interface OverallMetrics {
  roc_auc: string;
  ap: string;
  f1: string;
  hits_at_10: string;
  roc_auc_mean: number;
  ap_mean: number;
  f1_mean: number;
  hits_at_10_mean: number;
}

export interface ScenarioMetrics {
  roc_auc: number | null;
  ap: number | null;
  fpr_at_tau: number | null;
}

export interface ModelInfo {
  model_id: string;
  display_name: string;
  model_family: string;
  architecture_summary: string;
  params: number;
  default_threshold: number;
  supports_attention: boolean;
  is_recommended: boolean;
  metrics_overall: OverallMetrics;
  metrics_scenarios: Record<string, ScenarioMetrics>;
}

export interface ModelListResponse {
  default_model_id: string;
  models: ModelInfo[];
}

export interface HardNegativeShowcaseItem {
  pair_id: string;
  source: string;
  target: string;
  scenario_type: "TYPE_1_AML_AML_DIFF_CASE" | "TYPE_4_SHARED_IP_DEVICE";
  ground_truth_label: number;
  ck_gcn_score: number;
  ck_gat_score: number;
  hybrid_v3_score: number;
  explanation_vi: string;
}

export interface BenchmarkSummaryResponse {
  evaluation_protocol: Record<string, unknown>;
  models: ModelInfo[];
  hard_negative_showcase: HardNegativeShowcaseItem[];
}

// ==============================================================================
// 2. CASE MANAGEMENT & GATE CHECK 1
// ==============================================================================
export interface GateCheckReport {
  passed: boolean;
  node_dims_valid: boolean;
  edge_bounds_valid: boolean;
  nan_count: number;
  inf_count: number;
  reverse_edges_added: number;
  warnings: string[];
  errors: string[];
}

export interface CaseSummary {
  case_id: string;
  title: string;
  description: string;
  source_type: "BUILTIN_DEMO" | "USER_UPLOAD";
  num_customers: number;
  total_nodes: number;
  total_edges: number;
  validation_passed: boolean;
  sample_customer_ids: string[];
  created_at: string;
}

export interface CaseListResponse {
  cases: CaseSummary[];
}

export interface CaseUploadResponse {
  case: CaseSummary;
  gate_check: GateCheckReport;
}

// ==============================================================================
// 3. PREDICTION, EXPLAINABILITY & CYTOSCAPE PAYLOAD
// ==============================================================================
export interface PredictRequest {
  model_id: string;
  target_customer_ids: string[];
  inference_mode: InferenceMode;
  hop_depth: number;
  probability_threshold: number | null;
  top_k: number;
  include_node_types: NodeType[];
}

export interface EvidencePath {
  path_id: string;
  path_type: string;
  nodes: string[];
  relations: string[];
  attention_score: number | null;
  description: string;
}

export interface PairwiseSummary {
  shared_devices: number;
  shared_ips: number;
  direct_tx_count: number;
  weighted_aa: number;
  ppr_multi_hop_cos: number;
  node_risk_sim: number;
}

export interface RadarFeaturePoint {
  axis: string;
  value_normalized: number;
  raw_display: string;
}

export interface ModelComparisonScores {
  ck_gcn_seed42: number;
  ck_gat_seed42: number;
  hybrid_v3_best: number;
}

export interface PredictedLinkItem {
  pair_id: string;
  source: string;
  target: string;
  score: number;
  risk_level: RiskLevel;
  feedback_status: FeedbackStatus;
  model_comparison: ModelComparisonScores;
  pairwise_summary: PairwiseSummary;
  evidence_paths: EvidencePath[];
  explanation_vi: string;
}

export interface CytoscapeNodeData {
  id: string;
  label: string;
  node_type: NodeType;
  risk_score: number | null;
  is_target: boolean;
}

export interface CytoscapeEdgeData {
  id: string;
  source: string;
  target: string;
  relation: string;
  edge_category: EdgeCategory;
  score: number | null;
  risk_level: RiskLevel | null;
  pair_id: string | null;
  feedback_status: FeedbackStatus | null;
}

export interface CytoscapeGraphPayload {
  nodes: Array<{ data: CytoscapeNodeData }>;
  edges: Array<{ data: CytoscapeEdgeData }>;
}

export interface ModelUsedInfo {
  model_id: string;
  display_name: string;
  model_family: string;
  default_threshold: number;
  applied_threshold: number;
}

export interface SubgraphStats {
  total_nodes: number;
  total_edges: number;
  candidate_pairs_evaluated: number;
  high_risk_pairs: number;
  medium_risk_pairs: number;
}

export interface PredictResponse {
  run_id: string;
  case_id: string;
  model_used: ModelUsedInfo;
  execution_time_ms: number;
  subgraph_stats: SubgraphStats;
  predictions: PredictedLinkItem[];
  graph_payload: CytoscapeGraphPayload;
}

export interface ExplainPairRequest {
  source: string;
  target: string;
  model_id: string;
}

export interface ExplainPairResponse {
  case_id: string;
  pair_id: string;
  source: string;
  target: string;
  model_id: string;
  score: number;
  risk_level: RiskLevel;
  feedback_status: FeedbackStatus;
  model_comparison: ModelComparisonScores;
  pairwise_summary: PairwiseSummary;
  radar_features: RadarFeaturePoint[];
  evidence_paths: EvidencePath[];
  explanation_vi: string;
}

// ==============================================================================
// 4. HUMAN-IN-THE-LOOP FEEDBACK & AUDIT LOGS
// ==============================================================================
export interface FeedbackRequest {
  pair_id: string;
  source: string;
  target: string;
  model_id: string;
  predicted_score: number;
  action: FeedbackAction;
  note: string;
  reviewer_name: string;
}

export interface FeedbackRecord {
  id: number;
  case_id: string;
  pair_id: string;
  source_cust_id: string;
  target_cust_id: string;
  model_id: string;
  predicted_score: number;
  action: FeedbackAction;
  note: string;
  reviewer_name: string;
  updated_at: string;
}

export interface AuditLogItem {
  id: number;
  case_id: string;
  event_type: string;
  payload_json: string;
  created_at: string;
}

export interface AuditTrailResponse {
  feedbacks: FeedbackRecord[];
  audit_logs: AuditLogItem[];
}
