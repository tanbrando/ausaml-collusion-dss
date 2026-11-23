"use client";

/**
 * Khung ứng dụng: Sidebar (desktop) + thanh trên (mobile) + vùng nội dung chính + ToastProvider.
 * Ở /workspace sidebar tự thu về icon rail; người dùng vẫn có thể mở rộng lại thủ công.
 */

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Brand, NavList, Sidebar } from "@/components/layout/Sidebar";
import { BackendStatus } from "@/components/layout/BackendStatus";
import { ToastProvider } from "@/components/ui/Toast";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isWorkspace = pathname.startsWith("/workspace");

  // null = tự động theo trang; true/false = người dùng đã chủ động chọn trong ngữ cảnh hiện tại
  const [collapseOverride, setCollapseOverride] = useState<boolean | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapseOverride(null);
    setMobileOpen(false);
  }, [isWorkspace]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const collapsed = collapseOverride ?? isWorkspace;

  return (
    <ToastProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-base focus:shadow-md"
      >
        Bỏ qua tới nội dung chính
      </a>

      <div className="flex min-h-[100dvh]">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapseOverride(!collapsed)} />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Thanh trên cho màn hình nhỏ */}
          <header
            data-app-mobilebar
            className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-sidebar-line bg-sidebar px-4 md:hidden"
          >
            <Brand />
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Mở menu điều hướng"
              aria-expanded={mobileOpen}
              className="rounded-md p-2 text-sidebar-fg hover:bg-sidebar-hover"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
          </header>

          <main id="main-content" className="min-w-0 flex-1">
            {children}
          </main>
        </div>
      </div>

      {/* Ngăn điều hướng trượt cho mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Điều hướng">
          <div className="absolute inset-0 animate-fade-in bg-fg/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-fg shadow-lg">
            <div className="flex h-14 items-center justify-between px-4">
              <Brand />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Đóng menu"
                className="rounded-md p-2 text-sidebar-muted hover:bg-sidebar-hover hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <nav aria-label="Điều hướng chính" className="flex-1 px-3 py-2">
              <NavList onNavigate={() => setMobileOpen(false)} />
            </nav>
            <div className="border-t border-sidebar-line px-3 py-3">
              <BackendStatus />
            </div>
          </div>
        </div>
      )}
    </ToastProvider>
  );
}
