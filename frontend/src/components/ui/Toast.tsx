"use client";

/**
 * Toast nổi góc dưới-phải (quy tắc A5): phản hồi thành công không làm xô lệch bố cục,
 * hỗ trợ nút hành động (vd: "Hoàn tác"), tự đóng, đọc được bởi screen reader (aria-live).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastTone = "success" | "danger" | "info";

interface ToastInput {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_ICON: Record<ToastTone, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: "text-success" },
  danger: { icon: AlertCircle, className: "text-danger" },
  info: { icon: Info, className: "text-primary" },
};

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const { icon: Icon, className } = TONE_ICON[item.tone ?? "success"];
  const timerRef = useRef<number | null>(null);
  const duration = item.durationMs ?? (item.action ? 6000 : 4000);

  const start = useCallback(() => {
    timerRef.current = window.setTimeout(() => onDismiss(item.id), duration);
  }, [duration, item.id, onDismiss]);
  const stop = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  };

  useEffect(() => {
    start();
    return stop;
  }, [start]);

  return (
    <div
      onMouseEnter={stop}
      onMouseLeave={start}
      className="pointer-events-auto flex w-full animate-slide-up items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-lg"
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", className)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-fg">{item.title}</p>
        {item.description && <p className="mt-0.5 text-sm text-muted">{item.description}</p>}
      </div>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            onDismiss(item.id);
          }}
          className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-primary-fg hover:bg-primary-subtle"
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Đóng thông báo"
        className="-mr-1 shrink-0 rounded p-1 text-muted hover:bg-subtle hover:text-fg"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const idRef = useRef(0);

  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    idRef.current += 1;
    const id = idRef.current;
    setItems((prev) => [...prev.slice(-2), { ...input, id }]);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div
            aria-live="polite"
            role="status"
            className="no-print pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
          >
            {items.map((item) => (
              <ToastView key={item.id} item={item} onDismiss={dismiss} />
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast phải được dùng bên trong <ToastProvider>.");
  return ctx;
}
