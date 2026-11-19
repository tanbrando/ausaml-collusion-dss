"use client";

/**
 * MÀN HÌNH 1 (M4 - Việt): Case Command Center (/)
 * TODO (Việt - M4):
 * 1. Hiển thị 4 KPI Cards tổng quan (50k Customers, 6 Node Types, 14 Relations, 6 Checkpoints).
 * 2. Hiển thị 5 Built-in Demo Cases từ fetchCases() kèm nút "Mở Phòng Điều Tra" -> /workspace?case_id=...
 * 3. Thêm Dropzone Upload file .pt vụ án mới gọi uploadCase() và hiển thị GateCheckReport.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchCases } from "@/lib/api";
import type { CaseSummary } from "@/types/contract";

export default function CaseCommandCenterPage() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCases()
      .then((res) => setCases(res.cases))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">
          Case Command Center — Trung tâm Điều hành Vụ án AML
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Chọn một vụ án mẫu (nạp tức thì) hoặc tải lên file đồ thị .pt mới để kiểm định Gate Check 1.
        </p>
      </header>

      {error && (
        <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">
          Không kết nối được Backend: {error}
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cases.map((c) => (
          <div key={c.case_id} className="bg-white rounded-lg border p-4 shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                {c.source_type}
              </span>
              <h2 className="font-semibold text-slate-900 mt-2">{c.title}</h2>
              <p className="text-xs text-slate-600 mt-1">{c.description}</p>
            </div>
            <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs text-slate-500">
              <span>{c.num_customers} Customers · {c.total_edges} Cạnh</span>
              <Link
                href={`/workspace?case_id=${c.case_id}`}
                className="px-3 py-1.5 rounded bg-blue-600 text-white font-medium hover:bg-blue-700"
              >
                Mở Phòng Điều Tra →
              </Link>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
