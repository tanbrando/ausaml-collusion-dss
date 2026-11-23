"use client";

/**
 * Màn hình 4 — Nhật ký & báo cáo (/audit)
 * Một nút "Xuất báo cáo" (CSV / JSON / In), dải thống kê, thanh lọc (vụ án, thời gian, quyết định, mã KH),
 * 2 tab: quyết định thẩm định (bảng) và nhật ký hệ thống (timeline). Có header riêng cho bản in.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ClipboardCheck,
  Cpu,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Inbox,
  Printer,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Search,
  UploadCloud,
  X,
  type LucideIcon,
} from "lucide-react";
import { fetchAuditLogs, fetchCases, getExportUrl } from "@/lib/api";
import type { AuditLogItem, AuditTrailResponse, CaseSummary, FeedbackAction } from "@/types/contract";
import { ActionBadge, Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, EmptyState, PageContainer, PageHeader, Skeleton, StatStrip, StatTile } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { FilterChip, SegmentedControl, Tabs } from "@/components/ui/Tabs";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { Table, TableContainer, THead, Th, Td, Tr } from "@/components/ui/Table";
import { Alert } from "@/components/ui/Alert";
import { workspaceHref } from "@/components/cases/CaseCard";
import { ACTION_LABEL, eventTypeLabel, shortModelLabel } from "@/lib/i18n/labels";
import { formatDateVi, formatPercent, parseServerDate } from "@/lib/format";
import { cn } from "@/lib/cn";

type AuditTab = "verdicts" | "logs";
type ActionFilter = "ALL" | FeedbackAction;
type TimeRange = "ALL" | "7D" | "TODAY";

const TIME_RANGE_LABEL: Record<TimeRange, string> = { ALL: "Mọi thời điểm", "7D": "7 ngày qua", TODAY: "Hôm nay" };

const EVENT_STYLE: Record<string, { icon: LucideIcon; variant: BadgeVariant }> = {
  FEEDBACK: { icon: ClipboardCheck, variant: "danger" },
  UPLOAD: { icon: UploadCloud, variant: "neutral" },
  PREDICT: { icon: Cpu, variant: "primary" },
  EXPORT: { icon: Download, variant: "neutral" },
};

function parsePayloadChips(payloadJson: string): Array<{ k: string; v: string }> {
  try {
    const obj = JSON.parse(payloadJson) as Record<string, unknown>;
    const chips: Array<{ k: string; v: string }> = [];
    for (const [key, val] of Object.entries(obj)) {
      if (val === null || val === undefined) continue;
      if (typeof val === "number") {
        chips.push({
          k: key,
          v: key === "score" || key === "predicted_score" ? formatPercent(val, 1) : String(Number(val.toFixed(4))),
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

function inTimeRange(ts: string, range: TimeRange): boolean {
  if (range === "ALL") return true;
  const d = parseServerDate(ts);
  if (!d) return true;
  const now = new Date();
  if (range === "7D") return now.getTime() - d.getTime() <= 7 * 24 * 3600 * 1000;
  const fmt = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(x);
  return fmt(d) === fmt(now);
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw || "{}"), null, 2);
  } catch {
    return raw;
  }
}

function downloadBlob(content: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function LogItem({ log, caseTitle }: { log: AuditLogItem; caseTitle: string }) {
  const [expanded, setExpanded] = useState(false);
  const chips = parsePayloadChips(log.payload_json);
  const style = EVENT_STYLE[log.event_type] ?? { icon: ScrollText, variant: "neutral" as BadgeVariant };
  const Icon = style.icon;

  return (
    <li className="relative flex gap-4 px-5 py-4">
      <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant={style.variant}>{eventTypeLabel(log.event_type)}</Badge>
            <span className="truncate text-base font-medium text-fg">{caseTitle}</span>
          </div>
          <div className="flex items-center gap-2">
            <time className="num text-sm text-muted">{formatDateVi(log.created_at)}</time>
            <Button
              size="sm"
              variant="ghost"
              className="no-print"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              JSON
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} aria-hidden />
            </Button>
          </div>
        </div>
        {chips.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <li key={c.k} className="inline-flex items-center gap-1 rounded-md bg-subtle px-2 py-0.5 font-mono text-xs">
                <span className="text-muted">{c.k}</span>
                <span className="font-medium text-fg">{c.v}</span>
              </li>
            ))}
          </ul>
        )}
        {expanded && (
          <pre className="scrollbar-thin overflow-x-auto rounded-lg bg-fg p-3 font-mono text-xs text-white">
            {prettyJson(log.payload_json)}
          </pre>
        )}
      </div>
    </li>
  );
}

export default function AuditPage() {
  const router = useRouter();
  const [audit, setAudit] = useState<AuditTrailResponse | null>(null);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [tab, setTab] = useState<AuditTab>("verdicts");
  const [selectedCaseId, setSelectedCaseId] = useState("ALL");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("ALL");
  const [timeRange, setTimeRange] = useState<TimeRange>("ALL");
  const [query, setQuery] = useState("");
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
      setError(err instanceof Error ? err.message : "Không thể tải nhật ký điều tra từ backend.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(selectedCaseId);
  }, [selectedCaseId, loadData]);

  const caseTitle = useMemo(() => {
    const map = new Map(cases.map((c) => [c.case_id, c.title]));
    return (id: string) => map.get(id) ?? id;
  }, [cases]);

  // Lọc theo thời gian + mã KH áp dụng cho cả thống kê lẫn bảng; lọc quyết định chỉ áp dụng cho bảng
  const scopedFeedbacks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (audit?.feedbacks ?? []).filter(
      (fb) =>
        inTimeRange(fb.updated_at, timeRange) &&
        (!q || fb.source_cust_id.toLowerCase().includes(q) || fb.target_cust_id.toLowerCase().includes(q))
    );
  }, [audit, timeRange, query]);

  const feedbacks = useMemo(
    () => (actionFilter === "ALL" ? scopedFeedbacks : scopedFeedbacks.filter((fb) => fb.action === actionFilter)),
    [scopedFeedbacks, actionFilter]
  );

  const logs = useMemo(
    () => (audit?.audit_logs ?? []).filter((l) => inTimeRange(l.created_at, timeRange)),
    [audit, timeRange]
  );

  const summary = useMemo(() => {
    let confirmed = 0;
    let dismissed = 0;
    for (const fb of scopedFeedbacks) {
      if (fb.action === "CONFIRM") confirmed += 1;
      else dismissed += 1;
    }
    return { total: scopedFeedbacks.length, confirmed, dismissed };
  }, [scopedFeedbacks]);

  const exportClient = (format: "csv" | "json") => {
    if (format === "json") {
      downloadBlob(
        JSON.stringify(
          {
            scope: selectedCaseId === "ALL" ? "ALL_CASES" : selectedCaseId,
            action_filter: actionFilter,
            time_range: timeRange,
            exported_at: formatDateVi(new Date().toISOString()),
            feedbacks,
            audit_logs: logs,
          },
          null,
          2
        ),
        "application/json;charset=utf-8",
        "ausaml_audit_all_cases.json"
      );
      return;
    }
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const headers = ["case_id", "case_title", "pair_id", "source_cust_id", "target_cust_id", "model_id", "predicted_score", "action", "note", "reviewer_name", "updated_at_vn"];
    const rows = feedbacks.map((fb) => [
      fb.case_id,
      esc(caseTitle(fb.case_id)),
      fb.pair_id,
      fb.source_cust_id,
      fb.target_cust_id,
      fb.model_id,
      fb.predicted_score.toFixed(4),
      fb.action,
      esc(fb.note || ""),
      fb.reviewer_name,
      esc(formatDateVi(fb.updated_at)),
    ]);
    downloadBlob(
      "﻿" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n"),
      "text/csv;charset=utf-8",
      "ausaml_audit_all_cases.csv"
    );
  };

  const isAllCases = selectedCaseId === "ALL";
  const hasFilters = actionFilter !== "ALL" || timeRange !== "ALL" || query.trim() !== "";
  const resetFilters = () => {
    setActionFilter("ALL");
    setTimeRange("ALL");
    setQuery("");
  };

  return (
    <PageContainer>
      {/* Header riêng cho bản in */}
      <div className="print-only space-y-1 border-b border-line pb-4">
        <p className="text-xl font-semibold">Hồ sơ điều tra AML — AusAML DSS</p>
        <p className="text-sm">
          Xuất lúc {formatDateVi(new Date().toISOString())} · Phạm vi: {isAllCases ? "tất cả vụ án" : caseTitle(selectedCaseId)} ·{" "}
          {TIME_RANGE_LABEL[timeRange]} · Quyết định: {actionFilter === "ALL" ? "tất cả" : ACTION_LABEL[actionFilter]}
        </p>
      </div>

      <PageHeader
        title="Nhật ký & báo cáo"
        description="Theo dõi quyết định thẩm định của điều tra viên và xuất hồ sơ báo cáo (giờ Việt Nam)."
        actions={
          <DropdownMenu
            trigger={(props) => (
              <Button {...props} variant="primary" leftIcon={Download} rightIcon={ChevronDown}>
                Xuất báo cáo
              </Button>
            )}
            items={[
              isAllCases
                ? { key: "csv", label: "Bảng tính CSV", icon: FileSpreadsheet, hint: ".csv", onSelect: () => exportClient("csv") }
                : { key: "csv", label: "Bảng tính CSV", icon: FileSpreadsheet, hint: ".csv", href: getExportUrl(selectedCaseId, "csv") },
              isAllCases
                ? { key: "json", label: "Dữ liệu JSON", icon: FileJson, hint: ".json", onSelect: () => exportClient("json") }
                : { key: "json", label: "Dữ liệu JSON", icon: FileJson, hint: ".json", href: getExportUrl(selectedCaseId, "json") },
              { key: "print", label: "In / lưu PDF", icon: Printer, onSelect: () => window.print() },
            ]}
          />
        }
      />

      {error && (
        <Alert
          tone="danger"
          title="Không tải được nhật ký"
          action={
            <Button size="sm" variant="secondary" leftIcon={RotateCcw} onClick={() => void loadData(selectedCaseId)}>
              Thử lại
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <StatStrip>
        <StatTile label="Tổng lượt thẩm định" value={isLoading ? <Skeleton className="h-8 w-12" /> : summary.total} icon={FileText} />
        <StatTile label="Xác nhận đồng phạm" value={isLoading ? <Skeleton className="h-8 w-12" /> : summary.confirmed} tone={summary.confirmed > 0 ? "danger" : "default"} icon={Check} />
        <StatTile label="Bác bỏ cảnh báo" value={isLoading ? <Skeleton className="h-8 w-12" /> : summary.dismissed} tone="muted" icon={X} />
      </StatStrip>

      <section className="space-y-4">
        <div className="no-print flex items-end justify-between gap-4 border-b border-line">
          <Tabs<AuditTab>
            ariaLabel="Loại nhật ký"
            idPrefix="audit"
            value={tab}
            onChange={setTab}
            className="border-b-0"
            options={[
              { value: "verdicts", label: "Quyết định thẩm định", count: feedbacks.length },
              { value: "logs", label: "Nhật ký hệ thống", count: logs.length },
            ]}
          />
          <div className="flex items-center gap-1 pb-1.5">
            {hasFilters && (
              <Button size="sm" variant="ghost" onClick={resetFilters}>
                Xóa bộ lọc
              </Button>
            )}
            <IconButton
              label="Làm mới dữ liệu"
              icon={RefreshCw}
              size="sm"
              disabled={isLoading}
              onClick={() => void loadData(selectedCaseId)}
              className={cn(isLoading && "[&>svg]:animate-spin")}
            />
          </div>
        </div>

        {/* Thanh lọc */}
        <div className="no-print flex flex-wrap items-center gap-3">
          <Select
            aria-label="Lọc theo vụ án"
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            className="w-full sm:w-64"
          >
            <option value="ALL">Tất cả vụ án</option>
            {cases.map((c) => (
              <option key={c.case_id} value={c.case_id}>
                {c.title}
              </option>
            ))}
          </Select>

          <SegmentedControl<TimeRange>
            ariaLabel="Khoảng thời gian"
            size="md"
            value={timeRange}
            onChange={setTimeRange}
            options={[
              { value: "ALL", label: "Tất cả" },
              { value: "7D", label: "7 ngày" },
              { value: "TODAY", label: "Hôm nay" },
            ]}
          />

          {tab === "verdicts" && (
            <>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo quyết định">
                {(["ALL", "CONFIRM", "DISMISS"] as ActionFilter[]).map((act) => (
                  <FilterChip key={act} selected={actionFilter === act} onClick={() => setActionFilter(act)}>
                    {act === "ALL" ? "Mọi quyết định" : ACTION_LABEL[act]}
                  </FilterChip>
                ))}
              </div>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm mã khách hàng…"
                aria-label="Tìm theo mã khách hàng"
                leftIcon={<Search className="h-4 w-4" aria-hidden />}
                className="w-full sm:w-56"
              />
            </>
          )}

        </div>

        {tab === "verdicts" ? (
          <Card className="overflow-hidden">
            {isLoading ? (
              <div className="space-y-2 p-5">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : feedbacks.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title={hasFilters ? "Không có quyết định phù hợp bộ lọc" : "Chưa có quyết định thẩm định"}
                description={
                  hasFilters
                    ? "Thử nới rộng khoảng thời gian hoặc xóa bộ lọc."
                    : "Mở phòng điều tra đồ thị để xác nhận hoặc bác bỏ các cặp nghi vấn."
                }
                action={
                  hasFilters ? (
                    <Button size="sm" variant="secondary" onClick={resetFilters}>
                      Xóa bộ lọc
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" rightIcon={ArrowUpRight} onClick={() => router.push("/workspace")}>
                      Mở phòng điều tra
                    </Button>
                  )
                }
              />
            ) : (
              <TableContainer>
                <Table>
                  <THead sticky={false}>
                    <tr>
                      <Th>Thời gian</Th>
                      <Th>Vụ án</Th>
                      <Th>Cặp khách hàng</Th>
                      <Th>Mô hình</Th>
                      <Th align="right">Xác suất</Th>
                      <Th>Quyết định</Th>
                      <Th>Ghi chú</Th>
                      <Th className="no-print">
                        <span className="sr-only">Mở lại</span>
                      </Th>
                    </tr>
                  </THead>
                  <tbody>
                    {feedbacks.map((fb) => (
                      <Tr
                        key={fb.id}
                        onSelect={() => router.push(workspaceHref(fb.case_id, fb.pair_id))}
                        title="Mở lại cặp này trên đồ thị"
                      >
                        <Td className="num whitespace-nowrap text-muted">{formatDateVi(fb.updated_at)}</Td>
                        <Td className="max-w-[220px]">
                          <span className="block truncate" title={caseTitle(fb.case_id)}>
                            {caseTitle(fb.case_id)}
                          </span>
                        </Td>
                        <Td className="whitespace-nowrap font-mono">
                          {fb.source_cust_id} <span className="text-faint">↔</span> {fb.target_cust_id}
                        </Td>
                        <Td className="whitespace-nowrap text-fg-secondary">{shortModelLabel(fb.model_id)}</Td>
                        <Td numeric className="font-medium">{formatPercent(fb.predicted_score, 1)}</Td>
                        <Td>
                          <ActionBadge action={fb.action} />
                        </Td>
                        <Td className="max-w-xs">
                          {fb.note ? (
                            <span className="block truncate text-fg-secondary" title={fb.note}>
                              {fb.note}
                            </span>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </Td>
                        <Td align="right" className="no-print">
                          <ArrowUpRight className="ml-auto h-4 w-4 text-muted" aria-hidden />
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableContainer>
            )}
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {isLoading ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <EmptyState icon={ScrollText} title="Chưa có sự kiện hệ thống" description="Các lần tải lên, suy luận, thẩm định và xuất báo cáo sẽ xuất hiện tại đây." />
            ) : (
              <ol className="scrollbar-thin relative max-h-[640px] divide-y divide-line overflow-y-auto before:absolute before:bottom-0 before:left-[35px] before:top-0 before:w-px before:bg-line">
                {logs.map((log) => (
                  <LogItem key={log.id} log={log} caseTitle={caseTitle(log.case_id)} />
                ))}
              </ol>
            )}
          </Card>
        )}
      </section>
    </PageContainer>
  );
}
