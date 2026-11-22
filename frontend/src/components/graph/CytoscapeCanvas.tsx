"use client";

/**
 * Cột Giữa Trên (M3 - Việt): Đồ thị tương tác Cytoscape.js
 * Tích hợp đầy đủ từ file tham khảo `CytoscapeCanvas.tsx` (Review lần 3 + lần 4: a -> i):
 * - (a) Mặc định ẩn nhãn node/cạnh; chỉ hiện nhãn trên các đỉnh thuộc cặp/Bridge Path đang chọn
 *       và khi di chuột (hover `mouseover` -> `closedNeighborhood().addClass("show-label")`).
 * - (a) Kích thước node tỷ lệ theo bậc hiển thị `mapData(deg, 0, 10, 18, 34)`.
 * - (b) Ẩn toàn bộ các node cô lập (degree = 0 trên các cạnh đang hiển thị) rồi mới chạy layout
 *       và `cy.fit(cy.elements(":visible"), 40)` để đồ thị luôn phóng to rõ nét.
 * - (e) Cạnh quan sát (`OBSERVED_EDGE`) mảnh và mờ (`width: 1, opacity: 0.3`);
 *       cạnh dự báo `HIGH` đỏ, `MEDIUM` cam nổi bật rõ ràng.
 * - (f) ResizeObserver -> `cy.resize()` + fit lại: sửa lỗi đồ thị lệch/cắt mép khi card co giãn.
 * - (g) Chọn cặp/path -> zoom vừa phải vào đúng cụm được highlight (giới hạn max zoom 1.35x để không phóng quá to).
 * - (h) Đỉnh vừa hiện lên mà chưa có tọa độ (`!laidOutRef.current.has(n.id())`) -> tự chạy lại layout.
 * - (i) Nhãn cạnh được highlight nằm ngang (`"text-rotation": "none"`) để khỏi bị chữ dọc chồng nhau.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape, {
  type CollectionReturnValue,
  type Core,
  type ElementDefinition,
  type StylesheetStyle,
} from "cytoscape";
import {
  Maximize2,
  RefreshCw,
  Sparkles,
  Tag,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  computeRiskLevel,
  NODE_VISUAL_STYLES,
  type CytoscapeGraphPayload,
  type CytoscapeNodeData,
  type EvidencePath,
  type NodeType,
} from "@/types/contract";
import {
  computeGraphVisibility,
  computePathHighlight,
} from "@/lib/graph/filters";
import { applyGraphLayout, type LayoutMode } from "@/lib/graph/layouts";
import { formatPercent } from "@/lib/format";

interface CytoscapeCanvasProps {
  graphPayload: CytoscapeGraphPayload | null;
  threshold: number;
  includeNodeTypes: NodeType[];
  highlightedPath: EvidencePath | null;
  selectedPairEndpoints?: { source: string; target: string } | null;
  onSelectPredictedEdge: (pairId: string) => void;
  onClearHighlight?: () => void;
}

/**
 * Fit vào tập phần tử mục tiêu nhưng giới hạn mức zoom tối đa (`maxFocusZoom = 1.35`)
 * để khi cụm highlight chỉ có 3-5 đỉnh sẽ không bị phóng quá to gây đè nhãn.
 */
