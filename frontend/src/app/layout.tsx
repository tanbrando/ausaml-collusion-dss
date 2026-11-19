import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AusAML Collusion DSS",
  description:
    "GNN-Powered Decision Support System for Covert AML Accomplice Link Prediction",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="min-h-screen antialiased">
        <nav className="border-b bg-slate-900 text-white px-6 py-3 flex items-center justify-between">
          <div className="font-semibold text-base tracking-tight">
            🛡️ AusAML Collusion DSS
          </div>
          <div className="flex gap-6 text-sm">
            <Link href="/" className="hover:text-blue-300">
              Vụ án (Command Center)
            </Link>
            <Link href="/workspace" className="hover:text-blue-300">
              Phòng Điều Tra (Graph Workspace)
            </Link>
            <Link href="/benchmark" className="hover:text-blue-300">
              Đối chứng Mô hình
            </Link>
            <Link href="/audit" className="hover:text-blue-300">
              Nhật ký & Xuất Báo cáo
            </Link>
          </div>
        </nav>
        <main className="p-6 max-w-[1600px] mx-auto">{children}</main>
      </body>
    </html>
  );
}
