"use client";

/**
 * Cột Phải Workspace (M3 - Việt): Inspector Giải thích Bằng chứng & Human-in-the-Loop.
 * Tinh chỉnh theo review lần 2:
 * - Cân bằng chiều cao (`h-full flex flex-col justify-between`) khớp với cột trái và cột giữa
 *   để không bị trống phía dưới cột phải.
 * - Nội dung tab cuộn độc lập bên trong (`flex-1 overflow-y-auto`), phần Quyết định luôn neo ở đáy.
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart2,
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
} from "@/types/contract";
import { RiskBadge, StatusBadge } from "@/components/ui/Badge";
import { formatPercent } from "@/lib/format";

type InspectorTab = "overview" | "paths" | "radar";

interface EvidenceDrawerProps {
  selectedPair: PredictedLinkItem | null;
  pairDetail: ExplainPairResponse | null;
  highlightedPathId?: string | null;
  isLoadingDetail?: boolean;
  onHighlightPath: (path: EvidencePath) => void;
  onSubmitFeedback: (action: FeedbackAction, note: string) => Promise<void>;
}

function ScoreBar({
  label,
  sublabel,
  score,
  barColor,
  highlight = false,
}: {
  label: string;
  sublabel: string;
  score: number;
  barColor: string;
  highlight?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, score * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div>
          <span
            className={
              highlight
                ? "font-semibold text-blue-900"
                : "font-medium text-slate-700"
            }
          >
            {label}
          </span>
          <span className="text-[11px] text-slate-500 ml-1.5">{sublabel}</span>
        </div>
        <span
          className={`font-mono num ${
            highlight ? "font-bold text-blue-700" : "text-slate-800"
          }`}
        >
          {formatPercent(score, 1)}
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
  const [activeTab, setActiveTab] = useState<InspectorTab>("overview");
  const [note, setNote] = useState("");
  const [confirmingDismiss, setConfirmingDismiss] = useState(false);
  const [submittingAction, setSubmittingAction] =
    useState<FeedbackAction | null>(null);

  useEffect(() => {
    setConfirmingDismiss(false);
  }, [selectedPair?.pair_id]);

  if (!selectedPair) {
    return (
      <aside className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-6 h-full flex flex-col items-center justify-center text-center space-y-2">
        <ShieldCheck className="w-8 h-8 text-slate-400 mx-auto" />
        <p className="text-sm font-semibold text-slate-700">
          Inspector Bằng chứng Điều tra
        </p>
        <p className="text-xs text-slate-600 leading-relaxed max-w-xs">
          Chọn một cạnh nghi vấn (nét đứt) trên đồ thị hoặc một dòng trong bảng xếp hạng để xem đối chứng mô hình, chuỗi đường đi bắc cầu và biểu đồ Radar 6 trục.
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
  const summary = pairDetail?.pairwise_summary ?? selectedPair.pairwise_summary;
  const scoreGap = Math.abs(
    comparison.ck_gcn_seed42 - comparison.hybrid_v3_best
  );

  const handleAction = async (action: FeedbackAction) => {
    setSubmittingAction(action);
    try {
      await onSubmitFeedback(action, note.trim());
      setNote("");
      setConfirmingDismiss(false);
    } finally {
      setSubmittingAction(null);
    }
  };

  return (
    <aside className="bg-white rounded-xl border border-slate-200/90 shadow-sm h-full flex flex-col justify-between overflow-hidden">
      <div className="flex-1 min-h-0 flex flex-col">
        {/* 1. Header cố định */}
        <header className="p-4 border-b border-slate-100 bg-slate-50/60 space-y-2 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                Hồ sơ Cặp Nghi vấn
              </div>
              <h2 className="font-semibold text-slate-900 text-sm font-mono">
                {selectedPair.source} ↔ {selectedPair.target}
              </h2>
            </div>
            <RiskBadge
              level={selectedPair.risk_level}
              suffix={formatPercent(selectedPair.score, 1)}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-600">
            <span className="font-mono">ID: {selectedPair.pair_id}</span>
            <StatusBadge status={selectedPair.feedback_status} />
          </div>
        </header>

        {/* 2. Thanh chuyển Tab */}
        <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50/40 text-xs shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`py-2.5 px-2 font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              activeTab === "overview"
                ? "border-blue-600 text-blue-700 bg-white"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>Đối chứng</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("paths")}
            className={`py-2.5 px-2 font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              activeTab === "paths"
                ? "border-blue-600 text-blue-700 bg-white"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Bắc cầu ({paths.slice(0, 3).length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("radar")}
            className={`py-2.5 px-2 font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              activeTab === "radar"
                ? "border-blue-600 text-blue-700 bg-white"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <RadarIcon className="w-3.5 h-3.5" />
            <span>Radar 6 trục</span>
          </button>
        </div>

        {/* 3. Nội dung Tab (cuộn nội bộ) */}
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          {activeTab === "overview" && (
            <div className="space-y-3.5">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-800">
                    So sánh Xác suất Đa mô hình
                  </h3>
                  {scoreGap >= 0.25 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 num">
                      <AlertTriangle className="w-3 h-3" />
                      Chênh lệch {formatPercent(scoreGap, 1)}
                    </span>
                  )}
                </div>
                <ScoreBar
                  label="CK GCN"
                  sublabel="(Thuần đồng nhất)"
                  score={comparison.ck_gcn_seed42}
                  barColor="bg-slate-400"
                />
                <ScoreBar
                  label="CK GAT"
                  sublabel="(Attention đồng nhất)"
                  score={comparison.ck_gat_seed42}
                  barColor="bg-indigo-400"
                />
                <ScoreBar
                  label="Hybrid v4"
                  sublabel="(GATv2 + GINE + SAGE)"
                  score={comparison.hybrid_v3_best}
                  barColor="bg-blue-600"
                  highlight
                />
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg border border-slate-200 bg-white">
                  <div className="text-[11px] text-slate-600">Thiết bị chung</div>
                  <div className="text-sm font-bold text-slate-900 num mt-0.5">
                    {summary.shared_devices}
                  </div>
                </div>
                <div className="p-2 rounded-lg border border-slate-200 bg-white">
                  <div className="text-[11px] text-slate-600">Địa chỉ IP chung</div>
                  <div className="text-sm font-bold text-slate-900 num mt-0.5">
                    {summary.shared_ips}
                  </div>
                </div>
                <div className="p-2 rounded-lg border border-slate-200 bg-white">
                  <div className="text-[11px] text-slate-600">
                    Giao dịch trực tiếp
                  </div>
                  <div className="text-sm font-bold text-slate-900 num mt-0.5">
                    {summary.direct_tx_count}
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-slate-800 leading-relaxed space-y-1">
                <div className="font-semibold text-blue-900">
                  Nhận định Giải thích AI
                </div>
                <p>{explanationVi}</p>
              </div>
            </div>
          )}

          {activeTab === "paths" && (
            <div className="space-y-2.5">
              <p className="text-[11px] text-slate-600">
                Bấm vào một đường đi bắc cầu bên dưới để làm sáng chuỗi thực thể trung gian trên đồ thị:
              </p>
              {paths.length === 0 ? (
                <div className="text-xs text-slate-500 italic p-4 text-center border border-dashed rounded-xl">
                  Không tìm thấy đường đi bắc cầu trong phạm vi subgraph hiện tại.
                </div>
              ) : (
                paths.slice(0, 3).map((ep) => {
                  const isActive = highlightedPathId === ep.path_id;
                  return (
                    <button
                      key={ep.path_id}
                      type="button"
                      onClick={() => onHighlightPath(ep)}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all text-xs space-y-1.5 ${
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
                          <span className="font-mono num text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
                            Attention: {ep.attention_score.toFixed(3)}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
                        {ep.nodes.map((node, idx) => (
                          <span
                            key={`${ep.path_id}-${idx}`}
                            className="inline-flex items-center gap-1"
                          >
                            <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-800">
                              {node}
                            </span>
                            {idx < ep.nodes.length - 1 && (
                              <span className="text-slate-400">→</span>
                            )}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-600 leading-snug">
                        {ep.description}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {activeTab === "radar" && (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-600">
                Biểu đồ 6 nhóm đặc trưng cấu trúc & hành vi giữa hai khách hàng (chuẩn hóa 0 → 1):
              </p>
              <div className="border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                {isLoadingDetail ? (
                  <div className="h-52 flex items-center justify-center gap-2 text-xs text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang tải đặc trưng giải thích...</span>
                  </div>
                ) : radarData.length > 0 ? (
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart
                        cx="50%"
                        cy="50%"
                        outerRadius="68%"
                        data={radarData}
                      >
                        <PolarGrid stroke="#cbd5e1" />
                        <PolarAngleAxis
                          dataKey="axis"
                          tick={{
                            fontSize: 10.5,
                            fill: "#334155",
                            fontWeight: 500,
                          }}
                        />
                        <PolarRadiusAxis
                          angle={30}
                          domain={[0, 1]}
                          tick={{ fontSize: 9, fill: "#64748b" }}
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
                          formatter={(
                            value: number,
                            _name: string,
                            props: { payload?: { raw_display?: string } }
                          ) => [
                            props.payload?.raw_display ??
                              `${(value * 100).toFixed(1)}%`,
                            "Giá trị thực",
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
                  <div className="h-36 flex items-center justify-center text-xs text-slate-500">
                    Chưa có dữ liệu Radar cho cặp này.
                  </div>
                )}
              </div>

              {radarData.length > 0 && (
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  {radarData.map((pt) => (
                    <div
                      key={pt.axis}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80"
                    >
                      <span className="text-slate-700">{pt.axis}</span>
                      <span className="font-mono font-semibold text-slate-900 num">
                        {pt.raw_display}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 4. Khối Quyết định Human-in-the-Loop neo cố định ở đáy */}
      <footer className="p-4 border-t border-slate-200 bg-slate-50/70 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-800">
            Quyết định Điều tra viên (Lưu vào Nhật ký /audit)
          </h3>
        </div>
        <input
          type="text"
          placeholder="Ghi chú bằng chứng (vd: Trùng thiết bị + chia nhỏ giao dịch)..."
          value={note}
          disabled={submittingAction !== null}
          onChange={(e) => setNote(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
        />

        {confirmingDismiss ? (
          <div className="p-2.5 rounded-lg border border-amber-300 bg-amber-50 space-y-2 text-xs">
            <div className="font-medium text-amber-900">
              Xác nhận bác bỏ cặp{" "}
              <b>
                {selectedPair.source} ↔ {selectedPair.target}
              </b>
              ? Cạnh dự báo này sẽ được ẩn khỏi đồ thị.
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={submittingAction !== null}
                onClick={() => setConfirmingDismiss(false)}
                className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={submittingAction !== null}
                onClick={() => handleAction("DISMISS")}
                className="px-3 py-1.5 rounded-md bg-slate-900 text-white font-semibold hover:bg-slate-800 flex items-center gap-1"
              >
                {submittingAction === "DISMISS" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <X className="w-3.5 h-3.5" />
                )}
                <span>Đồng ý Bác bỏ</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={submittingAction !== null}
              onClick={() => handleAction("CONFIRM")}
              className="py-2 px-3 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:bg-red-300 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
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
              onClick={() => setConfirmingDismiss(true)}
              className="py-2 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 disabled:bg-slate-100 transition-colors flex items-center justify-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              <span>Bác bỏ (DISMISS)</span>
            </button>
          </div>
        )}
      </footer>
    </aside>
  );
}
