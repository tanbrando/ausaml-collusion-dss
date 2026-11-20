"use client";

/**
 * Cột Giữa Trên (M3 - Việt): Đồ thị tương tác Cytoscape.js
 * - Render graphPayload (nodes, edges) bằng Cytoscape.js với layout `cose`
 * - Áp dụng màu & hình dạng từ NODE_VISUAL_STYLES trong contract.ts
 * - Phân biệt OBSERVED_EDGE (nét liền), PREDICTED_LINK (nét đứt Đỏ/Cam), CONFIRMED_LINK (nét liền đỏ đậm + ✓)
 * - Lọc realtime phía client theo threshold slider, feedback_status === 'DISMISSED', và includeNodeTypes
 * - Highlight Bridge Path đồng bộ 3 chiều (click cạnh trên đồ thị / bảng / EvidenceDrawer)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { type Core, type ElementDefinition, type StylesheetStyle } from "cytoscape";
import { Maximize2, RefreshCw, Sparkles, ZoomIn, ZoomOut } from "lucide-react";
import { computeRiskLevel, NODE_VISUAL_STYLES } from "@/types/contract";
import type {
  CytoscapeGraphPayload,
  EvidencePath,
  NodeType,
} from "@/types/contract";

interface CytoscapeCanvasProps {
  graphPayload: CytoscapeGraphPayload | null;
  threshold: number;
  includeNodeTypes: NodeType[];
  highlightedPath: EvidencePath | null;
  onSelectPredictedEdge: (pairId: string) => void;
  onClearHighlight?: () => void;
}

function buildCytoscapeStyles(): StylesheetStyle[] {
  const nodeTypeStyles: StylesheetStyle[] = (
    Object.keys(NODE_VISUAL_STYLES) as NodeType[]
  ).map((nt) => {
    const visual = NODE_VISUAL_STYLES[nt];
    return {
      selector: `node[node_type = "${nt}"]`,
      style: {
        shape: visual.shape as cytoscape.Css.NodeShape,
        "background-color": visual.color,
      },
    };
  });

  return [
    {
      selector: "node",
      style: {
        label: "data(label)",
        color: "#0f172a",
        "font-size": 10,
        "font-weight": 600,
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 4,
        "text-background-color": "#ffffff",
        "text-background-opacity": 0.85,
        "text-background-padding": "2px",
        "text-background-shape": "roundrectangle",
        width: 30,
        height: 30,
        "border-width": 2,
        "border-color": "#ffffff",
        "overlay-padding": 4,
        "transition-property": "opacity, border-color, border-width",
        "transition-duration": 150,
      },
    },
    ...nodeTypeStyles,
    {
      selector: "node[?is_target]",
      style: {
        width: 38,
        height: 38,
        "border-width": 3,
        "border-color": "#1e3a8a",
        "font-size": 11,
        "font-weight": 700,
      },
    },
    {
      selector: "edge",
      style: {
        "curve-style": "bezier",
        width: 1.5,
        "line-color": "#94a3b8",
        "target-arrow-color": "#94a3b8",
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.75,
        label: "data(display_label)",
        "font-size": 8,
        color: "#64748b",
        "text-rotation": "autorotate",
        "text-background-color": "#ffffff",
        "text-background-opacity": 0.8,
        "text-background-padding": "1px",
        "transition-property": "opacity, line-color, width",
        "transition-duration": 150,
      },
    },
    {
      selector: 'edge[edge_category = "OBSERVED_EDGE"]',
      style: {
        "line-style": "solid",
        "line-color": "#cbd5e1",
        "target-arrow-color": "#cbd5e1",
        width: 1.5,
      },
    },
    {
      selector: 'edge[edge_category = "PREDICTED_LINK"]',
      style: {
        "line-style": "dashed",
        "line-dash-pattern": [6, 4],
        "target-arrow-shape": "none",
        width: 2.5,
        "line-color": "#64748b",
        color: "#334155",
        "font-weight": 700,
        "font-size": 9,
      },
    },
    {
      selector: 'edge[edge_category = "PREDICTED_LINK"][dynamic_risk = "HIGH"]',
      style: {
        "line-color": "#dc2626",
        color: "#b91c1c",
        width: 3,
      },
    },
    {
      selector: 'edge[edge_category = "PREDICTED_LINK"][dynamic_risk = "MEDIUM"]',
      style: {
        "line-color": "#ea580c",
        color: "#c2410c",
        width: 2.5,
      },
    },
    {
      selector: 'edge[edge_category = "CONFIRMED_LINK"]',
      style: {
        "line-style": "solid",
        "target-arrow-shape": "none",
        "line-color": "#b91c1c",
        color: "#991b1b",
        width: 4,
        "font-weight": 700,
        "font-size": 10,
      },
    },
    {
      selector: ".hidden-el",
      style: {
        display: "none",
      },
    },
    {
      selector: ".dimmed",
      style: {
        opacity: 0.16,
      },
    },
    {
      selector: ".highlighted-node",
      style: {
        opacity: 1,
        "border-width": 4,
        "border-color": "#f59e0b",
        "z-index": 999,
      },
    },
    {
      selector: ".highlighted-edge",
      style: {
        opacity: 1,
        width: 4,
        "line-color": "#2563eb",
        "target-arrow-color": "#2563eb",
        "z-index": 998,
      },
    },
    {
      selector: 'edge[edge_category = "CONFIRMED_LINK"].highlighted-edge',
      style: {
        "line-color": "#991b1b",
        width: 4.5,
      },
    },
    {
      selector: 'edge[edge_category = "PREDICTED_LINK"].highlighted-edge',
      style: {
        "line-color": "#dc2626",
        width: 3.5,
      },
    },
  ];
}

export function CytoscapeCanvas({
  graphPayload,
  threshold,
  includeNodeTypes,
  highlightedPath,
  onSelectPredictedEdge,
  onClearHighlight,
}: CytoscapeCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const onSelectEdgeRef = useRef(onSelectPredictedEdge);
  const onClearHighlightRef = useRef(onClearHighlight);
  const [visibleCounts, setVisibleCounts] = useState({ nodes: 0, edges: 0 });

  useEffect(() => {
    onSelectEdgeRef.current = onSelectPredictedEdge;
  }, [onSelectPredictedEdge]);

  useEffect(() => {
    onClearHighlightRef.current = onClearHighlight;
  }, [onClearHighlight]);

  const elements = useMemo<ElementDefinition[]>(() => {
    if (!graphPayload) return [];

    const nodes: ElementDefinition[] = graphPayload.nodes.map((n) => ({
      data: {
        ...n.data,
      },
    }));

    const edges: ElementDefinition[] = graphPayload.edges.map((e) => {
      const score = e.data.score;
      let displayLabel = e.data.relation;
      if (e.data.edge_category === "CONFIRMED_LINK") {
        displayLabel =
          score !== null ? `✓ ${(score * 100).toFixed(0)}%` : "✓ CONFIRMED";
      } else if (e.data.edge_category === "PREDICTED_LINK") {
        displayLabel = score !== null ? `${(score * 100).toFixed(0)}%` : "PRED";
      }

      return {
        data: {
          ...e.data,
          display_label: displayLabel,
          dynamic_risk: e.data.risk_level ?? "LOW",
        },
      };
    });

    return [...nodes, ...edges];
  }, [graphPayload]);

  // 1. Mount / Rebuild Cytoscape instance when graphPayload changes
  useEffect(() => {
    if (!containerRef.current || !graphPayload) {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
      setVisibleCounts({ nodes: 0, edges: 0 });
      return;
    }

    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: buildCytoscapeStyles(),
      minZoom: 0.25,
      maxZoom: 3,
      wheelSensitivity: 0.2,
    });

    cy.layout({
      name: "cose",
      animate: false,
      fit: true,
      padding: 28,
      nodeRepulsion: () => 8000,
      idealEdgeLength: () => 85,
      edgeElasticity: () => 100,
    }).run();

    cy.on("tap", "edge", (evt) => {
      const pairId = evt.target.data("pair_id") as string | null;
      if (pairId) {
        onSelectEdgeRef.current(pairId);
      }
    });

    cy.on("tap", (evt) => {
      if (evt.target === cy && onClearHighlightRef.current) {
        onClearHighlightRef.current();
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      if (cyRef.current === cy) {
        cyRef.current = null;
      }
    };
  }, [elements, graphPayload]);

  // 2. Realtime client-side filtering (threshold, DISMISSED, includeNodeTypes) without re-layout
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !graphPayload) return;

    const allowedTypes = new Set<NodeType>(includeNodeTypes);
    let shownNodes = 0;
    let shownEdges = 0;

    cy.batch(() => {
      const hiddenNodeIds = new Set<string>();

      cy.nodes().forEach((node) => {
        const nt = node.data("node_type") as NodeType;
        if (!allowedTypes.has(nt)) {
          node.addClass("hidden-el");
          hiddenNodeIds.add(node.id());
        } else {
          node.removeClass("hidden-el");
          shownNodes += 1;
        }
      });

      cy.edges().forEach((edge) => {
        const src = edge.source().id();
        const tgt = edge.target().id();
        const category = edge.data("edge_category") as string;
        const score = edge.data("score") as number | null;
        const fbStatus = edge.data("feedback_status") as string | null;

        if (score !== null && category === "PREDICTED_LINK") {
          edge.data("dynamic_risk", computeRiskLevel(score, threshold));
        }

        const endpointHidden = hiddenNodeIds.has(src) || hiddenNodeIds.has(tgt);
        const filteredByPredicted =
          category === "PREDICTED_LINK" &&
          (fbStatus === "DISMISSED" || (score !== null && score < threshold));

        if (endpointHidden || filteredByPredicted) {
          edge.addClass("hidden-el");
        } else {
          edge.removeClass("hidden-el");
          shownEdges += 1;
        }
      });
    });

    setVisibleCounts({ nodes: shownNodes, edges: shownEdges });
  }, [graphPayload, threshold, includeNodeTypes]);

  // 3. Highlight Bridge Path (sync with edge click, RankingTable, EvidenceDrawer)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !graphPayload) return;

    cy.batch(() => {
      cy.elements().removeClass("dimmed highlighted-node highlighted-edge");

      if (!highlightedPath || highlightedPath.nodes.length === 0) {
        return;
      }

      const pathNodes = highlightedPath.nodes;
      const pathNodeSet = new Set(pathNodes);
      const consecutivePairs = new Set<string>();

      for (let i = 0; i < pathNodes.length - 1; i += 1) {
        const u = pathNodes[i];
        const v = pathNodes[i + 1];
        consecutivePairs.add(`${u}__${v}`);
        consecutivePairs.add(`${v}__${u}`);
      }

      const startNode = pathNodes[0];
      const endNode = pathNodes[pathNodes.length - 1];

      cy.elements().addClass("dimmed");

      cy.nodes().forEach((node) => {
        if (pathNodeSet.has(node.id())) {
          node.removeClass("dimmed").addClass("highlighted-node");
        }
      });

      cy.edges().forEach((edge) => {
        if (edge.hasClass("hidden-el")) return;
        const src = edge.source().id();
        const tgt = edge.target().id();
        const isOnPath = consecutivePairs.has(`${src}__${tgt}`);
        const isEndToEndLink =
          (src === startNode && tgt === endNode) ||
          (src === endNode && tgt === startNode);

        if (isOnPath || isEndToEndLink) {
          edge.removeClass("dimmed").addClass("highlighted-edge");
        }
      });
    });
  }, [graphPayload, highlightedPath, threshold, includeNodeTypes]);

  const handleZoom = (factor: number) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({
      level: cy.zoom() * factor,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  };

  const handleFit = () => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.fit(cy.elements(":visible"), 28);
  };

  const handleRelayout = () => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.layout({
      name: "cose",
      animate: true,
      animationDuration: 350,
      fit: true,
      padding: 28,
      nodeRepulsion: () => 8000,
      idealEdgeLength: () => 85,
    }).run();
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-2.5">
      {/* Header + Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-900 text-sm">
            Đồ thị Dị thể & Liên kết Đồng phạm
          </h2>
          <p className="text-[11px] text-slate-500">
            {graphPayload
              ? `Đang hiện ${visibleCounts.nodes}/${graphPayload.nodes.length} đỉnh · ${visibleCounts.edges}/${graphPayload.edges.length} cạnh (τ=${threshold.toFixed(2)})`
              : "Bấm 'Chạy Suy Luận' để dựng đồ thị"}
          </p>
        </div>

        {graphPayload && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleZoom(1.2)}
              title="Phóng to"
              className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleZoom(0.8)}
              title="Thu nhỏ"
              className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleFit}
              title="Vừa khung nhìn"
              className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRelayout}
              title="Sắp xếp lại bố cục (COSE)"
              className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            {highlightedPath && onClearHighlight && (
              <button
                type="button"
                onClick={onClearHighlight}
                className="ml-1 px-2 py-1 rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-[11px] font-medium hover:bg-amber-100"
              >
                Bỏ Highlight
              </button>
            )}
          </div>
        )}
      </div>

      {/* Canvas */}
      <div className="relative h-[380px] rounded-lg border border-slate-200 bg-slate-50/70 overflow-hidden">
        {!graphPayload && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 text-center px-4">
            Chưa có dữ liệu đồ thị. Chọn Vụ án & Mô hình rồi nhấn{" "}
            <b className="mx-1 text-slate-600">Chạy Suy Luận</b>.
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* Footer Legend + Active Bridge Path */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 h-0.5 bg-slate-400 inline-block" />
            Quan sát (Observed)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 border-t-2 border-dashed border-red-600 inline-block" />
            Dự báo HIGH
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 border-t-2 border-dashed border-orange-500 inline-block" />
            Dự báo MEDIUM
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 h-1 bg-red-700 inline-block rounded-full" />
            Đã xác nhận (✓)
          </span>
        </div>

        {highlightedPath && (
          <div className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md font-mono text-[10px] max-w-full truncate">
            <Sparkles className="w-3 h-3 shrink-0" />
            <span className="truncate">
              {highlightedPath.nodes.join(" → ")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
