"use client";

/**
 * Top Navigation theo chuẩn Linear / Vercel Dashboard:
 * - Làm nổi rõ trang hiện tại (active tab) bằng usePathname()
 * - Ghi rõ vai trò từng màn hình để người dùng biết ngay mỗi trang hiển thị gì
 * - Tự động ẩn khi in báo cáo (@media print / .no-print)
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  FolderKanban,
  Network,
  ScrollText,
  Shield,
} from "lucide-react";

const NAV_ITEMS = [
  {
    href: "/",
    label: "1. Trung tâm Vụ án",
    sub: "Command Center",
    icon: FolderKanban,
  },
  {
    href: "/workspace",
    label: "2. Phòng Điều Tra Đồ thị",
    sub: "Graph Workspace",
    icon: Network,
  },
  {
    href: "/benchmark",
    label: "3. Đối chứng Mô hình",
    sub: "Benchmark Arena",
    icon: BarChart3,
  },
  {
    href: "/audit",
    label: "4. Nhật ký & Báo cáo",
    sub: "Audit & Export",
    icon: ScrollText,
  },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="no-print sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur text-white">
      <div className="max-w-[1600px] mx-auto px-6 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-semibold text-sm tracking-tight leading-none">
              AusAML Collusion DSS
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Heterogeneous GNN Link Prediction & Explainable AML
            </div>
          </div>
        </Link>

        <div className="flex items-center gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-blue-600 text-white font-semibold shadow-sm"
                    : "text-slate-300 hover:text-white hover:bg-slate-800"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
