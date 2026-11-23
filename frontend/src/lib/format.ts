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
export function parseServerDate(ts: string): Date | null {
  if (!ts) return null;
  const trimmed = ts.trim();
  const hasTimezone = /[zZ]$/.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed);
  const date = new Date(hasTimezone ? trimmed : `${trimmed.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateVi(ts: string): string {
  if (!ts) return "—";
  const date = parseServerDate(ts);
  if (!date) return ts;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
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

// Nhãn mô hình & chú giải chỉ số đã chuyển sang glossary dùng chung (quy tắc A7).
export { METRIC_TOOLTIPS, shortModelLabel } from "@/lib/i18n/labels";

export function formatNumber(value: number): string {
  return value.toLocaleString("vi-VN");
}
