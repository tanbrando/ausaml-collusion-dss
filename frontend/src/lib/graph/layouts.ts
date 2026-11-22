/**
 * Thuật toán bố cục đồ thị dị thể AML (Single Responsibility).
 * Tinh chỉnh theo review lần 3 (chỉ chạy layout trên các phần tử đang hiển thị `:visible`):
 * - COSE: `nodeRepulsion: 20000`, `idealEdgeLength: 90`, `gravity: 1.2`, `componentSpacing: 60`, `nodeOverlap: 20`, `numIter: 1500`
 * - Đồng tâm (Concentric): Đặt cặp đỉnh đang điều tra / node mục tiêu ở tâm (hop = 0),
 *   các vòng ngoài xếp theo khoảng cách bước nhảy BFS `concentric: n => 100 - hopFromTarget(n) * 25`, `minNodeSpacing: 30`.
 * - Phân tầng AML (Barycenter Tiered Preset): Chia tầng theo loại node (Customer Nguồn -> Account -> Device/IP/Benef -> Customer Đích)
 *   và sắp thứ tự ngang trong từng hàng bằng trung bình vị trí hàng xóm (Barycenter Heuristic) để giảm tối đa đường cắt chéo.
 */

import type { Core, NodeSingular } from "cytoscape";
import type { CytoscapeGraphPayload, NodeType } from "@/types/contract";

export type LayoutMode = "cose" | "concentric" | "breadthfirst";

interface PositionMap {
  [nodeId: string]: { x: number; y: number };
}

/**
 * Tính khoảng cách bước nhảy BFS từ tập đỉnh trọng tâm (cặp đang chọn hoặc đỉnh mục tiêu bậc cao nhất)
 * trên các cạnh đang hiển thị.
 */
