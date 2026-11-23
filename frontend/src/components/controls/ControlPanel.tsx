"use client";

/**
 * Bộ điều khiển DSS (cột trái /workspace — SRS §8.2, FR-05.2):
 * chọn vụ án, mô hình, ngưỡng τ (có vạch τ_val), Top-K, số hop và bật/tắt 6 lớp thực thể.
 * Mọi cài đặt luôn hiển thị (không giấu trong modal); nút "Chạy suy luận" dính ở đáy.
 */

import { useEffect, useState } from "react";
import { Check, PanelLeftClose, Play, RotateCcw } from "lucide-react";
import type { CaseSummary, ModelInfo, NodeType } from "@/types/contract";
import { NODE_VISUAL_STYLES } from "@/lib/theme/colors";
import { METRIC_TOOLTIPS, shortModelLabel } from "@/lib/i18n/labels";
import { shortCaseTitle } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { SegmentedControl } from "@/components/ui/Tabs";
import { NodeShapeIcon } from "@/components/graph/NodeShapeIcon";

export const THRESHOLD_MIN = 0.05;
export const THRESHOLD_MAX = 0.95;
export const ALL_NODE_TYPES = Object.keys(NODE_VISUAL_STYLES) as NodeType[];

export interface ControlPanelProps {
  cases: CaseSummary[];
  models: ModelInfo[];
  selectedCaseId: string;
  selectedModelId: string;
  threshold: number;
  topK: number;
  hopDepth: number;
  includeNodeTypes: NodeType[];
  isPredicting: boolean;
  isLoadingMeta: boolean;
  /** Top-K / số hop đã đổi so với lần chạy gần nhất. */
  isDirty: boolean;
  executionTimeMs: number | null;
  onClose?: () => void;
  onCaseChange: (caseId: string) => void;
  onModelChange: (modelId: string, defaultTau: number) => void;
  onThresholdChange: (tau: number) => void;
  onTopKChange: (k: number) => void;
  onHopDepthChange: (depth: number) => void;
  onToggleNodeType: (nt: NodeType) => void;
  onSetAllNodeTypes: () => void;
  onRunPredict: () => void;
}

