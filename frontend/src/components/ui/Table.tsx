"use client";

/**
 * Bảng dữ liệu dùng chung (quy tắc A2, A6):
 * - Header dính, cỡ chữ 13px, số liệu căn phải + tabular-nums.
 * - Dòng chọn được bằng chuột lẫn bàn phím (Enter/Space), có trạng thái đang chọn rõ ràng.
 */

import { forwardRef, type HTMLAttributes, type ReactNode, type TdHTMLAttributes, type ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function TableContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("scrollbar-thin overflow-auto", className)}>{children}</div>;
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return <table className={cn("w-full border-collapse text-left text-sm", className)}>{children}</table>;
}

export function THead({ children, sticky = true }: { children: ReactNode; sticky?: boolean }) {
  return (
    <thead className={cn("bg-subtle", sticky && "sticky top-0 z-10")}>
      {children}
    </thead>
  );
}

type Align = "left" | "right" | "center";
const ALIGN: Record<Align, string> = { left: "text-left", right: "text-right", center: "text-center" };

interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: Align;
}

export function Th({ align = "left", className, children, ...rest }: ThProps) {
  return (
    <th
      scope="col"
      className={cn(
        "h-9 whitespace-nowrap border-b border-line px-3 text-xs font-medium text-muted first:pl-5 last:pr-5",
        ALIGN[align],
        className
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: Align;
  numeric?: boolean;
}

export function Td({ align, numeric = false, className, children, ...rest }: TdProps) {
  return (
    <td
      className={cn(
        "px-3 py-2.5 align-middle text-fg first:pl-5 last:pr-5",
        ALIGN[align ?? (numeric ? "right" : "left")],
        numeric && "num whitespace-nowrap font-mono",
        className
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

interface TrProps extends HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
  /** Khi có onSelect, dòng trở thành phần tử tương tác (focus được, Enter/Space để chọn). */
  onSelect?: () => void;
  muted?: boolean;
}

export const Tr = forwardRef<HTMLTableRowElement, TrProps>(function Tr(
  { selected = false, onSelect, muted = false, className, children, onKeyDown, ...rest },
  ref
) {
  const interactive = Boolean(onSelect);
  return (
    <tr
      ref={ref}
      tabIndex={interactive ? 0 : undefined}
      aria-selected={interactive ? selected : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (interactive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect?.();
        }
        onKeyDown?.(e);
      }}
      className={cn(
        "border-b border-line transition-colors last:border-b-0",
        interactive && "cursor-pointer focus-visible:outline-offset-[-2px]",
        selected
          ? "bg-primary-subtle shadow-[inset_3px_0_0_rgb(var(--primary))]"
          : interactive && "hover:bg-subtle",
        muted && !selected && "text-muted [&_td]:text-muted",
        className
      )}
      {...rest}
    >
      {children}
    </tr>
  );
});
