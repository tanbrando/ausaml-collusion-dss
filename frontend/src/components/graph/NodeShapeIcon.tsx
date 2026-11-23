/** Biểu tượng SVG nhỏ mô phỏng đúng hình dạng + màu node trên đồ thị (dùng cho legend & bộ lọc). */

import type { NodeType } from "@/types/contract";
import { HEX, NODE_VISUAL_STYLES } from "@/lib/theme/colors";

const SHAPES: Record<string, string> = {
  ellipse: "M8 1.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13Z",
  "round-rectangle": "M4 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z",
  diamond: "M8 1l7 7-7 7-7-7Z",
  hexagon: "M4.5 2h7L15 8l-3.5 6h-7L1 8Z",
  triangle: "M8 1.5l7 12.5H1Z",
  star: "M8 1l2 4.6 5 .5-3.8 3.4 1.1 5L8 12l-4.3 2.5 1.1-5L1 6.1l5-.5Z",
};

export function NodeShapeIcon({
  type,
  size = 14,
  muted = false,
}: {
  type: NodeType;
  size?: number;
  muted?: boolean;
}) {
  const style = NODE_VISUAL_STYLES[type];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <path
        d={SHAPES[style.shape] ?? SHAPES.ellipse}
        fill={muted ? HEX.lineStrong : style.color}
        stroke={HEX.surface}
        strokeWidth={1}
      />
    </svg>
  );
}