/** Ô nhập số giữ bản nháp khi gõ; chỉ chuẩn hóa (kẹp min–max) & áp dụng khi Enter hoặc rời ô. */
function DraftNumberInput({
  value,
  min,
  max,
  decimals = 0,
  onCommit,
  className,
  id,
}: {
  value: number;
  min: number;
  max: number;
  decimals?: number;
  onCommit: (v: number) => void;
  className?: string;
  id?: string;
}) {
  const format = (v: number) => (decimals > 0 ? v.toFixed(decimals) : String(Math.round(v)));
  const [draft, setDraft] = useState(format(value));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setDraft(format(value)), [value]);
  const commit = () => {
    const v = parseFloat(draft.replace(",", "."));
    if (Number.isNaN(v)) {
      setDraft(format(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, decimals > 0 ? v : Math.round(v)));
    onCommit(clamped);
    setDraft(format(clamped));
  };
  return (
    <Input
      id={id}
      inputMode={decimals > 0 ? "decimal" : "numeric"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      className={cn("num font-mono", className)}
    />
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-medium text-muted">{children}</h3>;
}

export function ControlPanel({
  cases,
  models,
  selectedCaseId,
  selectedModelId,
  threshold,
  topK,
  hopDepth,
  includeNodeTypes,
  isPredicting,
  isLoadingMeta,
  isDirty,
  executionTimeMs,
  onClose,
  onCaseChange,
  onModelChange,
  onThresholdChange,
  onTopKChange,
  onHopDepthChange,
  onToggleNodeType,
  onSetAllNodeTypes,
  onRunPredict,
}: ControlPanelProps) {
  const selectedModel = models.find((m) => m.model_id === selectedModelId);
  const defaultTau = selectedModel?.default_threshold ?? 0.5682;
  const isAtDefault = Math.abs(threshold - defaultTau) < 0.005;
  const tauMarkerPct = ((defaultTau - THRESHOLD_MIN) / (THRESHOLD_MAX - THRESHOLD_MIN)) * 100;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-line pl-4 pr-2">
        <h2 className="text-base font-semibold text-fg">Bộ điều khiển</h2>
        {onClose && <IconButton label="Ẩn bộ điều khiển" icon={PanelLeftClose} size="sm" onClick={onClose} />}
      </header>

      <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-4 py-4">
        {/* Dữ liệu & mô hình */}
        <section className="space-y-4">
          <Field label="Vụ án">
            <Select
              value={selectedCaseId}
              disabled={isLoadingMeta || cases.length === 0}
              onChange={(e) => onCaseChange(e.target.value)}
            >
              {cases.length === 0 ? (
                <option value={selectedCaseId}>Đang tải vụ án…</option>
              ) : (
                cases.map((c) => (
                  <option key={c.case_id} value={c.case_id}>
                    {c.source_type === "USER_UPLOAD" ? "[Tải lên] " : ""}
                    {shortCaseTitle(c.title, 40)}
                  </option>
                ))
              )}
            </Select>
          </Field>

          <Field
            label="Mô hình"
            hint={selectedModel ? <span className="line-clamp-3">{selectedModel.architecture_summary}</span> : undefined}
          >
            <Select
              value={selectedModelId}
              disabled={isLoadingMeta || models.length === 0}
              onChange={(e) => {
                const m = models.find((x) => x.model_id === e.target.value);
                onModelChange(e.target.value, m?.default_threshold ?? 0.5682);
              }}
            >
              {models.length === 0 ? (
                <option value={selectedModelId}>Đang tải…</option>
              ) : (
                models.map((m) => (
                  <option key={m.model_id} value={m.model_id}>
                    {shortModelLabel(m.model_id, m.display_name)}
                    {m.is_recommended ? " (khuyến nghị)" : ""}
                  </option>
                ))
              )}
            </Select>
          </Field>
        </section>

        {/* Ngưỡng τ */}
        <section className="space-y-3" aria-labelledby="tau-title">
          <div className="flex items-center justify-between gap-2">
            <label id="tau-title" htmlFor="tau-input" className="text-sm font-medium text-fg-secondary" title={METRIC_TOOLTIPS.tau}>
              Ngưỡng xác suất τ
            </label>
            <DraftNumberInput
              id="tau-input"
              value={threshold}
              min={THRESHOLD_MIN}
              max={THRESHOLD_MAX}
              decimals={2}
              onCommit={onThresholdChange}
              className="h-8 w-20 text-right"
            />
          </div>

          <div className="relative pb-5">
            <input
              type="range"
              min={THRESHOLD_MIN}
              max={THRESHOLD_MAX}
              step={0.01}
              value={threshold}
              aria-label="Ngưỡng xác suất τ"
              aria-valuetext={`${threshold.toFixed(2)}${isAtDefault ? " (bằng τ_val)" : ""}`}
              onChange={(e) => onThresholdChange(parseFloat(e.target.value))}
              className="relative z-10 h-5 w-full cursor-pointer"
            />
            {/* Vạch đánh dấu τ_val (FR-05.2) */}
            <div
              className="pointer-events-none absolute top-[18px] flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${tauMarkerPct}%` }}
              aria-hidden
            >
              <span className="h-2 w-px bg-fg-secondary" />
              <span className="num mt-0.5 whitespace-nowrap font-mono text-xs text-muted">τ_val {defaultTau.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted">Kéo để cập nhật mức rủi ro tức thì.</p>
            {!isAtDefault && (
              <Button size="sm" variant="ghost" leftIcon={RotateCcw} onClick={() => onThresholdChange(defaultTau)} className="-mr-2">
                Về τ_val
              </Button>
            )}
          </div>
        </section>

        {/* Phạm vi suy luận */}
        <section className="space-y-4">
          <SectionTitle>Phạm vi suy luận</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Top-K cặp" hint="5 – 50">
              <DraftNumberInput value={topK} min={5} max={50} onCommit={onTopKChange} />
            </Field>
            <div className="space-y-1.5">
              <span className="block text-sm font-medium text-fg-secondary">Bán kính</span>
              <SegmentedControl<"2" | "3">
                ariaLabel="Bán kính đồ thị con"
                size="md"
                value={String(hopDepth) as "2" | "3"}
                onChange={(v) => onHopDepthChange(parseInt(v, 10))}
                options={[
                  { value: "2", label: "2-hop" },
                  { value: "3", label: "3-hop" },
                ]}
                className="flex w-full [&>button]:flex-1"
              />
            </div>
          </div>
        </section>

        {/* Lớp thực thể — đồng thời là chú giải node */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <SectionTitle>
              Lớp thực thể hiển thị <span className="num">({includeNodeTypes.length}/6)</span>
            </SectionTitle>
            {includeNodeTypes.length < ALL_NODE_TYPES.length && (
              <button type="button" onClick={onSetAllNodeTypes} className="text-xs font-medium text-primary-fg hover:underline">
                Hiện tất cả
              </button>
            )}
          </div>
          <ul className="space-y-0.5">
            {ALL_NODE_TYPES.map((nt) => {
              const checked = includeNodeTypes.includes(nt);
              return (
                <li key={nt}>
                  <button
                    type="button"
                    aria-pressed={checked}
                    onClick={() => onToggleNodeType(nt)}
                    className={cn(
                      "flex h-9 w-full items-center gap-3 rounded-md px-2 text-left text-base transition-colors hover:bg-subtle",
                      checked ? "text-fg" : "text-muted"
                    )}
                  >
                    <NodeShapeIcon type={nt} muted={!checked} />
                    <span className="flex-1">{NODE_VISUAL_STYLES[nt].labelVi}</span>
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border transition-colors",
                        checked ? "border-primary bg-primary text-white" : "border-line-strong bg-surface"
                      )}
                      aria-hidden
                    >
                      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <footer className="shrink-0 space-y-2 border-t border-line bg-surface px-4 py-3">
        {isDirty ? (
          <p className="text-xs text-warning-fg">Top-K hoặc bán kính đã thay đổi — chạy lại để áp dụng.</p>
        ) : (
          executionTimeMs !== null && (
            <p className="num text-xs text-muted">Lần chạy gần nhất: {executionTimeMs.toFixed(0)} ms</p>
          )
        )}
        <Button
          variant="primary"
          leftIcon={Play}
          loading={isPredicting}
          disabled={isLoadingMeta || !selectedCaseId}
          onClick={onRunPredict}
          className="w-full"
        >
          {isPredicting ? "Đang suy luận…" : "Chạy suy luận"}
        </Button>
      </footer>
    </div>
  );
}
