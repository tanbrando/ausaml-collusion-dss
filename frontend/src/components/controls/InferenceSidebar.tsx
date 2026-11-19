"use client";

/**
 * Cột Trái Workspace (M3 - Việt): Bộ điều khiển DSS.
 * TODO (Việt - M3): Hoàn thiện styling, hiển thị thêm vạch đánh dấu default_threshold trên slider.
 */

import { NODE_VISUAL_STYLES } from "@/types/contract";
import type { CaseSummary, ModelInfo, NodeType } from "@/types/contract";

interface InferenceSidebarProps {
  cases: CaseSummary[];
  models: ModelInfo[];
  selectedCaseId: string;
  selectedModelId: string;
  threshold: number;
  topK: number;
  includeNodeTypes: NodeType[];
  onCaseChange: (caseId: string) => void;
  onModelChange: (modelId: string, defaultTau: number) => void;
  onThresholdChange: (tau: number) => void;
  onTopKChange: (k: number) => void;
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
  includeNodeTypes,
  onCaseChange,
  onModelChange,
  onThresholdChange,
  onTopKChange,
  onToggleNodeType,
  onRunPredict,
}: InferenceSidebarProps) {
  return (
    <aside className="bg-white rounded-lg border p-4 space-y-4">
      <h2 className="font-semibold text-slate-900">Bộ điều khiển Suy luận DSS</h2>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Chọn Vụ án</label>
        <select
          value={selectedCaseId}
          onChange={(e) => onCaseChange(e.target.value)}
          className="w-full border rounded px-2 py-1.5 text-sm"
        >
          {cases.map((c) => (
            <option key={c.case_id} value={c.case_id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Chọn Mô hình GNN</label>
        <select
          value={selectedModelId}
          onChange={(e) => {
            const m = models.find((x) => x.model_id === e.target.value);
            onModelChange(e.target.value, m?.default_threshold ?? 0.5);
          }}
          className="w-full border rounded px-2 py-1.5 text-sm"
        >
          {models.map((m) => (
            <option key={m.model_id} value={m.model_id}>
              {m.display_name} (τ={m.default_threshold.toFixed(4)})
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
          <span>Ngưỡng rủi ro (Threshold)</span>
          <span className="font-mono">{threshold.toFixed(4)}</span>
        </div>
        <input
          type="range"
          min={0.05}
          max={0.95}
          step={0.01}
          value={threshold}
          onChange={(e) => onThresholdChange(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Top-K cặp nghi vấn</label>
        <input
          type="number"
          min={1}
          max={200}
          value={topK}
          onChange={(e) => onTopKChange(parseInt(e.target.value || "20", 10))}
          className="w-full border rounded px-2 py-1 text-sm"
        />
      </div>

      <div>
        <span className="block text-xs font-medium text-slate-600 mb-1">Lớp thực thể hiển thị</span>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          {(Object.keys(NODE_VISUAL_STYLES) as NodeType[]).map((nt) => (
            <label key={nt} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeNodeTypes.includes(nt)}
                onChange={() => onToggleNodeType(nt)}
              />
              <span>{NODE_VISUAL_STYLES[nt].labelVi}</span>
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={onRunPredict}
        className="w-full py-2 rounded bg-blue-600 text-white font-medium text-sm hover:bg-blue-700"
      >
        Chạy Suy Luận GNN
      </button>
    </aside>
  );
}
