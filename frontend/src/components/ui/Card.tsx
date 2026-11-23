/**
 * Card & các khối trình bày tĩnh dùng chung: Card, CardHeader, StatTile, PageHeader,
 * PageContainer, EmptyState, Skeleton, Kbd (quy tắc A2, A3, A5).
 */

import type { HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn("rounded-lg border border-line bg-surface shadow-sm", className)}
      {...rest}
    >
      {children}
    </section>
  );
}

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
  className?: string;
  /** id cho tiêu đề — dùng cho aria-labelledby hoặc anchor mục lục. */
  titleId?: string;
}

export function CardHeader({ title, description, actions, icon: Icon, className, titleId }: CardHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-4",
        className
      )}
    >
      <div className="min-w-0">
        <h2 id={titleId} className="flex items-center gap-2 text-lg font-semibold text-fg">
          {Icon && <Icon className="h-4 w-4 text-muted" aria-hidden />}
          {title}
        </h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  /** Màu số liệu chính — mặc định trung tính; chỉ dùng màu khi số mang ý nghĩa ngữ nghĩa. */
  tone?: "default" | "primary" | "success" | "danger" | "muted";
  className?: string;
}

const TONE_TEXT: Record<NonNullable<StatTileProps["tone"]>, string> = {
  default: "text-fg",
  primary: "text-primary-fg",
  success: "text-success-fg",
  danger: "text-danger-fg",
  muted: "text-fg-secondary",
};

export function StatTile({ label, value, hint, icon: Icon, tone = "default", className }: StatTileProps) {
  return (
    <div className={cn("min-w-0 px-5 py-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm text-muted">{label}</span>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-faint" aria-hidden />}
      </div>
      <div className={cn("num mt-1 text-2xl font-semibold tracking-tight", TONE_TEXT[tone])}>{value}</div>
      {hint && <div className="mt-1 text-sm text-muted">{hint}</div>}
    </div>
  );
}

/** Dải thống kê: nhiều StatTile trong một card, ngăn cách bằng đường kẻ. */
export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Card
      className={cn(
        "grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:auto-cols-fr lg:grid-flow-col lg:divide-x",
        className
      )}
    >
      {children}
    </Card>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-base text-muted">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-8", className)}>
      {children}
    </div>
  );
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ icon: Icon, title, description, action, className, compact = false }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-12",
        className
      )}
    >
      {Icon && (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-subtle text-muted">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      )}
      <div className="space-y-1">
        <p className="text-base font-medium text-fg">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-subtle", className)} aria-hidden />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-subtle px-1 font-mono text-xs text-muted">
      {children}
    </kbd>
  );
}
