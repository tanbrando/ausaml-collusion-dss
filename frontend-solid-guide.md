# Hướng dẫn xây dựng giao diện Clean theo SOLID (Next.js + TypeScript)

Tài liệu cho Module 3 & 4 (Frontend): 4 trang `/`, `/workspace`, `/benchmark`, `/audit`.
Có kèm **một mẫu chạy được** cho phần khó nhất: Workspace (store + lọc realtime + Cytoscape).

---

## 1. Cấu trúc thư mục: tách 4 lớp

```
src/
├─ app/                      # Chỉ routing + ghép trang (mỏng)
│  ├─ layout.tsx
│  ├─ page.tsx
│  ├─ workspace/page.tsx
│  ├─ benchmark/page.tsx
│  └─ audit/page.tsx
├─ features/                 # Mỗi tính năng là 1 module độc lập
│  ├─ cases/        (CaseList, UploadCaseForm, GateCheckReport, useCases)
│  ├─ workspace/    (InferenceSidebar, CytoscapeCanvas, RankingTable, EvidenceDrawer,
│  │                 useInference, useWorkspaceStore)
│  ├─ benchmark/    (BenchmarkCharts, SeedTable, HardNegativeTable)
│  └─ audit/        (FeedbackTable, AuditLogList, ExportActions)
├─ components/ui/            # Thành phần thuần hiển thị: Card, Badge, Button, Slider, Skeleton
├─ lib/
│  ├─ api/          (types.ts, client.ts, cases.api.ts, predict.api.ts, feedback.api.ts)
│  ├─ graph/        (nodeStyles.ts, edgeStyles.ts, filters.ts)
│  └─ format.ts     # formatPercent, formatDate
├─ types/           # Case, Prediction, EvidencePath, Feedback...
└─ styles/tokens.css
```

**Quy tắc:** `app` ghép trang → `features` xử lý nghiệp vụ UI → `components/ui` hiển thị thuần → `lib` gọi API và logic thuần.
Chiều phụ thuộc chỉ đi một hướng: `app → features → components/ui → lib/types`. `lib` không bao giờ import từ `features`.

---

## 2. Áp dụng SOLID

### S – Single Responsibility
Mỗi file chỉ có một lý do để thay đổi.

- `CytoscapeCanvas` chỉ vẽ đồ thị.
- Việc lọc threshold / dismissed / lớp thực thể nằm ở hàm thuần `filterElements()`.
- Việc gọi API nằm trong hook (`useInference`), không nằm trong component.

### O – Open/Closed
Thêm lớp thực thể hay mô hình mới chỉ cần **thêm cấu hình**, không sửa logic.

```ts
// lib/graph/nodeStyles.ts
export const NODE_VISUAL_STYLES: Record<NodeType, NodeStyle> = {
  Customer: { shape: "ellipse", color: "#4f8cff", label: "Khách hàng" },
  Device:   { shape: "rectangle", color: "#f59e0b", label: "Thiết bị" },
  // thêm loại mới = thêm 1 dòng
};
```

Badge rủi ro/trạng thái dùng map cấu hình thay vì chuỗi `if/else`.

### L – Liskov
Component cùng vai trò thay thế được nhau. `RiskBadge` và `StatusBadge` chỉ là wrapper của `Badge`, không đổi hợp đồng props. Các biểu đồ Recharts dùng chung `ChartProps<T>`.

### I – Interface Segregation
Props nhỏ, đúng nhu cầu. Không truyền cả object `result`.

```ts
// Tệ:  <RankingTable result={result} />
// Tốt:
interface RankingTableProps {
  pairs: RankedPair[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}
```

### D – Dependency Inversion
Component không biết `fetch` hay URL. Phụ thuộc vào interface, inject implementation (mục 6 có mẫu).

---

## 3. MẪU CODE: Workspace (điểm dễ rối nhất)

### 3.1 Types

```ts
// types/graph.ts
export type NodeType =
  | "Customer" | "Account" | "Device" | "IP" | "Merchant" | "Phone";

export type EdgeKind = "OBSERVED_EDGE" | "PREDICTED_LINK" | "CONFIRMED_LINK";
export type ReviewStatus = "PENDING" | "CONFIRMED" | "DISMISSED";
export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  isTarget?: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  probability?: number;     // chỉ có với PREDICTED_LINK / CONFIRMED_LINK
  pairId?: string;          // liên kết với dòng trong bảng xếp hạng
  pathIds?: string[];       // các bridge path chứa cạnh này
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
```

