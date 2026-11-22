import type { Metadata } from "next";
import { Navbar } from "@/components/ui/Navbar";
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
        <Navbar />
        <main className="p-5 max-w-[1600px] mx-auto">{children}</main>
      </body>
    </html>
  );
}
