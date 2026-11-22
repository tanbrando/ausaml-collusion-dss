/**
 * Logic lọc đồ thị thuần (Single Responsibility & Open/Closed).
 * Tinh chỉnh theo review lần 3:
 * 1. Tính bậc hiển thị (visibleDegree) của từng đỉnh trên các cạnh đang hiện.
 * 2. Ẩn toàn bộ các đỉnh cô lập (visibleDegree === 0, trừ các đỉnh thuộc cặp/đường đi đang chọn)
 *    để `cy.fit` không bị thu nhỏ đồ thị vì các node rời rạc ở rìa.
 * 3. Hỗ trợ highlight theo cả `highlightedPath` hoặc cặp `selectedPair` (source, target).
 */

import type {
  CytoscapeGraphPayload,
  EvidencePath,
  NodeType,
} from "@/types/contract";

export interface GraphFilterOptions {
  threshold: number;
  includeNodeTypes: ReadonlySet<NodeType>;
  focusNodeIds?: ReadonlySet<string>;
}

export interface GraphVisibilityResult {
  hiddenNodeIds: Set<string>;
  hiddenEdgeIds: Set<string>;
  visibleDegrees: Map<string, number>;
  shownNodes: number;
  shownEdges: number;
}

export function computeGraphVisibility(
  graph: CytoscapeGraphPayload,
  { threshold, includeNodeTypes, focusNodeIds }: GraphFilterOptions
): GraphVisibilityResult {
  const typeHiddenNodeIds = new Set<string>();

  for (const n of graph.nodes) {
    const { id, node_type } = n.data;
    const isFocused = focusNodeIds?.has(id) ?? false;
    if (!isFocused && !includeNodeTypes.has(node_type)) {
      typeHiddenNodeIds.add(id);
    }
  }

  const hiddenEdgeIds = new Set<string>();
  const visibleDegrees = new Map<string, number>();
  for (const n of graph.nodes) {
    visibleDegrees.set(n.data.id, 0);
  }

  let shownEdges = 0;

  for (const e of graph.edges) {
    const { id, source, target, edge_category, score, feedback_status } =
      e.data;
    const endpointHidden =
      typeHiddenNodeIds.has(source) || typeHiddenNodeIds.has(target);
    const filteredPredicted =
      edge_category === "PREDICTED_LINK" &&
      (feedback_status === "DISMISSED" ||
        (score !== null && score < threshold));

    if (endpointHidden || filteredPredicted) {
      hiddenEdgeIds.add(id);
    } else {
      shownEdges += 1;
      visibleDegrees.set(source, (visibleDegrees.get(source) ?? 0) + 1);
      visibleDegrees.set(target, (visibleDegrees.get(target) ?? 0) + 1);
    }
  }

  // Bước 2: Ẩn các node cô lập (degree = 0 trên các cạnh đang hiện) để đồ thị không bị thu nhỏ
  const hiddenNodeIds = new Set<string>(typeHiddenNodeIds);
  let shownNodes = 0;

  for (const n of graph.nodes) {
    if (hiddenNodeIds.has(n.data.id)) continue;
    const deg = visibleDegrees.get(n.data.id) ?? 0;
    const isFocused = focusNodeIds?.has(n.data.id) ?? false;

    if (shownEdges > 0 && deg === 0 && !isFocused) {
      hiddenNodeIds.add(n.data.id);
    } else {
      shownNodes += 1;
    }
  }

  return {
    hiddenNodeIds,
    hiddenEdgeIds,
    visibleDegrees,
    shownNodes,
    shownEdges,
  };
}

export interface HighlightSetResult {
  hasHighlight: boolean;
  highlightedNodeIds: Set<string>;
  consecutiveNodePairs: Set<string>;
  startNode: string | null;
  endNode: string | null;
}

/**
 * Tính tập đỉnh và cặp đỉnh liên tiếp thuộc Bridge Path hoặc cặp khách hàng đang chọn.
 */
export function computePathHighlight(
  highlightedPath: EvidencePath | null,
  selectedPairEndpoints?: { source: string; target: string } | null
): HighlightSetResult {
  const highlightedNodeIds = new Set<string>();
  const consecutiveNodePairs = new Set<string>();

  if (highlightedPath && highlightedPath.nodes.length > 0) {
    const nodes = highlightedPath.nodes;
    for (const id of nodes) {
      highlightedNodeIds.add(id);
    }
    for (let i = 0; i < nodes.length - 1; i += 1) {
      const u = nodes[i];
      const v = nodes[i + 1];
      consecutiveNodePairs.add(`${u}__${v}`);
      consecutiveNodePairs.add(`${v}__${u}`);
    }

    const startNode = selectedPairEndpoints?.source ?? nodes[0];
    const endNode =
      selectedPairEndpoints?.target ?? nodes[nodes.length - 1];
    highlightedNodeIds.add(startNode);
    highlightedNodeIds.add(endNode);

    return {
      hasHighlight: true,
      highlightedNodeIds,
      consecutiveNodePairs,
      startNode,
      endNode,
    };
  }

  if (selectedPairEndpoints) {
    const { source, target } = selectedPairEndpoints;
    highlightedNodeIds.add(source);
    highlightedNodeIds.add(target);
    consecutiveNodePairs.add(`${source}__${target}`);
    consecutiveNodePairs.add(`${target}__${source}`);
    return {
      hasHighlight: true,
      highlightedNodeIds,
      consecutiveNodePairs,
      startNode: source,
      endNode: target,
    };
  }

  return {
    hasHighlight: false,
    highlightedNodeIds,
    consecutiveNodePairs,
    startNode: null,
    endNode: null,
  };
}
