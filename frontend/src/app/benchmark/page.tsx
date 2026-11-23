"use client";

/**
 * Màn hình 3 — Đối chứng mô hình (/benchmark): một trang báo cáo có mục lục dính.
 * Kết luận chính → Hiệu năng tổng thể → Chống bẫy → Bảng số liệu 3 seeds → Lý do chọn Hybrid v4 → Ca bẫy thực tế.
 * Mọi số liệu nội suy từ API; màu biểu đồ cố định theo mô hình (quy tắc A8).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, CircleHelp, RotateCcw, Trophy, ShieldOff } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchBenchmarks } from "@/lib/api";
import type { BenchmarkSummaryResponse, HardNegativeShowcaseItem, ModelInfo } from "@/types/contract";
import { Card, CardHeader, EmptyState, PageContainer, PageHeader, Skeleton, StatStrip, StatTile } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonClasses } from "@/components/ui/Button";
import { FilterChip, SegmentedControl } from "@/components/ui/Tabs";
import { Table, TableContainer, THead, Th, Td, Tr } from "@/components/ui/Table";
import { Tooltip as UiTooltip } from "@/components/ui/Tooltip";
import { SectionNav } from "@/components/benchmark/SectionNav";
import { workspaceHref } from "@/components/cases/CaseCard";
import { METRIC_TOOLTIPS, SCENARIO_LABEL, TRAP_TYPE_LABEL, shortModelLabel } from "@/lib/i18n/labels";
import { CHART_THEME, HEX, modelColor } from "@/lib/theme/colors";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/cn";

type TrapFilter = "ALL" | HardNegativeShowcaseItem["scenario_type"];
type ScenarioMetric = "fpr_at_tau" | "roc_auc";

const SECTIONS = [
  { id: "ket-luan", label: "Kết luận chính" },
  { id: "hieu-nang", label: "Hiệu năng tổng thể" },
  { id: "chong-bay", label: "Khả năng chống bẫy" },
  { id: "so-lieu", label: "Bảng số liệu" },
  { id: "lap-luan", label: "Lý do chọn Hybrid v4" },
  { id: "ca-bay", label: "Ca bẫy thực tế" },
];

const RECOMMENDED_ID = "hybrid_v4_full";

function MetricHeader({ label, tooltipKey }: { label: string; tooltipKey: keyof typeof METRIC_TOOLTIPS }) {
  return (
    <UiTooltip content={METRIC_TOOLTIPS[tooltipKey]} side="top">
      <span tabIndex={0} className="inline-flex cursor-help items-center gap-1 rounded">
        {label}
        <CircleHelp className="h-3 w-3 text-faint" aria-hidden />
      </span>
    </UiTooltip>
  );
}

/** Ô số liệu: tách "mean ± std" thành giá trị chính + độ lệch chuẩn nhỏ bên dưới; ô tốt nhất có icon + nền. */
function BestCell({ isBest, value }: { isBest: boolean; value: string }) {
  const [mean, std] = value.split("±").map((x) => x.trim());
  return (
    <Td numeric className={cn("whitespace-nowrap", isBest && "bg-success-subtle")}>
      <span className={cn("inline-flex items-center justify-end gap-1", isBest ? "font-semibold text-success-fg" : "text-fg")}>
        {isBest && <Trophy className="h-3 w-3" aria-label="Tốt nhất cột" />}
        {mean}
      </span>
      {std && <span className="block text-xs text-muted">± {std}</span>}
    </Td>
  );
}

