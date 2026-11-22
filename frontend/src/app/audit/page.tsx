"use client";

/**
 * MÀN HÌNH 4 (M4 - Việt): Nhật ký Điều tra (Human-in-the-Loop) & Xuất Báo cáo (/audit)
 * - Gọi fetchAuditLogs() & fetchCases()
 * - Lọc phản hồi theo case_id và action (ALL / CONFIRM / DISMISS)
 * - Xuất báo cáo CSV / JSON thật dùng getExportUrl() + In Báo cáo (Print Dossier)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileJson,
  FileSpreadsheet,
  Filter,
  Printer,
  RefreshCw,
  ScrollText,
  XCircle,
} from "lucide-react";
import { fetchAuditLogs, fetchCases, getExportUrl } from "@/lib/api";
import type {
  AuditTrailResponse,
  CaseSummary,
  FeedbackAction,
} from "@/types/contract";

type ActionFilter = "ALL" | FeedbackAction;

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString("vi-VN");
  } catch {
    return ts;
  }
}

export default function AuditPage() {
  const [audit, setAudit] = useState<AuditTrailResponse | null>(null);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("ALL");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (caseFilter: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const [auditRes, casesRes] = await Promise.all([
        fetchAuditLogs(caseFilter === "ALL" ? undefined : caseFilter),
        fetchCases(),
      ]);
      setAudit(auditRes);
      setCases(casesRes.cases);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể tải dữ liệu Nhật ký Điều tra từ Backend."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(selectedCaseId);
  }, [selectedCaseId, loadData]);

  const filteredFeedbacks = useMemo(() => {
    const list = audit?.feedbacks ?? [];
    if (actionFilter === "ALL") return list;
    return list.filter((fb) => fb.action === actionFilter);
  }, [audit, actionFilter]);

  const summary = useMemo(() => {
    const list = audit?.feedbacks ?? [];
    let confirmed = 0;
    let dismissed = 0;
    for (const fb of list) {
      if (fb.action === "CONFIRM") confirmed += 1;
      else if (fb.action === "DISMISS") dismissed += 1;
    }
    return { total: list.length, confirmed, dismissed };
  }, [audit]);

  const exportCaseId =
    selectedCaseId === "ALL"
      ? cases[0]?.case_id ?? "case_01_smurfing_ring"
      : selectedCaseId;

  return (
    <div className="space-y-6">
      {/* Header + Action Buttons */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Nhật ký Điều tra (Human-in-the-Loop) & Xuất Báo cáo
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Toàn bộ quyết định Xác nhận (CONFIRM) và Bác bỏ (DISMISS) được lưu vết trong SQLite DB, sẵn sàng trích xuất hồ sơ điều tra.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <a
            href={getExportUrl(exportCaseId, "csv")}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Xuất CSV</span>
            <Download className="w-3.5 h-3.5 opacity-75" />
          </a>

          <a
            href={getExportUrl(exportCaseId, "json")}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            <FileJson className="w-4 h-4" />
            <span>Xuất JSON</span>
            <Download className="w-3.5 h-3.5 opacity-75" />
          </a>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>In Báo cáo (Print Dossier)</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">
            Tổng phản hồi đã lưu
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {summary.total}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-4 shadow-sm">
          <div className="text-xs text-red-600 font-medium flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Đã xác nhận Đồng phạm (CONFIRM)
          </div>
          <div className="text-2xl font-bold text-red-700 mt-1">
            {summary.confirmed}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" />
            Đã bác bỏ (DISMISS)
          </div>
          <div className="text-2xl font-bold text-slate-700 mt-1">
            {summary.dismissed}
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      <section className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <label className="text-xs font-medium text-slate-600">Vụ án:</label>
            <select
              value={selectedCaseId}
              onChange={(e) => setSelectedCaseId(e.target.value)}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Tất cả vụ án</option>
              {cases.map((c) => (
                <option key={c.case_id} value={c.case_id}>
                  {c.title} ({c.case_id})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 text-xs">
            {(["ALL", "CONFIRM", "DISMISS"] as ActionFilter[]).map((act) => {
              const active = actionFilter === act;
              return (
                <button
                  key={act}
                  type="button"
                  onClick={() => setActionFilter(act)}
                  className={`px-2.5 py-1 rounded-lg border transition-colors ${
                    active
                      ? "bg-slate-900 text-white border-slate-900 font-medium"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {act === "ALL" ? "Tất cả hành động" : act}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>
            File xuất áp dụng cho: <b className="font-mono text-slate-700">{exportCaseId}</b>
          </span>
          <button
            type="button"
            onClick={() => loadData(selectedCaseId)}
            disabled={isLoading}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
        </div>
      </section>

      {/* Feedbacks Table */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 text-sm">
            Danh sách Phản hồi Điều tra viên ({filteredFeedbacks.length})
          </h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Đang tải nhật ký phản hồi...
          </div>
        ) : filteredFeedbacks.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Chưa có phản hồi nào phù hợp bộ lọc. Hãy vào{" "}
            <b className="text-slate-600">Phòng Điều Tra (/workspace)</b> để bấm{" "}
            <b>CONFIRM</b> hoặc <b>DISMISS</b> các cặp nghi vấn.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Vụ án</th>
                  <th className="py-2.5 px-3 font-medium">Cặp Khách hàng</th>
                  <th className="py-2.5 px-3 font-medium">Mô hình</th>
                  <th className="py-2.5 px-3 font-medium text-right">Xác suất</th>
                  <th className="py-2.5 px-3 font-medium text-center">Quyết định</th>
                  <th className="py-2.5 px-3 font-medium">Ghi chú</th>
                  <th className="py-2.5 px-3 font-medium">Điều tra viên</th>
                  <th className="py-2.5 px-4 font-medium text-right">Cập nhật lúc</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFeedbacks.map((fb) => (
                  <tr key={fb.id} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-4 font-mono text-slate-700 whitespace-nowrap">
                      <Link
                        href={`/workspace?case_id=${encodeURIComponent(fb.case_id)}`}
                        className="text-blue-700 hover:underline"
                      >
                        {fb.case_id}
                      </Link>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {fb.source_cust_id} ↔ {fb.target_cust_id}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                      {fb.model_id}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right font-semibold text-slate-800">
                      {(fb.predicted_score * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      {fb.action === "CONFIRM" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700 border border-red-200">
                          <CheckCircle2 className="w-3 h-3" />
                          CONFIRM
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                          <XCircle className="w-3 h-3" />
                          DISMISS
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 max-w-xs">
                      {fb.note || <span className="text-slate-400 italic">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                      {fb.reviewer_name}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-500 whitespace-nowrap">
                      {formatTimestamp(fb.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Audit Logs Trail */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-slate-500" />
          <h2 className="font-semibold text-slate-900 text-sm">
            Nhật ký Sự kiện Hệ thống ({audit?.audit_logs.length ?? 0})
          </h2>
        </div>

        {(audit?.audit_logs.length ?? 0) === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            Chưa có sự kiện hệ thống nào được ghi nhận.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto text-xs">
            {audit?.audit_logs.map((log) => (
              <div
                key={log.id}
                className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-50"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono font-medium border border-blue-100">
                    {log.event_type}
                  </span>
                  <span className="font-mono text-slate-700">{log.case_id}</span>
                  <span className="font-mono text-[11px] text-slate-500 truncate max-w-xl">
                    {log.payload_json}
                  </span>
                </div>
                <span className="text-slate-400 whitespace-nowrap">
                  {formatTimestamp(log.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
