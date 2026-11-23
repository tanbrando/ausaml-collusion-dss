"use client";

/**
 * Hồ sơ bằng chứng (cột phải /workspace — SRS §8.2, FR-04, FR-05.3):
 * header cặp + điểm, 3 tab (Tổng quan · Đường bắc cầu · Đặc trưng), khối quyết định neo ở đáy.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Check, GitBranch, Loader2, PanelRightClose, Radar as RadarIcon, ShieldQuestion, Sparkles, X, LayoutList } from "lucide-react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  computeRiskLevel,
  type EvidencePath,
  type ExplainPairResponse,
  type FeedbackAction,
  type PredictedLinkItem,
} from "@/types/contract";
import { Badge, RiskBadge, StatusBadge } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState, Skeleton } from "@/components/ui/Card";
import { Field, Textarea } from "@/components/ui/Field";
import { ACTION_LABEL, STATUS_LABEL } from "@/lib/i18n/labels";
import { CHART_THEME, HEX, MODEL_HEX } from "@/lib/theme/colors";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/cn";

type PanelTab = "overview" | "paths" | "features";

interface EvidencePanelProps {
  selectedPair: PredictedLinkItem | null;
  pairDetail: ExplainPairResponse | null;
  threshold: number;
  highlightedPathId?: string | null;
  isLoadingDetail?: boolean;
  onHighlightPath: (path: EvidencePath) => void;
  onSubmitFeedback: (action: FeedbackAction, note: string) => Promise<void>;
  onClose?: () => void;
}

function ModelScoreRow({
  label,
  hint,
  score,
  color,
  threshold,
  emphasis = false,
}: {
  label: string;
  hint: string;
  score: number;
  color: string;
  threshold: number;
  emphasis?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, score * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-sm">
          <span className={cn(emphasis ? "font-semibold text-fg" : "font-medium text-fg-secondary")}>{label}</span>
          <span className="ml-1.5 text-xs text-muted">{hint}</span>
        </span>
        <span className={cn("num font-mono text-sm", emphasis ? "font-semibold text-fg" : "text-fg-secondary")}>
          {formatPercent(score, 1)}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-subtle">
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, backgroundColor: color }} />
        <span
          className="absolute -top-1 h-4 w-px bg-fg-secondary"
          style={{ left: `${threshold * 100}%` }}
          aria-hidden
          title={`τ = ${threshold.toFixed(2)}`}
        />
      </div>
    </div>
  );
}

export function EvidencePanel({
  selectedPair,
  pairDetail,
  threshold,
  highlightedPathId = null,
  isLoadingDetail = false,
  onHighlightPath,
  onSubmitFeedback,
  onClose,
}: EvidencePanelProps) {
  const [tab, setTab] = useState<PanelTab>("overview");
  const [note, setNote] = useState("");
  const [confirmingDismiss, setConfirmingDismiss] = useState(false);
  const [submitting, setSubmitting] = useState<FeedbackAction | null>(null);

  useEffect(() => {
    setConfirmingDismiss(false);
  }, [selectedPair?.pair_id]);

  const header = (title: React.ReactNode, extra?: React.ReactNode) => (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line pl-4 pr-2">
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      <div className="flex items-center gap-1">
        {extra}
        {onClose && <IconButton label="Ẩn hồ sơ bằng chứng" icon={PanelRightClose} size="sm" onClick={onClose} />}
      </div>
    </header>
  );

  if (!selectedPair) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-surface">
        {header("Hồ sơ bằng chứng")}
        <div className="flex flex-1 items-center">
          <EmptyState
            icon={ShieldQuestion}
            title="Chưa chọn cặp nghi vấn"
            description="Chọn một cạnh nét đứt trên đồ thị hoặc một dòng trong bảng xếp hạng để xem bằng chứng và ra quyết định."
          />
        </div>
      </div>
    );
  }

  const risk = computeRiskLevel(selectedPair.score, threshold);
  const comparison = pairDetail?.model_comparison ?? selectedPair.model_comparison;
  const paths = (pairDetail?.evidence_paths ?? selectedPair.evidence_paths).slice(0, 3);
  const explanation = pairDetail?.explanation_vi ?? selectedPair.explanation_vi;
  const radarData = pairDetail?.radar_features ?? [];
  const summary = pairDetail?.pairwise_summary ?? selectedPair.pairwise_summary;
  const scoreGap = comparison.hybrid_v3_best - comparison.ck_gcn_seed42;
  const hasDecision = selectedPair.feedback_status !== "PENDING";

  const act = async (action: FeedbackAction) => {
    setSubmitting(action);
    try {
      await onSubmitFeedback(action, note.trim());
      setNote("");
      setConfirmingDismiss(false);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      {header("Hồ sơ bằng chứng", isLoadingDetail && <Loader2 className="mr-1 h-4 w-4 animate-spin text-muted" aria-label="Đang tải chi tiết" />)}

      {/* Tóm tắt cặp */}
      <section className="shrink-0 space-y-3 border-b border-line px-4 py-4">
        <div className="min-w-0">
          <p className="truncate font-mono text-base font-semibold text-fg" title={`${selectedPair.source} ↔ ${selectedPair.target}`}>
            {selectedPair.source} <span className="font-normal text-faint">↔</span> {selectedPair.target}
          </p>
          <p className="mt-0.5 truncate font-mono text-xs text-muted">{selectedPair.pair_id}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="num text-2xl font-semibold tracking-tight text-fg">{formatPercent(selectedPair.score, 1)}</span>
          <RiskBadge level={risk} />
          <StatusBadge status={selectedPair.feedback_status} />
        </div>
      </section>

      <Tabs<PanelTab>
        ariaLabel="Nội dung hồ sơ"
        idPrefix="evidence"
        value={tab}
        onChange={setTab}
        fill
        className="shrink-0 px-2"
        options={[
          { value: "overview", label: "Tổng quan", icon: LayoutList },
          { value: "paths", label: "Bắc cầu", icon: GitBranch, count: paths.length },
          { value: "features", label: "Đặc trưng", icon: RadarIcon },
        ]}
      />

      <div
        role="tabpanel"
        id={`evidence-panel-${tab}`}
        aria-labelledby={`evidence-tab-${tab}`}
        className="scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4"
      >
        {tab === "overview" && (
          <>
            <section className="space-y-3">
              <h3 className="text-xs font-medium text-muted">So sánh xác suất giữa các mô hình</h3>
              <ModelScoreRow label="CK GCN" hint="đồng nhất" score={comparison.ck_gcn_seed42} color={MODEL_HEX.ck_gcn_seed42} threshold={threshold} />
              <ModelScoreRow label="CK GAT" hint="attention đồng nhất" score={comparison.ck_gat_seed42} color={MODEL_HEX.ck_gat_seed42} threshold={threshold} />
              <ModelScoreRow
                label="Hybrid v4"
                hint="GATv2 + GINE + SAGE"
                score={comparison.hybrid_v3_best}
                color={MODEL_HEX.hybrid_v4_full}
                threshold={threshold}
                emphasis
              />
              <p className="text-xs text-muted">Vạch dọc trên mỗi thanh là ngưỡng τ hiện tại.</p>
              {Math.abs(scoreGap) >= 0.25 && (
                <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning-fg">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    Hybrid v4 {scoreGap > 0 ? "cao hơn" : "thấp hơn"} CK GCN{" "}
                    <b className="num">{formatPercent(Math.abs(scoreGap), 1)}</b> —{" "}
                    {scoreGap > 0 ? "dấu hiệu đồng phạm ẩn mà mô hình đồng nhất bỏ sót." : "khả năng là ca bẫy mà GCN báo động giả."}
                  </span>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-medium text-muted">Tín hiệu giữa hai khách hàng</h3>
              <dl className="num grid grid-cols-3 divide-x divide-line rounded-lg border border-line">
                {[
                  { label: "Thiết bị chung", value: summary.shared_devices },
                  { label: "IP chung", value: summary.shared_ips },
                  { label: "Giao dịch trực tiếp", value: summary.direct_tx_count },
                ].map((s) => (
                  <div key={s.label} className="px-3 py-2.5">
                    <dt className="text-xs text-muted">{s.label}</dt>
                    <dd className="mt-0.5 text-lg font-semibold text-fg">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Nhận định của mô hình
              </h3>
              <p className="rounded-lg bg-subtle px-3 py-2.5 text-base leading-relaxed text-fg-secondary">{explanation}</p>
            </section>
          </>
        )}

        {tab === "paths" &&
          (paths.length === 0 ? (
            <EmptyState compact icon={GitBranch} title="Không có đường bắc cầu" description="Không tìm thấy đường đi trung gian trong đồ thị con hiện tại." />
          ) : (
            <section className="space-y-2">
              <p className="text-sm text-muted">Chọn một đường để làm sáng chuỗi thực thể trung gian trên đồ thị.</p>
              {paths.map((ep, idx) => {
                const active = highlightedPathId === ep.path_id;
                return (
                  <button
                    key={ep.path_id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onHighlightPath(ep)}
                    className={cn(
                      "w-full space-y-2 rounded-lg border p-3 text-left transition-colors",
                      active ? "border-primary bg-primary-subtle" : "border-line hover:border-line-strong hover:bg-subtle"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-fg">
                        <span className="num mr-1.5 text-muted">{idx + 1}.</span>
                        {ep.path_type}
                      </span>
                      {ep.attention_score !== null && (
                        <Badge variant={active ? "primary" : "neutral"} className="num font-mono" title="Trọng số attention">
                          α {ep.attention_score.toFixed(3)}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 font-mono text-xs">
                      {ep.nodes.map((node, i) => (
                        <span key={`${ep.path_id}-${i}`} className="inline-flex items-center gap-1">
                          <span className="rounded border border-line bg-surface px-1.5 py-0.5 text-fg-secondary">{node}</span>
                          {i < ep.nodes.length - 1 && <span className="text-faint">→</span>}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm text-muted">{ep.description}</p>
                  </button>
                );
              })}
            </section>
          ))}

        {tab === "features" && (
          <section className="space-y-3">
            <p className="text-sm text-muted">6 nhóm đặc trưng cấu trúc & hành vi của cặp, chuẩn hóa 0 → 1.</p>
            {isLoadingDetail ? (
              <Skeleton className="h-56 w-full" />
            ) : radarData.length > 0 ? (
              <>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                      <PolarGrid stroke={HEX.line} />
                      <PolarAngleAxis dataKey="axis" tick={{ fontSize: 12, fill: HEX.fgSecondary }} />
                      <PolarRadiusAxis angle={30} domain={[0, 1]} tick={{ fontSize: 11, fill: HEX.muted }} tickCount={3} axisLine={false} />
                      <Radar name="Mức tín hiệu" dataKey="value_normalized" stroke={HEX.primary} fill={HEX.primary} fillOpacity={0.2} strokeWidth={2} />
                      <Tooltip
                        formatter={(value: number, _n: string, props: { payload?: { raw_display?: string } }) => [
                          props.payload?.raw_display ?? `${(value * 100).toFixed(1)}%`,
                          "Giá trị thực",
                        ]}
                        {...CHART_THEME.tooltip}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <dl className="divide-y divide-line rounded-lg border border-line text-sm">
                  {radarData.map((pt) => (
                    <div key={pt.axis} className="flex items-center justify-between gap-3 px-3 py-2">
                      <dt className="text-fg-secondary">{pt.axis}</dt>
                      <dd className="num font-mono font-medium text-fg">{pt.raw_display}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <EmptyState compact icon={RadarIcon} title="Chưa có dữ liệu đặc trưng" />
            )}
          </section>
        )}
      </div>

      {/* Quyết định của điều tra viên */}
      <footer className="shrink-0 space-y-3 border-t border-line bg-subtle/60 px-4 py-4">
        <Field
          label="Ghi chú bằng chứng"
          hint={hasDecision ? `Đã có quyết định “${STATUS_LABEL[selectedPair.feedback_status]}” — gửi lại để cập nhật.` : "Lưu vào nhật ký điều tra."}
        >
          <Textarea
            value={note}
            disabled={submitting !== null}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ví dụ: trùng thiết bị + chia nhỏ giao dịch"
          />
        </Field>

        {confirmingDismiss ? (
          <div className="space-y-3 rounded-lg border border-warning/30 bg-warning-subtle p-3">
            <p className="text-sm text-warning-fg">
              Bác bỏ cặp <b className="font-mono">{selectedPair.source} ↔ {selectedPair.target}</b>? Cạnh dự báo sẽ bị ẩn khỏi đồ thị và đưa vào kho ca bẫy.
            </p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" disabled={submitting !== null} onClick={() => setConfirmingDismiss(false)}>
                Hủy
              </Button>
              <Button size="sm" variant="primary" leftIcon={X} loading={submitting === "DISMISS"} onClick={() => void act("DISMISS")}>
                Đồng ý bác bỏ
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Button variant="danger" leftIcon={Check} loading={submitting === "CONFIRM"} disabled={submitting !== null} onClick={() => void act("CONFIRM")}>
              {ACTION_LABEL.CONFIRM}
            </Button>
            <Button variant="secondary" leftIcon={X} disabled={submitting !== null} onClick={() => setConfirmingDismiss(true)}>
              {ACTION_LABEL.DISMISS}
            </Button>
          </div>
        )}
      </footer>
    </div>
  );
}
