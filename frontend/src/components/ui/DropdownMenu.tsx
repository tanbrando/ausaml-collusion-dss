"use client";

/**
 * Menu thả xuống nhẹ (role="menu"): mở bằng click/Enter/↓, điều hướng ↑/↓, đóng bằng Esc hoặc bấm ra ngoài
 * và trả focus về nút kích hoạt. Mục có `href` render thành thẻ <a> (vd: link tải file).
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface MenuItem {
  key: string;
  label: ReactNode;
  icon?: LucideIcon;
  onSelect?: () => void;
  href?: string;
  /** Gợi ý phụ hiển thị mờ bên phải (vd: định dạng file). */
  hint?: ReactNode;
  tone?: "default" | "danger";
}

interface DropdownMenuProps {
  /** Render nút kích hoạt; nhận props cần gắn vào nút. */
  trigger: (props: {
    ref: (el: HTMLButtonElement | null) => void;
    onClick: () => void;
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
    "aria-controls": string;
  }) => ReactNode;
  items: MenuItem[];
  align?: "left" | "right";
  className?: string;
}

export function DropdownMenu({ trigger, items, align = "right", className }: DropdownMenuProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    requestAnimationFrame(() => itemRefs.current[0]?.focus());
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const els = itemRefs.current.filter(Boolean) as HTMLElement[];
    const idx = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      els[(idx + 1) % els.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      els[(idx - 1 + els.length) % els.length]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const itemClass = (tone: MenuItem["tone"]) =>
    cn(
      "flex h-9 w-full items-center gap-2.5 px-3 text-left text-base transition-colors focus:bg-subtle focus:outline-none hover:bg-subtle",
      tone === "danger" ? "text-danger-fg" : "text-fg"
    );

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      {trigger({
        ref: (el) => {
          triggerRef.current = el;
        },
        onClick: () => setOpen((v) => !v),
        onKeyDown: (e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        },
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": menuId,
      })}

      {open && (
        <div
          id={menuId}
          role="menu"
          onKeyDown={onMenuKeyDown}
          className={cn(
            "absolute top-full z-40 mt-1 min-w-[200px] animate-fade-in overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-md",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {items.map((item, i) => {
            const Icon = item.icon;
            const content = (
              <>
                {Icon && <Icon className="h-4 w-4 text-muted" aria-hidden />}
                <span className="flex-1">{item.label}</span>
                {item.hint && <span className="text-xs text-muted">{item.hint}</span>}
              </>
            );
            return item.href ? (
              <a
                key={item.key}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                role="menuitem"
                tabIndex={-1}
                href={item.href}
                onClick={() => close(false)}
                className={itemClass(item.tone)}
              >
                {content}
              </a>
            ) : (
              <button
                key={item.key}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  close();
                  item.onSelect?.();
                }}
                className={itemClass(item.tone)}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
