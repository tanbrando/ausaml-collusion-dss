"use client";

/**
 * Sidebar điều hướng chính (thay cho top navbar cũ):
 * - 4 mục, nhãn tiếng Việt, không đánh số; trang hiện tại có vạch nhấn + nền.
 * - Thu gọn về icon rail 64px (tự động ở /workspace để nhường chỗ cho đồ thị).
 * - Đáy sidebar: trạng thái kết nối backend + nút thu gọn/mở rộng.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  FolderKanban,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  ShieldHalf,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Tooltip } from "@/components/ui/Tooltip";
import { BackendStatus } from "@/components/layout/BackendStatus";

export const NAV_ITEMS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/", label: "Vụ án", icon: FolderKanban },
  { href: "/workspace", label: "Điều tra đồ thị", icon: Network },
  { href: "/benchmark", label: "Đối chứng mô hình", icon: BarChart3 },
  { href: "/audit", label: "Nhật ký & báo cáo", icon: ScrollText },
];

export function isNavActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-3 rounded-md" aria-label="AusAML DSS — trang chủ">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
        <ShieldHalf className="h-4 w-4" aria-hidden />
      </span>
      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-white">AusAML DSS</span>
          <span className="block truncate text-xs text-sidebar-muted">Phát hiện đồng phạm AML</span>
        </span>
      )}
    </Link>
  );
}

export function NavList({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isNavActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Tooltip content={item.label} side="right" enabled={collapsed}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                aria-label={collapsed ? item.label : undefined}
                className={cn(
                  "relative flex h-9 items-center gap-3 rounded-md text-base font-medium transition-colors",
                  collapsed ? "w-9 justify-center" : "w-full px-3",
                  active
                    ? "bg-sidebar-hover text-white before:absolute before:-left-3 before:top-1.5 before:h-6 before:w-[3px] before:rounded-r before:bg-primary"
                    : "text-sidebar-muted hover:bg-sidebar-hover hover:text-white"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      data-app-sidebar
      className={cn(
        "sticky top-0 hidden h-[100dvh] shrink-0 flex-col border-r border-sidebar-line bg-sidebar text-sidebar-fg transition-[width] duration-200 md:flex",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className={cn("flex h-16 items-center", collapsed ? "justify-center" : "px-4")}>
        <Brand collapsed={collapsed} />
      </div>

      <nav aria-label="Điều hướng chính" className={cn("flex-1 py-2", collapsed ? "px-3.5" : "px-3")}>
        <NavList collapsed={collapsed} />
      </nav>

      <div className={cn("space-y-1 border-t border-sidebar-line py-3", collapsed ? "px-3.5" : "px-3")}>
        <BackendStatus collapsed={collapsed} />
        <Tooltip content={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"} side="right" enabled={collapsed}>
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
            aria-expanded={!collapsed}
            className={cn(
              "flex h-9 items-center gap-3 rounded-md text-sm text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-white",
              collapsed ? "w-9 justify-center" : "w-full px-3"
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" aria-hidden />
                <span>Thu gọn</span>
              </>
            )}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}
