/**
 * Thuật toán bố cục đồ thị dị thể AML (Single Responsibility).
 * Kết hợp đầy đủ Review lần 3 + lần 4 từ file tham khảo `layouts.ts`:
 * - COSE: cạnh nối với đỉnh trọng tâm dài hơn (`150` vs `100`), kèm bước hậu xử lý chống dính nút
 *   `enforceMinNodeDistance` (đảm bảo mọi đỉnh trọng tâm cách nhau >= 120px, đỉnh thường >= 82px)
 *   để khi zoom vào Bridge Path các nhãn `CUST_...`, `ACC_...`, `OWNS`, `USES_DEVICE` không bao giờ đè lên nhau.
 * - Đồng tâm (Concentric): Đặt cặp đỉnh đang điều tra ở tâm (hop = 0), các vòng ngoài xếp theo BFS hop, `minNodeSpacing: 36`.
 * - Phân tầng AML (Barycenter Tiered Preset): Sắp thứ tự ngang bằng Barycenter Heuristic và ngắt tầng quá 8 đỉnh thành nhiều hàng (`MAX_PER_ROW = 8`).
 */

import type { CollectionReturnValue, Core, EdgeSingular, NodeSingular } from "cytoscape";
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
 * và ngắt tầng > 8 đỉnh thành nhiều hàng (`MAX_PER_ROW = 8`).
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

  const X_GAP = 120;
  const Y_GAP = 120;
  const MAX_PER_ROW = 8;

  // Ngắt tầng dài thành nhiều hàng (giữ nguyên thứ tự Barycenter) để đồ thị không bị kéo giãn theo chiều ngang
  const rows: string[][] = [];
  for (const tier of tiers) {
    for (let i = 0; i < tier.length; i += MAX_PER_ROW) {
      rows.push(tier.slice(i, i + MAX_PER_ROW));
    }
  }

  const totalHeight = (rows.length - 1) * Y_GAP;
  const startY = -totalHeight / 2;

  rows.forEach((tier, rowIdx) => {
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
 * Hậu xử lý chống chồng lấp sau COSE:
 * Đẩy các cặp đỉnh bị xếp quá gần nhau (đặc biệt là các đỉnh thuộc Bridge Path đang chọn)
 * để nhãn đỉnh và nhãn cạnh nằm ngang (`OWNS`, `USES_DEVICE`, `99.9%`) luôn có đủ khoảng trống.
 */
function enforceMinNodeDistance(
  cy: Core,
  visibleEls: CollectionReturnValue,
  focusNodeIds: Set<string>
): void {
  const nodes = visibleEls.nodes().toArray();
  if (nodes.length <= 1) return;

  const coords = nodes.map((n) => ({
    node: n,
    id: n.id(),
    isFocus: focusNodeIds.has(n.id()),
    x: n.position("x"),
    y: n.position("y"),
  }));

  const BASE_MIN_DIST = 82;
  const FOCUS_MIN_DIST = 122;

  for (let iter = 0; iter < 14; iter += 1) {
    let moved = false;
    for (let i = 0; i < coords.length; i += 1) {
      for (let j = i + 1; j < coords.length; j += 1) {
        const a = coords[i];
        const b = coords[j];
        const minDist =
          a.isFocus || b.isFocus ? FOCUS_MIN_DIST : BASE_MIN_DIST;

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);

        if (dist < 1) {
          dx = (i - j) * 5;
          dy = ((i + j) % 2 === 0 ? 1 : -1) * 5;
          dist = Math.hypot(dx, dy);
        }

        if (dist < minDist) {
          const push = ((minDist - dist) / dist) * 0.52;
          const ox = dx * push;
          const oy = dy * push;
          a.x -= ox;
          a.y -= oy;
          b.x += ox;
          b.y += oy;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  cy.batch(() => {
    for (const item of coords) {
      item.node.position({
        x: Math.round(item.x),
        y: Math.round(item.y),
      });
    }
  });
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
      minNodeSpacing: 36,
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

  // COSE gọn & thoáng theo thông số chuẩn + cạnh nối đỉnh trọng tâm dài hơn (150px)
  const layout = visibleEls.layout({
    name: "cose",
    animate: false,
    fit: true,
    padding: 40,
    nodeRepulsion: () => 32000,
    idealEdgeLength: (edge: EdgeSingular) =>
      focusNodeIds.has(edge.source().id()) ||
      focusNodeIds.has(edge.target().id())
        ? 150
        : 95,
    gravity: 1.0,
    componentSpacing: 65,
    nodeOverlap: 24,
    numIter: 1500,
  });
  layout.run();
  enforceMinNodeDistance(cy, visibleEls, focusNodeIds);
  cy.fit(visibleEls, 40);
}
