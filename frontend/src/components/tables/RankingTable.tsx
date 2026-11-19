"use client";

/**
 * Cột Giữa Dưới (M3 - Việt): Bảng Xếp hạng Cặp Nghi vấn.
 * TODO (Việt - M3): Bổ sung lọc RiskLevel, huy hiệu màu và highlight dòng đang chọn.
 */

import type { PredictedLinkItem } from "@/types/contract";

interface RankingTableProps {
  predictions: PredictedLinkItem[];
  selectedPairId: string | null;
  onSelectPair: (item: PredictedLinkItem) => void;
}

export function RankingTable({
  predictions,
  selectedPairId,
  onSelectPair,
}: RankingTableProps) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <h2 className="font-semibold text-slate-900 mb-2">
        Xếp hạng Cặp Nghi vấn ({predictions.length})
      </h2>
      <div className="max-h-56 overflow-y-auto text-xs">
        <table className="w-full text-left">
          <thead className="border-b text-slate-500">
            <tr>
              <th className="py-1.5">Cặp Khách hàng</th>
              <th>Xác suất</th>
              <th>Rủi ro</th>
              <th>GCN vs Hybrid</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {predictions.map((p) => (
              <tr
                key={p.pair_id}
                onClick={() => onSelectPair(p)}
                className={`border-b cursor-pointer hover:bg-blue-50 ${
                  selectedPairId === p.pair_id ? "bg-blue-50 font-medium" : ""
                }`}
              >
                <td className="py-1.5">
                  {p.source} ↔ {p.target}
                </td>
                <td>{(p.score * 100).toFixed(1)}%</td>
                <td>{p.risk_level}</td>
                <td>
                  {(p.model_comparison.ck_gcn_seed42 * 100).toFixed(0)}% /{" "}
                  {(p.model_comparison.hybrid_v3_best * 100).toFixed(0)}%
                </td>
                <td>{p.feedback_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
