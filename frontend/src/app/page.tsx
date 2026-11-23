"use client";

/**
 * Màn hình 1 — Vụ án (/)
 * Header + 1 hành động chính, dải thống kê, tabs nguồn vụ án, bộ lọc kịch bản + tìm kiếm, lưới thẻ vụ án.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Cpu,
  FolderOpen,
  GitFork,
  Layers,
  Plus,
  RotateCcw,
  Search,
  SearchX,
  Users,
  X,
} from "lucide-react";
import { fetchCases, fetchModels } from "@/lib/api";
import type { CaseSummary, ModelInfo } from "@/types/contract";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState, Kbd, PageContainer, PageHeader, Skeleton, StatStrip, StatTile, Card } from "@/components/ui/Card";
import { FilterChip, Tabs } from "@/components/ui/Tabs";
import { Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { useToast } from "@/components/ui/Toast";
import { CaseCard } from "@/components/cases/CaseCard";
import { UploadCaseModal } from "@/components/cases/UploadCaseModal";
import { SCENARIO_META, getScenarioCategory, type ScenarioFilter } from "@/components/cases/scenario";
import { formatNumber } from "@/lib/format";

const STORAGE_HIDDEN_KEY = "ausaml_hidden_user_cases_v1";
const STORAGE_RENAME_KEY = "ausaml_renamed_user_cases_v1";

type SourceTab = "BUILTIN" | "UPLOADED";

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // bỏ qua: trình duyệt chặn storage
  }
}

export default function CasesPage() {
  const { toast } = useToast();
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sourceTab, setSourceTab] = useState<SourceTab>("BUILTIN");
  const [scenarioFilter, setScenarioFilter] = useState<ScenarioFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [hiddenCaseIds, setHiddenCaseIds] = useState<Set<string>>(new Set());
  const [renamedTitles, setRenamedTitles] = useState<Record<string, string>>({});
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const loadData = useCallback(() => {
    setIsLoading(true);
    setError(null);
    Promise.all([fetchCases(), fetchModels()])
      .then(([casesRes, modelsRes]) => {
        setCases(casesRes.cases);
        setModels(modelsRes.models);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Không thể kết nối tới backend API.")
      )
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    setHiddenCaseIds(new Set(readStorage<string[]>(STORAGE_HIDDEN_KEY, [])));
    setRenamedTitles(readStorage<Record<string, string>>(STORAGE_RENAME_KEY, {}));
    loadData();
  }, [loadData]);

  // Phím tắt "/" để focus ô tìm kiếm
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key !== "/" || target.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const builtinCases = useMemo(() => cases.filter((c) => c.source_type === "BUILTIN_DEMO"), [cases]);
  const uploadedCases = useMemo(
    () => cases.filter((c) => c.source_type === "USER_UPLOAD" && !hiddenCaseIds.has(c.case_id)),
    [cases, hiddenCaseIds]
  );
  const hiddenUploadCount = useMemo(
    () => cases.filter((c) => c.source_type === "USER_UPLOAD" && hiddenCaseIds.has(c.case_id)).length,
    [cases, hiddenCaseIds]
  );

  const scenarioCounts = useMemo(() => {
    const counts: Record<ScenarioFilter, number> = { ALL: builtinCases.length, TRUE_COLLUSION: 0, HARD_NEGATIVE: 0, MIXED: 0 };
    for (const c of builtinCases) counts[getScenarioCategory(c.case_id)] += 1;
    return counts;
  }, [builtinCases]);

  const getDisplayTitle = useCallback(
    (c: CaseSummary): string =>
      (renamedTitles[c.case_id] ?? c.title).replace(/\s*\((?:Bản tải lên|Upload)\s+\d{1,2}:\d{2}\)\s*$/i, ""),
    [renamedTitles]
  );

  const visibleCases = useMemo(() => {
    const base = sourceTab === "BUILTIN" ? builtinCases : uploadedCases;
    const q = searchQuery.trim().toLowerCase();
    return base.filter((c) => {
      if (sourceTab === "BUILTIN" && scenarioFilter !== "ALL" && getScenarioCategory(c.case_id) !== scenarioFilter) {
        return false;
      }
      if (!q) return true;
      return (
        getDisplayTitle(c).toLowerCase().includes(q) ||
        c.case_id.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    });
  }, [sourceTab, builtinCases, uploadedCases, scenarioFilter, searchQuery, getDisplayTitle]);

  const updateHidden = (updater: (prev: Set<string>) => Set<string>) => {
    setHiddenCaseIds((prev) => {
      const next = updater(prev);
      writeStorage(STORAGE_HIDDEN_KEY, [...next]);
      return next;
    });
  };

  const handleHide = (c: CaseSummary) => {
    updateHidden((prev) => new Set(prev).add(c.case_id));
    toast({
      title: "Đã ẩn vụ án",
      description: getDisplayTitle(c),
      tone: "info",
      action: {
        label: "Hoàn tác",
        onClick: () =>
          updateHidden((prev) => {
            const next = new Set(prev);
            next.delete(c.case_id);
            return next;
          }),
      },
    });
  };

  const handleRename = (caseId: string, title: string) => {
    setRenamedTitles((prev) => {
      const next = { ...prev, [caseId]: title };
      writeStorage(STORAGE_RENAME_KEY, next);
      return next;
    });
    toast({ title: "Đã đổi tên vụ án", description: title });
  };

  const isFiltering = searchQuery.trim() !== "" || (sourceTab === "BUILTIN" && scenarioFilter !== "ALL");

  return (
    <PageContainer>
      <PageHeader
        title="Vụ án"
        description="Chọn hồ sơ vụ án để mở phòng điều tra đồ thị, hoặc tải lên file đồ thị mới."
        actions={
          <Button variant="primary" leftIcon={Plus} onClick={() => setIsUploadOpen(true)}>
            Tải lên vụ án
          </Button>
        }
      />

      {error && (
        <Alert
          tone="danger"
          title="Không kết nối được backend"
          action={
            <Button size="sm" variant="secondary" leftIcon={RotateCcw} onClick={loadData}>
              Thử lại
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <StatStrip>
        <StatTile label="Khách hàng trong dữ liệu" value={formatNumber(50000)} hint="Bộ dữ liệu AusAML" icon={Users} />
        <StatTile label="Lớp thực thể" value="6" hint="Khách hàng, tài khoản, thiết bị, IP…" icon={Layers} />
        <StatTile label="Quan hệ dị thể" value="14" hint="7 cạnh gốc + 7 cạnh đảo chiều" icon={GitFork} />
        <StatTile
          label="Mô hình GNN"
          value={isLoading ? <Skeleton className="h-8 w-10" /> : models.length}
          hint="Hybrid v4, ablation và CK baseline"
          icon={Cpu}
        />
      </StatStrip>

      <section aria-label="Danh sách vụ án" className="space-y-4">
        <Tabs<SourceTab>
          ariaLabel="Nguồn vụ án"
          value={sourceTab}
          onChange={setSourceTab}
          options={[
            { value: "BUILTIN", label: "Vụ án mẫu", count: builtinCases.length },
            { value: "UPLOADED", label: "Đã tải lên", count: uploadedCases.length },
          ]}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Lọc theo kịch bản">
            {sourceTab === "BUILTIN" ? (
              (["ALL", "TRUE_COLLUSION", "HARD_NEGATIVE", "MIXED"] as ScenarioFilter[]).map((id) => (
                <FilterChip
                  key={id}
                  selected={scenarioFilter === id}
                  onClick={() => setScenarioFilter(id)}
                  count={scenarioCounts[id]}
                >
                  {id === "ALL" ? "Tất cả" : SCENARIO_META[id].label}
                </FilterChip>
              ))
            ) : hiddenUploadCount > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                leftIcon={RotateCcw}
                onClick={() => updateHidden(() => new Set())}
              >
                Hiện lại {hiddenUploadCount} vụ án đã ẩn
              </Button>
            ) : null}
          </div>

          <Input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên, mã, mô tả…"
            aria-label="Tìm vụ án"
            leftIcon={<Search className="h-4 w-4" aria-hidden />}
            rightSlot={
              searchQuery ? (
                <IconButton label="Xóa tìm kiếm" icon={X} size="sm" onClick={() => setSearchQuery("")} />
              ) : (
                <span className="hidden pr-1.5 sm:inline-flex">
                  <Kbd>/</Kbd>
                </span>
              )
            }
            className="w-full sm:w-72"
          />
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="space-y-3 p-5">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-4 h-10 w-full" />
              </Card>
            ))}
          </div>
        ) : visibleCases.length === 0 ? (
          <Card className="border-dashed shadow-none">
            {isFiltering ? (
              <EmptyState
                icon={SearchX}
                title="Không có vụ án phù hợp"
                description="Thử đổi từ khóa tìm kiếm hoặc chọn lại bộ lọc “Tất cả”."
                action={
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setSearchQuery("");
                      setScenarioFilter("ALL");
                    }}
                  >
                    Xóa bộ lọc
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={FolderOpen}
                title={sourceTab === "UPLOADED" ? "Chưa có vụ án tải lên" : "Chưa có vụ án mẫu"}
                description={
                  sourceTab === "UPLOADED"
                    ? "Tải lên file đồ thị .pt để kiểm định dữ liệu và bắt đầu điều tra."
                    : "Backend chưa trả về vụ án mẫu nào."
                }
                action={
                  sourceTab === "UPLOADED" && (
                    <Button variant="primary" size="sm" leftIcon={Plus} onClick={() => setIsUploadOpen(true)}>
                      Tải lên vụ án
                    </Button>
                  )
                }
              />
            )}
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleCases.map((c) => (
              <CaseCard
                key={c.case_id}
                item={c}
                displayTitle={getDisplayTitle(c)}
                onRename={(title) => handleRename(c.case_id, title)}
                onHide={() => handleHide(c)}
              />
            ))}
          </div>
        )}
      </section>

      <UploadCaseModal
        open={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploaded={(item) => {
          setCases((prev) => (prev.some((c) => c.case_id === item.case_id) ? prev : [item, ...prev]));
          setSourceTab("UPLOADED");
          toast({ title: "Đã tải lên vụ án", description: item.title });
        }}
      />
    </PageContainer>
  );
}