### 3.2 Cấu hình hiển thị (Open/Closed)

```ts
// lib/graph/nodeStyles.ts
import type { NodeType } from "@/types/graph";

export interface NodeStyle {
  shape: "ellipse" | "rectangle" | "diamond" | "triangle" | "hexagon" | "round-rectangle";
  color: string;
  label: string;
}

export const NODE_VISUAL_STYLES: Record<NodeType, NodeStyle> = {
  Customer: { shape: "ellipse",         color: "#4f8cff", label: "Khách hàng" },
  Account:  { shape: "round-rectangle", color: "#22c55e", label: "Tài khoản" },
  Device:   { shape: "rectangle",       color: "#f59e0b", label: "Thiết bị" },
  IP:       { shape: "diamond",         color: "#a78bfa", label: "Địa chỉ IP" },
  Merchant: { shape: "hexagon",         color: "#14b8a6", label: "Merchant" },
  Phone:    { shape: "triangle",        color: "#94a3b8", label: "Số điện thoại" },
};

export const ALL_NODE_TYPES = Object.keys(NODE_VISUAL_STYLES) as NodeType[];
```

### 3.3 Hàm lọc thuần (Single Responsibility, dễ test)

```ts
// lib/graph/filters.ts
import type { GraphData, NodeType } from "@/types/graph";

export interface FilterOptions {
  threshold: number;
  dismissedPairIds: ReadonlySet<string>;
  visibleTypes: ReadonlySet<NodeType>;
}

export interface VisibilityResult {
  hiddenNodeIds: Set<string>;
  hiddenEdgeIds: Set<string>;
}

/** Trả về tập id cần ẩn. Không đụng đến DOM hay Cytoscape. */
export function computeVisibility(
  graph: GraphData,
  { threshold, dismissedPairIds, visibleTypes }: FilterOptions,
): VisibilityResult {
  const hiddenNodeIds = new Set<string>();
  for (const n of graph.nodes) {
    // Node mục tiêu luôn hiển thị để không mất ngữ cảnh
    if (!n.isTarget && !visibleTypes.has(n.type)) hiddenNodeIds.add(n.id);
  }

  const hiddenEdgeIds = new Set<string>();
  for (const e of graph.edges) {
    const endpointHidden =
      hiddenNodeIds.has(e.source) || hiddenNodeIds.has(e.target);

    const belowThreshold =
      e.kind === "PREDICTED_LINK" && (e.probability ?? 0) < threshold;

    const dismissed =
      e.kind === "PREDICTED_LINK" && !!e.pairId && dismissedPairIds.has(e.pairId);

    if (endpointHidden || belowThreshold || dismissed) hiddenEdgeIds.add(e.id);
  }

  return { hiddenNodeIds, hiddenEdgeIds };
}
```

Test nhanh (không cần trình duyệt):

```ts
import { computeVisibility } from "./filters";

test("ẩn cạnh dự đoán dưới threshold", () => {
  const graph = {
    nodes: [{ id: "a", type: "Customer", label: "A" }, { id: "b", type: "Customer", label: "B" }],
    edges: [{ id: "e1", source: "a", target: "b", kind: "PREDICTED_LINK", probability: 0.3 }],
  } as const;
  const r = computeVisibility(graph as any, {
    threshold: 0.5, dismissedPairIds: new Set(), visibleTypes: new Set(["Customer"]),
  });
  expect(r.hiddenEdgeIds.has("e1")).toBe(true);
});
```

### 3.4 Store — một nguồn sự thật cho đồng bộ 3 chiều

```ts
// features/workspace/useWorkspaceStore.ts
import { create } from "zustand";
import { ALL_NODE_TYPES } from "@/lib/graph/nodeStyles";
import type { NodeType } from "@/types/graph";

interface WorkspaceState {
  selectedPairId: string | null;
  highlightedPathId: string | null;
  threshold: number;
  visibleTypes: Set<NodeType>;
  dismissedPairIds: Set<string>;

  selectPair: (id: string | null) => void;
  highlightPath: (id: string | null) => void;
  clearHighlight: () => void;
  setThreshold: (v: number) => void;
  toggleType: (t: NodeType) => void;
  markDismissed: (pairId: string) => void;
  reset: () => void;
}

const initial = {
  selectedPairId: null,
  highlightedPathId: null,
  threshold: 0.5,
  visibleTypes: new Set<NodeType>(ALL_NODE_TYPES),
  dismissedPairIds: new Set<string>(),
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  ...initial,

  selectPair: (id) => set({ selectedPairId: id, highlightedPathId: null }),
  highlightPath: (id) => set({ highlightedPathId: id }),
  clearHighlight: () => set({ selectedPairId: null, highlightedPathId: null }),
  setThreshold: (v) => set({ threshold: v }),

  toggleType: (t) =>
    set((s) => {
      const next = new Set(s.visibleTypes);
      next.has(t) ? next.delete(t) : next.add(t);
      return { visibleTypes: next };
    }),

  markDismissed: (pairId) =>
    set((s) => ({ dismissedPairIds: new Set(s.dismissedPairIds).add(pairId) })),

  reset: () => set({ ...initial, visibleTypes: new Set(ALL_NODE_TYPES), dismissedPairIds: new Set() }),
}));
```

