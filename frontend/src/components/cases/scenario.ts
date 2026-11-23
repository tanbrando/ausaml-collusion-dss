import type { BadgeVariant } from "@/components/ui/Badge";

export type ScenarioCategory = "TRUE_COLLUSION" | "HARD_NEGATIVE" | "MIXED";
export type ScenarioFilter = "ALL" | ScenarioCategory;

export const SCENARIO_META: Record<ScenarioCategory, { label: string; variant: BadgeVariant }> = {
  TRUE_COLLUSION: { label: "Thông đồng thật", variant: "danger" },
  HARD_NEGATIVE: { label: "Bẫy dương tính giả", variant: "warning" },
  MIXED: { label: "Tổng hợp nhiều kịch bản", variant: "neutral" },
};

/** Suy ra kịch bản của vụ án mẫu từ case_id (dữ liệu demo cố định). */
export function getScenarioCategory(caseId: string): ScenarioCategory {
  if (caseId.includes("hard_neg") || caseId.includes("case_03") || caseId.includes("case_04")) {
    return "HARD_NEGATIVE";
  }
  if (caseId.includes("mixed") || caseId.includes("case_05")) return "MIXED";
  return "TRUE_COLLUSION";
}
