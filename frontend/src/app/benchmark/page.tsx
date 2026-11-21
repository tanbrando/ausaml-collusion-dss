"use client";

/**
 * MÀN HÌNH 3 (M4 - Việt): Model Benchmark & Ablation Arena (/benchmark)
 * - Gọi fetchBenchmarks()
 * - Biểu đồ cột nhóm Recharts đối chiếu ROC-AUC, AP, F1, Hits@10 của các mô hình chuẩn
 * - Biểu đồ Scenario 1 (AML-AML) vs Scenario 4 (Shared IP/Device) theo ROC-AUC hoặc FPR@τ
 * - Bảng Hard Negative Showcase (Type 1 & Type 4) chứng minh Hybrid v4 lọc đúng ca bẫy
 */

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Award, BarChart3, ShieldAlert } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchBenchmarks } from "@/lib/api";
import type { BenchmarkSummaryResponse } from "@/types/contract";

function shortModelLabel(modelId: string, displayName: string): string {
  const map: Record<string, string> = {
    hybrid_v4_full: "Hybrid v4",
    hetero_gat_v4: "HeteroGAT v4",
    hetero_sage_v4: "HeteroSAGE v4",
    ck_gcn_seed42: "CK GCN",
    ck_gat_seed42: "CK GAT",
  };
  return map[modelId] ?? displayName.slice(0, 18);
}

