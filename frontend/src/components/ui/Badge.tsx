/**
 * Component Badge & các Liskov wrappers (RiskBadge, StatusBadge, ActionBadge).
 * Áp dụng Open/Closed: dùng bảng ánh xạ cấu hình thay vì chuỗi if/else.
 */

import type { ReactNode } from "react";
import type {
  FeedbackAction,
  FeedbackStatus,
  RiskLevel,
} from "@/types/contract";

export type BadgeVariant =
  | "danger"
  | "warning"
  | "neutral"
  | "success"
  | "info"
  | "purple";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  danger: "bg-red-50 text-red-700 border-red-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  neutral: "bg-slate-100 text-slate-600 border-slate-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
};

interface BadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant, children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

const RISK_VARIANT_MAP: Record<RiskLevel, BadgeVariant> = {
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "neutral",
};

const RISK_LABEL_VI: Record<RiskLevel, string> = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
};

export function RiskBadge({
  level,
  suffix,
}: {
  level: RiskLevel;
  suffix?: string;
}) {
  return (
    <Badge variant={RISK_VARIANT_MAP[level]}>
      <span>{RISK_LABEL_VI[level]}</span>
      {suffix && <span className="num">· {suffix}</span>}
    </Badge>
  );
}

const STATUS_VARIANT_MAP: Record<FeedbackStatus, BadgeVariant> = {
  PENDING: "info",
  CONFIRMED: "danger",
  DISMISSED: "neutral",
};

const STATUS_LABEL_MAP: Record<FeedbackStatus, string> = {
  PENDING: "Chờ duyệt",
  CONFIRMED: "✓ Đồng phạm",
  DISMISSED: "✕ Đã bác bỏ",
};

export function StatusBadge({ status }: { status: FeedbackStatus }) {
  return (
    <Badge
      variant={STATUS_VARIANT_MAP[status]}
      className={status === "DISMISSED" ? "line-through opacity-75" : ""}
    >
      {STATUS_LABEL_MAP[status]}
    </Badge>
  );
}

const ACTION_VARIANT_MAP: Record<FeedbackAction, BadgeVariant> = {
  CONFIRM: "danger",
  DISMISS: "neutral",
};

export function ActionBadge({ action }: { action: FeedbackAction }) {
  return (
    <Badge variant={ACTION_VARIANT_MAP[action]}>
      {action === "CONFIRM" ? "✓ CONFIRM (Đồng phạm)" : "✕ DISMISS (Bác bỏ)"}
    </Badge>
  );
}