function fitWithMaxZoom(
  cy: Core,
  targetEls: CollectionReturnValue,
  padding = 75,
  maxFocusZoom = 1.35
): void {
  if (targetEls.empty()) return;
  cy.fit(targetEls, padding);
  if (cy.zoom() > maxFocusZoom) {
    cy.zoom({
      level: maxFocusZoom,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
    cy.center(targetEls);
  }
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
        // Mặc định ẩn nhãn để không đè chữ; hiện khi thuộc cặp đang chọn, hover hoặc bật "Hiện nhãn"
        label: "",
        color: "#0f172a",
        "font-size": 11,
        "font-weight": 600,
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 4,
        "text-background-color": "#ffffff",
        "text-background-opacity": 0.92,
        "text-background-padding": "2px",
        "text-background-shape": "roundrectangle",
        "text-border-width": 1,
        "text-border-color": "#cbd5e1",
        "text-border-opacity": 0.85,
        width: "mapData(deg, 0, 10, 18, 34)",
        height: "mapData(deg, 0, 10, 18, 34)",
        "border-width": 2,
        "border-color": "#ffffff",
        "overlay-padding": 4,
      },
    },
    ...nodeTypeStyles,
    {
      selector: "node[?is_target]",
      style: {
        "border-width": 2.5,
        "border-color": "#1e3a8a",
      },
    },
    {
      selector:
        "node.highlighted-node, node.show-label, node.always-label",
      style: {
        label: "data(label)",
      },
    },
    {
      selector: "edge",
      style: {
        "curve-style": "bezier",
        width: 1,
        opacity: 0.3,
        "line-color": "#94a3b8",
        "target-arrow-color": "#94a3b8",
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.65,
        label: "",
        "font-size": 9.5,
        color: "#1e293b",
        "text-rotation": "autorotate",
        "text-background-color": "#ffffff",
        "text-background-opacity": 0.94,
        "text-background-padding": "2px",
        "text-background-shape": "roundrectangle",
        "text-border-width": 1,
        "text-border-color": "#e2e8f0",
        "text-border-opacity": 0.9,
      },
    },
    {
      selector: 'edge[edge_category != "OBSERVED_EDGE"]',
      style: {
        opacity: 0.88,
        width: 2,
        "target-arrow-shape": "none",
      },
    },
    {
      selector: 'edge[edge_category = "PREDICTED_LINK"]',
      style: {
        "line-style": "dashed",
        "line-dash-pattern": [6, 4],
        "line-color": "#64748b",
        "font-weight": 700,
      },
    },
    {
      selector:
        'edge[edge_category = "PREDICTED_LINK"][dynamic_risk = "HIGH"]',
      style: {
        "line-color": "#dc2626",
        color: "#b91c1c",
        width: 2.5,
        opacity: 0.92,
      },
    },
    {
      selector:
        'edge[edge_category = "PREDICTED_LINK"][dynamic_risk = "MEDIUM"]',
      style: {
        "line-color": "#d97706",
        color: "#b45309",
        width: 2,
        opacity: 0.85,
      },
    },
    {
      selector:
        'edge[edge_category = "PREDICTED_LINK"][dynamic_risk = "LOW"]',
      style: {
        "line-color": "#94a3b8",
        width: 1.2,
        opacity: 0.25,
      },
    },
    {
      selector: 'edge[edge_category = "CONFIRMED_LINK"]',
      style: {
        "line-style": "solid",
        "line-color": "#b91c1c",
        color: "#991b1b",
        width: 3.5,
        opacity: 1,
        "font-weight": 700,
      },
    },
    {
      selector: ".dimmed",
      style: {
        opacity: 0.14,
      },
    },
    {
      selector: ".highlighted-node",
      style: {
        opacity: 1,
        "border-width": 3.5,
        "border-color": "#f59e0b",
        "z-index": 999,
      },
    },
    {
      selector: ".highlighted-edge",
      style: {
        opacity: 1,
        width: 3.4,
        "line-color": "#2563eb",
        "target-arrow-color": "#2563eb",
        color: "#1e40af",
        "font-weight": 700,
        label: "data(relation_or_score)",
        // (i) Nhãn cạnh được highlight nằm ngang (không autorotate) để khỏi bị chữ dọc chồng nhau
        "text-rotation": "none",
        "z-index": 998,
      },
    },
    {
      selector: 'edge[edge_category = "CONFIRMED_LINK"].highlighted-edge',
      style: {
        "line-color": "#991b1b",
        color: "#991b1b",
        width: 4.2,
      },
    },
    {
      selector: 'edge[edge_category = "PREDICTED_LINK"].highlighted-edge',
      style: {
        "line-color": "#dc2626",
        color: "#b91c1c",
        width: 3.6,
      },
    },
    {
      selector: "edge.show-label",
      style: {
        opacity: 1,
        label: "data(relation_or_score)",
        "text-rotation": "none",
        "z-index": 997,
      },
    },
  ];
}

