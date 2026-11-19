"use client";

/**
 * Cột Phải Workspace (M3 - Việt): Giải thích Bằng chứng & Human-in-the-Loop.
 * TODO (Việt - M3):
 * 1. Vẽ biểu đồ Radar 6 trục từ `pairDetail?.radar_features` bằng Recharts.
 * 2. Làm đẹp 3 thanh đối chứng `CK GCN vs CK GAT vs Hybrid`.
 * 3. Gắn sự kiện click vào từng Bridge Path để gọi `onHighlightPath(path)` trên Cytoscape.
 */

import { useState } from "react";
import type {
  EvidencePath,
  ExplainPairResponse,
  FeedbackAction,
  PredictedLinkItem,
} from "@/types/contract";

interface EvidenceDrawerProps {
  selectedPair: PredictedLinkItem | null;
  pairDetail: ExplainPairResponse | null;
  onHighlightPath: (path: EvidencePath) => void;
  onSubmitFeedback: (action: FeedbackAction, note: string) => Promise<void>;
}

export function EvidenceDrawer({
  selectedPair,
  pairDetail,
  onHighlightPath,
  onSubmitFeedback,
}: EvidenceDrawerProps) {
  const [note, setNote] = useState("");

  if (!selectedPair) {
    return (
      <div className="bg-white rounded-lg border p-4 text-sm text-slate-500">
        Chọn một cặp nghi vấn trên đồ thị hoặc bảng để xem bằng chứng giải thích.
      </div>
    );
  }

  const paths = pairDetail?.evidence_paths ?? selectedPair.evidence_paths;

  return (
    <aside className="bg-white rounded-lg border p-4 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-900">
          Bằng chứng: {selectedPair.source} ↔ {selectedPair.target}
        </h2>
        <p className="text-xs text-slate-600 mt-1">{selectedPair.explanation_vi}</p>
      </div>

      <div className="p-3 rounded bg-slate-50 border text-xs space-y-1">
        <div className="font-semibold text-slate-700">Đối chứng Đa mô hình</div>
        <div>CK GCN: {(selectedPair.model_comparison.ck_gcn_seed42 * 100).toFixed(1)}%</div>
        <div>CK GAT: {(selectedPair.model_comparison.ck_gat_seed42 * 100).toFixed(1)}%</div>
        <div className="text-blue-700 font-semibold">
          Hybrid GATv2+GINE: {(selectedPair.model_comparison.hybrid_v3_best * 100).toFixed(1)}%
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-700">
          Top-3 Bridge Meta-paths (Click để Highlight)
        </div>
        {paths.map((ep) => (
          <button
            key={ep.path_id}
            onClick={() => onHighlightPath(ep)}
            className="w-full text-left p-2 rounded border hover:border-blue-400 text-xs"
          >
            <div className="font-medium text-blue-700">{ep.path_type}</div>
            <div className="text-slate-700 mt-0.5">{ep.nodes.join(" → ")}</div>
            <div className="text-slate-500 mt-0.5">{ep.description}</div>
          </button>
        ))}
      </div>

      <div className="pt-3 border-t space-y-2">
        <input
          type="text"
          placeholder="Ghi chú của điều tra viên..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full border rounded px-2 py-1.5 text-xs"
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onSubmitFeedback("CONFIRM", note)}
            className="py-1.5 rounded bg-red-600 text-white text-xs font-medium hover:bg-red-700"
          >
            ✓ Xác nhận (Confirm)
          </button>
          <button
            onClick={() => onSubmitFeedback("DISMISS", note)}
            className="py-1.5 rounded bg-slate-200 text-slate-800 text-xs font-medium hover:bg-slate-300"
          >
            ✕ Bác bỏ (Dismiss)
          </button>
        </div>
      </div>
    </aside>
  );
}
