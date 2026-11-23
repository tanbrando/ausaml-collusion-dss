/**
 * Badge & các biến thể nghiệp vụ (RiskBadge, StatusBadge, ActionBadge).
 * Màu theo nghĩa (quy tắc A1), nhãn tiếng Việt từ glossary (quy tắc A7), có icon/chấm để không phụ thuộc màu (A6).
 */

import type { ReactNode } from "react";
import { Check, Clock, X } from "lucide-react";
import type { FeedbackAction, FeedbackStatus, RiskLevel } from "@/types/contract";
import { ACTION_LABEL, RISK_LABEL, STATUS_LABEL } from "@/lib/i18n/labels";
import { cn } from "@/lib/cn";

export type BadgeVariant = "neutral" | "primary" | "success" | "warning" | "danger";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: "border-line bg-subtle text-fg-secondary",
  primary: "border-primary/20 bg-primary-subtle text-primary-fg",
  success: "border-success/25 bg-success-subtle text-success-fg",
  warning: "border-warning/30 bg-warning-subtle text-warning-fg",
  danger: "border-danger/25 bg-danger-subtle text-danger-fg",
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
  title?: string;
}

export function Badge({ variant = "neutral", children, className, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-xs font-medium",
        VARIANT_CLASSES[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

const RISK_VARIANT: Record<RiskLevel, BadgeVariant> = {
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "neutral",
};

export const RISK_DOT: Record<RiskLevel, string> = {
  HIGH: "bg-risk-high",
  MEDIUM: "bg-risk-medium",
  LOW: "bg-risk-low",
};

export function RiskBadge({ level, suffix, className }: { level: RiskLevel; suffix?: string; className?: string }) {
  return (
    <Badge variant={RISK_VARIANT[level]} className={className}>
      <span className={cn("h-1.5 w-1.5 rounded-full", RISK_DOT[level])} aria-hidden />
      <span>{RISK_LABEL[level]}</span>
      {suffix && <span className="num font-mono">· {suffix}</span>}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: FeedbackStatus }) {
  if (status === "CONFIRMED") {
    return (
      <Badge variant="danger">
        <Check className="h-3 w-3" aria-hidden />
        {STATUS_LABEL.CONFIRMED}
      </Badge>
    );
  }
  if (status === "DISMISSED") {
    return (
      <Badge variant="neutral" className="text-muted">
        <X className="h-3 w-3" aria-hidden />
        {STATUS_LABEL.DISMISSED}
      </Badge>
    );
  }
  return (
    <Badge variant="neutral" className="border-transparent bg-transparent px-0 text-muted">
      <Clock className="h-3 w-3" aria-hidden />
      {STATUS_LABEL.PENDING}
    </Badge>
  );
}

export function ActionBadge({ action }: { action: FeedbackAction }) {
  return action === "CONFIRM" ? (
    <Badge variant="danger">
      <Check className="h-3 w-3" aria-hidden />
      {ACTION_LABEL.CONFIRM}
    </Badge>
  ) : (
    <Badge variant="neutral">
      <X className="h-3 w-3" aria-hidden />
      {ACTION_LABEL.DISMISS}
    </Badge>
  );
}