Ba khối (đồ thị, bảng, danh sách path) **chỉ đọc/ghi store**, không gọi nhau trực tiếp:

| Hành động | Ghi vào store | Ai phản ứng |
|---|---|---|
| Click cạnh trên đồ thị | `selectPair(pairId)` | Bảng highlight dòng, Drawer mở bằng chứng |
| Click dòng bảng | `selectPair(pairId)` | Đồ thị làm nổi cạnh, Drawer cập nhật |
| Click path ở cột phải | `highlightPath(pathId)` | Đồ thị làm mờ nền, nổi chuỗi path |
| Kéo slider | `setThreshold(v)` | Đồ thị ẩn/hiện cạnh, bảng lọc dòng |

### 3.5 CytoscapeCanvas (chỉ vẽ, nhận props nhỏ)

```tsx
// features/workspace/CytoscapeCanvas.tsx
"use client";

import { useEffect, useRef } from "react";
import cytoscape, { type Core } from "cytoscape";
import { NODE_VISUAL_STYLES } from "@/lib/graph/nodeStyles";
import { computeVisibility, type FilterOptions } from "@/lib/graph/filters";
import type { GraphData } from "@/types/graph";

interface Props {
  graph: GraphData;
  filter: FilterOptions;
  selectedPairId: string | null;
  highlightedPathId: string | null;
  onSelectPair: (pairId: string) => void;
  onClearHighlight: () => void;
}

export function CytoscapeCanvas({
  graph, filter, selectedPairId, highlightedPathId, onSelectPair, onClearHighlight,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  // 1) Dựng đồ thị: CHỈ khi dữ liệu graph đổi (không chạy khi kéo slider)
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: [
        ...graph.nodes.map((n) => ({
          data: { id: n.id, label: n.label, type: n.type, isTarget: !!n.isTarget },
        })),
        ...graph.edges.map((e) => ({
          data: {
            id: e.id, source: e.source, target: e.target, kind: e.kind,
            pairId: e.pairId, pathIds: e.pathIds ?? [],
            label:
              e.kind === "PREDICTED_LINK" ? `${Math.round((e.probability ?? 0) * 100)}%`
              : e.kind === "CONFIRMED_LINK" ? "✓" : "",
          },
        })),
      ],
      style: [
        { selector: "node", style: { label: "data(label)", "font-size": 10, color: "#e6e9f2" } },
        ...Object.entries(NODE_VISUAL_STYLES).map(([type, s]) => ({
          selector: `node[type = "${type}"]`,
          style: { shape: s.shape, "background-color": s.color },
        })),
        { selector: "node[?isTarget]", style: { "border-width": 3, "border-color": "#ef4444" } },
        { selector: "edge", style: { width: 1.5, "line-color": "#475569", label: "data(label)", "font-size": 9, color: "#e6e9f2" } },
        { selector: 'edge[kind = "PREDICTED_LINK"]', style: { "line-style": "dashed", "line-color": "#f59e0b" } },
        { selector: 'edge[kind = "CONFIRMED_LINK"]', style: { width: 3.5, "line-color": "#ef4444" } },
        { selector: ".faded", style: { opacity: 0.12 } },
        { selector: ".focus", style: { opacity: 1, width: 4 } },
      ],
      layout: { name: "cose", animate: false },
    });

    cy.on("tap", "edge", (evt) => {
      const pairId = evt.target.data("pairId");
      if (pairId) onSelectPair(pairId);
    });
    cy.on("tap", (evt) => { if (evt.target === cy) onClearHighlight(); });

    cyRef.current = cy;
    return () => { cy.destroy(); cyRef.current = null; };
  }, [graph, onSelectPair, onClearHighlight]);

  // 2) Lọc realtime: chỉ đổi display, KHÔNG dựng lại, KHÔNG chạy lại layout
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const { hiddenNodeIds, hiddenEdgeIds } = computeVisibility(graph, filter);
    cy.batch(() => {
      cy.nodes().forEach((n) => n.style("display", hiddenNodeIds.has(n.id()) ? "none" : "element"));
      cy.edges().forEach((e) => e.style("display", hiddenEdgeIds.has(e.id()) ? "none" : "element"));
    });
  }, [graph, filter]);

  // 3) Highlight path / cặp đang chọn: làm mờ nền
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass("faded focus");
      let focus = cy.collection();
      if (highlightedPathId) {
        focus = cy.edges().filter((e) => (e.data("pathIds") as string[]).includes(highlightedPathId));
      } else if (selectedPairId) {
        focus = cy.edges().filter((e) => e.data("pairId") === selectedPairId);
      }
      if (focus.nonempty()) {
        const keep = focus.union(focus.connectedNodes());
        cy.elements().not(keep).addClass("faded");
        focus.addClass("focus");
      }
    });
  }, [highlightedPathId, selectedPairId]);

  return <div ref={containerRef} className="h-full w-full" aria-label="Đồ thị dị thể" />;
}
```

