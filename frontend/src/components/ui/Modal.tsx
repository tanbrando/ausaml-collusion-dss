"use client";

/**
 * Modal dialog chuẩn a11y (quy tắc A6):
 * role="dialog" + aria-modal, bẫy focus (Tab/Shift+Tab), trả focus khi đóng, khoá cuộn nền,
 * đóng bằng Esc hoặc bấm nền. Hỗ trợ vùng footer cố định cho nút hành động.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}

const SIZE = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-2xl" } as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, description, children, footer, size = "md" }: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const preferred = panel.querySelector<HTMLElement>("[data-autofocus]");
      const first = preferred ?? panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    };
    const raf = requestAnimationFrame(focusFirst);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-fg/40" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92vh] w-full animate-slide-up flex-col overflow-hidden rounded-t-xl border border-line bg-surface shadow-lg focus:outline-none sm:rounded-xl",
          SIZE[size]
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-fg">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="-mr-2 rounded-md p-2 text-muted transition-colors hover:bg-subtle hover:text-fg"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-subtle/60 px-6 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}
