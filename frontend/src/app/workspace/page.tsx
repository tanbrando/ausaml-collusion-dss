"use client";

/**
 * MÀN HÌNH 2 (M3 - Việt): DSS Interactive Graph Workspace (/workspace)
 * Tinh chỉnh theo review lần 3 (f):
 * - Cố định chiều cao toàn trang theo viewport trên màn hình desktop (`lg:h-[calc(100vh-88px)] lg:overflow-hidden`)
 *   để bảng xếp hạng không đẩy trang xuống và khối Quyết định ở cột phải luôn nằm gọn trong màn hình.
 * - Truyền `selectedPairEndpoints` vào `CytoscapeCanvas` để mặc định làm nổi bật cặp đang chọn.
 */

import { Suspense, useDeferredValue, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Network,
  Sparkles,
  X,
} from "lucide-react";
import {
  explainPair,
  fetchCases,
  fetchModels,
  runPrediction,
  submitFeedback,
} from "@/lib/api";
import type {
  CaseSummary,
  EvidencePath,
  ExplainPairResponse,
  FeedbackAction,
  ModelInfo,
  NodeType,
  PredictedLinkItem,
  PredictResponse,
} from "@/types/contract";
import { InferenceSidebar } from "@/components/controls/InferenceSidebar";
import { CytoscapeCanvas } from "@/components/graph/CytoscapeCanvas";
import { RankingTable } from "@/components/tables/RankingTable";
import { EvidenceDrawer } from "@/components/explain/EvidenceDrawer";