> Lưu ý: truyền `filter` là object mới mỗi lần render sẽ làm effect 2 chạy lại. Hãy `useMemo` object này ở nơi ghép (mục 3.6).

### 3.6 Ghép trang Workspace (mỏng)

```tsx
// app/workspace/page.tsx
"use client";

import { useMemo, useDeferredValue } from "react";
import { useWorkspaceStore } from "@/features/workspace/useWorkspaceStore";
import { CytoscapeCanvas } from "@/features/workspace/CytoscapeCanvas";
import { useInference } from "@/features/workspace/useInference";
import { AsyncBoundary } from "@/components/ui/AsyncBoundary";

export default function WorkspacePage() {
  const s = useWorkspaceStore();
  const deferredThreshold = useDeferredValue(s.threshold); // slider mượt
  const inference = useInference();                        // TanStack Query bên trong

  const filter = useMemo(
    () => ({
      threshold: deferredThreshold,
      dismissedPairIds: s.dismissedPairIds,
      visibleTypes: s.visibleTypes,
    }),
    [deferredThreshold, s.dismissedPairIds, s.visibleTypes],
  );

  return (
    <div className="grid h-[calc(100vh-64px)] grid-cols-[300px_1fr_380px] gap-4 p-4">
      {/* <InferenceSidebar .../> */}
      <section className="grid grid-rows-[3fr_2fr] gap-4 min-h-0">
        <AsyncBoundary query={inference.query} empty="Chưa chạy suy luận. Chọn mô hình và nhấn Chạy.">
          {(result) => (
            <CytoscapeCanvas
              graph={result.graph}
              filter={filter}
              selectedPairId={s.selectedPairId}
              highlightedPathId={s.highlightedPathId}
              onSelectPair={s.selectPair}
              onClearHighlight={s.clearHighlight}
            />
          )}
        </AsyncBoundary>
        {/* <RankingTable pairs=... selectedId=... onSelect={s.selectPair} /> */}
      </section>
      {/* <EvidenceDrawer pair=... /> */}
    </div>
  );
}
```

---

## 4. Design system để nhìn "clean"

### 4.1 Token (định nghĩa một lần)

```css
/* styles/tokens.css */
:root {
  --bg: #0b1020;
  --surface: #131a2e;
  --surface-2: #1a2340;
  --border: #232c47;
  --text: #e6e9f2;
  --muted: #8b94b3;

  --primary: #4f8cff;
  --risk-high: #ef4444;
  --risk-medium: #f59e0b;
  --risk-low: #64748b;
  --ok: #22c55e;

  --radius: 12px;
  --space: 8px;

  --fs-xs: 12px; --fs-sm: 14px; --fs-md: 16px; --fs-lg: 20px;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: Inter, system-ui, sans-serif;
  font-size: var(--fs-sm);
}
.num { font-variant-numeric: tabular-nums; }
```

### 4.2 Card, Badge (Liskov: RiskBadge/StatusBadge là wrapper)

