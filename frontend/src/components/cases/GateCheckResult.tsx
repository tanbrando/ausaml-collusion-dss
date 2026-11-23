/**
 * Kết quả "Kiểm định dữ liệu" (Gate Check 1) dạng checklist có nhãn tiếng Việt,
 * thay cho lưới 5 ô hiển thị key thô (node_dims, edge_bounds...).
 */

import { CheckCircle2, Info, XCircle } from "lucide-react";
import type { GateCheckReport } from "@/types/contract";
import { GATE_CHECK_LABEL } from "@/lib/i18n/labels";
import { Badge } from "@/components/ui/Badge";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";

type RowState = "pass" | "fail" | "info";

const ICON: Record<RowState, { icon: typeof Info; className: string; sr: string }> = {
  pass: { icon: CheckCircle2, className: "text-success", sr: "Đạt" },
  fail: { icon: XCircle, className: "text-danger", sr: "Lỗi" },
  info: { icon: Info, className: "text-muted", sr: "Thông tin" },
};

export function GateCheckResult({ report }: { report: GateCheckReport }) {
  const rows: Array<{ key: string; label: string; state: RowState; detail: string }> = [
    {
      key: "node_dims",
      label: GATE_CHECK_LABEL.node_dims,
      state: report.node_dims_valid ? "pass" : "fail",
      detail: report.node_dims_valid ? "Hợp lệ" : "Sai kích thước",
    },
    {
      key: "edge_bounds",
      label: GATE_CHECK_LABEL.edge_bounds,
      state: report.edge_bounds_valid ? "pass" : "fail",
      detail: report.edge_bounds_valid ? "Hợp lệ" : "Vượt biên",
    },
    {
      key: "nan",
      label: GATE_CHECK_LABEL.nan,
      state: report.nan_count === 0 ? "pass" : "fail",
      detail: `${formatNumber(report.nan_count)} giá trị`,
    },
    {
      key: "inf",
      label: GATE_CHECK_LABEL.inf,
      state: report.inf_count === 0 ? "pass" : "fail",
      detail: `${formatNumber(report.inf_count)} giá trị`,
    },
    {
      key: "reverse",
      label: GATE_CHECK_LABEL.reverse_edges,
      state: "info",
      detail: `${formatNumber(report.reverse_edges_added)} cạnh`,
    },
  ];

  return (
    <section aria-label={GATE_CHECK_LABEL.title} className="overflow-hidden rounded-lg border border-line">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-subtle px-4 py-3">
        <h3 className="text-base font-semibold text-fg">{GATE_CHECK_LABEL.title}</h3>
        <Badge variant={report.passed ? "success" : "danger"}>
          {report.passed ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <XCircle className="h-3 w-3" aria-hidden />}
          {report.passed ? "Đạt" : "Không đạt"}
        </Badge>
      </header>

      <ul className="divide-y divide-line">
        {rows.map((row) => {
          const { icon: Icon, className, sr } = ICON[row.state];
          return (
            <li key={row.key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-base">
              <span className="flex items-center gap-2.5 text-fg">
                <Icon className={cn("h-4 w-4 shrink-0", className)} aria-hidden />
                <span className="sr-only">{sr}:</span>
                {row.label}
              </span>
              <span
                className={cn(
                  "num shrink-0 text-sm",
                  row.state === "fail" ? "font-medium text-danger-fg" : "text-muted"
                )}
              >
                {row.detail}
              </span>
            </li>
          );
        })}
      </ul>

      {(report.errors.length > 0 || report.warnings.length > 0) && (
        <div className="space-y-2 border-t border-line px-4 py-3 text-sm">
          {report.errors.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-danger-fg">
              {report.errors.map((msg, i) => (
                <li key={`e-${i}`}>{msg}</li>
              ))}
            </ul>
          )}
          {report.warnings.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-warning-fg">
              {report.warnings.map((msg, i) => (
                <li key={`w-${i}`}>{msg}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
