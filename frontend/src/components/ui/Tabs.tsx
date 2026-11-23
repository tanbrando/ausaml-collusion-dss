"use client";

/**
 * Tabs (gạch chân, chuyển nội dung) & SegmentedControl (nút chọn 1 trong N) — quy tắc A4, A6.
 * Cả hai hỗ trợ phím mũi tên ←/→, Home/End và có role ARIA đầy đủ.
 */

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface TabOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
  count?: number;
  disabled?: boolean;
}

function useRovingKeys<T extends string>(
  options: TabOption<T>[],
  value: T,
  onChange: (v: T) => void
) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = options.filter((o) => !o.disabled);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const idx = enabled.findIndex((o) => o.value === value);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % enabled.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (idx - 1 + enabled.length) % enabled.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = enabled.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const target = enabled[next];
    onChange(target.value);
    const realIdx = options.findIndex((o) => o.value === target.value);
    refs.current[realIdx]?.focus();
  };

  return { refs, onKeyDown };
}

interface TabsProps<T extends string> {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  /** Tabs chiếm đều chiều ngang (dùng trong panel hẹp). */
  fill?: boolean;
  idPrefix?: string;
}

export function Tabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  fill = false,
  idPrefix,
}: TabsProps<T>) {
  const { refs, onKeyDown } = useRovingKeys(options, value, onChange);

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex items-end gap-6 border-b border-line", fill && "gap-0", className)}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-tab-${opt.value}` : undefined}
            aria-controls={idPrefix ? `${idPrefix}-panel-${opt.value}` : undefined}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            onKeyDown={onKeyDown}
            className={cn(
              "-mb-px inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap border-b-2 text-base font-medium transition-colors",
              "focus-visible:outline-offset-[-2px] disabled:opacity-50",
              fill && "flex-1 px-2",
              selected
                ? "border-primary text-fg"
                : "border-transparent text-muted hover:border-line-strong hover:text-fg"
            )}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden />}
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                className={cn(
                  "num rounded-full px-1.5 text-xs",
                  selected ? "bg-primary-subtle text-primary-fg" : "bg-subtle text-muted"
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface SegmentedControlProps<T extends string> {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "sm",
  className,
}: SegmentedControlProps<T>) {
  const { refs, onKeyDown } = useRovingKeys(options, value, onChange);

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center rounded-md border border-line bg-subtle p-0.5", className)}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            onKeyDown={onKeyDown}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded font-medium transition-colors disabled:opacity-50",
              size === "sm" ? "h-7 px-2.5 text-sm" : "h-8 px-3 text-sm",
              selected
                ? "bg-surface text-fg shadow-sm"
                : "text-muted hover:text-fg"
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
            {opt.label}
            {opt.count !== undefined && <span className="num text-xs text-muted">{opt.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

interface FilterChipProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
  /** Chấm màu ngữ nghĩa bên trái (vd: mức rủi ro). */
  dotClassName?: string;
  title?: string;
}

/** Chip lọc dạng bật/tắt (aria-pressed). Dùng cho bộ lọc nhiều lựa chọn ngang hàng. */
export function FilterChip({ selected, onClick, children, count, dotClassName, title }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium transition-colors",
        selected
          ? "border-primary/40 bg-primary-subtle text-primary-fg"
          : "border-line bg-surface text-fg-secondary hover:border-line-strong hover:bg-subtle"
      )}
    >
      {dotClassName && <span className={cn("h-2 w-2 rounded-full", dotClassName)} aria-hidden />}
      {children}
      {count !== undefined && (
        <span className={cn("num text-xs", selected ? "text-primary-fg" : "text-muted")}>{count}</span>
      )}
    </button>
  );
}
