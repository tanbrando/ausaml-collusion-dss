"use client";

/**
 * MÀN HÌNH 2 (M3 - Việt + Refactored Full-Stack Integration): DSS Interactive Graph Workspace (/workspace)
 * Bố cục 3 cột chuẩn SRS Mục 8:
 * - Cột trái (~25%): InferenceSidebar
 * - Cột giữa (~45%): CytoscapeCanvas (trên) + RankingTable (dưới)
 * - Cột phải (~30%): EvidenceDrawer (Giải thích Bridge Paths, Radar & Human-in-the-Loop)
 *
 * Cải tiến tích hợp:
 * - Auto-run suy luận khi mở trang hoặc đổi Vụ án / Mô hình (chống ghi nhầm Feedback chéo vụ án).
 * - Đồng bộ realtime `threshold` slider trên cả CytoscapeCanvas, RankingTable, EvidenceDrawer & bộ đếm HIGH/MEDIUM.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock, Network, X } from "lucide-react";
import {
  explainPair,
  fetchCases,
  fetchModels,
  runPrediction,
  submitFeedback,
} from "@/lib/api";
import { computeRiskLevel } from "@/types/contract";
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
  const [topK, setTopK] = useState(20);
  const [hopDepth, setHopDepth] = useState(2);
  const [includeNodeTypes, setIncludeNodeTypes] =
    useState<NodeType[]>(ALL_NODE_TYPES);

  const [isLoadingMeta, setIsLoadingMeta] = useState(true);
  const [isPredicting, setIsPredicting] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  // Guard chống race condition khi đổi Vụ án / Mô hình nhanh liên tiếp
  const predictSeqRef = useRef(0);
  const metaReadyRef = useRef(false);

  const handleSelectPair = useCallback(
    async (
      item: PredictedLinkItem,
      caseIdOverride?: string,
      modelIdOverride?: string
    ) => {
      setSelectedPair(item);
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
    },
    [selectedCaseId, selectedModelId]
  );

  const executePredict = useCallback(
    async (opts: {
      caseId: string;
      modelId: string;
      tau: number;
      k: number;
      depth: number;
      nodeTypes: NodeType[];
      preservePairId?: string;
    }) => {
      if (!opts.caseId) return;
      const reqSeq = ++predictSeqRef.current;
      setIsPredicting(true);
      setErrorMsg(null);
      try {
        const res = await runPrediction(opts.caseId, {
          model_id: opts.modelId,
          target_customer_ids: [],
          inference_mode: "subgraph",
          hop_depth: opts.depth,
          probability_threshold: opts.tau,
          top_k: opts.k,
          include_node_types: opts.nodeTypes,
        });
        if (reqSeq !== predictSeqRef.current) return;
        setPredResult(res);

        const targetPair =
          (opts.preservePairId
            ? res.predictions.find((p) => p.pair_id === opts.preservePairId)
            : null) ??
          res.predictions[0] ??
          null;

        if (targetPair) {
          await handleSelectPair(targetPair, opts.caseId, opts.modelId);
        } else {
          setSelectedPair(null);
          setPairDetail(null);
          setHighlightedPath(null);
        }
      } catch (err) {
        if (reqSeq !== predictSeqRef.current) return;
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "Lỗi khi chạy suy luận GNN. Kiểm tra lại Backend Server."
        );
      } finally {
        if (reqSeq === predictSeqRef.current) {
          setIsPredicting(false);
        }
      }
    },
    [handleSelectPair]
  );

  useEffect(() => {
    let active = true;
    setIsLoadingMeta(true);
    setErrorMsg(null);

    Promise.all([fetchCases(), fetchModels()])
      .then(([casesRes, modelsRes]) => {
        if (!active) return;
        setCases(casesRes.cases);
        let initCaseId = caseIdFromQuery || "case_01_smurfing_ring";
        if (casesRes.cases.length > 0) {
          const matched = casesRes.cases.find((c) => c.case_id === initCaseId);
          initCaseId = matched ? matched.case_id : casesRes.cases[0].case_id;
          setSelectedCaseId(initCaseId);
        }

        setModels(modelsRes.models);
        const initModelId = modelsRes.default_model_id;
        setSelectedModelId(initModelId);
        const rec = modelsRes.models.find((m) => m.model_id === initModelId);
        const initTau = rec ? rec.default_threshold : 0.5682;
        setThreshold(initTau);
        metaReadyRef.current = true;

        // Tự động chạy suy luận ngay khi vào Phòng Điều Tra
        void executePredict({
          caseId: initCaseId,
          modelId: initModelId,
          tau: initTau,
          k: topK,
          depth: hopDepth,
          nodeTypes: includeNodeTypes,
        });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseIdFromQuery]);

  const handleCaseChange = (newCaseId: string) => {
    setSelectedCaseId(newCaseId);
    // Xóa ngay state cũ để không bao giờ ghi nhầm feedback sang vụ án mới
    setPredResult(null);
    setSelectedPair(null);
    setPairDetail(null);
    setHighlightedPath(null);
    if (metaReadyRef.current) {
      void executePredict({
        caseId: newCaseId,
        modelId: selectedModelId,
        tau: threshold,
        k: topK,
        depth: hopDepth,
        nodeTypes: includeNodeTypes,
      });
    }
  };

  const handleModelChange = (newModelId: string, defaultTau: number) => {
    setSelectedModelId(newModelId);
    setThreshold(defaultTau);
    if (metaReadyRef.current) {
      void executePredict({
        caseId: selectedCaseId,
        modelId: newModelId,
        tau: defaultTau,
        k: topK,
        depth: hopDepth,
        nodeTypes: includeNodeTypes,
      });
    }
  };

  const handleRunPredict = (preservePairId?: string) =>
    executePredict({
      caseId: selectedCaseId,
      modelId: selectedModelId,
      tau: threshold,
      k: topK,
      depth: hopDepth,
      nodeTypes: includeNodeTypes,
      preservePairId,
    });

  const handleFeedback = async (action: FeedbackAction, note: string) => {
    if (!selectedPair || !predResult) return;
    // Luôn dùng case_id và model_id thực sự của predResult hiện tại để đảm bảo toàn vẹn dữ liệu
    const activeCaseId = predResult.case_id;
    const activeModelId = predResult.model_used.model_id;
    setErrorMsg(null);
    const currentPairId = selectedPair.pair_id;
    try {
      await submitFeedback(activeCaseId, {
        pair_id: selectedPair.pair_id,
        source: selectedPair.source,
        target: selectedPair.target,
        model_id: activeModelId,
        predicted_score: selectedPair.score,
        action,
        note,
        reviewer_name: "Investigator_Viet",
      });
      await handleRunPredict(currentPairId);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Không thể lưu phản hồi điều tra viên."
      );
    }
  };

  // Đồng bộ realtime risk_level theo thanh trượt Threshold trên toàn Workspace
  const effectivePredictions = useMemo<PredictedLinkItem[]>(() => {
    if (!predResult) return [];
    return predResult.predictions.map((p) => ({
      ...p,
      risk_level: computeRiskLevel(p.score, threshold),
    }));
  }, [predResult, threshold]);

  const effectiveSelectedPair = useMemo<PredictedLinkItem | null>(() => {
    if (!selectedPair) return null;
    return {
      ...selectedPair,
      risk_level: computeRiskLevel(selectedPair.score, threshold),
    };
  }, [selectedPair, threshold]);

  const dynamicRiskCounts = useMemo(() => {
    let high = 0;
    let medium = 0;
    for (const p of effectivePredictions) {
      if (p.risk_level === "HIGH") high += 1;
      else if (p.risk_level === "MEDIUM") medium += 1;
    }
    return { high, medium };
  }, [effectivePredictions]);

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3">
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

      {predResult && (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 shadow-sm">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5 font-medium text-slate-900">
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
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium border border-red-200">
              HIGH: {dynamicRiskCounts.high}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium border border-amber-200">
              MEDIUM: {dynamicRiskCounts.medium}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4 items-start">
        <div className="col-span-12 lg:col-span-3">
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
            onCaseChange={handleCaseChange}
            onModelChange={handleModelChange}
            onThresholdChange={setThreshold}
            onTopKChange={setTopK}
            onHopDepthChange={setHopDepth}
            onToggleNodeType={(nt) =>
              setIncludeNodeTypes((prev) =>
                prev.includes(nt) ? prev.filter((x) => x !== nt) : [...prev, nt]
              )
            }
            onRunPredict={() => void handleRunPredict()}
          />
        </div>

        <div className="col-span-12 lg:col-span-5 space-y-4">
          <CytoscapeCanvas
            graphPayload={predResult?.graph_payload ?? null}
            threshold={threshold}
            includeNodeTypes={includeNodeTypes}
            highlightedPath={highlightedPath}
            onSelectPredictedEdge={(pairId) => {
              const found = effectivePredictions.find(
                (p) => p.pair_id === pairId
              );
              if (found) void handleSelectPair(found);
            }}
            onClearHighlight={() => setHighlightedPath(null)}
          />
          <RankingTable
            predictions={effectivePredictions}
            selectedPairId={effectiveSelectedPair?.pair_id ?? null}
            onSelectPair={(item) => void handleSelectPair(item)}
          />
        </div>

        <div className="col-span-12 lg:col-span-4">
          <EvidenceDrawer
            selectedPair={effectiveSelectedPair}
            pairDetail={pairDetail}
            highlightedPathId={highlightedPath?.path_id ?? null}
            isLoadingDetail={isLoadingDetail}
            onHighlightPath={setHighlightedPath}
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
