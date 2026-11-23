"use client";

/**
 * Dock bảng xếp hạng cặp nghi vấn dưới đồ thị (/workspace):
 * - 3 chế độ: thu gọn (1 thanh), chia đôi với đồ thị, mở rộng toàn khung.
 * - Mức rủi ro đồng bộ realtime theo ngưỡng τ; lọc theo mức rủi ro.
 * - Bàn phím: ↑/↓ hoặc J/K để chuyển cặp, Enter để chọn.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronUp, Maximize2, Minimize2, ShieldCheck, ListX, Zap } from "lucide-react";
import { computeRiskLevel, type PredictedLinkItem, type RiskLevel } from "@/types/contract";
import { RISK_DOT, RiskBadge, StatusBadge, Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/Button";
import { FilterChip } from "@/components/ui/Tabs";
import { EmptyState, Kbd } from "@/components/ui/Card";
import { Table, TableContainer, THead, Th, Td, Tr } from "@/components/ui/Table";
import { RISK_LABEL } from "@/lib/i18n/labels";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/cn";

export type TableDockMode = "collapsed" | "split" | "expanded";

interface RankingTableProps {
  predictions: PredictedLinkItem[];
  threshold: number;
  selectedPairId: string | null;
  dockMode: TableDockMode;
  onDockModeChange: (mode: TableDockMode) => void;
  onSelectPair: (item: PredictedLinkItem) => void;
}

type RiskFilter = "ALL" | RiskLevel;

/** Thanh điểm nhỏ thể hiện xác suất 0–100%. */
function ScoreBar({ score, level }: { score: number; level: RiskLevel }) {
  return (
    <span className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-subtle 2xl:inline-block" aria-hidden>
      <span className={cn("block h-full rounded-full", RISK_DOT[level])} style={{ width: `${Math.round(score * 100)}%` }} />
    </span>
  );
}

