"use client";

/**
 * MÀN HÌNH 4 (M4 - Việt): Nhật ký Điều tra (Human-in-the-Loop) & Xuất Báo cáo (/audit)
 * Tinh chỉnh theo review lần 2:
 * 1. Dùng chung `formatDateVi` chuẩn múi giờ Asia/Ho_Chi_Minh (hết lệch 7 tiếng).
 * 2. Làm rõ phạm vi Xuất CSV / Xuất JSON:
 *    - Nếu bộ lọc đang là "Tất cả vụ án" (`ALL`), hiển thị rõ "Phạm vi xuất: Tất cả vụ án"
 *      và xuất trực tiếp toàn bộ danh sách quyết định thẩm định & nhật ký sự kiện đang hiển thị.
 *    - Nếu đã chọn 1 vụ án cụ thể, xuất hồ sơ vụ án đó trực tiếp từ Backend (`getExportUrl`).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
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
import { ActionBadge, Badge } from "@/components/ui/Badge";
import { formatDateVi, formatPercent } from "@/lib/format";

type ActionFilter = "ALL" | FeedbackAction;

function parsePayloadChips(payloadJson: string): Array<{ k: string; v: string }> {
  try {
    const obj = JSON.parse(payloadJson) as Record<string, unknown>;
    const chips: Array<{ k: string; v: string }> = [];
    for (const [key, val] of Object.entries(obj)) {
      if (val === null || val === undefined) continue;
      if (typeof val === "number") {
        chips.push({
          k: key,
          v:
            key === "score" || key === "predicted_score"
              ? formatPercent(val, 1)
              : String(Number(val.toFixed(4))),
        });
      } else if (typeof val === "string" || typeof val === "boolean") {
        chips.push({ k: key, v: String(val) });
      }
    }
    return chips;
  } catch {
    return [];
  }
}

export default function AuditPage() {
  const [audit, setAudit] = useState<AuditTrailResponse | null>(null);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("ALL");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("ALL");
  const [expandedLogIds, setExpandedLogIds] = useState<Set<number>>(new Set());
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

  const caseTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cases) {
      map.set(c.case_id, c.title);
    }
    return map;
  }, [cases]);

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

  const toggleExpandLog = (id: number) => {
    setExpandedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Xuất CSV/JSON cho "Tất cả vụ án" (khi bộ lọc là ALL) hoặc tải hồ sơ vụ án cụ thể từ Backend
  const handleExportAllClient = (format: "csv" | "json") => {
    if (format === "json") {
      const payload = {
        scope: "ALL_CASES",
        action_filter: actionFilter,
        exported_at: formatDateVi(new Date().toISOString()),
        feedbacks: filteredFeedbacks,
        audit_logs: audit?.audit_logs ?? [],
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ausaml_audit_all_cases.json";
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const headers = [
      "case_id",
      "case_title",
      "pair_id",
      "source_cust_id",
      "target_cust_id",
      "model_id",
      "predicted_score",
      "action",
      "note",
      "reviewer_name",
      "updated_at_vn",
    ];
    const rows = filteredFeedbacks.map((fb) => [
      fb.case_id,
      `"${(caseTitleMap.get(fb.case_id) ?? fb.case_id).replace(/"/g, '""')}"`,
      fb.pair_id,
      fb.source_cust_id,
      fb.target_cust_id,
      fb.model_id,
      fb.predicted_score.toFixed(4),
      fb.action,
      `"${(fb.note || "").replace(/"/g, '""')}"`,
      fb.reviewer_name,
      `"${formatDateVi(fb.updated_at)}"`,
    ]);
    const csvContent =
      "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ausaml_audit_all_cases.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportScopeLabel =
    selectedCaseId === "ALL"
      ? `Tất cả vụ án (${filteredFeedbacks.length} quyết định)`
      : caseTitleMap.get(selectedCaseId) ?? selectedCaseId;

  return (
    <div className="space-y-6">
      {/* Header + Action Buttons */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Nhật ký Điều tra & Xuất Hồ sơ Báo cáo
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Lưu vết toàn bộ quyết định thẩm định (CONFIRM / DISMISS) của điều tra viên và lịch sử chạy mô hình trong SQLite DB (Múi giờ: Asia/Ho_Chi_Minh).
          </p>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2">
          {selectedCaseId === "ALL" ? (
            <>
              <button
                type="button"
                onClick={() => handleExportAllClient("csv")}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors shadow-sm"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Xuất CSV (Tất cả vụ án)</span>
                <Download className="w-3.5 h-3.5 opacity-75" />
              </button>

              <button
                type="button"
                onClick={() => handleExportAllClient("json")}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >
                <FileJson className="w-4 h-4" />
                <span>Xuất JSON (Tất cả vụ án)</span>
                <Download className="w-3.5 h-3.5 opacity-75" />
              </button>
            </>
          ) : (
            <>
              <a
                href={getExportUrl(selectedCaseId, "csv")}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors shadow-sm"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Xuất CSV (Vụ án đang chọn)</span>
                <Download className="w-3.5 h-3.5 opacity-75" />
              </a>

              <a
                href={getExportUrl(selectedCaseId, "json")}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >
                <FileJson className="w-4 h-4" />
                <span>Xuất JSON (Vụ án đang chọn)</span>
                <Download className="w-3.5 h-3.5 opacity-75" />
              </a>
            </>
          )}

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 transition-colors"
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
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 num">
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-sm">
          <div className="text-xs text-slate-600 font-semibold">
            Tổng lượt thẩm định đã lưu
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {summary.total}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-4 shadow-sm">
          <div className="text-xs text-red-700 font-semibold flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Đã xác nhận Đồng phạm (CONFIRM)
          </div>
          <div className="text-2xl font-bold text-red-700 mt-1">
            {summary.confirmed}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-sm">
          <div className="text-xs text-slate-600 font-semibold flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" />
            Đã bác bỏ cảnh báo (DISMISS)
          </div>
          <div className="text-2xl font-bold text-slate-700 mt-1">
            {summary.dismissed}
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      <section className="no-print bg-white rounded-xl border border-slate-200/90 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <label className="text-xs font-semibold text-slate-700">Vụ án:</label>
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
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {act === "ALL" ? "Tất cả quyết định" : act}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span>
            Phạm vi xuất CSV/JSON:{" "}
            <b className="text-slate-900">{exportScopeLabel}</b>
          </span>
          <button
            type="button"
            onClick={() => loadData(selectedCaseId)}
            disabled={isLoading}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
            />
            Làm mới
          </button>
        </div>
      </section>

      {/* Feedbacks Table */}
      <section className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900 text-sm">
              Danh sách Quyết định Thẩm định của Điều tra viên ({filteredFeedbacks.length})
            </h2>
            <p className="text-[11px] text-slate-600">
              Dữ liệu đồng bộ hai chiều với trạng thái cạnh trên Phòng Điều Tra (/workspace)
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Đang tải nhật ký phản hồi...
          </div>
        ) : filteredFeedbacks.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Chưa có phản hồi nào phù hợp bộ lọc. Hãy vào{" "}
            <b className="text-slate-700">Phòng Điều Tra (/workspace)</b> để bấm{" "}
            <b>CONFIRM</b> hoặc <b>DISMISS</b> các cặp nghi vấn.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse num">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Hồ sơ Vụ án</th>
                  <th className="py-2.5 px-3 font-semibold">Cặp Khách hàng</th>
                  <th className="py-2.5 px-3 font-semibold">Mô hình</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Xác suất AI</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Quyết định</th>
                  <th className="py-2.5 px-3 font-semibold">Ghi chú Bằng chứng</th>
                  <th className="py-2.5 px-3 font-semibold">Điều tra viên</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Thời gian (VN)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFeedbacks.map((fb) => {
                  const readableTitle = caseTitleMap.get(fb.case_id);
                  return (
                    <tr key={fb.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900">
                          {readableTitle ?? fb.case_id}
                        </div>
                        {readableTitle && (
                          <div className="font-mono text-[10px] text-slate-500">
                            {fb.case_id}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {fb.source_cust_id} ↔ {fb.target_cust_id}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                        {fb.model_id}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-right font-semibold text-slate-900">
                        {formatPercent(fb.predicted_score, 1)}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <ActionBadge action={fb.action} />
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 max-w-xs">
                        {fb.note || (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                        {fb.reviewer_name}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-600 whitespace-nowrap">
                        {formatDateVi(fb.updated_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Audit Logs Trail */}
      <section className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-slate-600" />
          <div>
            <h2 className="font-semibold text-slate-900 text-sm">
              Nhật ký Sự kiện Hệ thống ({audit?.audit_logs.length ?? 0})
            </h2>
            <p className="text-[11px] text-slate-600">
              Lưu vết tự động mọi phiên chạy suy luận (PREDICT), tải vụ án (UPLOAD) và thẩm định (FEEDBACK)
            </p>
          </div>
        </div>

        {(audit?.audit_logs.length ?? 0) === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            Chưa có sự kiện hệ thống nào được ghi nhận.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto text-xs num">
            {audit?.audit_logs.map((log) => {
              const chips = parsePayloadChips(log.payload_json);
              const isExpanded = expandedLogIds.has(log.id);
              const readableTitle = caseTitleMap.get(log.case_id);

              return (
                <div
                  key={log.id}
                  className="px-4 py-3 space-y-1.5 hover:bg-slate-50/80"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant={
                          log.event_type === "FEEDBACK"
                            ? "danger"
                            : log.event_type === "UPLOAD"
                            ? "purple"
                            : "info"
                        }
                      >
                        {log.event_type}
                      </Badge>
                      <span className="font-semibold text-slate-900">
                        {readableTitle ?? log.case_id}
                      </span>
                      {readableTitle && (
                        <span className="font-mono text-[11px] text-slate-500">
                          ({log.case_id})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 whitespace-nowrap">
                        {formatDateVi(log.created_at)}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleExpandLog(log.id)}
                        className="no-print inline-flex items-center gap-0.5 px-2 py-0.5 rounded border border-slate-200 bg-white text-[11px] text-slate-600 hover:bg-slate-100"
                      >
                        <span>JSON</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  {chips.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {chips.map((c) => (
                        <span
                          key={`${log.id}-${c.k}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[11px]"
                        >
                          <span className="text-slate-500">{c.k}:</span>
                          <b className="text-slate-900">{c.v}</b>
                        </span>
                      ))}
                    </div>
                  )}

                  {isExpanded && (
                    <pre className="p-2.5 rounded-lg bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto">
                      {log.payload_json}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
