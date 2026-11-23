"use client";

/**
 * Tooltip nhẹ, render qua portal để không bị cắt bởi container `overflow-hidden`.
 * Hiện khi hover (trễ 300ms) hoặc khi phần tử con nhận focus bàn phím.
 */

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Side = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  side?: Side;
  /** Đặt false để tắt tooltip (vd: khi sidebar đang mở rộng đã có chữ). */
  enabled?: boolean;
  /** Class cho phần tử bọc (mặc định inline-flex) — vd "flex w-full" khi con cần chiếm hết chiều ngang. */
  className?: string;
}

const GAP = 8;

export function Tooltip({ content, children, side = "top", enabled = true, className }: TooltipProps) {
  const id = useId();
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    []
  );

  const computePosition = useCallback(() => {
    const el = wrapperRef.current?.firstElementChild ?? wrapperRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    switch (side) {
      case "bottom":
        setPos({ top: r.bottom + GAP, left: r.left + r.width / 2 });
        break;
      case "left":
        setPos({ top: r.top + r.height / 2, left: r.left - GAP });
        break;
      case "right":
        setPos({ top: r.top + r.height / 2, left: r.right + GAP });
        break;
      default:
        setPos({ top: r.top - GAP, left: r.left + r.width / 2 });
    }
  }, [side]);

  const show = (delay: number) => {
    if (!enabled || !content) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      computePosition();
      setOpen(true);
    }, delay);
  };

  const hide = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setOpen(false);
  };

  const transform: Record<Side, string> = {
    top: "translate(-50%, -100%)",
    bottom: "translate(-50%, 0)",
    left: "translate(-100%, -50%)",
    right: "translate(0, -50%)",
  };

  if (!enabled) return children;

  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, {
        "aria-describedby": open ? id : undefined,
      })
    : children;

  return (
    <span
      ref={wrapperRef}
      className={className ?? "inline-flex"}
      onMouseEnter={() => show(300)}
      onMouseLeave={hide}
      onFocus={(e) => {
        if ((e.target as HTMLElement).matches?.(":focus-visible")) show(0);
      }}
      onBlur={hide}
      onKeyDown={(e) => {
        if (e.key === "Escape") hide();
      }}
    >
      {child}
      {mounted &&
        open &&
        pos &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            style={{ top: pos.top, left: pos.left, transform: transform[side] }}
            className="pointer-events-none fixed z-[100] max-w-xs animate-fade-in rounded-md bg-fg px-2 py-1 text-xs font-medium text-white shadow-md"
          >
            {content}
          </div>,
          document.body
        )}
    </span>
  );
}