export function RankingTable({
  predictions,
  threshold,
  selectedPairId,
  dockMode,
  onDockModeChange,
  onSelectPair,
}: RankingTableProps) {
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("ALL");
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  const ranked = useMemo(
    () =>
      [...predictions]
        .sort((a, b) => b.score - a.score)
        .map((p, i) => ({ ...p, rank: i + 1, dynamicRisk: computeRiskLevel(p.score, threshold) })),
    [predictions, threshold]
  );

  const counts = useMemo(() => {
    const c: Record<RiskFilter, number> = { ALL: ranked.length, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const p of ranked) c[p.dynamicRisk] += 1;
    return c;
  }, [ranked]);

  const filtered = useMemo(
    () => (riskFilter === "ALL" ? ranked : ranked.filter((p) => p.dynamicRisk === riskFilter)),
    [ranked, riskFilter]
  );

  const selected = ranked.find((p) => p.pair_id === selectedPairId);

  useEffect(() => {
    if (!selectedPairId) return;
    rowRefs.current.get(selectedPairId)?.scrollIntoView({ block: "nearest" });
  }, [selectedPairId, dockMode]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const down = e.key === "ArrowDown" || e.key === "j";
    const up = e.key === "ArrowUp" || e.key === "k";
    if (!down && !up) return;
    if ((e.target as HTMLElement).closest("input, textarea, select")) return;
    e.preventDefault();
    if (filtered.length === 0) return;
    const idx = filtered.findIndex((p) => p.pair_id === selectedPairId);
    const nextIdx = idx < 0 ? 0 : Math.min(filtered.length - 1, Math.max(0, idx + (down ? 1 : -1)));
    const next = filtered[nextIdx];
    onSelectPair(next);
    rowRefs.current.get(next.pair_id)?.focus();
  };

  if (dockMode === "collapsed") {
    return (
      <section className="flex h-11 shrink-0 items-center justify-between gap-3 rounded-lg border border-line bg-surface pl-4 pr-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => onDockModeChange("split")}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label="Mở bảng xếp hạng"
        >
          <span className="whitespace-nowrap text-base font-semibold text-fg">Cặp nghi vấn</span>
          <span className="num hidden items-center gap-3 text-sm text-muted sm:flex">
            <span className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", RISK_DOT.HIGH)} aria-hidden />
              {RISK_LABEL.HIGH} {counts.HIGH}
            </span>
            <span className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", RISK_DOT.MEDIUM)} aria-hidden />
              {RISK_LABEL.MEDIUM} {counts.MEDIUM}
            </span>
          </span>
          {selected && (
            <span className="num truncate font-mono text-sm text-primary-fg">
              Đang chọn: {selected.source} ↔ {selected.target} · {formatPercent(selected.score, 1)}
            </span>
          )}
        </button>
        <IconButton label="Mở bảng xếp hạng" icon={ChevronUp} size="sm" onClick={() => onDockModeChange("split")} />
      </section>
    );
  }

  return (
    <section
      aria-label="Bảng xếp hạng cặp nghi vấn"
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm",
        dockMode === "expanded" ? "min-h-0 flex-1" : "h-[260px] shrink-0"
      )}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line py-2 pl-4 pr-1.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="text-base font-semibold text-fg">
            Cặp nghi vấn <span className="num font-normal text-muted">({filtered.length}/{predictions.length})</span>
          </h2>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lọc theo mức rủi ro">
            {(["ALL", "HIGH", "MEDIUM", "LOW"] as RiskFilter[]).map((level) => (
              <FilterChip
                key={level}
                selected={riskFilter === level}
                onClick={() => setRiskFilter(level)}
                count={counts[level]}
                dotClassName={level === "ALL" ? undefined : RISK_DOT[level]}
              >
                {level === "ALL" ? "Tất cả" : RISK_LABEL[level]}
              </FilterChip>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-2 hidden items-center gap-1 text-xs text-muted 2xl:flex">
            <Kbd>J</Kbd>
            <Kbd>K</Kbd> chuyển cặp
          </span>
          <IconButton
            label={dockMode === "expanded" ? "Thu về chế độ chia đôi" : "Mở rộng bảng"}
            icon={dockMode === "expanded" ? Minimize2 : Maximize2}
            size="sm"
            onClick={() => onDockModeChange(dockMode === "expanded" ? "split" : "expanded")}
          />
          <IconButton label="Thu gọn bảng" icon={ChevronDown} size="sm" onClick={() => onDockModeChange("collapsed")} />
        </div>
      </header>

      {predictions.length === 0 ? (
        <EmptyState compact icon={ListX} title="Chưa có kết quả suy luận" description="Chạy suy luận để xếp hạng các cặp nghi vấn." />
      ) : filtered.length === 0 ? (
        <EmptyState
          compact
          icon={ListX}
          title={`Không có cặp ở mức rủi ro “${RISK_LABEL[riskFilter as RiskLevel]}”`}
          description={`Tại ngưỡng τ = ${threshold.toFixed(2)}.`}
        />
      ) : (
        <TableContainer className="min-h-0 flex-1">
          <div onKeyDown={handleKeyDown}>
            <Table>
              <THead>
                <tr>
                  <Th align="right" className="hidden w-12 2xl:table-cell">#</Th>
                  <Th className="pl-5 2xl:pl-3">Cặp khách hàng</Th>
                  <Th align="right">Xác suất</Th>
                  <Th>Rủi ro</Th>
                  <Th title="So sánh điểm dự báo giữa CK GCN thuần và Hybrid v4">GCN → Hybrid v4</Th>
                  <Th align="right">Trạng thái</Th>
                </tr>
              </THead>
              <tbody>
                {filtered.map((p) => {
                  const gcn = p.model_comparison.ck_gcn_seed42;
                  const hybrid = p.model_comparison.hybrid_v3_best;
                  const diff = hybrid - gcn;
                  return (
                    <Tr
                      key={p.pair_id}
                      ref={(el) => {
                        if (el) rowRefs.current.set(p.pair_id, el);
                        else rowRefs.current.delete(p.pair_id);
                      }}
                      selected={selectedPairId === p.pair_id}
                      muted={p.feedback_status === "DISMISSED"}
                      onSelect={() => onSelectPair(p)}
                    >
                      <Td numeric className="hidden text-muted 2xl:table-cell">{p.rank}</Td>
                      <Td className="whitespace-nowrap pl-5 font-mono 2xl:pl-3">
                        {p.source} <span className="text-faint">↔</span> {p.target}
                      </Td>
                      <Td numeric>
                        <span className="inline-flex items-center gap-2">
                          <ScoreBar score={p.score} level={p.dynamicRisk} />
                          <span className="w-12 font-medium">{formatPercent(p.score, 1)}</span>
                        </span>
                      </Td>
                      <Td>
                        <RiskBadge level={p.dynamicRisk} />
                      </Td>
                      <Td className="whitespace-nowrap">
                        <span className="num inline-flex items-center gap-2 font-mono">
                          <span className="text-muted">{formatPercent(gcn, 1)}</span>
                          <span className="text-faint" aria-hidden>→</span>
                          <span className="font-medium">{formatPercent(hybrid, 1)}</span>
                          {diff >= 0.25 && (
                            <Badge
                              variant="warning"
                              className="font-sans"
                              title={`CK GCN chỉ dự báo ${formatPercent(gcn, 1)} nhưng Hybrid v4 phát hiện ${formatPercent(hybrid, 1)}`}
                            >
                              <Zap className="h-3 w-3" aria-hidden />
                              <span className="sr-only 2xl:not-sr-only">Đồng phạm ẩn</span>
                            </Badge>
                          )}
                          {diff <= -0.25 && (
                            <Badge
                              variant="success"
                              className="font-sans"
                              title={`CK GCN báo động giả ${formatPercent(gcn, 1)}, Hybrid v4 hạ xuống ${formatPercent(hybrid, 1)}`}
                            >
                              <ShieldCheck className="h-3 w-3" aria-hidden />
                              <span className="sr-only 2xl:not-sr-only">Lọc bẫy</span>
                            </Badge>
                          )}
                        </span>
                      </Td>
                      <Td align="right" className="whitespace-nowrap">
                        <span className="inline-flex justify-end">
                          <StatusBadge status={p.feedback_status} />
                        </span>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        </TableContainer>
      )}
    </section>
  );
}