function computeHopFromTargets(
  visibleNodeIds: Set<string>,
  adjacency: Map<string, string[]>,
  focusNodeIds: Set<string>
): Map<string, number> {
  const hops = new Map<string, number>();
  const queue: string[] = [];

  for (const id of focusNodeIds) {
    if (visibleNodeIds.has(id)) {
      hops.set(id, 0);
      queue.push(id);
    }
  }

  // Nếu chưa có đỉnh trọng tâm, chọn tối đa 2 khách hàng có nhiều kết nối nhất làm tâm
  if (queue.length === 0) {
    const sortedByDeg = [...visibleNodeIds].sort(
      (a, b) =>
        (adjacency.get(b)?.length ?? 0) - (adjacency.get(a)?.length ?? 0)
    );
    for (const id of sortedByDeg.slice(0, 2)) {
      hops.set(id, 0);
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currHop = hops.get(curr) ?? 0;
    for (const nb of adjacency.get(curr) ?? []) {
      if (!visibleNodeIds.has(nb)) continue;
      if (!hops.has(nb)) {
        hops.set(nb, currHop + 1);
        queue.push(nb);
      }
    }
  }

  for (const id of visibleNodeIds) {
    if (!hops.has(id)) {
      hops.set(id, 3);
    }
  }

  return hops;
}

/**
 * Phân tầng AML kèm sắp xếp thứ tự ngang bằng Barycenter Heuristic (trung bình chỉ số cột của hàng xóm)
 * để các đỉnh có liên kết nằm thẳng trục dọc với nhau, giảm tối đa cạnh cắt chéo.
 */
export function computeBarycenterTieredPositions(
  visibleNodes: Array<{ id: string; node_type: NodeType }>,
  visibleEdges: Array<{
    source: string;
    target: string;
    edge_category: string;
  }>,
  focusNodeIds: Set<string>
): PositionMap {
  const positions: PositionMap = {};
  if (visibleNodes.length === 0) return positions;

  const adjacency = new Map<string, string[]>();
  for (const n of visibleNodes) {
    adjacency.set(n.id, []);
  }

  const predSources = new Set<string>();
  const predTargets = new Set<string>();

  for (const e of visibleEdges) {
    adjacency.get(e.source)?.push(e.target);
    adjacency.get(e.target)?.push(e.source);
    if (
      e.edge_category === "PREDICTED_LINK" ||
      e.edge_category === "CONFIRMED_LINK"
    ) {
      if (!predTargets.has(e.source)) predSources.add(e.source);
      if (!predSources.has(e.target)) predTargets.add(e.target);
    }
  }

  const customers = visibleNodes.filter((n) => n.node_type === "customer");
  const accounts = visibleNodes.filter((n) => n.node_type === "account");
  const bridges = visibleNodes.filter(
    (n) => n.node_type !== "customer" && n.node_type !== "account"
  );

  const tierTop: string[] = [];
  const tierBottom: string[] = [];

  // Đưa các đỉnh thuộc cặp/đường đi đang chọn về trung tâm của tầng trên và tầng dưới
  customers.forEach((c, idx) => {
    if (predSources.has(c.id) && !predTargets.has(c.id)) {
      tierTop.push(c.id);
    } else if (predTargets.has(c.id) && !predSources.has(c.id)) {
      tierBottom.push(c.id);
    } else if (idx % 2 === 0) {
      tierTop.push(c.id);
    } else {
      tierBottom.push(c.id);
    }
  });

  const tiers: string[][] = [
    tierTop,
    accounts.map((a) => a.id),
    bridges.map((b) => b.id),
    tierBottom,
  ].filter((t) => t.length > 0);

  // Khởi tạo tọa độ X ban đầu (ưu tiên đỉnh đang chọn nằm gần tâm x = 0)
  const xOrder = new Map<string, number>();
  for (const tier of tiers) {
    tier.sort((a, b) => {
      const fa = focusNodeIds.has(a) ? 0 : 1;
      const fb = focusNodeIds.has(b) ? 0 : 1;
      return (
        fa - fb ||
        (adjacency.get(b)?.length ?? 0) - (adjacency.get(a)?.length ?? 0)
      );
    });
    tier.forEach((id, idx) => xOrder.set(id, idx));
  }

  // Lặp 4 lượt Barycenter (trên-xuống & dưới-lên) để gỡ chéo cạnh
  for (let iter = 0; iter < 4; iter += 1) {
    for (let t = 1; t < tiers.length; t += 1) {
      const tier = tiers[t];
      const scores = new Map<string, number>();
      tier.forEach((id, idx) => {
        const nbs = (adjacency.get(id) ?? []).filter((nb) => xOrder.has(nb));
        if (nbs.length === 0) {
          scores.set(id, idx);
        } else {
          const avg =
            nbs.reduce((sum, nb) => sum + (xOrder.get(nb) ?? 0), 0) /
            nbs.length;
          scores.set(id, avg);
        }
      });
      tier.sort((a, b) => (scores.get(a) ?? 0) - (scores.get(b) ?? 0));
      tier.forEach((id, idx) => xOrder.set(id, idx));
    }

    for (let t = tiers.length - 2; t >= 0; t -= 1) {
      const tier = tiers[t];
      const scores = new Map<string, number>();
      tier.forEach((id, idx) => {
        const nbs = (adjacency.get(id) ?? []).filter((nb) => xOrder.has(nb));
        if (nbs.length === 0) {
          scores.set(id, idx);
        } else {
          const avg =
            nbs.reduce((sum, nb) => sum + (xOrder.get(nb) ?? 0), 0) /
            nbs.length;
          scores.set(id, avg);
        }
      });
      tier.sort((a, b) => (scores.get(a) ?? 0) - (scores.get(b) ?? 0));
      tier.forEach((id, idx) => xOrder.set(id, idx));
    }
  }

  const X_GAP = 115;
  const Y_GAP = 120;
  const totalHeight = (tiers.length - 1) * Y_GAP;
  const startY = -totalHeight / 2;

  tiers.forEach((tier, rowIdx) => {
    const rowWidth = (tier.length - 1) * X_GAP;
    const startX = -rowWidth / 2;
    const y = startY + rowIdx * Y_GAP;

    tier.forEach((id, colIdx) => {
      positions[id] = {
        x: Math.round(startX + colIdx * X_GAP),
        y: Math.round(y),
      };
    });
  });

  return positions;
}

/**
 * Chạy bố cục chỉ trên các phần tử đang hiển thị (`:visible`) rồi `cy.fit(visibleEls, 40)`.
 */
export function applyGraphLayout(
  cy: Core,
  _graph: CytoscapeGraphPayload,
  mode: LayoutMode,
  animate = false,
  focusNodeIds: Set<string> = new Set()
): void {
  const visibleEls = cy.elements(":visible");
  if (visibleEls.empty()) return;

  const visibleNodeIds = new Set<string>();
  const visibleNodes: Array<{ id: string; node_type: NodeType }> = [];
  const adjacency = new Map<string, string[]>();

  visibleEls.nodes().forEach((n) => {
    visibleNodeIds.add(n.id());
    visibleNodes.push({
      id: n.id(),
      node_type: n.data("node_type") as NodeType,
    });
    adjacency.set(n.id(), []);
  });

  const visibleEdges: Array<{
    source: string;
    target: string;
    edge_category: string;
  }> = [];

  visibleEls.edges().forEach((e) => {
    const s = e.source().id();
    const t = e.target().id();
    if (visibleNodeIds.has(s) && visibleNodeIds.has(t)) {
      visibleEdges.push({
        source: s,
        target: t,
        edge_category: e.data("edge_category") as string,
      });
      adjacency.get(s)?.push(t);
      adjacency.get(t)?.push(s);
    }
  });

  if (mode === "concentric") {
    const hopMap = computeHopFromTargets(
      visibleNodeIds,
      adjacency,
      focusNodeIds
    );
    const layout = visibleEls.layout({
      name: "concentric",
      animate,
      animationDuration: 260,
      fit: true,
      padding: 40,
      minNodeSpacing: 32,
      avoidOverlap: true,
      concentric: (node: NodeSingular) =>
        100 - (hopMap.get(node.id()) ?? 3) * 25,
      levelWidth: () => 20,
    });
    layout.run();
    return;
  }

  if (mode === "breadthfirst") {
    const positions = computeBarycenterTieredPositions(
      visibleNodes,
      visibleEdges,
      focusNodeIds
    );
    const layout = visibleEls.layout({
      name: "preset",
      positions,
      animate,
      animationDuration: 260,
      fit: true,
      padding: 40,
    });
    layout.run();
    return;
  }

  // COSE gọn & thoáng theo thông số chuẩn
  const layout = visibleEls.layout({
    name: "cose",
    animate: false,
    fit: true,
    padding: 40,
    nodeRepulsion: () => 20000,
    idealEdgeLength: () => 90,
    gravity: 1.2,
    componentSpacing: 60,
    nodeOverlap: 20,
    numIter: 1500,
  });
  layout.run();
  cy.fit(visibleEls, 40);
}
