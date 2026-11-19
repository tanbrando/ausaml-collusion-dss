"use client";

/**
 * MÀN HÌNH 3 (M4 - Việt): Model Benchmark & Ablation Arena (/benchmark)
 * TODO (Việt - M4):
 * 1. Vẽ biểu đồ cột nhóm Recharts so sánh ROC-AUC, AP, F1, Hits@10 của 6 models.
 * 2. Hiển thị bảng Scenario 1 (AML-AML) vs Scenario 4 (Shared IP/Device).
 * 3. Hiển thị bảng Hard Negative Showcase (Type 1 & Type 4) từ data.hard_negative_showcase.
 */

import { useEffect, useState } from "react";
import { fetchBenchmarks } from "@/lib/api";
import type { BenchmarkSummaryResponse } from "@/types/contract";

export default function BenchmarkPage() {
  const [data, setData] = useState<BenchmarkSummaryResponse | null>(null);

  useEffect(() => {
    fetchBenchmarks().then(setData).catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">
          Model Benchmark & Hard Negative Arena
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Đối chiếu 3 Seeds Mean ± Std giữa CK Baseline (GCN, GAT) và Hybrid GATv2+GINE.
        </p>
      </header>

      <div className="bg-white rounded-lg border p-4 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="border-b text-slate-600">
            <tr>
              <th className="py-2">Mô hình</th>
              <th>Params</th>
              <th>τ_val</th>
              <th>ROC-AUC</th>
              <th>AP (PR-AUC)</th>
              <th>F1</th>
              <th>Hits@10</th>
            </tr>
          </thead>
          <tbody>
            {data?.models.map((m) => (
              <tr key={m.model_id} className="border-b last:border-0">
                <td className="py-2 font-medium">{m.display_name}</td>
                <td>{m.params.toLocaleString()}</td>
                <td>{m.default_threshold.toFixed(4)}</td>
                <td>{m.metrics_overall.roc_auc}</td>
                <td>{m.metrics_overall.ap}</td>
                <td>{m.metrics_overall.f1}</td>
                <td>{m.metrics_overall.hits_at_10}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