```tsx
// components/ui/Card.tsx
import type { ReactNode } from "react";

interface CardProps { title?: string; action?: ReactNode; children: ReactNode; className?: string }

export function Card({ title, action, children, className = "" }: CardProps) {
  return (
    <div className={`flex min-h-0 flex-col rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] ${className}`}>
      {title && (
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h3 className="text-[var(--fs-sm)] font-semibold">{title}</h3>
          {action}
        </header>
      )}
      <div className="min-h-0 flex-1 p-4">{children}</div>
    </div>
  );
}
```

```tsx
// components/ui/Badge.tsx
export type BadgeVariant = "danger" | "warning" | "neutral" | "success" | "info";

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  danger:  "bg-red-500/15 text-red-400",
  warning: "bg-amber-500/15 text-amber-400",
  neutral: "bg-slate-500/15 text-slate-400",
  success: "bg-green-500/15 text-green-400",
  info:    "bg-blue-500/15 text-blue-400",
};

export function Badge({ variant, children }: { variant: BadgeVariant; children: React.ReactNode }) {
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-[var(--fs-xs)] font-medium ${VARIANT_CLASS[variant]}`}>
      {children}
    </span>
  );
}
```

```tsx
// features/workspace/badges.tsx
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import type { RiskLevel, ReviewStatus } from "@/types/graph";

const RISK_VARIANT: Record<RiskLevel, BadgeVariant> = { HIGH: "danger", MEDIUM: "warning", LOW: "neutral" };
const STATUS_VARIANT: Record<ReviewStatus, BadgeVariant> = { PENDING: "info", CONFIRMED: "danger", DISMISSED: "neutral" };

export const RiskBadge = ({ level }: { level: RiskLevel }) => <Badge variant={RISK_VARIANT[level]}>{level}</Badge>;
export const StatusBadge = ({ status }: { status: ReviewStatus }) => <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
```

### 4.3 Checklist thẩm mỹ

- **Một font** (Inter), 4 cỡ chữ cố định; số liệu dùng `tabular-nums`.
- **Lưới 8px**, mỗi khối là một `Card` cùng padding, viền mảnh.
- **Màu có ngữ nghĩa**: đỏ chỉ cho HIGH/CONFIRMED, cam cho MEDIUM; không dùng màu trang trí.
- **Tối đa 1 màu nhấn** (`--primary`); còn lại là xám trung tính.
- Workspace: `grid-cols-[300px_1fr_380px]`, đồ thị cao cố định, bảng cuộn nội bộ, không cuộn cả trang.

---

## 5. Các trạng thái làm giao diện "hoàn thiện"

Mỗi khối dữ liệu cần đủ 4 trạng thái, gói trong một component dùng chung (Dependency Inversion: nhận `query` trừu tượng, không biết API cụ thể).

```tsx
// components/ui/AsyncBoundary.tsx
import type { ReactNode } from "react";

interface QueryLike<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

interface Props<T> {
  query: QueryLike<T>;
  children: (data: T) => ReactNode;
  skeleton?: ReactNode;
  empty?: string;
  isEmpty?: (data: T) => boolean;
}

