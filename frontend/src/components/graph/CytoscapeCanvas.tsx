"use client";

/**
 * Cột Giữa Trên (M3 - Việt): Đồ thị tương tác Cytoscape.js
 * TODO (Việt - M3):
 * 1. Tích hợp `react-cytoscapejs` render `graphPayload.nodes` & `graphPayload.edges`.
 * 2. Áp dụng hình dạng & màu từ NODE_VISUAL_STYLES; cạnh OBSERVED nét liền, PREDICTED nét đứt, CONFIRMED đậm.
 * 3. Lọc ẩn cạnh PREDICTED_LINK có score < threshold hoặc feedback_status === 'DISMISSED'.
 * 4. Highlight chuỗi `highlightedPath.nodes` khi click cạnh hoặc EvidencePath.
 */

import type { CytoscapeGraphPayload, EvidencePath } from "@/types/contract";

interface CytoscapeCanvasProps {
  graphPayload: CytoscapeGraphPayload | null;
  threshold: number;
  highlightedPath: EvidencePath | null;
  onSelectPredictedEdge: (pairId: string) => void;
}

export function CytoscapeCanvas({
  graphPayload,
  threshold,
  highlightedPath,
  onSelectPredictedEdge,
}: CytoscapeCanvasProps) {
  return (
    <div className="bg-white rounded-lg border p-4 h-[420px] flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Đồ thị Dị thể & Liên kết Đồng phạm</h2>
        <span className="text-xs text-slate-500">
          {graphPayload
            ? `${graphPayload.nodes.length} đỉnh · ${graphPayload.edges.length} cạnh (τ=${threshold.toFixed(2)})`
            : "Bấm 'Chạy Suy Luận GNN' để hiển thị đồ thị"}
        </span>
      </div>

      <div className="flex-1 my-2 rounded border border-dashed bg-slate-50 flex items-center justify-center text-xs text-slate-500 text-center px-4">
        {graphPayload ? (
          <div>
            <p className="font-medium text-slate-700">
              TODO (Việt - M3): Mount CytoscapeComponent tại đây.
            </p>
            {highlightedPath && (
              <p className="mt-2 text-blue-600">
                Bridge Path đang chọn: {highlightedPath.nodes.join(" → ")}
              </p>
            )}
          </div>
        ) : (
          <span>Chưa có dữ liệu đồ thị.</span>
        )}
      </div>
    </div>
  );
}
