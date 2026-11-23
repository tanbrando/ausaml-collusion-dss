/**
 * Glossary nhãn giao diện (quy tắc A7) — nguồn duy nhất cho mọi chữ hiển thị lặp lại.
 * - Nhãn & hành động: tiếng Việt, viết hoa kiểu câu.
 * - Thuật ngữ kỹ thuật giữ nguyên: ROC-AUC, AP, F1, Hits@10, FPR@τ, τ, GNN, tên mô hình.
 */

import type {
  FeedbackAction,
  FeedbackStatus,
  HardNegativeShowcaseItem,
  RiskLevel,
} from "@/types/contract";

export const RISK_LABEL: Record<RiskLevel, string> = {
  HIGH: "Cao",
  MEDIUM: "Trung bình",
  LOW: "Thấp",
};

export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  PENDING: "Chờ xử lý",
  CONFIRMED: "Đã xác nhận",
  DISMISSED: "Đã bác bỏ",
};

export const ACTION_LABEL: Record<FeedbackAction, string> = {
  CONFIRM: "Xác nhận đồng phạm",
  DISMISS: "Bác bỏ",
};

export const EVENT_TYPE_LABEL: Record<string, string> = {
  FEEDBACK: "Thẩm định",
  UPLOAD: "Tải lên",
  PREDICT: "Suy luận",
  EXPLAIN: "Giải thích",
  EXPORT: "Xuất báo cáo",
};

export function eventTypeLabel(eventType: string): string {
  return EVENT_TYPE_LABEL[eventType] ?? eventType;
}

export const TRAP_TYPE_LABEL: Record<HardNegativeShowcaseItem["scenario_type"], string> = {
  TYPE_1_AML_AML_DIFF_CASE: "Type 1 · AML–AML khác vụ án",
  TYPE_4_SHARED_IP_DEVICE: "Type 4 · Trùng IP/thiết bị",
};

export const SCENARIO_LABEL = {
  scenario_1_aml_aml: "Kịch bản 1 · AML–AML",
  scenario_4_shared_ip_dev: "Kịch bản 4 · Trùng IP/thiết bị",
} as const;

const SHORT_MODEL_LABELS: Record<string, string> = {
  hybrid_v4_full: "Hybrid v4",
  hetero_gat_v4: "HeteroGAT v4",
  hetero_sage_v4: "HeteroSAGE v4",
  ck_gcn_seed42: "CK GCN",
  ck_gat_seed42: "CK GAT",
};

export function shortModelLabel(modelId: string, displayName?: string): string {
  return SHORT_MODEL_LABELS[modelId] ?? (displayName ?? modelId).slice(0, 18);
}

export const METRIC_TOOLTIPS: Record<string, string> = {
  tau: "Ngưỡng quyết định tối ưu (τ_val) được chọn trên tập validation theo F1-score.",
  roc_auc:
    "ROC-AUC: diện tích dưới đường cong ROC — đo khả năng phân biệt cặp đồng phạm và cặp bình thường ở mọi ngưỡng.",
  ap: "AP (Average Precision / PR-AUC): độ chính xác trung bình trên đường cong Precision-Recall, quan trọng khi dữ liệu mất cân bằng.",
  f1: "F1-score: trung bình điều hòa giữa Precision và Recall tại ngưỡng τ_val.",
  hits_at_10:
    "Hits@10: tỷ lệ liên kết đồng phạm thật lọt vào top-10 ứng viên có điểm cao nhất.",
  fpr_at_tau:
    "FPR@τ: tỷ lệ báo động giả tại ngưỡng τ_val — càng thấp càng tốt, đặc biệt trên ca bẫy Type 1 & Type 4.",
};

/** Nhãn 5 hạng mục kiểm định dữ liệu khi tải lên file .pt (thay cho "Gate Check 1"). */
export const GATE_CHECK_LABEL = {
  title: "Kiểm định dữ liệu",
  node_dims: "Kích thước đặc trưng 6 lớp thực thể",
  edge_bounds: "Chỉ số cạnh nằm trong biên",
  nan: "Không có giá trị NaN",
  inf: "Không có giá trị Inf",
  reverse_edges: "Cạnh đảo chiều được bổ sung",
} as const;