export function AsyncBoundary<T>({ query, children, skeleton, empty = "Chưa có dữ liệu", isEmpty }: Props<T>) {
  if (query.isLoading) return <>{skeleton ?? <div className="h-full animate-pulse rounded-lg bg-[var(--surface-2)]" />}</>;

  if (query.isError)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--muted)]">
        <p>Không tải được dữ liệu.</p>
        <button className="rounded-md bg-[var(--primary)] px-3 py-1 text-white" onClick={query.refetch}>Thử lại</button>
      </div>
    );

  if (query.data === undefined || (isEmpty && isEmpty(query.data)))
    return <div className="flex h-full items-center justify-center text-[var(--muted)]">{empty}</div>;

  return <>{children(query.data)}</>;
}
```

Bổ sung:

- Nút **Chạy Suy Luận** có trạng thái loading/disabled, chống bấm đúp.
- **Toast** khi Confirm/Dismiss; **confirm dialog** trước khi Bác bỏ.
- **Tooltip** giải thích viết tắt: τ, Hits@10, FPR@τ, AP, ROC-AUC.
- Phím tắt: `Esc` bỏ highlight.
- `@media print` ẩn sidebar/navbar cho trang `/audit`:

```css
@media print {
  nav, aside, .no-print { display: none !important; }
  body { background: #fff; color: #000; }
}
```

---

## 6. Dependency Inversion cho tầng API

```ts
// lib/api/types.ts
import type { CaseSummary, CaseMeta, GateCheckResult } from "@/types/case";

export interface CaseRepository {
  list(): Promise<CaseSummary[]>;
  upload(file: File, meta: CaseMeta): Promise<GateCheckResult>;
}
```

```ts
// lib/api/cases.api.ts  → implement bằng fetch
import type { CaseRepository } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const httpCaseRepository: CaseRepository = {
  async list() {
    const res = await fetch(`${BASE}/cases`);
    if (!res.ok) throw new Error("Không tải được danh sách vụ án");
    return res.json();
  },
  async upload(file, meta) {
    const form = new FormData();
    form.append("file", file);
    form.append("name", meta.name);
    form.append("description", meta.description ?? "");
    const res = await fetch(`${BASE}/cases/upload`, { method: "POST", body: form });
    if (!res.ok) throw new Error("Upload thất bại");
    return res.json();
  },
};
```

```ts
// lib/api/cases.mock.ts  → implement bằng dữ liệu giả (demo offline / test)
import type { CaseRepository } from "./types";

export const mockCaseRepository: CaseRepository = {
  list: async () => [
    { id: "case-1", name: "Vụ án mẫu 1", source: "SAMPLE", customers: 50000, nodes: 120000, edges: 560000, gatePassed: true },
  ],
  upload: async () => ({ passed: true, warnings: [], errors: [] } as any),
};
```

```tsx
// lib/api/RepositoryProvider.tsx  → inject qua Context
"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { CaseRepository } from "./types";
import { httpCaseRepository } from "./cases.api";
import { mockCaseRepository } from "./cases.mock";

const Ctx = createContext<{ cases: CaseRepository }>({ cases: httpCaseRepository });

export function RepositoryProvider({ children }: { children: ReactNode }) {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "1";
  return <Ctx.Provider value={{ cases: useMock ? mockCaseRepository : httpCaseRepository }}>{children}</Ctx.Provider>;
}
export const useRepositories = () => useContext(Ctx);
```

```ts
// features/cases/useCases.ts  → hook chỉ biết interface
import { useQuery } from "@tanstack/react-query";
import { useRepositories } from "@/lib/api/RepositoryProvider";

export function useCases() {
  const { cases } = useRepositories();
  return useQuery({ queryKey: ["cases"], queryFn: () => cases.list() });
}
```

Đổi backend hoặc demo offline chỉ cần đặt `NEXT_PUBLIC_USE_MOCK=1`, không sửa UI.

---

## 7. Mẹo riêng từng thư viện

- **Cytoscape**: giữ instance trong `useRef`; cập nhật bằng `cy.batch()`; lọc bằng `style('display','none')` thay vì dựng lại; **không** chạy lại layout khi chỉ kéo slider (chỉ chạy khi bấm "Chạy lại layout").
- **Slider threshold**: `useDeferredValue` hoặc debounce ~50ms.
- **Recharts**: bọc `ResponsiveContainer`, màu lấy từ token, tooltip là component riêng.
- **Bảng lớn**: `React.memo` cho row; virtualize (`@tanstack/react-virtual`) nếu > 200 dòng.
- **State**: dữ liệu server → TanStack Query; state UI → Zustand. Không trộn.

---

## 8. Thứ tự làm đề xuất

1. `styles/tokens.css` + `components/ui` (Card, Badge, Button, Slider, Skeleton, AsyncBoundary).
2. `types/` + `lib/api` (viết interface trước, implement sau).
3. `layout.tsx` + navbar chung.
4. Trang `/` và `/audit` (đơn giản, kiểm chứng design system).
5. `/benchmark` (chỉ đọc dữ liệu, tái dùng `ChartProps<T>`).
6. `/workspace` cuối cùng: store → `filterElements` + test → `CytoscapeCanvas` → `RankingTable` → `EvidenceDrawer`.

### Checklist trước khi nộp

- [ ] Không component nào gọi `fetch` trực tiếp.
- [ ] Không prop nào là object kết quả nguyên khối.
- [ ] Thêm lớp thực thể mới chỉ sửa `nodeStyles.ts`.
- [ ] Mọi khối dữ liệu có loading / empty / error / disabled.
- [ ] Kéo slider không dựng lại đồ thị và không gọi API.
- [ ] Click đồng bộ 3 chiều chỉ đi qua `useWorkspaceStore`.
- [ ] In trang `/audit` không còn navbar/sidebar.

### Cài đặt gợi ý

```bash
npm i zustand @tanstack/react-query cytoscape recharts
npm i -D @types/cytoscape
```
