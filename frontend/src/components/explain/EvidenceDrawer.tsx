"use client";

/**
 * Cột Phải Workspace (M3 - Việt): Giải thích Bằng chứng & Human-in-the-Loop.
 * - Thẻ 1: Đối chứng Đa mô hình (CK GCN vs CK GAT vs Hybrid v4)
 * - Thẻ 2: Top-3 Đường đi Bắc cầu (evidence_paths) kèm attention_score & click highlight
 * - Thẻ 3: Radar Chart 6 trục (Recharts) + Nhận định tiếng Việt (explanation_vi)
 * - Thẻ 4: Human-in-the-Loop (CONFIRM / DISMISS + ghi chú)
 */

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  GitBranch,
  Loader2,
  Radar as RadarIcon,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type {
  EvidencePath,
  ExplainPairResponse,
  FeedbackAction,
  PredictedLinkItem,
  RiskLevel,
} from "@/types/contract";

interface EvidenceDrawerProps {
  selectedPair: PredictedLinkItem | null;
  pairDetail: ExplainPairResponse | null;
  highlightedPathId?: string | null;
  isLoadingDetail?: boolean;
  onHighlightPath: (path: EvidencePath) => void;
  onSubmitFeedback: (action: FeedbackAction, note: string) => Promise<void>;
}

const RISK_STYLES: Record<RiskLevel, string> = {
  HIGH: "bg-red-100 text-red-700 border-red-200",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-200",
  LOW: "bg-slate-100 text-slate-600 border-slate-200",
};

