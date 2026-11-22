/**
 * Hàm format thuần (Single Responsibility) và từ điển chú giải chỉ số GNN (Open/Closed).
 * - Chuẩn hóa múi giờ UTC -> Asia/Ho_Chi_Minh tại một hàm duy nhất `formatDateVi`.
 */

export function formatPercent(score: number, digits = 1): string {
  return `${(score * 100).toFixed(digits)}%`;
}

/**
 * Backend SQLite/Python đôi khi trả chuỗi ISO UTC không có hậu tố 'Z' (vd: "2026-11-22T15:06:38").
 * Hàm này tự chuẩn hóa về UTC ('Z') rồi format thống nhất theo múi giờ Asia/Ho_Chi_Minh (UTC+7).
 */
export function formatDateVi(ts: string): string {
  if (!ts) return "—";
  try {
    const trimmed = ts.trim();
    const hasTimezone =
      trimmed.endsWith("Z") ||
      trimmed.endsWith("z") ||
      /[+-]\d{2}:?\d{2}$/.test(trimmed);
    const normalizedIso = hasTimezone
      ? trimmed
      : `${trimmed.replace(" ", "T")}Z`;
    const date = new Date(normalizedIso);
    if (Number.isNaN(date.getTime())) return ts;

    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      dateStyle: "short",
      timeStyle: "medium",
    }).format(date);
  } catch {
    return ts;
  }
}

/**
 * Rút gọn tiêu đề vụ án theo từ nguyên vẹn để vừa khung dropdown <select> mà không bị cắt ngang chữ.
 */
export function shortCaseTitle(title: string, maxLen = 44): string {
  const clean = title.trim();
  if (clean.length <= maxLen) return clean;
  const sliced = clean.slice(0, maxLen);
  const lastSpace = sliced.lastIndexOf(" ");
  return `${lastSpace > 20 ? sliced.slice(0, lastSpace) : sliced}…`;
}

const SHORT_MODEL_LABELS: Record<string, string> = {
  hybrid_v4_full: "Hybrid v4",
  hetero_gat_v4: "HeteroGAT v4",
  hetero_sage_v4: "HeteroSAGE v4",
  ck_gcn_seed42: "CK GCN",
  ck_gat_seed42: "CK GAT",
};

export function shortModelLabel(modelId: string, displayName: string): string {
  return SHORT_MODEL_LABELS[modelId] ?? displayName.slice(0, 18);
}

export const METRIC_TOOLTIPS: Record<string, string> = {
  tau: "Ngưỡng quyết định tối ưu (τ_val) được chọn trên tập Validation theo F1-score.",
  roc_auc:
    "ROC-AUC: Diện tích dưới đường cong ROC — đo khả năng phân biệt cặp đồng phạm và cặp bình thường ở mọi ngưỡng.",
  ap: "AP (Average Precision / PR-AUC): Độ chính xác trung bình trên đường cong Precision-Recall, đặc biệt quan trọng khi dữ liệu mất cân bằng.",
  f1: "F1-Score: Trung bình điều hòa giữa Precision và Recall tại ngưỡng τ_val.",
  hits_at_10:
    "Hits@10: Tỷ lệ liên kết đồng phạm thật lọt vào Top-10 ứng viên có điểm cao nhất (đánh giá khả năng xếp hạng).",
  fpr_at_tau:
    "FPR@τ (False Positive Rate): Tỷ lệ báo động giả tại ngưỡng τ_val (càng thấp càng tốt, đặc biệt trên ca bẫy Type 1 & Type 4).",
};
