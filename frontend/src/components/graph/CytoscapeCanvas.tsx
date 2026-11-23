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
  ChevronDown,
  ChevronUp,
  Loader2,
  Maximize,
  Network,
  RefreshCw,
  Route,
  Tag,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  computeRiskLevel,
  NODE_VISUAL_STYLES,
  type AttributeTone,
  type CytoscapeEdgeData,
  type CytoscapeGraphPayload,
  type CytoscapeNodeData,
  type EntityAttributeItem,
  type EvidencePath,
  type NodeType,
} from "@/types/contract";
import {
  computeGraphVisibility,
  computePathHighlight,
} from "@/lib/graph/filters";
import { applyGraphLayout, type LayoutMode } from "@/lib/graph/layouts";
import { formatPercent } from "@/lib/format";
import { HEX, RISK_HEX } from "@/lib/theme/colors";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/Tabs";
import { Kbd } from "@/components/ui/Card";
import { NodeShapeIcon } from "@/components/graph/NodeShapeIcon";

interface CytoscapeCanvasProps {
  graphPayload: CytoscapeGraphPayload | null;
  threshold: number;
  includeNodeTypes: NodeType[];
  highlightedPath: EvidencePath | null;
  selectedPairEndpoints?: { source: string; target: string } | null;
  onSelectPredictedEdge: (pairId: string) => void;
  onClearHighlight?: () => void;
  /** Đang chạy suy luận — hiện lớp phủ tiến trình trên canvas. */
  isLoading?: boolean;
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
        color: HEX.fg,
        "font-size": 12,
        "font-weight": 500,
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 4,
        "text-background-color": HEX.surface,
        "text-background-opacity": 0.92,
        "text-background-padding": "2px",
        "text-background-shape": "roundrectangle",
        "text-border-width": 1,
        "text-border-color": HEX.lineStrong,
        "text-border-opacity": 0.85,
        width: "mapData(deg, 0, 10, 18, 34)",
        height: "mapData(deg, 0, 10, 18, 34)",
        "border-width": 2,
        "border-color": HEX.surface,
        "overlay-padding": 4,
      },
    },
    ...nodeTypeStyles,
    {
      selector: "node[?is_target]",
      style: {
        "border-width": 2.5,
        "border-color": HEX.fg,
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
        "line-color": HEX.faint,
        "target-arrow-color": HEX.faint,
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.65,
        label: "",
        "font-size": 11,
        color: HEX.fg,
        "text-rotation": "autorotate",
        "text-background-color": HEX.surface,
        "text-background-opacity": 0.94,
        "text-background-padding": "2px",
        "text-background-shape": "roundrectangle",
        "text-border-width": 1,
        "text-border-color": HEX.line,
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
        "line-color": HEX.muted,
        "font-weight": 600,
      },
    },
    {
      selector:
        'edge[edge_category = "PREDICTED_LINK"][dynamic_risk = "HIGH"]',
      style: {
        "line-color": RISK_HEX.HIGH,
        color: HEX.dangerDark,
        width: 2.5,
        opacity: 0.92,
      },
    },
    {
      selector:
        'edge[edge_category = "PREDICTED_LINK"][dynamic_risk = "MEDIUM"]',
      style: {
        "line-color": RISK_HEX.MEDIUM,
        color: HEX.warningDark,
        width: 2,
        opacity: 0.85,
      },
    },
    {
      selector:
        'edge[edge_category = "PREDICTED_LINK"][dynamic_risk = "LOW"]',
      style: {
        "line-color": HEX.faint,
        width: 1.2,
        opacity: 0.25,
      },
    },
    {
      selector: 'edge[edge_category = "CONFIRMED_LINK"]',
      style: {
        "line-style": "solid",
        "line-color": HEX.dangerDark,
        color: HEX.dangerDark,
        width: 3.5,
        opacity: 1,
        "font-weight": 600,
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
        "border-color": HEX.primary,
        "z-index": 999,
      },
    },
    {
      selector: ".highlighted-edge",
      style: {
        opacity: 1,
        width: 3.4,
        "line-color": HEX.primary,
        "target-arrow-color": HEX.primary,
        color: HEX.primaryDark,
        "font-weight": 600,
        label: "data(relation_or_score)",
        // (i) Nhãn cạnh được highlight nằm ngang (không autorotate) để khỏi bị chữ dọc chồng nhau
        "text-rotation": "none",
        "z-index": 998,
      },
    },
    {
      selector: 'edge[edge_category = "CONFIRMED_LINK"].highlighted-edge',
      style: {
        "line-color": HEX.dangerDark,
        color: HEX.dangerDark,
        width: 4.2,
      },
    },
    {
      selector: 'edge[edge_category = "PREDICTED_LINK"].highlighted-edge',
      style: {
        "line-color": RISK_HEX.HIGH,
        color: HEX.dangerDark,
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

const TONE_VALUE_STYLES: Record<AttributeTone, string> = {
  neutral: "text-fg-secondary",
  info: "text-primary-fg font-medium",
  warning: "text-warning-fg font-medium",
  danger: "text-danger-fg font-semibold",
  success: "text-success-fg font-medium",
};

export function CytoscapeCanvas({
  graphPayload,
  threshold,
  includeNodeTypes,
  highlightedPath,
  selectedPairEndpoints = null,
  onSelectPredictedEdge,
  onClearHighlight,
  isLoading = false,
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
  const [legendOpen, setLegendOpen] = useState(false);
  const [visibleCounts, setVisibleCounts] = useState({ nodes: 0, edges: 0 });
  const [inspectedNode, setInspectedNode] = useState<CytoscapeNodeData | null>(
    null
  );
  const [inspectedEdge, setInspectedEdge] = useState<CytoscapeEdgeData | null>(
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
          score !== null ? `✓ ${formatPercent(score, 1)}` : "✓ Đã xác nhận";
      } else if (e.data.edge_category === "PREDICTED_LINK") {
        displayLabel = score !== null ? formatPercent(score, 1) : "Dự báo";
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
      setInspectedEdge(null);
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
      const e = evt.target;
      const pairId = e.data("pair_id") as string | null;
      if (pairId) {
        setInspectedNode(null);
        setInspectedEdge(null);
        onSelectEdgeRef.current(pairId);
        return;
      }
      setInspectedNode(null);
      setInspectedEdge({
        id: e.id(),
        source: e.source().id(),
        target: e.target().id(),
        relation: e.data("relation") ?? "",
        edge_category: e.data("edge_category") ?? "OBSERVED_EDGE",
        score: e.data("score") ?? null,
        risk_level: e.data("risk_level") ?? null,
        pair_id: null,
        feedback_status: null,
        detail_label: e.data("detail_label") ?? null,
        attributes: (e.data("attributes") as EntityAttributeItem[] | undefined) ?? [],
      });
    });

    cy.on("tap", "node", (evt) => {
      const n = evt.target;
      setInspectedEdge(null);
      setInspectedNode({
        id: n.id(),
        label: n.data("label"),
        node_type: n.data("node_type"),
        risk_score: n.data("risk_score") ?? null,
        is_target: Boolean(n.data("is_target")),
        subtitle: (n.data("subtitle") as string | null | undefined) ?? null,
        attributes: (n.data("attributes") as EntityAttributeItem[] | undefined) ?? [],
      });
    });

    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        setInspectedNode(null);
        setInspectedEdge(null);
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

  const hasFocus = Boolean(highlightedPath || selectedPairEndpoints);
  const overlayCard = "pointer-events-auto rounded-lg border border-line bg-surface/95 shadow-sm backdrop-blur";

  return (
    <section
      aria-label="Đồ thị mạng lưới dị thể"
      className="relative flex min-h-[280px] flex-1 overflow-hidden rounded-lg border border-line bg-dot-grid"
    >
      <div ref={containerRef} className="absolute inset-0" />

      {/* Trạng thái rỗng / đang tải */}
      {!graphPayload && !isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted shadow-sm">
            <Network className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-base font-medium text-fg">Chưa có dữ liệu đồ thị</p>
            <p className="mt-1 text-sm text-muted">Chọn vụ án và chạy suy luận để dựng mạng lưới.</p>
          </div>
        </div>
      )}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/50 backdrop-blur-[1px]">
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-base text-fg-secondary shadow-md"
          >
            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
            Đang chạy suy luận GNN…
          </div>
        </div>
      )}

      {graphPayload && (
        <>
          {/* Góc trên-trái: bố cục + nhãn + thông tin đỉnh */}
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col items-start gap-2">
            <div className={cn(overlayCard, "flex items-center gap-1 p-1")}>
              <SegmentedControl<LayoutMode>
                ariaLabel="Bố cục đồ thị"
                value={layoutMode}
                onChange={handleChangeLayout}
                options={[
                  { value: "cose", label: "Cụm" },
                  { value: "concentric", label: "Đồng tâm" },
                  { value: "breadthfirst", label: "Phân tầng" },
                ]}
                className="border-0 bg-transparent p-0"
              />
              <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
              <IconButton
                label={showAllLabels ? "Ẩn nhãn đỉnh" : "Hiện nhãn mọi đỉnh"}
                icon={Tag}
                size="sm"
                active={showAllLabels}
                tooltipSide="bottom"
                onClick={() => setShowAllLabels((v) => !v)}
              />
            </div>

            {inspectedNode && (
              <div className={cn(overlayCard, "w-72 sm:w-80 overflow-hidden text-xs")}>
                <div className="flex items-start justify-between gap-2 border-b border-line px-3 py-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="mt-0.5 shrink-0">
                      <NodeShapeIcon type={inspectedNode.node_type} size={16} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="truncate font-mono text-sm font-semibold text-fg">
                          {inspectedNode.label}
                        </span>
                        <span className="rounded bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-fg-secondary border border-line">
                          {NODE_VISUAL_STYLES[inspectedNode.node_type]?.labelVi ??
                            inspectedNode.node_type}
                        </span>
                      </div>
                      {inspectedNode.subtitle && (
                        <div className="mt-0.5 truncate text-[11px] text-muted">
                          {inspectedNode.subtitle}
                        </div>
                      )}
                    </div>
                  </div>
                  <IconButton
                    label="Đóng thông tin đỉnh"
                    icon={X}
                    size="sm"
                    onClick={() => setInspectedNode(null)}
                  />
                </div>

                <div className="max-h-56 space-y-1.5 overflow-y-auto px-3 py-2.5 num">
                  {inspectedNode.risk_score !== null && (
                    <div className="mb-1 flex items-center justify-between gap-2 border-b border-line pb-1.5 text-[11px]">
                      <span className="text-muted">Xác suất đồng phạm cao nhất</span>
                      <span className="font-mono font-semibold text-danger-fg">
                        {formatPercent(inspectedNode.risk_score, 1)}
                      </span>
                    </div>
                  )}

                  {inspectedNode.attributes && inspectedNode.attributes.length > 0 ? (
                    <dl className="space-y-1.5 text-[11px]">
                      {inspectedNode.attributes.map((attr, idx) => (
                        <div
                          key={`${inspectedNode.id}-attr-${idx}`}
                          className="flex items-baseline justify-between gap-3"
                        >
                          <dt className="shrink-0 text-muted">{attr.label}</dt>
                          <dd
                            className={cn(
                              "truncate text-right",
                              TONE_VALUE_STYLES[attr.tone ?? "neutral"]
                            )}
                            title={attr.value}
                          >
                            {attr.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <div className="text-[11px] text-muted">
                      Không có thêm thuộc tính chi tiết cho thực thể này.
                    </div>
                  )}
                </div>
              </div>
            )}

            {inspectedEdge && (
              <div className={cn(overlayCard, "w-72 sm:w-80 overflow-hidden text-xs")}>
                <div className="flex items-start justify-between gap-2 border-b border-line px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-muted">
                      Chi tiết Quan hệ Quan sát
                    </div>
                    <div className="mt-0.5 truncate font-mono text-xs font-semibold text-fg">
                      {inspectedEdge.source} → {inspectedEdge.target}
                    </div>
                    {inspectedEdge.detail_label && (
                      <div className="mt-0.5 truncate text-[11px] font-medium text-primary-fg">
                        {inspectedEdge.detail_label}
                      </div>
                    )}
                  </div>
                  <IconButton
                    label="Đóng thông tin cạnh"
                    icon={X}
                    size="sm"
                    onClick={() => setInspectedEdge(null)}
                  />
                </div>

                <div className="space-y-1.5 px-3 py-2.5 text-[11px] num">
                  {inspectedEdge.attributes && inspectedEdge.attributes.length > 0 ? (
                    <dl className="space-y-1.5">
                      {inspectedEdge.attributes.map((attr, idx) => (
                        <div
                          key={`${inspectedEdge.id}-eattr-${idx}`}
                          className="flex items-baseline justify-between gap-3"
                        >
                          <dt className="shrink-0 text-muted">{attr.label}</dt>
                          <dd
                            className={cn(
                              "truncate text-right",
                              TONE_VALUE_STYLES[attr.tone ?? "neutral"]
                            )}
                            title={attr.value}
                          >
                            {attr.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <div className="text-fg-secondary">
                      Quan hệ: <span className="font-mono font-medium">{inspectedEdge.relation}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Góc trên-phải: điều khiển khung nhìn */}
          <div className={cn(overlayCard, "absolute right-3 top-3 z-10 flex flex-col p-1")}>
            <IconButton label="Phóng to" icon={ZoomIn} size="sm" tooltipSide="left" onClick={() => handleZoom(1.2)} />
            <IconButton label="Thu nhỏ" icon={ZoomOut} size="sm" tooltipSide="left" onClick={() => handleZoom(0.8)} />
            <IconButton label="Vừa khung nhìn" icon={Maximize} size="sm" tooltipSide="left" onClick={handleFit} />
            <span className="mx-1.5 my-0.5 h-px bg-line" aria-hidden />
            <IconButton
              label="Sắp xếp lại bố cục"
              icon={RefreshCw}
              size="sm"
              tooltipSide="left"
              onClick={() => runLayout(layoutMode)}
            />
          </div>

          {/* Trên-giữa: thoát chế độ tập trung */}
          {hasFocus && onClearHighlight && (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-10 hidden justify-center 2xl:flex">
              <button
                type="button"
                onClick={onClearHighlight}
                className={cn(
                  overlayCard,
                  "inline-flex h-8 items-center gap-2 px-3 text-sm font-medium text-fg-secondary hover:text-fg"
                )}
              >
                Xem toàn cảnh <Kbd>Esc</Kbd>
              </button>
            </div>
          )}

          {/* Góc dưới-trái: chú giải */}
          <div className={cn(overlayCard, "absolute bottom-3 left-3 z-10 max-w-[calc(100%-1.5rem)] text-xs")}>
            <button
              type="button"
              onClick={() => setLegendOpen((v) => !v)}
              aria-expanded={legendOpen}
              className="flex w-full items-center justify-between gap-6 rounded-lg px-3 py-2 font-medium text-fg-secondary"
            >
              Chú giải
              {legendOpen ? (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
            {legendOpen && (
              <div className="space-y-2 border-t border-line px-3 pb-2.5 pt-2 text-fg-secondary">
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <li className="flex items-center gap-2">
                    <span className="h-px w-5 bg-faint" aria-hidden /> Cạnh quan sát
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-5 border-t-2 border-dashed border-risk-high" aria-hidden /> Dự báo · cao
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-5 border-t-2 border-dashed border-risk-medium" aria-hidden /> Dự báo · trung bình
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-1 w-5 rounded-full bg-danger-fg" aria-hidden /> Đã xác nhận
                  </li>
                </ul>
                <ul className="grid grid-cols-3 gap-x-4 gap-y-1.5 border-t border-line pt-2">
                  {(Object.keys(NODE_VISUAL_STYLES) as NodeType[]).map((nt) => (
                    <li key={nt} className="flex items-center gap-1.5 whitespace-nowrap">
                      <NodeShapeIcon type={nt} size={12} muted={!includeNodeTypes.includes(nt)} />
                      {NODE_VISUAL_STYLES[nt].labelVi}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Góc dưới-phải: số liệu + đường bắc cầu đang làm sáng */}
          <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex max-w-[45%] flex-col items-end gap-2">
            {highlightedPath && (
              <div className={cn(overlayCard, "flex max-w-full items-center gap-2 px-3 py-1.5 text-xs text-primary-fg")}>
                <Route className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate font-mono">{highlightedPath.nodes.join(" → ")}</span>
              </div>
            )}
            <div className={cn(overlayCard, "num px-3 py-1.5 text-xs text-muted")}>
              {visibleCounts.nodes} đỉnh · {visibleCounts.edges} cạnh
            </div>
          </div>
        </>
      )}
    </section>
  );
}
