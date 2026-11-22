/**
 * Component Card chuẩn Design System (Single Responsibility).
 * Đồng nhất khung viền, header, subtitle và action cho cả 4 màn hình.
 */

import type { ReactNode } from "react";

interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
  bodyClassName = "p-4",
}: CardProps) {
  return (
    <section
      className={`flex min-h-0 flex-col rounded-xl border border-slate-200/90 bg-white shadow-sm ${className}`}
    >
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            {title && (
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
