"use client";

/**
 * Màn hình 2 — Điều tra đồ thị (/workspace), bố cục 3 cột theo SRS §8.2:
 * [Bộ điều khiển] | [Đồ thị + bảng xếp hạng] | [Hồ sơ bằng chứng]
 * - ≥1280px: hai panel bên gắn cố định, ẩn/hiện được. <1280px: panel thành ngăn trượt (drawer).
 * - Tự suy luận khi mở vụ án hoặc đổi mô hình; ngưỡng τ cập nhật mức rủi ro realtime.
 */

import { Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { PanelLeftOpen, PanelRightOpen, RotateCcw, SlidersHorizontal, FileSearch } from "lucide-react";
import { explainPair, fetchCases, fetchModels, runPrediction, submitFeedback } from "@/lib/api";
import {
  computeRiskLevel,
  type CaseSummary,
  type EvidencePath,
  type ExplainPairResponse,
  type FeedbackAction,
  type ModelInfo,
  type NodeType,
  type PredictedLinkItem,
  type PredictResponse,
} from "@/types/contract";
import { ALL_NODE_TYPES, ControlPanel } from "@/components/controls/ControlPanel";
import { CytoscapeCanvas } from "@/components/graph/CytoscapeCanvas";
import { RankingTable, type TableDockMode } from "@/components/tables/RankingTable";
import { EvidencePanel } from "@/components/explain/EvidencePanel";
import { Alert } from "@/components/ui/Alert";
import { Badge, RISK_DOT } from "@/components/ui/Badge";
import { Button, IconButton } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { RISK_LABEL, shortModelLabel } from "@/lib/i18n/labels";
import { cn } from "@/lib/cn";

const DEFAULT_TOP_K = 20;
const DEFAULT_HOP = 2;

/**
 * Panel bên dựa trên CSS (không dò media query bằng JS → không lệch hydration):
 * - ≥1280px (xl): bản gắn cố định, ẩn/hiện bằng `dockedOpen`.
 * - <1280px: bản drawer có nền mờ, chỉ hiện khi `drawerOpen`.
 */
function SidePanel({
  side,
  dockedOpen,
  drawerOpen,
  onCloseDrawer,
  widthClass,
  label,
  children,
}: {
  side: "left" | "right";
  dockedOpen: boolean;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
  widthClass: string;
  label: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, onCloseDrawer]);

  return (
    <>
      {dockedOpen && (
        <aside
          aria-label={label}
          className={cn(
            "hidden h-full min-h-0 shrink-0 xl:block",
            widthClass,
            side === "left" ? "border-r border-line" : "border-l border-line"
          )}
        >
          {children}
        </aside>
      )}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 xl:hidden" role="dialog" aria-modal="true" aria-label={label}>
          <div className="absolute inset-0 animate-fade-in bg-fg/30" onClick={onCloseDrawer} aria-hidden />
          <aside
            className={cn(
              "absolute inset-y-0 flex max-w-[92vw] animate-slide-up flex-col shadow-lg",
              widthClass,
              side === "left" ? "left-0" : "right-0"
            )}
          >
            {children}
          </aside>
        </div>
      )}
    </>
  );
}

function WorkspaceContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const caseIdFromQuery = searchParams.get("case_id");
  const pairIdFromQuery = searchParams.get("pair_id");

  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState(caseIdFromQuery || "case_01_smurfing_ring");
  const [selectedModelId, setSelectedModelId] = useState("hybrid_v4_full");
  const [threshold, setThreshold] = useState(0.5682);
  const deferredThreshold = useDeferredValue(threshold);

  const [topK, setTopK] = useState(DEFAULT_TOP_K);
  const [hopDepth, setHopDepth] = useState(DEFAULT_HOP);
  const [includeNodeTypes, setIncludeNodeTypes] = useState<NodeType[]>(ALL_NODE_TYPES);
  const [lastRunScope, setLastRunScope] = useState<string | null>(null);

  // Panel gắn cố định (≥xl) và drawer (<xl) có trạng thái riêng
  const [controlsDocked, setControlsDocked] = useState(true);
  const [controlsDrawer, setControlsDrawer] = useState(false);
  const [evidenceDocked, setEvidenceDocked] = useState(true);
  const [evidenceDrawer, setEvidenceDrawer] = useState(false);
  const [tableDockMode, setTableDockMode] = useState<TableDockMode>("split");

  const [isLoadingMeta, setIsLoadingMeta] = useState(true);
  const [isPredicting, setIsPredicting] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [predResult, setPredResult] = useState<PredictResponse | null>(null);
  const [selectedPair, setSelectedPair] = useState<PredictedLinkItem | null>(null);
  const [pairDetail, setPairDetail] = useState<ExplainPairResponse | null>(null);
  const [highlightedPath, setHighlightedPath] = useState<EvidencePath | null>(null);
  const [focusPairEndpoints, setFocusPairEndpoints] = useState<{ source: string; target: string } | null>(null);

  // Chống race condition khi chuyển vụ án/mô hình nhanh
  const predictReqIdRef = useRef(0);
  const explainReqIdRef = useRef(0);
  const hasConsumedPairQueryRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"]')) {
        setHighlightedPath(null);
        setFocusPairEndpoints(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (caseIdFromQuery) setSelectedCaseId(caseIdFromQuery);
  }, [caseIdFromQuery]);

  const loadMeta = useCallback(() => {
    let active = true;
    setIsLoadingMeta(true);
    setErrorMsg(null);
    Promise.all([fetchCases(), fetchModels()])
      .then(([casesRes, modelsRes]) => {
        if (!active) return;
        setCases(casesRes.cases);
        if (casesRes.cases.length > 0) {
          const target = caseIdFromQuery ? casesRes.cases.find((c) => c.case_id === caseIdFromQuery) : null;
          if (target) setSelectedCaseId(target.case_id);
          else setSelectedCaseId((cur) => (casesRes.cases.some((c) => c.case_id === cur) ? cur : casesRes.cases[0].case_id));
        }
        setModels(modelsRes.models);
        setSelectedModelId(modelsRes.default_model_id);
        const rec = modelsRes.models.find((m) => m.model_id === modelsRes.default_model_id);
        if (rec) setThreshold(rec.default_threshold);
      })
      .catch((err) => {
        if (active) setErrorMsg(err instanceof Error ? err.message : "Không thể kết nối tới backend API.");
      })
      .finally(() => {
        if (active) setIsLoadingMeta(false);
      });
    return () => {
      active = false;
    };
  }, [caseIdFromQuery]);

  useEffect(() => loadMeta(), [loadMeta]);

  const handleSelectPair = useCallback(
    async (item: PredictedLinkItem, caseIdOverride?: string, modelIdOverride?: string, openPanel = true) => {
      const reqId = ++explainReqIdRef.current;
      setSelectedPair(item);
      setFocusPairEndpoints({ source: item.source, target: item.target });
      setHighlightedPath(item.evidence_paths[0] ?? null);
      if (openPanel) setEvidenceDocked(true);
      setIsLoadingDetail(true);
      try {
        const detail = await explainPair(caseIdOverride ?? selectedCaseId, {
          source: item.source,
          target: item.target,
          model_id: modelIdOverride ?? selectedModelId,
        });
        if (reqId === explainReqIdRef.current) setPairDetail(detail);
      } catch (err) {
        if (reqId === explainReqIdRef.current) {
          setErrorMsg(err instanceof Error ? err.message : "Không thể tải chi tiết giải thích cặp nghi vấn.");
        }
      } finally {
        if (reqId === explainReqIdRef.current) setIsLoadingDetail(false);
      }
    },
    [selectedCaseId, selectedModelId]
  );

  const handleRunPredict = useCallback(
    async (options?: { caseId?: string; modelId?: string; tau?: number; preservePairId?: string }) => {
      const targetCaseId = options?.caseId ?? selectedCaseId;
      const targetModelId = options?.modelId ?? selectedModelId;
      const targetTau = options?.tau ?? threshold;
      if (!targetCaseId) return;

      const reqId = ++predictReqIdRef.current;
      setIsPredicting(true);
      setErrorMsg(null);
      try {
        const res = await runPrediction(targetCaseId, {
          model_id: targetModelId,
          target_customer_ids: [],
          inference_mode: "subgraph",
          hop_depth: hopDepth,
          probability_threshold: targetTau,
          top_k: topK,
          include_node_types: includeNodeTypes,
        });
        if (reqId !== predictReqIdRef.current) return;

        setPredResult(res);
        setLastRunScope(`${topK}:${hopDepth}`);

        const desiredPairId =
          options?.preservePairId ??
          (!hasConsumedPairQueryRef.current && pairIdFromQuery ? pairIdFromQuery : undefined);
        if (pairIdFromQuery) hasConsumedPairQueryRef.current = true;

        const targetPair =
          (desiredPairId ? res.predictions.find((p) => p.pair_id === desiredPairId) : null) ?? res.predictions[0] ?? null;

        if (targetPair) {
          await handleSelectPair(targetPair, targetCaseId, targetModelId, false);
        } else {
          setSelectedPair(null);
          setFocusPairEndpoints(null);
          setPairDetail(null);
          setHighlightedPath(null);
        }
      } catch (err) {
        if (reqId !== predictReqIdRef.current) return;
        setErrorMsg(err instanceof Error ? err.message : "Lỗi khi chạy suy luận GNN. Kiểm tra lại backend.");
      } finally {
        if (reqId === predictReqIdRef.current) setIsPredicting(false);
      }
    },
    [selectedCaseId, selectedModelId, threshold, hopDepth, topK, includeNodeTypes, pairIdFromQuery, handleSelectPair]
  );

  // Tự động suy luận khi metadata sẵn sàng hoặc khi đổi vụ án / mô hình
  const lastAutoRunKeyRef = useRef<string>("");
  useEffect(() => {
    if (isLoadingMeta || !selectedCaseId || !selectedModelId) return;
    const key = `${selectedCaseId}::${selectedModelId}`;
    if (lastAutoRunKeyRef.current === key) return;
    lastAutoRunKeyRef.current = key;
    const modelObj = models.find((m) => m.model_id === selectedModelId);
    void handleRunPredict({
      caseId: selectedCaseId,
      modelId: selectedModelId,
      tau: modelObj?.default_threshold ?? threshold,
    });
  }, [isLoadingMeta, selectedCaseId, selectedModelId, models, threshold, handleRunPredict]);

  const handleFeedback = async (action: FeedbackAction, note: string) => {
    if (!selectedPair) return;
    const activeCaseId = predResult?.case_id ?? selectedCaseId;
    if (activeCaseId !== selectedCaseId) return;

    setErrorMsg(null);
    const pair = selectedPair;
    try {
      await submitFeedback(activeCaseId, {
        pair_id: pair.pair_id,
        source: pair.source,
        target: pair.target,
        model_id: selectedModelId,
        predicted_score: pair.score,
        action,
        note,
        reviewer_name: "Investigator_Viet",
      });
      toast({
        title: action === "CONFIRM" ? "Đã xác nhận đồng phạm" : "Đã bác bỏ cảnh báo",
        description: `${pair.source} ↔ ${pair.target} · đã lưu vào nhật ký`,
        tone: action === "CONFIRM" ? "success" : "info",
      });
      await handleRunPredict({ caseId: activeCaseId, modelId: selectedModelId, preservePairId: pair.pair_id });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Không thể lưu phản hồi điều tra viên.");
    }
  };

  const liveRiskCounts = useMemo(() => {
    let high = 0;
    let medium = 0;
    for (const p of predResult?.predictions ?? []) {
      const level = computeRiskLevel(p.score, deferredThreshold);
      if (level === "HIGH") high += 1;
      else if (level === "MEDIUM") medium += 1;
    }
    return { high, medium };
  }, [predResult, deferredThreshold]);

  const closeControlsDrawer = useCallback(() => setControlsDrawer(false), []);
  const closeEvidenceDrawer = useCallback(() => setEvidenceDrawer(false), []);

  const selectedCase = cases.find((c) => c.case_id === selectedCaseId);
  const selectedModel = models.find((m) => m.model_id === selectedModelId);
  const isDirty = lastRunScope !== null && lastRunScope !== `${topK}:${hopDepth}`;

  return (
    <div className="flex h-[calc(100dvh-56px)] min-h-[560px] md:h-[100dvh]">
      <SidePanel
        side="left"
        label="Bộ điều khiển"
        dockedOpen={controlsDocked}
        drawerOpen={controlsDrawer}
        onCloseDrawer={closeControlsDrawer}
        widthClass="w-72"
      >
        <ControlPanel
          cases={cases}
          models={models}
          selectedCaseId={selectedCaseId}
          selectedModelId={selectedModelId}
          threshold={threshold}
          topK={topK}
          hopDepth={hopDepth}
          includeNodeTypes={includeNodeTypes}
          isPredicting={isPredicting}
          isLoadingMeta={isLoadingMeta}
          isDirty={isDirty}
          executionTimeMs={predResult?.execution_time_ms ?? null}
          onClose={() => (controlsDrawer ? setControlsDrawer(false) : setControlsDocked(false))}
          onCaseChange={setSelectedCaseId}
          onModelChange={(id, defaultTau) => {
            setSelectedModelId(id);
            setThreshold(defaultTau);
          }}
          onThresholdChange={setThreshold}
          onTopKChange={setTopK}
          onHopDepthChange={setHopDepth}
          onToggleNodeType={(nt) =>
            setIncludeNodeTypes((prev) => (prev.includes(nt) ? prev.filter((x) => x !== nt) : [...prev, nt]))
          }
          onSetAllNodeTypes={() => setIncludeNodeTypes(ALL_NODE_TYPES)}
          onRunPredict={() => {
            setControlsDrawer(false);
            void handleRunPredict();
          }}
        />
      </SidePanel>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Thanh ngữ cảnh */}
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
          {!controlsDocked && (
            <span className="hidden xl:inline-flex">
              <IconButton label="Hiện bộ điều khiển" icon={PanelLeftOpen} size="sm" onClick={() => setControlsDocked(true)} />
            </span>
          )}
          <Button
            size="sm"
            variant="secondary"
            leftIcon={SlidersHorizontal}
            onClick={() => setControlsDrawer(true)}
            className="xl:hidden"
          >
            <span className="hidden sm:inline">Bộ điều khiển</span>
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h1 className="truncate text-base font-semibold text-fg" title={selectedCase?.title}>
              {selectedCase?.title ?? "Điều tra đồ thị"}
            </h1>
            {selectedModel && (
              <Badge variant="primary" className="hidden sm:inline-flex">
                {shortModelLabel(selectedModel.model_id, selectedModel.display_name)}
              </Badge>
            )}
          </div>
          <div className="num hidden items-center gap-4 text-sm text-fg-secondary md:flex" aria-live="polite">
            <span className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", RISK_DOT.HIGH)} aria-hidden />
              {RISK_LABEL.HIGH} <b className="font-semibold text-fg">{liveRiskCounts.high}</b>
            </span>
            <span className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", RISK_DOT.MEDIUM)} aria-hidden />
              {RISK_LABEL.MEDIUM} <b className="font-semibold text-fg">{liveRiskCounts.medium}</b>
            </span>
            <span className="text-muted">τ = {threshold.toFixed(2)}</span>
          </div>
          {!evidenceDocked && (
            <span className="hidden xl:inline-flex">
              <IconButton label="Hiện hồ sơ bằng chứng" icon={PanelRightOpen} size="sm" onClick={() => setEvidenceDocked(true)} />
            </span>
          )}
          <Button
            size="sm"
            variant="secondary"
            leftIcon={FileSearch}
            onClick={() => setEvidenceDrawer(true)}
            className="xl:hidden"
          >
            <span className="hidden sm:inline">Bằng chứng</span>
          </Button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
          {errorMsg && (
            <Alert
              tone="danger"
              title="Đã xảy ra lỗi"
              onClose={() => setErrorMsg(null)}
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={RotateCcw}
                  onClick={() => (cases.length === 0 ? loadMeta() : void handleRunPredict())}
                >
                  Thử lại
                </Button>
              }
              className="shrink-0"
            >
              {errorMsg}
            </Alert>
          )}

          {tableDockMode !== "expanded" && (
            <CytoscapeCanvas
              graphPayload={predResult?.graph_payload ?? null}
              threshold={deferredThreshold}
              includeNodeTypes={includeNodeTypes}
              highlightedPath={highlightedPath}
              selectedPairEndpoints={focusPairEndpoints}
              isLoading={isPredicting}
              onSelectPredictedEdge={(pairId) => {
                const found = predResult?.predictions.find((p) => p.pair_id === pairId);
                if (found) void handleSelectPair(found);
              }}
              onClearHighlight={() => {
                setHighlightedPath(null);
                setFocusPairEndpoints(null);
              }}
            />
          )}

          <RankingTable
            predictions={predResult?.predictions ?? []}
            threshold={deferredThreshold}
            selectedPairId={selectedPair?.pair_id ?? null}
            dockMode={tableDockMode}
            onDockModeChange={setTableDockMode}
            onSelectPair={(item) => void handleSelectPair(item)}
          />
        </div>
      </div>

      <SidePanel
        side="right"
        label="Hồ sơ bằng chứng"
        dockedOpen={evidenceDocked}
        drawerOpen={evidenceDrawer}
        onCloseDrawer={closeEvidenceDrawer}
        widthClass="w-[380px]"
      >
        <EvidencePanel
          selectedPair={selectedPair}
          pairDetail={pairDetail}
          threshold={deferredThreshold}
          highlightedPathId={highlightedPath?.path_id ?? null}
          isLoadingDetail={isLoadingDetail}
          onHighlightPath={(path) => {
            setHighlightedPath(path);
            if (selectedPair) setFocusPairEndpoints({ source: selectedPair.source, target: selectedPair.target });
          }}
          onSubmitFeedback={handleFeedback}
          onClose={() => (evidenceDrawer ? setEvidenceDrawer(false) : setEvidenceDocked(false))}
        />
      </SidePanel>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[100dvh] items-center justify-center text-base text-muted">Đang khởi tạo phòng điều tra…</div>
      }
    >
      <WorkspaceContent />
    </Suspense>
  );
}
