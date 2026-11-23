"use client";

/**
 * Form controls dùng chung: Field (nhãn + gợi ý + lỗi), Input, Select, Textarea.
 * Một kiểu viền, một kiểu focus, một chiều cao (h-9) cho mọi control (quy tắc A3, A6).
 */

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  cloneElement,
  isValidElement,
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

const CONTROL =
  "w-full rounded-md border border-line-strong bg-surface text-base text-fg shadow-sm transition-colors " +
  "hover:border-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 " +
  "disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted";

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactElement;
  className?: string;
  /** Phần tử phụ bên phải nhãn (vd: giá trị hiện tại, nút đặt lại). */
  aside?: ReactNode;
}

export function Field({ label, hint, error, children, className, aside }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined,
        "aria-invalid": error ? true : undefined,
      })
    : children;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-fg-secondary">
          {label}
        </label>
        {aside}
      </div>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger-fg">
          {error}
        </p>
      )}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, leftIcon, rightSlot, ...rest },
  ref
) {
  if (!leftIcon && !rightSlot) {
    return <input ref={ref} className={cn(CONTROL, "h-9 px-3", className)} {...rest} />;
  }
  return (
    <div className={cn("relative", className)}>
      {leftIcon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">
          {leftIcon}
        </span>
      )}
      <input
        ref={ref}
        className={cn(CONTROL, "h-9", leftIcon ? "pl-9" : "pl-3", rightSlot ? "pr-10" : "pr-3")}
        {...rest}
      />
      {rightSlot && <span className="absolute right-1.5 top-1/2 -translate-y-1/2">{rightSlot}</span>}
    </div>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <div className={cn("relative", className)}>
        <select ref={ref} className={cn(CONTROL, "h-9 appearance-none truncate pl-3 pr-9")} {...rest}>
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
      </div>
    );
  }
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 2, ...rest }, ref) {
    return (
      <textarea ref={ref} rows={rows} className={cn(CONTROL, "resize-none px-3 py-2", className)} {...rest} />
    );
  }
);