export function CytoscapeCanvas({
  graphPayload,
  threshold,
  includeNodeTypes,
  highlightedPath,
  selectedPairEndpoints = null,
  onSelectPredictedEdge,
  onClearHighlight,
}: CytoscapeCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const layoutModeRef = useRef<LayoutMode>("cose");
  // Tập đỉnh đã được layout đặt tọa độ (đỉnh bị ẩn lúc layout sẽ chưa có tọa độ hợp lệ)
  const laidOutRef = useRef<Set<string>>(new Set());
  const onSelectEdgeRef = useRef(onSelectPredictedEdge);
  const onClearHighlightRef = useRef(onClearHighlight);

  const [layoutMode, setLayoutMode] = useState<LayoutMode>("cose");
  const [showAllLabels, setShowAllLabels] = useState(false);
  const [visibleCounts, setVisibleCounts] = useState({ nodes: 0, edges: 0 });
  const [inspectedNode, setInspectedNode] = useState<CytoscapeNodeData | null>(
    null
  );

  useEffect(() => {
    onSelectEdgeRef.current = onSelectPredictedEdge;
  }, [onSelectPredictedEdge]);

  useEffect(() => {
    onClearHighlightRef.current = onClearHighlight;
  }, [onClearHighlight]);

  const focusNodeIds = useMemo(() => {
    const s = new Set<string>();
    if (highlightedPath) {
      highlightedPath.nodes.forEach((id) => s.add(id));
    }
    if (selectedPairEndpoints) {
      s.add(selectedPairEndpoints.source);
      s.add(selectedPairEndpoints.target);
    }
    return s;
  }, [highlightedPath, selectedPairEndpoints]);

  const elements = useMemo<ElementDefinition[]>(() => {
    if (!graphPayload) return [];

    const nodes: ElementDefinition[] = graphPayload.nodes.map((n) => ({
      data: {
        ...n.data,
        deg: 2,
      },
    }));

    const edges: ElementDefinition[] = graphPayload.edges.map((e) => {
      const score = e.data.score;
      let displayLabel = "";
      if (e.data.edge_category === "CONFIRMED_LINK") {
        displayLabel =
          score !== null ? `✓ ${formatPercent(score, 1)}` : "✓ CONFIRMED";
      } else if (e.data.edge_category === "PREDICTED_LINK") {
        displayLabel = score !== null ? formatPercent(score, 1) : "PRED";
      }

      return {
        data: {
          ...e.data,
          display_label: displayLabel,
          relation_or_score: displayLabel || e.data.relation,
          dynamic_risk: e.data.risk_level ?? "LOW",
        },
      };
    });

    return [...nodes, ...edges];
  }, [graphPayload]);

  // 1) Khởi tạo Cytoscape khi graphPayload đổi
  useEffect(() => {
    if (!containerRef.current || !graphPayload) {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
      setVisibleCounts({ nodes: 0, edges: 0 });
      setInspectedNode(null);
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
      minZoom: 0.3,
      maxZoom: 2.5,
      wheelSensitivity: 0.2,
    });

    // Hover vào node hoặc cạnh sẽ tự hiện nhãn của nó và các phần tử lân cận
    cy.on("mouseover", "node", (evt) => {
      evt.target.closedNeighborhood().addClass("show-label");
    });
    cy.on("mouseout", "node", () => {
      cy.elements().removeClass("show-label");
    });
    cy.on("mouseover", "edge", (evt) => {
      evt.target.closedNeighborhood().addClass("show-label");
    });
    cy.on("mouseout", "edge", () => {
      cy.elements().removeClass("show-label");
    });

    cy.on("tap", "edge", (evt) => {
      const pairId = evt.target.data("pair_id") as string | null;
      if (pairId) {
        onSelectEdgeRef.current(pairId);
      }
    });

    cy.on("tap", "node", (evt) => {
      const n = evt.target;
      setInspectedNode({
        id: n.id(),
        label: n.data("label"),
        node_type: n.data("node_type"),
        risk_score: n.data("risk_score") ?? null,
        is_target: Boolean(n.data("is_target")),
      });
    });

    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        setInspectedNode(null);
        onClearHighlightRef.current?.();
      }
    });

    cyRef.current = cy;

    // Lọc các node cô lập trước rồi mới chạy layout trên các phần tử `:visible`
    const {
      hiddenNodeIds,
      hiddenEdgeIds,
      visibleDegrees,
      shownNodes,
      shownEdges,
    } = computeGraphVisibility(graphPayload, {
      threshold,
      includeNodeTypes: new Set(includeNodeTypes),
      focusNodeIds,
    });

    cy.batch(() => {
      cy.nodes().forEach((n) => {
        const deg = visibleDegrees.get(n.id()) ?? 0;
        n.data("deg", Math.min(10, deg));
        n.style("display", hiddenNodeIds.has(n.id()) ? "none" : "element");
      });
      cy.edges().forEach((e) => {
        const score = e.data("score") as number | null;
        if (score !== null && e.data("edge_category") === "PREDICTED_LINK") {
          e.data("dynamic_risk", computeRiskLevel(score, threshold));
        }
        e.style("display", hiddenEdgeIds.has(e.id()) ? "none" : "element");
      });
    });

    setVisibleCounts({ nodes: shownNodes, edges: shownEdges });
    applyGraphLayout(
      cy,
      graphPayload,
      layoutModeRef.current,
      false,
      focusNodeIds
    );
    laidOutRef.current = new Set(cy.nodes(":visible").map((n) => n.id()));

    return () => {
      cy.destroy();
      if (cyRef.current === cy) {
        cyRef.current = null;
      }
    };
  }, [elements, graphPayload]);

  // 2) Lọc realtime khi kéo slider threshold hoặc bật/tắt loại đỉnh (ẩn node bậc 0 & fit gọn)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !graphPayload) return;

    const {
      hiddenNodeIds,
      hiddenEdgeIds,
      visibleDegrees,
      shownNodes,
      shownEdges,
    } = computeGraphVisibility(graphPayload, {
      threshold,
      includeNodeTypes: new Set(includeNodeTypes),
      focusNodeIds,
    });

    cy.batch(() => {
      cy.nodes().forEach((n) => {
        const deg = visibleDegrees.get(n.id()) ?? 0;
        n.data("deg", Math.min(10, deg));
        n.style("display", hiddenNodeIds.has(n.id()) ? "none" : "element");
      });
      cy.edges().forEach((e) => {
        const score = e.data("score") as number | null;
        if (score !== null && e.data("edge_category") === "PREDICTED_LINK") {
          e.data("dynamic_risk", computeRiskLevel(score, threshold));
        }
        e.style("display", hiddenEdgeIds.has(e.id()) ? "none" : "element");
      });
    });

    setVisibleCounts({ nodes: shownNodes, edges: shownEdges });

    // (h) Có đỉnh vừa hiện lên nhưng chưa từng được đặt tọa độ -> chạy lại layout
    const needsLayout = cy
      .nodes(":visible")
      .toArray()
      .some((n) => !laidOutRef.current.has(n.id()));
    if (needsLayout) {
      applyGraphLayout(
        cy,
        graphPayload,
        layoutModeRef.current,
        false,
        focusNodeIds
      );
      laidOutRef.current = new Set(cy.nodes(":visible").map((n) => n.id()));
      return;
    }

    // (g) Khi đang có cặp/path được chọn thì effect 3 sẽ zoom vào cụm đó; chỉ fit toàn cảnh khi không có focus
    if (focusNodeIds.size === 0) {
      const vis = cy.elements(":visible");
      if (vis.nonempty()) {
        cy.fit(vis, 40);
      }
    }
  }, [graphPayload, threshold, includeNodeTypes, focusNodeIds]);

  // 3) Highlight cặp đang chọn & Bridge Path, làm mờ phần còn lại
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !graphPayload) return;

    const {
      hasHighlight,
      highlightedNodeIds,
      consecutiveNodePairs,
      startNode,
      endNode,
    } = computePathHighlight(highlightedPath, selectedPairEndpoints);

    cy.batch(() => {
      cy.elements().removeClass("dimmed highlighted-node highlighted-edge");
      if (!hasHighlight) return;

      cy.elements().addClass("dimmed");

      cy.nodes().forEach((n) => {
        if (highlightedNodeIds.has(n.id())) {
          n.removeClass("dimmed").addClass("highlighted-node");
        }
      });

      cy.edges().forEach((e) => {
        if (e.style("display") === "none") return;
        const src = e.source().id();
        const tgt = e.target().id();
        const isStep = consecutiveNodePairs.has(`${src}__${tgt}`);
        const isDirectPair =
          (src === startNode && tgt === endNode) ||
          (src === endNode && tgt === startNode);

        if (isStep || isDirectPair) {
          e.removeClass("dimmed").addClass("highlighted-edge");
        }
      });
    });

    // (g) Zoom vừa phải vào đúng cụm được highlight (kèm giới hạn max zoom 1.35x để nhãn thoáng)
    if (hasHighlight) {
      const focusEls = cy
        .elements(".highlighted-node, .highlighted-edge")
        .filter(":visible");
      if (focusEls.nonempty()) {
        fitWithMaxZoom(cy, focusEls, 75, 1.35);
      }
    }
  }, [
    graphPayload,
    highlightedPath,
    selectedPairEndpoints,
    threshold,
    includeNodeTypes,
  ]);

  // 4) Bật/tắt hiển thị toàn bộ nhãn node theo ý muốn điều tra viên
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      if (showAllLabels) {
        cy.nodes().addClass("always-label");
      } else {
        cy.nodes().removeClass("always-label");
      }
    });
  }, [showAllLabels, graphPayload]);

  // 5) (f) Container co giãn (card đồ thị chia chiều cao với bảng xếp hạng) -> cập nhật canvas rồi fit lại
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const cy = cyRef.current;
        if (!cy) return;
        cy.resize();
        const focusEls = cy
          .elements(".highlighted-node, .highlighted-edge")
          .filter(":visible");
        const hasFocus = focusEls.nonempty();
        if (hasFocus) {
          fitWithMaxZoom(cy, focusEls, 75, 1.35);
        } else {
          const vis = cy.elements(":visible");
          if (vis.nonempty()) cy.fit(vis, 40);
        }
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const runLayout = (mode: LayoutMode) => {
    const cy = cyRef.current;
    if (!cy || !graphPayload) return;
    applyGraphLayout(cy, graphPayload, mode, true, focusNodeIds);
    laidOutRef.current = new Set(cy.nodes(":visible").map((n) => n.id()));
  };

  const handleChangeLayout = (mode: LayoutMode) => {
    setLayoutMode(mode);
    layoutModeRef.current = mode;
    runLayout(mode);
  };

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
    const vis = cy.elements(":visible");
    if (vis.nonempty()) {
      cy.fit(vis, 40);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-3.5 flex-1 min-h-[260px] flex flex-col justify-between gap-2">
      {/* Header + Layout & Zoom Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div>
          <h2 className="font-semibold text-slate-900 text-sm">
            Đồ thị Dị thể & Liên kết Đồng phạm
          </h2>
          <p className="text-[11px] text-slate-600 num">
            {graphPayload
              ? `Đang hiện ${visibleCounts.nodes} đỉnh có liên kết · ${visibleCounts.edges} cạnh (τ=${threshold.toFixed(2)}) — Di chuột vào đỉnh/cạnh để xem nhãn`
              : "Chọn Vụ án & Mô hình ở cột trái rồi nhấn Chạy Suy Luận"}
          </p>
        </div>

        {graphPayload && (
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-[11px]">
              {(
                [
                  { id: "cose", label: "Cụm (COSE)" },
                  { id: "concentric", label: "Đồng tâm" },
                  { id: "breadthfirst", label: "Phân tầng AML" },
                ] as Array<{ id: LayoutMode; label: string }>
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleChangeLayout(opt.id)}
                  className={`px-2 py-0.5 rounded-md transition-colors ${
                    layoutMode === opt.id
                      ? "bg-white text-slate-900 shadow-sm font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowAllLabels((v) => !v)}
              title="Bật/tắt hiển thị toàn bộ tên đỉnh"
              className={`px-2 py-1 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 transition-colors ${
                showAllLabels
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <Tag className="w-3 h-3" />
              <span>Nhãn</span>
            </button>

            <button
              type="button"
              onClick={() => handleZoom(1.2)}
              title="Phóng to"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleZoom(0.8)}
              title="Thu nhỏ"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleFit}
              title="Vừa khung nhìn"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => runLayout(layoutMode)}
              title="Sắp xếp lại bố cục"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            {(highlightedPath || selectedPairEndpoints) && onClearHighlight && (
              <button
                type="button"
                onClick={onClearHighlight}
                title="Phím tắt: Esc"
                className="px-2 py-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-[11px] font-semibold hover:bg-amber-100"
              >
                Xem toàn cảnh (Esc)
              </button>
            )}
          </div>
        )}
      </div>

      {/* Canvas co giãn lấp đầy chiều cao cột giữa */}
      <div className="relative flex-1 min-h-[220px] rounded-xl border border-slate-200 bg-dot-grid overflow-hidden">
        {!graphPayload && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-xs text-slate-500 text-center px-4 gap-1">
            <span className="font-semibold text-slate-700">
              Không gian Đồ thị Điều tra Rửa tiền
            </span>
            <span>
              Nhấn <b>Chạy Suy Luận</b> để hiển thị các thực thể (Khách hàng, Tài khoản, Thiết bị, IP) và các liên kết đồng phạm ẩn.
            </span>
          </div>
        )}

        <div ref={containerRef} className="w-full h-full" />

        {/* Floating Node Inspector Pill khi click vào 1 đỉnh */}
        {inspectedNode && (
          <div className="absolute top-2.5 left-2.5 z-20 bg-white/95 backdrop-blur border border-slate-200 shadow-md rounded-lg px-3 py-2 text-xs flex items-center gap-2.5">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{
                backgroundColor:
                  NODE_VISUAL_STYLES[inspectedNode.node_type]?.color ??
                  "#2563eb",
              }}
            />
            <div>
              <div className="font-mono font-semibold text-slate-900 flex items-center gap-1.5">
                <span>{inspectedNode.label}</span>
                <span className="text-[10px] font-sans font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                  {NODE_VISUAL_STYLES[inspectedNode.node_type]?.labelVi ??
                    inspectedNode.node_type}
                </span>
              </div>
              {inspectedNode.risk_score !== null && (
                <div className="text-[11px] text-slate-600 num">
                  Điểm rủi ro nút: {formatPercent(inspectedNode.risk_score, 1)}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setInspectedNode(null)}
              className="text-slate-400 hover:text-slate-600 ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Footer Legend + Active Bridge Path */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-slate-300 inline-block" />
            Quan sát (Mờ)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-red-600 inline-block" />
            Dự báo HIGH
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-amber-600 inline-block" />
            Dự báo MEDIUM
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-1 bg-red-700 inline-block rounded-full" />
            Đã xác nhận (✓)
          </span>
        </div>

        {highlightedPath && (
          <div className="inline-flex items-center gap-1 text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md font-mono text-[10px] max-w-full truncate">
            <Sparkles className="w-3 h-3 shrink-0" />
            <span className="truncate">
              {highlightedPath.nodes.join(" → ")}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
