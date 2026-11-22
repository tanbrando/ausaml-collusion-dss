"use client";

/**
 * Cột Trái Workspace (M3 - Việt): Bộ điều khiển DSS.
 * Tinh chỉnh theo review lần 2:
 * - Rút gọn tiêu đề vụ án trong `<select>` bằng `shortCaseTitle` để không bị cắt ngang từ ("…2 kịch bản rời nh").
 * - Bỏ hộp lặp lại tên vụ án bên dưới dropdown, chỉ giữ thanh thống kê `KH · Đỉnh · Cạnh`.
 * - Cân bằng chiều cao (`h-full flex flex-col justify-between`) để cột trái không bị hụt khoảng trống bên dưới.
 */

import { Loader2, Play, RotateCcw, SlidersHorizontal } from "lucide-react";
import { NODE_VISUAL_STYLES } from "@/types/contract";
import type { CaseSummary, ModelInfo, NodeType } from "@/types/contract";
import {
  METRIC_TOOLTIPS,
  shortCaseTitle,
  shortModelLabel,
} from "@/lib/format";

const THRESHOLD_MIN = 0.05;
const THRESHOLD_MAX = 0.95;

interface InferenceSidebarProps {
  cases: CaseSummary[];
  models: ModelInfo[];
  selectedCaseId: string;
  selectedModelId: string;
  threshold: number;
  topK: number;
  hopDepth: number;
  includeNodeTypes: NodeType[];
  isPredicting?: boolean;
  isLoadingMeta?: boolean;
  onCaseChange: (caseId: string) => void;
  onModelChange: (modelId: string, defaultTau: number) => void;
  onThresholdChange: (tau: number) => void;
  onTopKChange: (k: number) => void;
  onHopDepthChange: (depth: number) => void;
  onToggleNodeType: (nt: NodeType) => void;
  onRunPredict: () => void;
}

