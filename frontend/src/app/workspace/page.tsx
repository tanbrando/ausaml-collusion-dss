"use client";

/**
 * MÀN HÌNH 2 (M3 - Việt): DSS Interactive Graph Workspace (/workspace)
 * Bố cục 3 cột chuẩn SRS Mục 8:
 * - Cột trái (25%): InferenceSidebar
 * - Cột giữa (45%): CytoscapeCanvas (trên) + RankingTable (dưới)
 * - Cột phải (30%): EvidenceDrawer (Giải thích Bridge Paths, Radar & Human-in-the-Loop)
 */

import { useEffect, useState } from "react";
import { explainPair, fetchCases, fetchModels, runPrediction, submitFeedback } from "@/lib/api";
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

export default function WorkspacePage() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState("case_01_smurfing_ring");
  const [selectedModelId, setSelectedModelId] = useState("hybrid_v3_best");
  const [threshold, setThreshold] = useState(0.5);
  const [topK, setTopK] = useState(20);
  const [includeNodeTypes, setIncludeNodeTypes] = useState<NodeType[]>([
    "customer",
    "account",
    "device",
    "ip",
    "beneficiary",
    "bank",
  ]);
  const [predResult, setPredResult] = useState<PredictResponse | null>(null);
  const [selectedPair, setSelectedPair] = useState<PredictedLinkItem | null>(null);
  const [pairDetail, setPairDetail] = useState<ExplainPairResponse | null>(null);
  const [highlightedPath, setHighlightedPath] = useState<EvidencePath | null>(null);

  useEffect(() => {
    fetchCases().then((res) => setCases(res.cases)).catch(console.error);
    fetchModels()
      .then((res) => {
        setModels(res.models);
        setSelectedModelId(res.default_model_id);
        const rec = res.models.find((m) => m.model_id === res.default_model_id);
        if (rec) setThreshold(rec.default_threshold);
      })
      .catch(console.error);
  }, []);

  const handleRunPredict = async () => {
    const res = await runPrediction(selectedCaseId, {
      model_id: selectedModelId,
      target_customer_ids: [],
      inference_mode: "subgraph",
      hop_depth: 2,
      probability_threshold: threshold,
      top_k: topK,
      include_node_types: includeNodeTypes,
    });
    setPredResult(res);
    setSelectedPair(res.predictions[0] ?? null);
    setHighlightedPath(res.predictions[0]?.evidence_paths[0] ?? null);
  };

  const handleSelectPair = async (item: PredictedLinkItem) => {
    setSelectedPair(item);
    setHighlightedPath(item.evidence_paths[0] ?? null);
    const detail = await explainPair(selectedCaseId, {
      source: item.source,
      target: item.target,
      model_id: selectedModelId,
    });
    setPairDetail(detail);
  };

  const handleFeedback = async (action: FeedbackAction, note: string) => {
    if (!selectedPair) return;
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
    await handleRunPredict();
  };

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 lg:col-span-3">
        <InferenceSidebar
          cases={cases}
          models={models}
          selectedCaseId={selectedCaseId}
          selectedModelId={selectedModelId}
          threshold={threshold}
          topK={topK}
          includeNodeTypes={includeNodeTypes}
          onCaseChange={setSelectedCaseId}
          onModelChange={(id, defaultTau) => {
            setSelectedModelId(id);
            setThreshold(defaultTau);
          }}
          onThresholdChange={setThreshold}
          onTopKChange={setTopK}
          onToggleNodeType={(nt) =>
            setIncludeNodeTypes((prev) =>
              prev.includes(nt) ? prev.filter((x) => x !== nt) : [...prev, nt]
            )
          }
          onRunPredict={handleRunPredict}
        />
      </div>

      <div className="col-span-12 lg:col-span-5 space-y-4">
        <CytoscapeCanvas
          graphPayload={predResult?.graph_payload ?? null}
          threshold={threshold}
          highlightedPath={highlightedPath}
          onSelectPredictedEdge={(pairId) => {
            const found = predResult?.predictions.find((p) => p.pair_id === pairId);
            if (found) handleSelectPair(found);
          }}
        />
        <RankingTable
          predictions={predResult?.predictions ?? []}
          selectedPairId={selectedPair?.pair_id ?? null}
          onSelectPair={handleSelectPair}
        />
      </div>

      <div className="col-span-12 lg:col-span-4">
        <EvidenceDrawer
          selectedPair={selectedPair}
          pairDetail={pairDetail}
          onHighlightPath={setHighlightedPath}
          onSubmitFeedback={handleFeedback}
        />
      </div>
    </div>
  );
}