const ALL_NODE_TYPES: NodeType[] = [
  "customer",
  "account",
  "device",
  "ip",
  "beneficiary",
  "bank",
];

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const caseIdFromQuery = searchParams.get("case_id");

  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState(
    caseIdFromQuery || "case_01_smurfing_ring"
  );
  const [selectedModelId, setSelectedModelId] = useState("hybrid_v4_full");
  const [threshold, setThreshold] = useState(0.5682);
  const deferredThreshold = useDeferredValue(threshold);

  const [topK, setTopK] = useState(20);
  const [hopDepth, setHopDepth] = useState(2);
  const [includeNodeTypes, setIncludeNodeTypes] =
    useState<NodeType[]>(ALL_NODE_TYPES);

  const [isLoadingMeta, setIsLoadingMeta] = useState(true);
  const [isPredicting, setIsPredicting] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [predResult, setPredResult] = useState<PredictResponse | null>(null);
  const [selectedPair, setSelectedPair] = useState<PredictedLinkItem | null>(
    null
  );
  const [pairDetail, setPairDetail] = useState<ExplainPairResponse | null>(
    null
  );
  const [highlightedPath, setHighlightedPath] = useState<EvidencePath | null>(
    null
  );
  const [focusPairEndpoints, setFocusPairEndpoints] = useState<{
    source: string;
    target: string;
  } | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setHighlightedPath(null);
        setFocusPairEndpoints(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const timer = window.setTimeout(() => setToastMsg(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toastMsg]);

  useEffect(() => {
    if (caseIdFromQuery) {
      setSelectedCaseId(caseIdFromQuery);
    }
  }, [caseIdFromQuery]);

  useEffect(() => {
    let active = true;
    setIsLoadingMeta(true);
    setErrorMsg(null);

    Promise.all([fetchCases(), fetchModels()])
      .then(([casesRes, modelsRes]) => {
        if (!active) return;
        setCases(casesRes.cases);
        if (casesRes.cases.length > 0) {
          const targetCase = caseIdFromQuery
            ? casesRes.cases.find((c) => c.case_id === caseIdFromQuery)
            : null;
          if (targetCase) {
            setSelectedCaseId(targetCase.case_id);
          } else if (
            !casesRes.cases.some((c) => c.case_id === selectedCaseId)
          ) {
            setSelectedCaseId(casesRes.cases[0].case_id);
          }
        }

        setModels(modelsRes.models);
        setSelectedModelId(modelsRes.default_model_id);
        const rec = modelsRes.models.find(
          (m) => m.model_id === modelsRes.default_model_id
        );
        if (rec) setThreshold(rec.default_threshold);
      })
      .catch((err) => {
        if (!active) return;
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "Không thể kết nối tới Backend API (http://localhost:8000)."
        );
      })
      .finally(() => {
        if (active) setIsLoadingMeta(false);
      });

    return () => {
      active = false;
    };
  }, [caseIdFromQuery]);

  const handleSelectPair = async (
    item: PredictedLinkItem,
    caseIdOverride?: string,
    modelIdOverride?: string
  ) => {
    setSelectedPair(item);
    setFocusPairEndpoints({ source: item.source, target: item.target });
    setHighlightedPath(item.evidence_paths[0] ?? null);
    setIsLoadingDetail(true);
    try {
      const detail = await explainPair(caseIdOverride ?? selectedCaseId, {
        source: item.source,
        target: item.target,
        model_id: modelIdOverride ?? selectedModelId,
      });
      setPairDetail(detail);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Không thể tải chi tiết giải thích cặp nghi vấn."
      );
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleRunPredict = async (preservePairId?: string) => {
    if (!selectedCaseId) return;
    setIsPredicting(true);
    setErrorMsg(null);
    try {
      const res = await runPrediction(selectedCaseId, {
        model_id: selectedModelId,
        target_customer_ids: [],
        inference_mode: "subgraph",
        hop_depth: hopDepth,
        probability_threshold: threshold,
        top_k: topK,
        include_node_types: includeNodeTypes,
      });
      setPredResult(res);

      const targetPair =
        (preservePairId
          ? res.predictions.find((p) => p.pair_id === preservePairId)
          : null) ??
        res.predictions[0] ??
        null;

      if (targetPair) {
        await handleSelectPair(targetPair, selectedCaseId, selectedModelId);
      } else {
        setSelectedPair(null);
        setFocusPairEndpoints(null);
        setPairDetail(null);
        setHighlightedPath(null);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Lỗi khi chạy suy luận GNN. Kiểm tra lại Backend Server."
      );
    } finally {
      setIsPredicting(false);
    }
  };

  const handleFeedback = async (action: FeedbackAction, note: string) => {
    if (!selectedPair) return;
    setErrorMsg(null);
    const currentPairId = selectedPair.pair_id;
    try {
      await submitFeedback(selectedCaseId, {
        pair_id: selectedPair.pair_id,
        source: selectedPair.source,
        target: selectedPair.target,
        model_id: selectedModelId,
        predicted_score: selectedPair.score,
        action,
        note,
        reviewer_name: "Investigator_Viet",
      });
      setToastMsg(
        action === "CONFIRM"
          ? `Đã xác nhận đồng phạm cặp ${selectedPair.source} ↔ ${selectedPair.target}`
          : `Đã bác bỏ cảnh báo cặp ${selectedPair.source} ↔ ${selectedPair.target}`
      );
      await handleRunPredict(currentPairId);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Không thể lưu phản hồi điều tra viên."
      );
    }
  };

  return (
    <div className="lg:h-[calc(100vh-88px)] lg:overflow-hidden flex flex-col gap-3">
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-2 text-xs flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-red-500 hover:text-red-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {toastMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-2 text-xs flex items-center justify-between gap-3 shadow-sm shrink-0">
          <div className="flex items-center gap-2 font-medium">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            className="text-emerald-600 hover:text-emerald-800"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Thanh trạng thái phiên suy luận */}
      {predResult && (
        <div className="bg-white border border-slate-200/90 rounded-xl px-4 py-1.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 shadow-sm num shrink-0">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5 font-semibold text-slate-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              {predResult.model_used.display_name}
            </span>
            <span className="flex items-center gap-1">
              <Network className="w-3.5 h-3.5 text-blue-600" />
              Subgraph: <b>{predResult.subgraph_stats.total_nodes}</b> đỉnh ·{" "}
              <b>{predResult.subgraph_stats.total_edges}</b> cạnh
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {predResult.execution_time_ms.toFixed(1)} ms
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700 font-semibold border border-red-200">
              HIGH: {predResult.subgraph_stats.high_risk_pairs}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-semibold border border-amber-200">
              MEDIUM: {predResult.subgraph_stats.medium_risk_pairs}
            </span>
          </div>
        </div>
      )}

      {/* Bố cục 3 cột khóa chiều cao theo viewport (min-h-0 flex-1) để không bị đẩy tràn trang */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-3 h-full min-h-0 flex flex-col">
          <InferenceSidebar
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
            onCaseChange={setSelectedCaseId}
            onModelChange={(id, defaultTau) => {
              setSelectedModelId(id);
              setThreshold(defaultTau);
            }}
            onThresholdChange={setThreshold}
            onTopKChange={setTopK}
            onHopDepthChange={setHopDepth}
            onToggleNodeType={(nt) =>
              setIncludeNodeTypes((prev) =>
                prev.includes(nt) ? prev.filter((x) => x !== nt) : [...prev, nt]
              )
            }
            onRunPredict={() => handleRunPredict()}
          />
        </div>

        <div className="col-span-12 lg:col-span-5 h-full min-h-0 flex flex-col gap-3">
          <CytoscapeCanvas
            graphPayload={predResult?.graph_payload ?? null}
            threshold={deferredThreshold}
            includeNodeTypes={includeNodeTypes}
            highlightedPath={highlightedPath}
            selectedPairEndpoints={focusPairEndpoints}
            onSelectPredictedEdge={(pairId) => {
              const found = predResult?.predictions.find(
                (p) => p.pair_id === pairId
              );
              if (found) handleSelectPair(found);
            }}
            onClearHighlight={() => {
              setHighlightedPath(null);
              setFocusPairEndpoints(null);
            }}
          />
          <RankingTable
            predictions={predResult?.predictions ?? []}
            selectedPairId={selectedPair?.pair_id ?? null}
            onSelectPair={(item) => handleSelectPair(item)}
          />
        </div>

        <div className="col-span-12 lg:col-span-4 h-full min-h-0 flex flex-col">
          <EvidenceDrawer
            selectedPair={selectedPair}
            pairDetail={pairDetail}
            highlightedPathId={highlightedPath?.path_id ?? null}
            isLoadingDetail={isLoadingDetail}
            onHighlightPath={(path) => {
              setHighlightedPath(path);
              if (selectedPair) {
                setFocusPairEndpoints({
                  source: selectedPair.source,
                  target: selectedPair.target,
                });
              }
            }}
            onSubmitFeedback={handleFeedback}
          />
        </div>
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-slate-500">
          Đang khởi tạo Phòng Điều Tra...
        </div>
      }
    >
      <WorkspaceContent />
    </Suspense>
  );
}
