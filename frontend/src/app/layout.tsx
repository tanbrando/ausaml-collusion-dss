import type { Metadata } from "next";
import { Be_Vietnam_Pro, JetBrains_Mono } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import "./globals.css";

const sans = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "AusAML DSS",
    template: "%s · AusAML DSS",
  },
  description:
    "Hệ thống hỗ trợ ra quyết định phát hiện liên kết đồng phạm rửa tiền bằng GNN dị thể.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
