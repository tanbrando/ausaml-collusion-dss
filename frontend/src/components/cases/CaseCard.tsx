"use client";

/**
 * Thẻ vụ án: bấm cả thẻ để mở Phòng điều tra (stretched link), số liệu dạng danh sách định nghĩa,
 * vụ án tải lên có menu "⋯" (Đổi tên / Ẩn) và chế độ sửa tên tại chỗ.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Clock, EyeOff, MoreHorizontal, Pencil, X } from "lucide-react";
import type { CaseSummary } from "@/types/contract";
import { Badge } from "@/components/ui/Badge";
import { IconButton, buttonClasses } from "@/components/ui/Button";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { Input } from "@/components/ui/Field";
import { formatDateVi, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import { SCENARIO_META, getScenarioCategory } from "@/components/cases/scenario";

interface CaseCardProps {
  item: CaseSummary;
  displayTitle: string;
  onRename?: (title: string) => void;
  onHide?: () => void;
}

export function workspaceHref(caseId: string, pairId?: string): string {
  const qs = new URLSearchParams({ case_id: caseId });
  if (pairId) qs.set("pair_id", pairId);
  return `/workspace?${qs.toString()}`;
}

export function CaseCard({ item, displayTitle, onRename, onHide }: CaseCardProps) {
  const isUpload = item.source_type === "USER_UPLOAD";
  const scenario = isUpload ? null : SCENARIO_META[getScenarioCategory(item.case_id)];
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(displayTitle);

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== displayTitle) onRename?.(trimmed);
    setIsEditing(false);
  };

  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-lg border border-line bg-surface p-5 shadow-sm transition",
        "hover:border-primary/40 hover:shadow-md has-[a:focus-visible]:border-primary has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-primary/20"
      )}
    >
      <div className="flex min-h-8 items-center justify-between gap-3">
        {scenario ? (
          <Badge variant={scenario.variant}>{scenario.label}</Badge>
        ) : (
          <Badge variant="neutral">Tải lên · #{item.case_id.slice(-6)}</Badge>
        )}

        {isUpload ? (
          <div className="relative z-10">
            <DropdownMenu
              trigger={(props) => (
                <IconButton {...props} label="Tùy chọn vụ án" icon={MoreHorizontal} size="sm" />
              )}
              items={[
                {
                  key: "rename",
                  label: "Đổi tên",
                  icon: Pencil,
                  onSelect: () => {
                    setDraft(displayTitle);
                    setIsEditing(true);
                  },
                },
                { key: "hide", label: "Ẩn khỏi danh sách", icon: EyeOff, onSelect: onHide },
              ]}
            />
          </div>
        ) : (
          <span className="font-mono text-xs text-muted">{item.case_id.split("_").slice(0, 2).join("_")}</span>
        )}
      </div>

      {isEditing ? (
        <div className="relative z-10 mt-3 flex items-center gap-2">
          <Input
            value={draft}
            aria-label="Tên vụ án mới"
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setIsEditing(false);
            }}
            className="flex-1"
          />
          <IconButton label="Lưu tên" icon={Check} variant="secondary" onClick={save} />
          <IconButton label="Hủy" icon={X} onClick={() => setIsEditing(false)} />
        </div>
      ) : (
        <h3 className="mt-3 text-lg font-semibold text-fg">
          <Link
            href={workspaceHref(item.case_id)}
            className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none"
          >
            {displayTitle}
          </Link>
        </h3>
      )}

      <p className="mt-1 line-clamp-2 text-base text-muted" title={item.description}>
        {item.description}
      </p>

      <dl className="num mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
        {[
          { label: "Khách hàng", value: item.num_customers },
          { label: "Đỉnh", value: item.total_nodes },
          { label: "Cạnh", value: item.total_edges },
        ].map((stat) => (
          <div key={stat.label} className="min-w-0">
            <dt className="text-xs text-muted">{stat.label}</dt>
            <dd className="mt-0.5 truncate text-base font-medium text-fg">{formatNumber(stat.value)}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex items-center justify-between gap-2">
        {isUpload ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {formatDateVi(item.created_at)}
          </span>
        ) : (
          <span />
        )}
        <span
          aria-hidden
          className={buttonClasses({
            variant: "ghost",
            size: "sm",
            className: "pointer-events-none -mr-2 text-primary-fg group-hover:bg-primary-subtle",
          })}
        >
          Mở điều tra
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </article>
  );
}
