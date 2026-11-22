"use client";

/**
 * Cột Giữa Dưới (M3 - Việt): Bảng Xếp hạng Cặp Nghi vấn.
 * Tinh chỉnh theo review:
 * - Thống nhất 100% số chữ số thập phân `formatPercent(score, 1)` (ví dụ: 99.9% / 99.5%)
 *   khớp tuyệt đối với cột Xác suất và thanh Đối chứng bên phải.
 * - Gắn huy hiệu cảnh báo `⚡ Phát hiện ẩn` hoặc `🛡️ Lọc bẫy` cho các cặp mà
 *   CK GCN và Hybrid v4 chênh lệch lớn (>= 25%) — làm nổi bật đóng góp của đề tài.
 */

import { useMemo, useState } from "react";
import { Filter, ShieldCheck, Zap } from "lucide-react";
import type { PredictedLinkItem, RiskLevel } from "@/types/contract";
import { RiskBadge, StatusBadge } from "@/components/ui/Badge";
import { formatPercent } from "@/lib/format";

interface RankingTableProps {
  predictions: PredictedLinkItem[];
  selectedPairId: string | null;
  onSelectPair: (item: PredictedLinkItem) => void;
}

type RiskFilter = "ALL" | RiskLevel;

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
    <section className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-3 shrink-0 h-[230px] flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div>
          <h2 className="font-semibold text-slate-900 text-sm">
            Danh sách Xếp hạng Cặp Nghi vấn{" "}
            <span className="text-slate-600 font-normal num">
              ({filteredPredictions.length}/{predictions.length})
            </span>
          </h2>
          <p className="text-[11px] text-slate-600">
            Click vào một dòng để đồng bộ đồ thị và mở hồ sơ giải thích bên phải
          </p>
        </div>

        <div className="flex items-center gap-1 text-[11px] num">
          <Filter className="w-3.5 h-3.5 text-slate-500 mr-0.5" />
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
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {level === "ALL" ? "Tất cả" : level} ({counts[level]})
              </button>
            );
          })}
        </div>
      </div>

      {predictions.length === 0 ? (
        <div className="py-7 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
          Chưa có kết quả suy luận. Nhấn <b>Chạy Suy Luận</b> ở cột trái để xếp hạng các cặp khách hàng nghi vấn.
        </div>
      ) : filteredPredictions.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
          Không có cặp nào ở mức rủi ro <b>{riskFilter}</b>.
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto text-xs border border-slate-200/80 rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-600 sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="py-2 px-3 font-semibold">Cặp Khách hàng</th>
                <th className="py-2 px-2 font-semibold text-right">Xác suất</th>
                <th className="py-2 px-2 font-semibold text-center">Mức Rủi ro</th>
                <th
                  className="py-2 px-2 font-semibold text-center"
                  title="So sánh điểm dự báo (1 chữ số thập phân) giữa CK GCN thuần và Hybrid v4"
                >
                  CK GCN vs Hybrid v4
                </th>
                <th className="py-2 px-3 font-semibold text-right">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 num">
              {filteredPredictions.map((p) => {
                const isSelected = selectedPairId === p.pair_id;
                const gcnScore = p.model_comparison.ck_gcn_seed42;
                const hybridScore = p.model_comparison.hybrid_v3_best;
                // Đồng nhất 1 chữ số thập phân (formatPercent(..., 1))
                const gcnPct = formatPercent(gcnScore, 1);
                const hybridPct = formatPercent(hybridScore, 1);
                const diff = hybridScore - gcnScore;
                const isCovertDiscovery = diff >= 0.25;
                const isTrapFiltered = diff <= -0.25;

                return (
                  <tr
                    key={p.pair_id}
                    onClick={() => onSelectPair(p)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-blue-50/90 ring-1 ring-inset ring-blue-300"
                        : "hover:bg-slate-50"
                    } ${p.feedback_status === "DISMISSED" ? "opacity-60" : ""}`}
                  >
                    <td className="py-2 px-3 font-mono text-slate-800 whitespace-nowrap">
                      <span
                        className={
                          isSelected ? "font-semibold text-blue-900" : ""
                        }
                      >
                        {p.source}
                      </span>
                      <span className="mx-1 text-slate-400">↔</span>
                      <span
                        className={
                          isSelected ? "font-semibold text-blue-900" : ""
                        }
                      >
                        {p.target}
                      </span>
                    </td>

                    <td className="py-2 px-2 text-right font-mono font-semibold text-slate-900">
                      {formatPercent(p.score, 1)}
                    </td>

                    <td className="py-2 px-2 text-center">
                      <RiskBadge level={p.risk_level} />
                    </td>

                    <td className="py-2 px-2 text-center font-mono whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <span>
                          <span className="text-slate-600">{gcnPct}</span>
                          <span className="mx-1 text-slate-300">/</span>
                          <span
                            className={`font-semibold ${
                              isCovertDiscovery || isTrapFiltered
                                ? "text-blue-700"
                                : "text-slate-800"
                            }`}
                          >
                            {hybridPct}
                          </span>
                        </span>

                        {isCovertDiscovery && (
                          <span
                            title={`Phát hiện đồng phạm ẩn: CK GCN thuần chỉ dự báo ${gcnPct} nhưng Hybrid v4 phát hiện ${hybridPct} nhờ đường đi bắc cầu dị thể`}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300 font-sans text-[10px] font-semibold"
                          >
                            <Zap className="w-2.5 h-2.5 fill-current" />
                            Ẩn
                          </span>
                        )}

                        {isTrapFiltered && (
                          <span
                            title={`Lọc bẫy thành công: CK GCN báo động giả (${gcnPct}) nhưng Hybrid v4 hạ xuống ${hybridPct}`}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 font-sans text-[10px] font-semibold"
                          >
                            <ShieldCheck className="w-2.5 h-2.5" />
                            Lọc bẫy
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      <StatusBadge status={p.feedback_status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