export default function BenchmarkPage() {
  const [data, setData] = useState<BenchmarkSummaryResponse | null>(null);
  const [scenarioMetric, setScenarioMetric] = useState<"roc_auc" | "fpr_at_tau">(
    "roc_auc"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBenchmarks()
      .then(setData)
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : "Không thể tải dữ liệu Benchmark từ Backend."
        )
      );
  }, []);

  const overallChartData = useMemo(() => {
    if (!data) return [];
    return data.models.map((m) => ({
      name: shortModelLabel(m.model_id, m.display_name),
      "ROC-AUC": Number((m.metrics_overall.roc_auc_mean * 100).toFixed(2)),
      AP: Number((m.metrics_overall.ap_mean * 100).toFixed(2)),
      F1: Number((m.metrics_overall.f1_mean * 100).toFixed(2)),
      "Hits@10": Number((m.metrics_overall.hits_at_10_mean * 100).toFixed(2)),
    }));
  }, [data]);

  const scenarioChartData = useMemo(() => {
    if (!data) return [];
    return data.models.map((m) => {
      const s1 = m.metrics_scenarios["scenario_1_aml_aml"];
      const s4 = m.metrics_scenarios["scenario_4_shared_ip_dev"];
      const v1 = s1?.[scenarioMetric] ?? 0;
      const v4 = s4?.[scenarioMetric] ?? 0;
      return {
        name: shortModelLabel(m.model_id, m.display_name),
        "Scenario 1 (AML-AML)": Number((v1 * 100).toFixed(2)),
        "Scenario 4 (Shared IP/Dev)": Number((v4 * 100).toFixed(2)),
      };
    });
  }, [data, scenarioMetric]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">
          Model Benchmark & Hard Negative Arena
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Đối chiếu 3 Seeds (Mean ± Std) giữa CK Baseline (GCN, GAT), Ablation (HeteroGAT, HeteroSAGE) và Hybrid Tri-Modal GATv2+GINE+SAGE v4.
        </p>
      </header>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 1. Hai Biểu đồ Recharts */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Biểu đồ Overall Metrics */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              <h2 className="font-semibold text-slate-900 text-sm">
                So sánh Chỉ số Tổng thể ({data?.models.length ?? 0} Mô hình, %)
              </h2>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={overallChartData}
                margin={{ top: 10, right: 12, left: -12, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#475569" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip
                  formatter={(v: number) => [`${v.toFixed(2)}%`, ""]}
                  contentStyle={{ fontSize: "12px", borderRadius: "8px" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="ROC-AUC" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="AP" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="F1" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Hits@10" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Biểu đồ Scenario 1 vs Scenario 4 */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900 text-sm">
              Scenario 1 (AML-AML) vs Scenario 4 (Shared IP/Dev)
            </h2>
            <div className="flex items-center gap-1 text-[11px]">
              <button
                type="button"
                onClick={() => setScenarioMetric("roc_auc")}
                className={`px-2 py-0.5 rounded-md border ${
                  scenarioMetric === "roc_auc"
                    ? "bg-slate-900 text-white border-slate-900 font-medium"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                ROC-AUC (Cao hơn tốt)
              </button>
              <button
                type="button"
                onClick={() => setScenarioMetric("fpr_at_tau")}
                className={`px-2 py-0.5 rounded-md border ${
                  scenarioMetric === "fpr_at_tau"
                    ? "bg-slate-900 text-white border-slate-900 font-medium"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                FPR@τ (Thấp hơn tốt)
              </button>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={scenarioChartData}
                margin={{ top: 10, right: 12, left: -12, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#475569" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip
                  formatter={(v: number) => [`${v.toFixed(2)}%`, ""]}
                  contentStyle={{ fontSize: "12px", borderRadius: "8px" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar
                  dataKey="Scenario 1 (AML-AML)"
                  fill={scenarioMetric === "roc_auc" ? "#ef4444" : "#f97316"}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="Scenario 4 (Shared IP/Dev)"
                  fill={scenarioMetric === "roc_auc" ? "#0ea5e9" : "#6366f1"}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* 2. Bảng tổng hợp 3 Seeds Mean ± Std */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Award className="w-4 h-4 text-emerald-600" />
          <h2 className="font-semibold text-slate-900 text-sm">
            Bảng Tổng hợp Chỉ số Benchmark (3 Seeds Mean ± Std)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 font-medium">Mô hình</th>
                <th className="py-2.5 px-3 font-medium text-right">Params</th>
                <th className="py-2.5 px-3 font-medium text-right">τ_val</th>
                <th className="py-2.5 px-3 font-medium text-right">ROC-AUC</th>
                <th className="py-2.5 px-3 font-medium text-right">AP (PR-AUC)</th>
                <th className="py-2.5 px-3 font-medium text-right">F1</th>
                <th className="py-2.5 px-4 font-medium text-right">Hits@10</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.models.map((m) => (
                <tr
                  key={m.model_id}
                  className={
                    m.is_recommended
                      ? "bg-blue-50/60 font-medium"
                      : "hover:bg-slate-50"
                  }
                >
                  <td className="py-2.5 px-4 text-slate-900">
                    <div className="flex items-center gap-2">
                      <span>{m.display_name}</span>
                      {m.is_recommended && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                          Mặc định
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                    {m.params.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                    {m.default_threshold.toFixed(4)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-900">
                    {m.metrics_overall.roc_auc}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-900">
                    {m.metrics_overall.ap}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-900">
                    {m.metrics_overall.f1}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-slate-900">
                    {m.metrics_overall.hits_at_10}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Bảng Hard Negative Showcase (Type 1 & Type 4) */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <h2 className="font-semibold text-slate-900 text-sm">
              Hard Negative Showcase — Đối chứng Ca Bẫy (Type 1 & Type 4)
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Chứng minh GCN thuần báo nhầm nhưng Hybrid v4 lọc chính xác
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 font-medium">Cặp Khách hàng</th>
                <th className="py-2.5 px-3 font-medium">Kịch bản Bẫy</th>
                <th className="py-2.5 px-3 font-medium text-center">Nhãn thật</th>
                <th className="py-2.5 px-3 font-medium text-right">CK GCN</th>
                <th className="py-2.5 px-3 font-medium text-right">CK GAT</th>
                <th className="py-2.5 px-3 font-medium text-right">Hybrid v4</th>
                <th className="py-2.5 px-4 font-medium">Phân tích</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.hard_negative_showcase.map((item) => (
                <tr key={item.pair_id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                    {item.source} ↔ {item.target}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        item.scenario_type === "TYPE_1_AML_AML_DIFF_CASE"
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : "bg-purple-50 text-purple-800 border-purple-200"
                      }`}
                    >
                      {item.scenario_type === "TYPE_1_AML_AML_DIFF_CASE"
                        ? "Type 1: AML–AML khác vụ án"
                        : "Type 4: Trùng IP/Thiết bị"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                      {item.ground_truth_label === 0
                        ? "0 (Không đồng phạm)"
                        : "1 (Đồng phạm)"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-red-600 font-semibold">
                    {(item.ck_gcn_score * 100).toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-amber-700">
                    {(item.ck_gat_score * 100).toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-bold">
                    {(item.hybrid_v3_score * 100).toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-4 text-slate-600 max-w-md leading-relaxed">
                    {item.explanation_vi}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