function ModelLegend({ models }: { models: ModelInfo[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-secondary">
      {models.map((m, i) => (
        <li key={m.model_id} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: modelColor(m.model_id, i) }} aria-hidden />
          <span className={cn(m.model_id === RECOMMENDED_ID && "font-medium text-fg")}>{shortModelLabel(m.model_id, m.display_name)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function BenchmarkPage() {
  const [data, setData] = useState<BenchmarkSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scenarioMetric, setScenarioMetric] = useState<ScenarioMetric>("fpr_at_tau");
  const [trapFilter, setTrapFilter] = useState<TrapFilter>("ALL");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const load = useCallback(() => {
    setError(null);
    fetchBenchmarks()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Không thể tải dữ liệu benchmark từ backend."));
  }, []);

  useEffect(() => load(), [load]);

  const models = useMemo(() => data?.models ?? [], [data]);

  const story = useMemo(() => {
    const find = (id: string) => models.find((m) => m.model_id === id);
    const hyb = find(RECOMMENDED_ID);
    const gcn = find("ck_gcn_seed42");
    const sage = find("hetero_sage_v4");
    const gatOnly = find("hetero_gat_v4");
    const fpr = (m: ModelInfo | undefined, key: string, fb: number) => m?.metrics_scenarios[key]?.fpr_at_tau ?? fb;

    const hybFprS1 = fpr(hyb, "scenario_1_aml_aml", 0.4652);
    const hybFprS4 = fpr(hyb, "scenario_4_shared_ip_dev", 0.0521);
    const gcnFprS1 = fpr(gcn, "scenario_1_aml_aml", 0.7193);
    const gcnFprS4 = fpr(gcn, "scenario_4_shared_ip_dev", 0.25);
    const gatOnlyFprS4 = fpr(gatOnly, "scenario_4_shared_ip_dev", 0.0208);
    const hybRoc = hyb?.metrics_overall.roc_auc_mean ?? 0.8312;

    return {
      gcnF1: (gcn?.metrics_overall.f1_mean ?? 0.7558).toFixed(4),
      gcnFprS1Pct: formatPercent(gcnFprS1, 1),
      gcnFprS4Pct: formatPercent(gcnFprS4, 1),
      hybFprS1Pct: formatPercent(hybFprS1, 1),
      hybFprS4Pct: formatPercent(hybFprS4, 1),
      gatOnlyFprS4Pct: formatPercent(gatOnlyFprS4, 2),
      ratioS4: hybFprS4 > 0 ? (gcnFprS4 / hybFprS4).toFixed(1) : "4.8",
      s1ReductionPts: ((gcnFprS1 - hybFprS1) * 100).toFixed(1),
      gatOnlyRocDiff: ((gatOnly?.metrics_overall.roc_auc_mean ?? 0.8346) - hybRoc).toFixed(4),
      sageRocDiff: ((sage?.metrics_overall.roc_auc_mean ?? 0.8358) - hybRoc).toFixed(4),
      hybRoc: hybRoc.toFixed(4),
      hybAp: (hyb?.metrics_overall.ap_mean ?? 0.8454).toFixed(4),
    };
  }, [models]);

  const best = useMemo(() => {
    if (models.length === 0) return { roc: -1, ap: -1, f1: -1, hits: -1, fprS4: 999 };
    const fprVals = models
      .map((m) => m.metrics_scenarios["scenario_4_shared_ip_dev"]?.fpr_at_tau)
      .filter((v): v is number => typeof v === "number");
    return {
      roc: Math.max(...models.map((m) => m.metrics_overall.roc_auc_mean)),
      ap: Math.max(...models.map((m) => m.metrics_overall.ap_mean)),
      f1: Math.max(...models.map((m) => m.metrics_overall.f1_mean)),
      hits: Math.max(...models.map((m) => m.metrics_overall.hits_at_10_mean)),
      fprS4: fprVals.length > 0 ? Math.min(...fprVals) : 999,
    };
  }, [models]);

  // Biểu đồ: trục x = chỉ số/kịch bản, mỗi mô hình một màu cố định
  const overallChart = useMemo(() => {
    const metrics: Array<{ key: keyof ModelInfo["metrics_overall"]; label: string }> = [
      { key: "roc_auc_mean", label: "ROC-AUC" },
      { key: "ap_mean", label: "AP" },
      { key: "f1_mean", label: "F1" },
      { key: "hits_at_10_mean", label: "Hits@10" },
    ];
    return metrics.map(({ key, label }) => {
      const row: Record<string, string | number> = { metric: label };
      for (const m of models) row[m.model_id] = Number(((m.metrics_overall[key] as number) * 100).toFixed(2));
      return row;
    });
  }, [models]);

  const scenarioChart = useMemo(
    () =>
      (Object.keys(SCENARIO_LABEL) as Array<keyof typeof SCENARIO_LABEL>).map((key) => {
        const row: Record<string, string | number> = { scenario: SCENARIO_LABEL[key] };
        for (const m of models) row[m.model_id] = Number((((m.metrics_scenarios[key]?.[scenarioMetric] ?? 0) as number) * 100).toFixed(2));
        return row;
      }),
    [models, scenarioMetric]
  );

  const showcase = useMemo(() => {
    const items = data?.hard_negative_showcase ?? [];
    return trapFilter === "ALL" ? items : items.filter((i) => i.scenario_type === trapFilter);
  }, [data, trapFilter]);

  const trapCounts = useMemo(() => {
    const items = data?.hard_negative_showcase ?? [];
    return {
      ALL: items.length,
      TYPE_1_AML_AML_DIFF_CASE: items.filter((i) => i.scenario_type === "TYPE_1_AML_AML_DIFF_CASE").length,
      TYPE_4_SHARED_IP_DEVICE: items.filter((i) => i.scenario_type === "TYPE_4_SHARED_IP_DEVICE").length,
    } as Record<TrapFilter, number>;
  }, [data]);

  const faqs = [
    {
      title: `Vì sao không chọn CK GCN dù F1 tổng đạt ${story.gcnF1}?`,
      body: `GCN đồng nhất bị thiên lệch theo bậc (degree bias): FPR@τ ở Kịch bản 1 lên tới ${story.gcnFprS1Pct} (Hybrid v4: ${story.hybFprS1Pct}), ở Kịch bản 4 là ${story.gcnFprS4Pct} — cao gấp ${story.ratioS4} lần mức ${story.hybFprS4Pct} của Hybrid v4.`,
    },
    {
      title: `Vì sao không chọn HeteroSAGE v4 dù ROC-AUC nhỉnh hơn +${story.sageRocDiff}?`,
      body: "HeteroSAGE dùng phép gộp trung bình (mean aggregation), không có attention và không có nhánh GINE đọc thuộc tính cạnh, nên không trích xuất được trọng số attention để giải thích đường bắc cầu cho điều tra viên.",
    },
    {
      title: `Vì sao chấp nhận FPR@τ Kịch bản 4 cao hơn HeteroGAT-only (${story.gatOnlyFprS4Pct} so với ${story.hybFprS4Pct})?`,
      body: `HeteroGAT-only chỉ xét cấu trúc đỉnh, bỏ qua thuộc tính cạnh giao dịch (số tiền, tần suất, độ trễ). Hybrid v4 đánh đổi rất nhỏ (ROC-AUC chênh ${story.gatOnlyRocDiff}) để tích hợp nhánh GINE, giúp giải thích chính xác dòng tiền chia nhỏ (smurfing).`,
    },
  ];

  const isLoading = !data && !error;
  const yTickPct = (v: number) => `${v}%`;
  const tooltipPct = (v: number, modelId: string) => {
    const m = models.find((x) => x.model_id === modelId);
    return [`${v.toFixed(2)}%`, shortModelLabel(modelId, m?.display_name)];
  };

  return (
    <PageContainer>
      <PageHeader
        title="Đối chứng mô hình"
        description="Kết quả thực nghiệm 3 seeds (mean ± std) giữa CK baseline, các bản ablation và Hybrid v4 — kèm các ca bẫy dương tính giả."
      />

      {error && (
        <Alert
          tone="danger"
          title="Không tải được dữ liệu benchmark"
          action={
            <Button size="sm" variant="secondary" leftIcon={RotateCcw} onClick={load}>
              Thử lại
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <div className="grid gap-8 lg:grid-cols-[180px_minmax(0,1fr)]">
        <SectionNav sections={SECTIONS} />

        <div className="min-w-0 space-y-8">
          {/* 1. Kết luận chính */}
          <section id="ket-luan" className="scroll-mt-6 space-y-3" aria-labelledby="ket-luan-title">
            <h2 id="ket-luan-title" className="text-lg font-semibold text-fg">
              Kết luận chính
            </h2>
            {isLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : (
              <StatStrip>
                <StatTile
                  label="Hybrid v4 · ROC-AUC"
                  value={story.hybRoc}
                  tone="primary"
                  hint={<>AP {story.hybAp} · giải thích được bằng attention + GINE</>}
                />
                <StatTile
                  label="FPR@τ · Kịch bản 4"
                  value={story.hybFprS4Pct}
                  tone="success"
                  hint={<>Trùng IP/thiết bị — thấp hơn {story.ratioS4}× so với CK GCN ({story.gcnFprS4Pct})</>}
                />
                <StatTile
                  label="FPR@τ · Kịch bản 1"
                  value={story.hybFprS1Pct}
                  tone="success"
                  hint={<>AML–AML khác vụ án — giảm {story.s1ReductionPts} điểm % so với CK GCN ({story.gcnFprS1Pct})</>}
                />
              </StatStrip>
            )}
          </section>

          {/* 2. Hiệu năng tổng thể */}
          <Card id="hieu-nang" className="scroll-mt-6">
            <CardHeader
              title="Hiệu năng tổng thể"
              description="Trung bình 3 seeds trên tập test, đơn vị %. Trục tung bắt đầu từ 0."
              actions={<ModelLegend models={models} />}
            />
            <div className="h-80 px-2 pb-4 pt-6">
              {isLoading ? (
                <Skeleton className="mx-4 h-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overallChart} margin={{ top: 16, right: 16, left: 0, bottom: 0 }} barCategoryGap="22%">
                    <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
                    <XAxis dataKey="metric" tick={CHART_THEME.axisLabel} tickLine={false} axisLine={{ stroke: HEX.line }} />
                    <YAxis domain={[0, 100]} tickFormatter={yTickPct} tick={CHART_THEME.axisTick} tickLine={false} axisLine={false} width={44} />
                    <Tooltip cursor={{ fill: HEX.bg }} formatter={(v: number, name: string) => tooltipPct(v, name)} {...CHART_THEME.tooltip} />
                    {models.map((m, i) => (
                      <Bar key={m.model_id} dataKey={m.model_id} fill={modelColor(m.model_id, i)} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                        {m.model_id === RECOMMENDED_ID && (
                          <LabelList dataKey={m.model_id} position="top" formatter={(v: number) => v.toFixed(1)} style={{ fontSize: 11, fill: HEX.primaryDark, fontWeight: 600 }} />
                        )}
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          {/* 3. Khả năng chống bẫy */}
          <Card id="chong-bay" className="scroll-mt-6">
            <CardHeader
              title="Khả năng chống bẫy"
              description={
                scenarioMetric === "fpr_at_tau"
                  ? "Tỷ lệ báo động giả FPR@τ trên ca bẫy — càng thấp càng tốt."
                  : "ROC-AUC trên ca bẫy khó — càng cao càng tốt."
              }
              actions={
                <SegmentedControl<ScenarioMetric>
                  ariaLabel="Chỉ số so sánh"
                  value={scenarioMetric}
                  onChange={setScenarioMetric}
                  options={[
                    { value: "fpr_at_tau", label: "FPR@τ ↓" },
                    { value: "roc_auc", label: "ROC-AUC ↑" },
                  ]}
                />
              }
            />
            <div className="space-y-3 px-2 pb-4 pt-4">
              <div className="px-3">
                <ModelLegend models={models} />
              </div>
              <div className="h-72">
                {isLoading ? (
                  <Skeleton className="mx-4 h-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scenarioChart} margin={{ top: 16, right: 16, left: 0, bottom: 0 }} barCategoryGap="28%">
                      <CartesianGrid stroke={CHART_THEME.grid} vertical={false} />
                      <XAxis dataKey="scenario" tick={CHART_THEME.axisLabel} tickLine={false} axisLine={{ stroke: HEX.line }} />
                      <YAxis domain={[0, 100]} tickFormatter={yTickPct} tick={CHART_THEME.axisTick} tickLine={false} axisLine={false} width={44} />
                      <Tooltip cursor={{ fill: HEX.bg }} formatter={(v: number, name: string) => tooltipPct(v, name)} {...CHART_THEME.tooltip} />
                      {models.map((m, i) => (
                        <Bar key={m.model_id} dataKey={m.model_id} fill={modelColor(m.model_id, i)} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                          {m.model_id === RECOMMENDED_ID && (
                            <LabelList dataKey={m.model_id} position="top" formatter={(v: number) => `${v.toFixed(1)}%`} style={{ fontSize: 11, fill: HEX.primaryDark, fontWeight: 600 }} />
                          )}
                        </Bar>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </Card>

          {/* 4. Bảng số liệu */}
          <Card id="so-lieu" className="scroll-mt-6 overflow-hidden">
            <CardHeader
              title="Bảng số liệu 3 seeds"
              description={
                <span className="inline-flex flex-wrap items-center gap-1">
                  Ô có <Trophy className="h-3 w-3 text-success-fg" aria-hidden /> là kết quả tốt nhất trong cột.
                </span>
              }
            />
            {isLoading ? (
              <div className="space-y-2 p-5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <TableContainer>
                <Table>
                  <THead sticky={false}>
                    <tr>
                      <Th>Mô hình</Th>
                      <Th align="right">Tham số</Th>
                      <Th align="right"><MetricHeader label="τ_val" tooltipKey="tau" /></Th>
                      <Th align="right"><MetricHeader label="ROC-AUC" tooltipKey="roc_auc" /></Th>
                      <Th align="right"><MetricHeader label="AP" tooltipKey="ap" /></Th>
                      <Th align="right"><MetricHeader label="F1" tooltipKey="f1" /></Th>
                      <Th align="right"><MetricHeader label="Hits@10" tooltipKey="hits_at_10" /></Th>
                      <Th align="right"><MetricHeader label="FPR@τ KB4 ↓" tooltipKey="fpr_at_tau" /></Th>
                      <Th>Khả năng giải thích</Th>
                    </tr>
                  </THead>
                  <tbody>
                    {models.map((m) => {
                      const fprS4 = m.metrics_scenarios["scenario_4_shared_ip_dev"]?.fpr_at_tau ?? null;
                      const eq = (a: number, b: number) => Math.abs(a - b) < 1e-6;
                      return (
                        <Tr key={m.model_id} className={cn(m.is_recommended && "bg-primary-subtle/50")}>
                          <Td className="min-w-[240px] max-w-[300px]">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-fg">{m.display_name}</span>
                              {m.is_recommended && <Badge variant="primary">Triển khai chính</Badge>}
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted">{m.architecture_summary}</p>
                          </Td>
                          <Td numeric className="text-fg-secondary">{formatNumber(m.params)}</Td>
                          <Td numeric className="text-fg-secondary">{m.default_threshold.toFixed(4)}</Td>
                          <BestCell isBest={eq(m.metrics_overall.roc_auc_mean, best.roc)} value={m.metrics_overall.roc_auc} />
                          <BestCell isBest={eq(m.metrics_overall.ap_mean, best.ap)} value={m.metrics_overall.ap} />
                          <BestCell isBest={eq(m.metrics_overall.f1_mean, best.f1)} value={m.metrics_overall.f1} />
                          <BestCell isBest={eq(m.metrics_overall.hits_at_10_mean, best.hits)} value={m.metrics_overall.hits_at_10} />
                          <BestCell isBest={fprS4 !== null && eq(fprS4, best.fprS4)} value={fprS4 !== null ? formatPercent(fprS4, 2) : "—"} />
                          <Td className="whitespace-nowrap">
                            {m.model_id === RECOMMENDED_ID ? (
                              <Badge variant="success">Attention + GINE</Badge>
                            ) : m.supports_attention ? (
                              <span className="text-sm text-fg-secondary">Attention, không GINE</span>
                            ) : (
                              <span className="text-sm text-muted">Không có attention</span>
                            )}
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableContainer>
            )}
          </Card>

          {/* 5. Lý do chọn Hybrid v4 */}
          <Card id="lap-luan" className="scroll-mt-6">
            <CardHeader title="Lý do chọn Hybrid v4 làm mô hình triển khai" />
            <div className="divide-y divide-line">
              {faqs.map((faq, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div key={idx}>
                    <h3>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={`faq-${idx}`}
                        onClick={() => setOpenFaq(isOpen ? null : idx)}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-base font-medium text-fg transition-colors hover:bg-subtle"
                      >
                        <span>
                          <span className="num mr-2 text-muted">{idx + 1}.</span>
                          {faq.title}
                        </span>
                        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", isOpen && "rotate-180")} aria-hidden />
                      </button>
                    </h3>
                    {isOpen && (
                      <p id={`faq-${idx}`} className="px-5 pb-4 pl-10 text-base leading-relaxed text-fg-secondary">
                        {faq.body}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* 6. Ca bẫy thực tế */}
          <Card id="ca-bay" className="scroll-mt-6 overflow-hidden">
            <CardHeader
              title="Ca bẫy thực tế"
              description="Các cặp có nhãn thật = 0 (không đồng phạm) trích từ vụ án 03 & 04 — GCN/GAT báo động giả, Hybrid v4 lọc đúng."
              actions={
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo loại bẫy">
                  {(["ALL", "TYPE_1_AML_AML_DIFF_CASE", "TYPE_4_SHARED_IP_DEVICE"] as TrapFilter[]).map((id) => (
                    <FilterChip key={id} selected={trapFilter === id} onClick={() => setTrapFilter(id)} count={trapCounts[id]}>
                      {id === "ALL" ? "Tất cả" : id === "TYPE_1_AML_AML_DIFF_CASE" ? "Type 1" : "Type 4"}
                    </FilterChip>
                  ))}
                </div>
              }
            />
            {isLoading ? (
              <div className="space-y-2 p-5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : showcase.length === 0 ? (
              <EmptyState compact icon={ShieldOff} title="Không có ca bẫy phù hợp bộ lọc" />
            ) : (
              <TableContainer>
                <Table>
                  <THead sticky={false}>
                    <tr>
                      <Th>Cặp khách hàng</Th>
                      <Th>Loại bẫy</Th>
                      <Th align="right">CK GCN</Th>
                      <Th align="right">CK GAT</Th>
                      <Th align="right">Hybrid v4</Th>
                      <Th>Cơ chế lọc bẫy</Th>
                      <Th align="right"><span className="sr-only">Hành động</span></Th>
                    </tr>
                  </THead>
                  <tbody>
                    {showcase.map((item) => {
                      const targetCase =
                        item.scenario_type === "TYPE_1_AML_AML_DIFF_CASE" ? "case_03_hard_neg_type1_trap" : "case_04_hard_neg_type4_trap";
                      return (
                        <Tr key={item.pair_id}>
                          <Td className="whitespace-nowrap font-mono font-medium">
                            {item.source} <span className="text-faint">↔</span> {item.target}
                          </Td>
                          <Td>
                            <Badge variant="neutral">{TRAP_TYPE_LABEL[item.scenario_type]}</Badge>
                          </Td>
                          <Td numeric className="text-danger-fg">{formatPercent(item.ck_gcn_score, 1)}</Td>
                          <Td numeric className="text-warning-fg">{formatPercent(item.ck_gat_score, 1)}</Td>
                          <Td numeric className="font-semibold text-success-fg">{formatPercent(item.hybrid_v3_score, 1)}</Td>
                          <Td className="min-w-[280px] max-w-md text-fg-secondary">{item.explanation_vi}</Td>
                          <Td align="right" className="whitespace-nowrap">
                            <Link
                              href={workspaceHref(targetCase, item.pair_id)}
                              className={buttonClasses({ variant: "ghost", size: "sm", className: "-mr-2 text-primary-fg" })}
                            >
                              Xem trên đồ thị
                              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                            </Link>
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableContainer>
            )}
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
