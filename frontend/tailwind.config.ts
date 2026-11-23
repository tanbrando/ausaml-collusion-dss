import type { Config } from "tailwindcss";

/**
 * Design tokens (quy tắc A1–A3 trong plan thiết kế lại giao diện).
 * - Bảng màu được THAY THẾ hoàn toàn (không extend) để buộc mọi component dùng token ngữ nghĩa.
 * - Thang chữ 6 bậc: 12 / 13 / 14 / 16 / 20 / 28 (px).
 * - Giá trị màu thực nằm trong CSS variables ở `src/app/globals.css`.
 */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      white: "#ffffff",
      black: "#000000",

      bg: token("bg"),
      surface: token("surface"),
      subtle: token("subtle"),
      line: { DEFAULT: token("line"), strong: token("line-strong") },

      fg: { DEFAULT: token("fg"), secondary: token("fg-secondary") },
      muted: token("muted"),
      faint: token("faint"),

      primary: {
        DEFAULT: token("primary"),
        hover: token("primary-hover"),
        subtle: token("primary-subtle"),
        fg: token("primary-fg"),
      },
      danger: {
        DEFAULT: token("danger"),
        hover: token("danger-hover"),
        subtle: token("danger-subtle"),
        fg: token("danger-fg"),
      },
      warning: {
        DEFAULT: token("warning"),
        subtle: token("warning-subtle"),
        fg: token("warning-fg"),
      },
      success: {
        DEFAULT: token("success"),
        subtle: token("success-subtle"),
        fg: token("success-fg"),
      },
      risk: {
        high: token("danger"),
        medium: token("warning"),
        low: token("muted"),
      },
      sidebar: {
        DEFAULT: token("sidebar"),
        hover: token("sidebar-hover"),
        active: token("sidebar-active"),
        fg: token("sidebar-fg"),
        muted: token("sidebar-muted"),
        line: token("sidebar-line"),
      },
    },
    fontSize: {
      xs: ["12px", { lineHeight: "16px" }],
      sm: ["13px", { lineHeight: "18px" }],
      base: ["14px", { lineHeight: "20px" }],
      lg: ["16px", { lineHeight: "24px" }],
      xl: ["20px", { lineHeight: "28px" }],
      "2xl": ["28px", { lineHeight: "34px" }],
    },
    fontWeight: {
      normal: "400",
      medium: "500",
      semibold: "600",
    },
    borderRadius: {
      none: "0",
      sm: "4px",
      DEFAULT: "6px",
      md: "6px",
      lg: "8px",
      xl: "12px",
      full: "9999px",
    },
    boxShadow: {
      none: "none",
      sm: "0 1px 2px 0 rgb(15 23 42 / 0.05)",
      md: "0 4px 12px -2px rgb(15 23 42 / 0.10), 0 2px 4px -2px rgb(15 23 42 / 0.06)",
      lg: "0 16px 40px -8px rgb(15 23 42 / 0.22), 0 4px 8px -4px rgb(15 23 42 / 0.08)",
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "slide-up": "slide-up 200ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
