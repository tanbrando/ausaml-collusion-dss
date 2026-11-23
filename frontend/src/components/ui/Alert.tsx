"use client";

/** Thông báo inline theo ngữ cảnh (lỗi, cảnh báo, thành công, thông tin) — quy tắc A5. */

import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type AlertTone = "danger" | "warning" | "success" | "info";

const TONE: Record<AlertTone, { box: string; icon: typeof Info }> = {
  danger: { box: "border-danger/25 bg-danger-subtle text-danger-fg", icon: AlertCircle },
  warning: { box: "border-warning/30 bg-warning-subtle text-warning-fg", icon: AlertTriangle },
  success: { box: "border-success/25 bg-success-subtle text-success-fg", icon: CheckCircle2 },
  info: { box: "border-primary/20 bg-primary-subtle text-primary-fg", icon: Info },
};

interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  onClose?: () => void;
  className?: string;
}

export function Alert({ tone = "info", title, children, action, onClose, className }: AlertProps) {
  const { box, icon: Icon } = TONE[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-lg border px-4 py-3 text-sm", box, className)}
    >
      <Icon className="mt-px h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="break-words text-fg-secondary">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông báo"
          className="-m-1 shrink-0 rounded p-1 opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