export function InferenceSidebar({
  cases,
  models,
  selectedCaseId,
  selectedModelId,
  threshold,
  topK,
  hopDepth,
  includeNodeTypes,
  isPredicting = false,
  isLoadingMeta = false,
  onCaseChange,
  onModelChange,
  onThresholdChange,
  onTopKChange,
  onHopDepthChange,
  onToggleNodeType,
  onRunPredict,
}: InferenceSidebarProps) {
  const selectedCase = cases.find((c) => c.case_id === selectedCaseId);
  const selectedModel = models.find((m) => m.model_id === selectedModelId);
  const defaultTau = selectedModel?.default_threshold ?? 0.5682;

  const clampedDefaultTau = Math.min(
    THRESHOLD_MAX,
    Math.max(THRESHOLD_MIN, defaultTau)
  );
  const defaultMarkerPercent =
    ((clampedDefaultTau - THRESHOLD_MIN) / (THRESHOLD_MAX - THRESHOLD_MIN)) * 100;
  const isAtDefaultThreshold = Math.abs(threshold - defaultTau) < 0.005;

  return (
    <aside className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-4 h-full min-h-0 flex flex-col justify-between gap-3">
      <div className="space-y-3.5 flex-1 min-h-0 overflow-y-auto pr-0.5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-blue-600" />
            <h2 className="font-semibold text-slate-900 text-sm">
              Bộ điều khiển Suy luận DSS
            </h2>
          </div>
        </div>

        {/* 1. Chọn Vụ án (Không lặp lại tên vụ án ở ô dưới, chỉ giữ dòng thống kê) */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-700">
            Hồ sơ Vụ án
          </label>
          <select
            value={selectedCaseId}
            title={selectedCase?.title}
            disabled={isLoadingMeta || cases.length === 0}
            onChange={(e) => onCaseChange(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-medium bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
          >
            {cases.length === 0 ? (
              <option value={selectedCaseId}>Đang tải danh sách vụ án...</option>
            ) : (
              cases.map((c) => {
                const label =
                  c.source_type === "USER_UPLOAD"
                    ? `[Upload #${c.case_id.slice(-6)}] ${shortCaseTitle(c.title, 30)}`
                    : shortCaseTitle(c.title, 42);
                return (
                  <option key={c.case_id} value={c.case_id}>
                    {label}
                  </option>
                );
              })
            )}
          </select>

          {selectedCase && (
            <div className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200/70 rounded-lg px-2.5 py-1.5 flex items-center justify-between num">
              <span>
                <b>{selectedCase.num_customers.toLocaleString()}</b> KH
              </span>
              <span className="text-slate-300">·</span>
              <span>
                <b>{selectedCase.total_nodes.toLocaleString()}</b> đỉnh
              </span>
              <span className="text-slate-300">·</span>
              <span>
                <b>{selectedCase.total_edges.toLocaleString()}</b> cạnh
              </span>
            </div>
          )}
        </div>

        {/* 2. Chọn Mô hình GNN */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-slate-700">
              Mô hình GNN
            </label>
            {selectedModel?.is_recommended && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                ★ Khuyên dùng
              </span>
            )}
          </div>
          <select
            value={selectedModelId}
            disabled={isLoadingMeta || models.length === 0}
            onChange={(e) => {
              const m = models.find((x) => x.model_id === e.target.value);
              onModelChange(e.target.value, m?.default_threshold ?? 0.5682);
            }}
            className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-medium bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
          >
            {models.length === 0 ? (
              <option value={selectedModelId}>Đang tải mô hình...</option>
            ) : (
              models.map((m) => (
                <option key={m.model_id} value={m.model_id}>
                  {shortModelLabel(m.model_id, m.display_name)} (τ=
                  {m.default_threshold.toFixed(4)})
                  {m.is_recommended ? " ★" : ""}
                </option>
              ))
            )}
          </select>
          {selectedModel && (
            <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200/70 rounded-lg px-2.5 py-1.5 leading-relaxed">
              {selectedModel.architecture_summary}
            </p>
          )}
        </div>

        {/* 3. Ngưỡng rủi ro (Threshold) + Vạch đánh dấu default_threshold */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span
              className="font-semibold text-slate-700 cursor-help"
              title={METRIC_TOOLTIPS.tau}
            >
              Ngưỡng quyết định (Threshold)
            </span>
            <div className="flex items-center gap-1.5 num">
              <span className="font-mono font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                {threshold.toFixed(4)}
              </span>
              {!isAtDefaultThreshold && (
                <button
                  type="button"
                  onClick={() => onThresholdChange(defaultTau)}
                  title={`Đặt lại về τ_val mặc định (${defaultTau.toFixed(4)})`}
                  className="text-[11px] text-slate-600 hover:text-blue-600 flex items-center gap-0.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="relative pt-1 pb-4">
            <input
              type="range"
              min={THRESHOLD_MIN}
              max={THRESHOLD_MAX}
              step={0.01}
              value={threshold}
              onChange={(e) => onThresholdChange(parseFloat(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer relative z-10"
            />
            <div
              className="absolute top-0 bottom-2 pointer-events-none flex flex-col items-center"
              style={{
                left: `calc(${defaultMarkerPercent}% - 1px)`,
              }}
            >
              <div className="w-0.5 h-5 bg-amber-500 rounded-full" />
              <span className="text-[10px] font-mono font-semibold text-amber-800 whitespace-nowrap -translate-x-1/2 ml-0.5 bg-amber-50 px-1 rounded border border-amber-300 num">
                τ={defaultTau.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* 4. Top-K & Hop Depth */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Top-K (5–50)
            </label>
            <input
              type="number"
              min={5}
              max={50}
              value={topK}
              onChange={(e) => {
                const parsed = parseInt(e.target.value || "20", 10);
                if (!Number.isNaN(parsed)) {
                  onTopKChange(Math.min(50, Math.max(5, parsed)));
                }
              }}
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-900 num focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Hop Depth
            </label>
            <select
              value={hopDepth}
              onChange={(e) => onHopDepthChange(parseInt(e.target.value, 10))}
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={2}>2-hop (Nhanh)</option>
              <option value={3}>3-hop (Mở rộng)</option>
            </select>
          </div>
        </div>

        {/* 5. 6 Checkboxes lớp thực thể */}
        <div className="space-y-1.5">
          <span className="block text-xs font-semibold text-slate-700">
            Lớp thực thể hiển thị
          </span>
          <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
            {(Object.keys(NODE_VISUAL_STYLES) as NodeType[]).map((nt) => {
              const style = NODE_VISUAL_STYLES[nt];
              return (
                <label
                  key={nt}
                  className="flex items-center gap-1.5 cursor-pointer select-none text-slate-700 hover:text-slate-900 font-medium"
                >
                  <input
                    type="checkbox"
                    checked={includeNodeTypes.includes(nt)}
                    onChange={() => onToggleNodeType(nt)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: style.color }}
                  />
                  <span className="truncate">{style.labelVi}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* 6. Nút Chạy Suy Luận neo ở đáy cột trái */}
      <button
        type="button"
        onClick={onRunPredict}
        disabled={isPredicting || isLoadingMeta || !selectedCaseId}
        className="w-full py-2.5 px-4 rounded-lg bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 shadow-sm"
      >
        {isPredicting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Đang suy luận GNN...</span>
          </>
        ) : (
          <>
            <Play className="w-4 h-4 fill-current" />
            <span>Chạy Suy Luận (Run Prediction)</span>
          </>
        )}
      </button>
    </aside>
  );
}
