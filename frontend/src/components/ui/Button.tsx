"use client";

/**
 * Button & IconButton (quy tắc A4): 4 biến thể × 2 kích thước, dùng cho MỌI nút trong ứng dụng.
 * - primary: hành động chính duy nhất của một vùng.
 * - secondary: hành động phụ (viền).
 * - ghost: hành động cấp ba / thanh công cụ.
 * - danger: hành động mang tính rủi ro cao.
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Tooltip } from "@/components/ui/Tooltip";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white shadow-sm hover:bg-primary-hover",
  secondary: "border border-line-strong bg-surface text-fg shadow-sm hover:bg-subtle",
  ghost: "text-fg-secondary hover:bg-subtle hover:text-fg",
  danger: "bg-danger text-white shadow-sm hover:bg-danger-hover",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-sm",
  md: "h-9 gap-2 px-4 text-sm",
};

const ICON_SIZE: Record<ButtonSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
};

/** Dùng cho <Link>/<a> cần mang hình dạng nút. */
export function buttonClasses({
  variant = "secondary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(
    "inline-flex select-none items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    VARIANT[variant],
    SIZE[size],
    className
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    leftIcon: LeftIcon,
    rightIcon: RightIcon,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className })}
      {...rest}
    >
      {loading ? (
        <Loader2 className={cn(ICON_SIZE[size], "animate-spin")} aria-hidden />
      ) : (
        LeftIcon && <LeftIcon className={ICON_SIZE[size]} aria-hidden />
      )}
      {children}
      {RightIcon && !loading && <RightIcon className={ICON_SIZE[size]} aria-hidden />}
    </button>
  );
});

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Bắt buộc: dùng làm aria-label và nội dung tooltip (quy tắc A6). */
  label: string;
  icon: LucideIcon;
  variant?: Exclude<ButtonVariant, "danger">;
  size?: ButtonSize;
  active?: boolean;
  tooltipSide?: "top" | "bottom" | "left" | "right";
  badge?: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    icon: Icon,
    variant = "ghost",
    size = "md",
    active = false,
    tooltipSide = "top",
    badge,
    className,
    type = "button",
    ...rest
  },
  ref
) {
  return (
    <Tooltip content={label} side={tooltipSide}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        aria-pressed={active || undefined}
        className={cn(
          buttonClasses({ variant, size }),
          "relative px-0",
          size === "sm" ? "w-8" : "w-9",
          active && "bg-primary-subtle text-primary-fg hover:bg-primary-subtle",
          className
        )}
        {...rest}
      >
        <Icon className={ICON_SIZE[size]} aria-hidden />
        {badge}
      </button>
    </Tooltip>
  );
});