function ScoreBar({
  label,
  score,
  barColor,
  highlight = false,
}: {
  label: string;
  score: number;
  barColor: string;
  highlight?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, score * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span
          className={
            highlight
              ? "font-semibold text-blue-800"
              : "font-medium text-slate-600"
          }
        >
          {label}
        </span>
        <span
          className={`font-mono ${
            highlight ? "font-bold text-blue-700" : "text-slate-700"
          }`}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function EvidenceDrawer({
  selectedPair,
  pairDetail,
  highlightedPathId = null,
  isLoadingDetail = false,
  onHighlightPath,
  onSubmitFeedback,
}: EvidenceDrawerProps) {
  const [note, setNote] = useState("");
  const [submittingAction, setSubmittingAction] =
    useState<FeedbackAction | null>(null);

  if (!selectedPair) {
    return (
      <aside className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center space-y-2">
        <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto" />
        <p className="text-sm font-medium text-slate-600">
          Chưa chọn cặp nghi vấn
        </p>
        <p className="text-xs text-slate-400">
          Click vào một cạnh nét đứt trên đồ thị hoặc một dòng trong bảng xếp
          hạng để xem bằng chứng giải thích.
        </p>
      </aside>
    );
  }

  const comparison =
    pairDetail?.model_comparison ?? selectedPair.model_comparison;
  const paths = pairDetail?.evidence_paths ?? selectedPair.evidence_paths;
  const explanationVi =
    pairDetail?.explanation_vi ?? selectedPair.explanation_vi;
  const radarData = pairDetail?.radar_features ?? [];
  const scoreGap = Math.abs(
    comparison.ck_gcn_seed42 - comparison.hybrid_v3_best
  );

  const handleAction = async (action: FeedbackAction) => {
    setSubmittingAction(action);
    try {
      await onSubmitFeedback(action, note.trim());
      setNote("");
    } finally {
      setSubmittingAction(null);
    }
  };

  return (
    <aside className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
      {/* Header */}
      <div className="border-b border-slate-100 pb-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900 text-sm font-mono truncate">
            {selectedPair.source} ↔ {selectedPair.target}
          </h2>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${
              RISK_STYLES[selectedPair.risk_level]
            }`}
          >
            {selectedPair.risk_level} · {(selectedPair.score * 100).toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>Pair ID: {selectedPair.pair_id}</span>
          <span className="font-medium">
            Trạng thái:{" "}
            <b
              className={
                selectedPair.feedback_status === "CONFIRMED"
                  ? "text-red-700"
                  : selectedPair.feedback_status === "DISMISSED"
                  ? "text-slate-400"
                  : "text-blue-700"
              }
            >
              {selectedPair.feedback_status}
            </b>
          </span>
        </div>
      </div>

      {/* Thẻ 1: Đối chứng Đa mô hình */}
      <section className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-800">
            1. Đối chứng Đa mô hình
          </h3>
          {scoreGap >= 0.25 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
              <AlertTriangle className="w-3 h-3" />
              Chênh lệch lớn
            </span>
          )}
        </div>
        <ScoreBar
          label="CK GCN (Baseline)"
          score={comparison.ck_gcn_seed42}
          barColor="bg-slate-400"
        />
        <ScoreBar
          label="CK GAT (Baseline)"
          score={comparison.ck_gat_seed42}
          barColor="bg-indigo-400"
        />
        <ScoreBar
          label="Hybrid v4 (GATv2 + GINE + SAGE)"
          score={comparison.hybrid_v3_best}
          barColor="bg-blue-600"
          highlight
        />
      </section>

      {/* Thẻ 2: Top-3 Đường đi Bắc cầu */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5 text-blue-600" />
            2. Top-3 Đường đi Bắc cầu (Click để Highlight)
          </h3>
        </div>
        {paths.length === 0 ? (
          <div className="text-xs text-slate-400 italic p-2 border border-dashed rounded-lg">
            Không tìm thấy đường đi bắc cầu trong phạm vi subgraph hiện tại.
          </div>
        ) : (
          <div className="space-y-2">
            {paths.slice(0, 3).map((ep) => {
              const isActive = highlightedPathId === ep.path_id;
              return (
                <button
                  key={ep.path_id}
                  type="button"
                  onClick={() => onHighlightPath(ep)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-all text-xs space-y-1.5 ${
                    isActive
                      ? "border-blue-500 bg-blue-50/70 ring-1 ring-blue-300"
                      : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-blue-800">
                      {ep.path_type}
                    </span>
                    {ep.attention_score !== null && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">
                        attn: {ep.attention_score.toFixed(3)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
                    {ep.nodes.map((node, idx) => (
                      <span key={`${ep.path_id}-${idx}`} className="inline-flex items-center gap-1">
                        <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                          {node}
                        </span>
                        {idx < ep.nodes.length - 1 && (
                          <span className="text-slate-400">→</span>
                        )}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    {ep.description}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Thẻ 3: Radar Chart 6 trục + Nhận định tiếng Việt */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
          <RadarIcon className="w-3.5 h-3.5 text-blue-600" />
          3. Hồ sơ Đặc trưng Cặp (6 trục Radar)
        </h3>

        <div className="border border-slate-200 rounded-lg p-2 bg-slate-50/50">
          {isLoadingDetail ? (
            <div className="h-48 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang tải đặc trưng giải thích...</span>
            </div>
          ) : radarData.length > 0 ? (
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="68%" data={radarData}>
                  <PolarGrid stroke="#cbd5e1" />
                  <PolarAngleAxis
                    dataKey="axis"
                    tick={{ fontSize: 10, fill: "#475569" }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 1]}
                    tick={{ fontSize: 9, fill: "#94a3b8" }}
                    tickCount={4}
                  />
                  <Radar
                    name="Mức độ tín hiệu"
                    dataKey="value_normalized"
                    stroke="#2563eb"
                    fill="#3b82f6"
                    fillOpacity={0.32}
                    strokeWidth={2}
                  />
                  <Tooltip
                    formatter={(value: number, _name: string, props: { payload?: { raw_display?: string } }) => [
                      props.payload?.raw_display ?? `${(value * 100).toFixed(0)}%`,
                      "Giá trị",
                    ]}
                    contentStyle={{
                      fontSize: "11px",
                      borderRadius: "8px",
                      borderColor: "#cbd5e1",
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-xs text-slate-400">
              Chưa có dữ liệu Radar cho cặp này.
            </div>
          )}
        </div>

        <div className="p-2.5 rounded-lg bg-blue-50/60 border border-blue-100 text-xs text-slate-700 leading-relaxed">
          <span className="font-semibold text-blue-900">Nhận định AI: </span>
          {explanationVi}
        </div>
      </section>

      {/* Thẻ 4: Human-in-the-Loop */}
      <section className="pt-3 border-t border-slate-200 space-y-2.5">
        <h3 className="text-xs font-semibold text-slate-800">
          4. Quyết định Điều tra viên (Human-in-the-Loop)
        </h3>
        <input
          type="text"
          placeholder="Nhập ghi chú ngắn (ví dụ: Trùng thiết bị + chia nhỏ giao dịch)..."
          value={note}
          disabled={submittingAction !== null}
          onChange={(e) => setNote(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={submittingAction !== null}
            onClick={() => handleAction("CONFIRM")}
            className="py-2 px-3 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:bg-red-300 transition-colors flex items-center justify-center gap-1.5"
          >
            {submittingAction === "CONFIRM" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            <span>Xác nhận (CONFIRM)</span>
          </button>
          <button
            type="button"
            disabled={submittingAction !== null}
            onClick={() => handleAction("DISMISS")}
            className="py-2 px-3 rounded-lg bg-slate-200 text-slate-800 text-xs font-medium hover:bg-slate-300 disabled:bg-slate-100 transition-colors flex items-center justify-center gap-1.5"
          >
            {submittingAction === "DISMISS" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <X className="w-3.5 h-3.5" />
            )}
            <span>Bác bỏ (DISMISS)</span>
          </button>
        </div>
      </section>
    </aside>
  );
}
