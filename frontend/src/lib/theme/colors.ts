/**
 * Nguồn hex duy nhất cho các thư viện không đọc được class Tailwind (Cytoscape, Recharts).
 * Giá trị phải khớp với CSS variables trong `src/app/globals.css`.
 */

import type { NodeType, RiskLevel } from "@/types/contract";

export const HEX = {
  fg: "#0f172a",
  fgSecondary: "#334155",
  muted: "#64748b",
  faint: "#94a3b8",
  line: "#e2e8f0",
  lineStrong: "#cbd5e1",
  surface: "#ffffff",
  bg: "#f6f7f9",

  primary: "#2563eb",
  primaryDark: "#1e40af",
  danger: "#dc2626",
  dangerDark: "#991b1b",
  warning: "#d97706",
  warningDark: "#b45309",
  success: "#16a34a",
} as const;

export const RISK_HEX: Record<RiskLevel, string> = {
  HIGH: HEX.danger,
  MEDIUM: HEX.warning,
  LOW: HEX.faint,
};

/**
 * 6 lớp thực thể theo SRS FR-05.1 (hình dạng + màu). Màu node chỉ dùng cho đồ thị và legend.
 */
export const NODE_VISUAL_STYLES: Record<
  NodeType,
  { labelVi: string; shape: string; color: string }
> = {
  customer: { labelVi: "Khách hàng", shape: "ellipse", color: "#2563eb" },
  account: { labelVi: "Tài khoản", shape: "round-rectangle", color: "#059669" },
  device: { labelVi: "Thiết bị", shape: "diamond", color: "#7c3aed" },
  ip: { labelVi: "Địa chỉ IP", shape: "hexagon", color: "#ea580c" },
  beneficiary: { labelVi: "Thụ hưởng", shape: "triangle", color: "#ca8a04" },
  bank: { labelVi: "Ngân hàng", shape: "star", color: "#64748b" },
};

/**
 * Màu cố định theo MÔ HÌNH trên mọi biểu đồ (quy tắc A8):
 * mô hình triển khai chính dùng primary, các ablation dùng sắc xanh nhạt, CK baseline dùng xám.
 */
export const MODEL_HEX: Record<string, string> = {
  hybrid_v4_full: "#2563eb",
  hetero_gat_v4: "#7aa7f0",
  hetero_sage_v4: "#b4cdf6",
  ck_gat_seed42: "#94a3b8",
  ck_gcn_seed42: "#cbd5e1",
};

const FALLBACK_MODEL_HEX = ["#64748b", "#94a3b8", "#cbd5e1", "#475569"];

export function modelColor(modelId: string, index = 0): string {
  return MODEL_HEX[modelId] ?? FALLBACK_MODEL_HEX[index % FALLBACK_MODEL_HEX.length];
}

/** Style dùng chung cho Recharts để mọi biểu đồ đồng nhất. */
export const CHART_THEME = {
  grid: HEX.line,
  axisTick: { fontSize: 12, fill: HEX.muted },
  axisLabel: { fontSize: 12, fill: HEX.fgSecondary },
  tooltip: {
    contentStyle: {
      fontSize: 13,
      borderRadius: 8,
      border: `1px solid ${HEX.line}`,
      boxShadow: "0 4px 12px -2px rgb(15 23 42 / 0.10)",
      padding: "8px 12px",
    },
    labelStyle: { color: HEX.fg, fontWeight: 600, marginBottom: 4 },
    itemStyle: { padding: 0 },
  },
  legend: { fontSize: 13, color: HEX.fgSecondary },
} as const;
