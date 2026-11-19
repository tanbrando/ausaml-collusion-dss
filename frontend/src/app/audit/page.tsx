"use client";

/**
 * MÀN HÌNH 4 (M4 - Việt): Audit Log & Investigation Report (/audit)
 * TODO (Việt - M4):
 * 1. Hiển thị bảng feedbacks (CONFIRM / DISMISS) và audit_logs từ fetchAuditLogs().
 * 2. Thêm bộ lọc theo case_id và nút Export CSV / JSON dùng getExportUrl().
 */

import { useEffect, useState } from "react";
import { fetchAuditLogs, getExportUrl } from "@/lib/api";
import type { AuditTrailResponse } from "@/types/contract";

export default function AuditPage() {
  const [audit, setAudit] = useState<AuditTrailResponse | null>(null);

  useEffect(() => {
    fetchAuditLogs().then(setAudit).catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Nhật ký Điều tra (Human-in-the-Loop) & Xuất Báo cáo
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Toàn bộ xác nhận (CONFIRM) và bác bỏ (DISMISS) được lưu vết trong SQLite/PostgreSQL.
          </p>
        </div>
        <a
          href={getExportUrl("case_01_smurfing_ring", "csv")}
          className="px-4 py-2 rounded bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
        >
          Xuất Báo cáo CSV (Case #1)
        </a>
      </header>

      <div className="bg-white rounded-lg border p-4">
        <h2 className="font-semibold mb-3">
          Phản hồi Điều tra viên ({audit?.feedbacks.length ?? 0})
        </h2>
        <div className="space-y-2 text-sm">
          {audit?.feedbacks.map((fb) => (
            <div key={fb.id} className="p-2 rounded border flex justify-between">
              <span>
                <strong>{fb.case_id}</strong> · {fb.source_cust_id} ↔ {fb.target_cust_id} ({(fb.predicted_score * 100).toFixed(1)}%)
              </span>
              <span className={fb.action === "CONFIRM" ? "text-red-600 font-semibold" : "text-slate-500"}>
                {fb.action}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
