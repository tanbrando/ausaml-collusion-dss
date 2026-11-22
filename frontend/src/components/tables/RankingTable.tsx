"use client";

/**
 * Cột Giữa Dưới (M3 - Việt): Bảng Xếp hạng Cặp Nghi vấn.
 * - Sắp xếp predictions theo score giảm dần
 * - Lọc nhanh theo RiskLevel (ALL / HIGH / MEDIUM / LOW)
 * - Hiển thị badge rủi ro, so sánh nhanh CK GCN vs Hybrid v4, trạng thái feedback
 * - Click dòng để chọn cặp (mở EvidenceDrawer & highlight trên CytoscapeCanvas)
 */

import { useMemo, useState } from "react";
import { CheckCircle2, Clock, Filter, XCircle } from "lucide-react";
import type {
  FeedbackStatus,
  PredictedLinkItem,
  RiskLevel,
} from "@/types/contract";

interface RankingTableProps {
  predictions: PredictedLinkItem[];
  selectedPairId: string | null;
  onSelectPair: (item: PredictedLinkItem) => void;
}

type RiskFilter = "ALL" | RiskLevel;

const RISK_BADGE_STYLES: Record<RiskLevel, string> = {
  HIGH: "bg-red-100 text-red-700 border-red-200",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-200",
  LOW: "bg-slate-100 text-slate-600 border-slate-200",
};

function FeedbackBadge({ status }: { status: FeedbackStatus }) {
  if (status === "CONFIRMED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-700 border border-red-200">
        <CheckCircle2 className="w-3 h-3" />
        CONFIRMED
      </span>
    );
  }
  if (status === "DISMISSED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200 line-through">
        <XCircle className="w-3 h-3" />
        DISMISSED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
      <Clock className="w-3 h-3" />
      PENDING
    </span>
  );
}

export function RankingTable({
  predictions,
  selectedPairId,
  onSelectPair,
}: RankingTableProps) {
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("ALL");

  const sortedPredictions = useMemo(
    () => [...predictions].sort((a, b) => b.score - a.score),
    [predictions]
  );

  const counts = useMemo(() => {
    const c = { ALL: sortedPredictions.length, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const p of sortedPredictions) {
      c[p.risk_level] += 1;
    }
    return c;
  }, [sortedPredictions]);

  const filteredPredictions = useMemo(() => {
    if (riskFilter === "ALL") return sortedPredictions;
    return sortedPredictions.filter((p) => p.risk_level === riskFilter);
  }, [sortedPredictions, riskFilter]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900 text-sm">
          Xếp hạng Cặp Nghi vấn{" "}
          <span className="text-slate-500 font-normal">
            ({filteredPredictions.length}/{predictions.length})
          </span>
        </h2>

        <div className="flex items-center gap-1 text-[11px]">
          <Filter className="w-3.5 h-3.5 text-slate-400 mr-0.5" />
          {(["ALL", "HIGH", "MEDIUM", "LOW"] as RiskFilter[]).map((level) => {
            const active = riskFilter === level;
            return (
              <button
                key={level}
                type="button"
                onClick={() => setRiskFilter(level)}
                className={`px-2 py-0.5 rounded-md border transition-colors ${
                  active
                    ? "bg-slate-900 text-white border-slate-900 font-medium"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {level === "ALL" ? "Tất cả" : level} ({counts[level]})
              </button>
            );
          })}
        </div>
      </div>

      {predictions.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
          Chưa có kết quả suy luận. Nhấn <b>Chạy Suy Luận</b> ở cột trái để tải danh sách cặp nghi vấn.
        </div>
      ) : filteredPredictions.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
          Không có cặp nào ở mức rủi ro <b>{riskFilter}</b>.
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto text-xs border border-slate-100 rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-500 sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="py-2 px-3 font-medium">Cặp Khách hàng</th>
                <th className="py-2 px-2 font-medium text-right">Xác suất</th>
                <th className="py-2 px-2 font-medium text-center">Mức Rủi ro</th>
                <th className="py-2 px-2 font-medium text-center">
                  CK GCN vs Hybrid v4
                </th>
                <th className="py-2 px-3 font-medium text-right">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPredictions.map((p) => {
                const isSelected = selectedPairId === p.pair_id;
                const gcnPct = (p.model_comparison.ck_gcn_seed42 * 100).toFixed(
                  0
                );
                const hybridPct = (
                  p.model_comparison.hybrid_v3_best * 100
                ).toFixed(0);
                const hasGap =
                  Math.abs(
                    p.model_comparison.ck_gcn_seed42 -
                      p.model_comparison.hybrid_v3_best
                  ) >= 0.25;

                return (
                  <tr
                    key={p.pair_id}
                    onClick={() => onSelectPair(p)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-blue-50/90 ring-1 ring-inset ring-blue-300"
                        : "hover:bg-slate-50"
                    } ${p.feedback_status === "DISMISSED" ? "opacity-65" : ""}`}
                  >
                    <td className="py-2 px-3 font-mono text-slate-800 whitespace-nowrap">
                      <span className={isSelected ? "font-semibold text-blue-900" : ""}>
                        {p.source}
                      </span>
                      <span className="mx-1 text-slate-400">↔</span>
                      <span className={isSelected ? "font-semibold text-blue-900" : ""}>
                        {p.target}
                      </span>
                    </td>

                    <td className="py-2 px-2 text-right font-mono font-semibold text-slate-900">
                      {(p.score * 100).toFixed(1)}%
                    </td>

                    <td className="py-2 px-2 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                          RISK_BADGE_STYLES[p.risk_level]
                        }`}
                      >
                        {p.risk_level}
                      </span>
                    </td>

                    <td className="py-2 px-2 text-center font-mono whitespace-nowrap">
                      <span className="text-slate-500">{gcnPct}%</span>
                      <span className="mx-1 text-slate-300">/</span>
                      <span
                        className={`font-semibold ${
                          hasGap ? "text-blue-700" : "text-slate-800"
                        }`}
                      >
                        {hybridPct}%
                      </span>
                    </td>

                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      <FeedbackBadge status={p.feedback_status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
