"use client";

/**
 * MÀN HÌNH 1 (M4 - Việt): Case Command Center (/)
 * Tinh chỉnh theo review lần 2:
 * 1. Đồng bộ múi giờ UTC -> Asia/Ho_Chi_Minh bằng `formatDateVi` duy nhất (hết lệch 7 tiếng).
 * 2. Không tự gắn hậu tố "(Bản tải lên 22:06)" vào trong tiêu đề nữa để nhãn nhất quán 1 kiểu.
 * 3. Tách riêng 2 mục: "1. Hồ sơ Vụ án Mẫu Chuẩn (5)" và "2. Hồ sơ Vụ án Tải lên (User Uploads)",
 *    kèm nút Đổi tên và Xóa/Ẩn vụ án tải lên để quản lý gọn gàng.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  FileUp,
  GitFork,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { fetchCases, fetchModels, uploadCase } from "@/lib/api";
import type {
  CaseSummary,
  CaseUploadResponse,
  ModelInfo,
} from "@/types/contract";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { formatDateVi } from "@/lib/format";

const STORAGE_HIDDEN_KEY = "ausaml_hidden_user_cases_v1";
const STORAGE_RENAME_KEY = "ausaml_renamed_user_cases_v1";

export default function CaseCommandCenterPage() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quản lý đổi tên & xóa/ẩn các vụ án USER_UPLOAD
  const [hiddenCaseIds, setHiddenCaseIds] = useState<Set<string>>(new Set());
  const [renamedTitles, setRenamedTitles] = useState<Record<string, string>>(
    {}
  );
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState("");

  // Upload Modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<CaseUploadResponse | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const savedHidden = localStorage.getItem(STORAGE_HIDDEN_KEY);
      if (savedHidden) {
        setHiddenCaseIds(new Set(JSON.parse(savedHidden) as string[]));
      }
      const savedRenamed = localStorage.getItem(STORAGE_RENAME_KEY);
      if (savedRenamed) {
        setRenamedTitles(JSON.parse(savedRenamed) as Record<string, string>);
      }
    } catch {
      // ignore localStorage parse error
    }

    Promise.all([fetchCases(), fetchModels()])
      .then(([casesRes, modelsRes]) => {
        setCases(casesRes.cases);
        setModels(modelsRes.models);
      })
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : "Không thể kết nối tới Backend API (http://localhost:8000)."
        )
      )
      .finally(() => setIsLoading(false));
  }, []);

  const builtinCases = useMemo(
    () => cases.filter((c) => c.source_type === "BUILTIN_DEMO"),
    [cases]
  );

  const uploadedCases = useMemo(
    () =>
      cases.filter(
        (c) =>
          c.source_type === "USER_UPLOAD" && !hiddenCaseIds.has(c.case_id)
      ),
    [cases, hiddenCaseIds]
  );

  const hiddenUploadCount = useMemo(
    () =>
      cases.filter(
        (c) => c.source_type === "USER_UPLOAD" && hiddenCaseIds.has(c.case_id)
      ).length,
    [cases, hiddenCaseIds]
  );

  const handleHideCase = (caseId: string) => {
    setHiddenCaseIds((prev) => {
      const next = new Set(prev);
      next.add(caseId);
      try {
        localStorage.setItem(STORAGE_HIDDEN_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleRestoreHiddenCases = () => {
    setHiddenCaseIds(new Set());
    try {
      localStorage.removeItem(STORAGE_HIDDEN_KEY);
    } catch {
      // ignore
    }
  };

  const handleSaveRename = (caseId: string) => {
    const trimmed = editingTitleValue.trim();
    if (trimmed) {
      setRenamedTitles((prev) => {
        const next = { ...prev, [caseId]: trimmed };
        try {
          localStorage.setItem(STORAGE_RENAME_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    }
    setEditingCaseId(null);
  };

  const getDisplayTitle = (c: CaseSummary): string => {
    // Loại bỏ hậu tố "(Bản tải lên ...)" cũ nếu đã lỡ lưu vào DB trước đó để nhất quán 1 kiểu
    const raw = renamedTitles[c.case_id] ?? c.title;
    return raw.replace(/\s*\((?:Bản tải lên|Upload)\s+\d{1,2}:\d{2}\)\s*$/i, "");
  };

  const handleFilePick = (file: File | null) => {
    if (!file) return;
    setSelectedFile(file);
    setUploadError(null);
    if (!title.trim()) {
      setTitle(file.name.replace(/\.pt$/i, ""));
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError("Vui lòng chọn hoặc kéo thả một file đồ thị (.pt).");
      return;
    }

    const cleanTitle =
      title.trim() || selectedFile.name.replace(/\.pt$/i, "");

    setIsUploading(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const res = await uploadCase(
        cleanTitle,
        description.trim() || "Vụ án tải lên bởi điều tra viên",
        selectedFile
      );
      setUploadResult(res);
      setCases((prev) => {
        const exists = prev.some((c) => c.case_id === res.case.case_id);
        return exists ? prev : [res.case, ...prev];
      });
      setTitle("");
      setDescription("");
      setSelectedFile(null);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Tải lên file .pt thất bại."
      );
    } finally {
      setIsUploading(false);
    }
  };

  const kpiCards = [
    {
      label: "Quy mô Khách hàng",
      value: "50,000",
      sub: "Đồ thị toàn hàng AusAML",
      icon: Users,
      accent: "text-blue-600 bg-blue-50",
    },
    {
      label: "Lớp Thực thể (Node Types)",
      value: "6",
      sub: "Customer · Account · Device · IP · Benef · Bank",
      icon: Layers,
      accent: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Quan hệ Dị thể (Relations)",
      value: "14",
      sub: "7 cạnh gốc + 7 cạnh đảo chiều",
      icon: GitFork,
      accent: "text-violet-600 bg-violet-50",
    },
    {
      label: "GNN Checkpoints sẵn sàng",
      value: String(models.length || 5),
      sub: "Hybrid v4 + Ablations + CK Baselines",
      icon: Cpu,
      accent: "text-amber-600 bg-amber-50",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header + Nút mở Modal Upload */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Trung tâm Điều hành Vụ án AML
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Tổng quan quy mô đồ thị AusAML, danh mục hồ sơ vụ án điều tra và kiểm định dữ liệu đầu vào (Gate Check 1).
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsUploadModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Tải lên Vụ án mới (.pt)</span>
        </button>
      </header>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Không kết nối được Backend: {error}</span>
        </div>
      )}

      {/* 1. 4 KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-sm flex items-start justify-between gap-3"
            >
              <div>
                <div className="text-xs font-semibold text-slate-600">
                  {card.label}
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-1 num">
                  {card.value}
                </div>
                <div className="text-[11px] text-slate-600 mt-1">
                  {card.sub}
                </div>
              </div>
              <div className={`p-2.5 rounded-lg shrink-0 ${card.accent}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
          );
        })}
      </section>

      {/* 2A. Danh sách 5 Vụ án Mẫu Chuẩn (BUILTIN_DEMO) */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            1. Hồ sơ Vụ án Mẫu Chuẩn ({builtinCases.length})
          </h2>
          <p className="text-xs text-slate-600">
            5 kịch bản chuẩn trích xuất từ tập đồ thị AusAML dùng để kiểm thử khả năng phát hiện đồng phạm và chống bẫy Hard Negative.
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="bg-white rounded-xl border border-slate-200 p-5 h-44 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {builtinCases.map((c) => (
              <div
                key={c.case_id}
                className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-sm hover:border-blue-300 hover:shadow transition-all flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="info">VỤ ÁN MẪU</Badge>
                      <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                        {c.case_id}
                      </span>
                    </div>
                    {c.validation_passed && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Gate Check OK
                      </span>
                    )}
                  </div>

                  <h3 className="font-semibold text-slate-900 text-sm leading-snug">
                    {c.title}
                  </h3>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {c.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                  <div className="text-slate-600 num">
                    <b className="text-slate-900">
                      {c.num_customers.toLocaleString()}
                    </b>{" "}
                    KH ·{" "}
                    <b className="text-slate-900">
                      {c.total_nodes.toLocaleString()}
                    </b>{" "}
                    đỉnh ·{" "}
                    <b className="text-slate-900">
                      {c.total_edges.toLocaleString()}
                    </b>{" "}
                    cạnh
                  </div>
                  <Link
                    href={`/workspace?case_id=${encodeURIComponent(c.case_id)}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shrink-0"
                  >
                    <span>Mở Điều Tra</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2B. Mục riêng: Vụ án Tải lên (USER_UPLOAD) kèm nút Đổi tên & Xóa */}
      {(uploadedCases.length > 0 || hiddenUploadCount > 0) && (
        <section className="space-y-3 pt-2 border-t border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                2. Hồ sơ Vụ án Tải lên ({uploadedCases.length})
              </h2>
              <p className="text-xs text-slate-600">
                Các file đồ thị <code>.pt</code> do điều tra viên tải lên và đã vượt qua kiểm định Gate Check 1. Bạn có thể đổi tên hiển thị hoặc xóa bớt các bản tải thử trùng lặp.
              </p>
            </div>

            {hiddenUploadCount > 0 && (
              <button
                type="button"
                onClick={handleRestoreHiddenCases}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Khôi phục {hiddenUploadCount} vụ án đã ẩn</span>
              </button>
            )}
          </div>

          {uploadedCases.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-slate-300 bg-white text-center text-xs text-slate-600">
              Tất cả vụ án tải lên đang được ẩn. Nhấn <b>Khôi phục</b> ở góc phải hoặc <b>+ Tải lên Vụ án mới (.pt)</b>.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {uploadedCases.map((c) => {
                const isEditing = editingCaseId === c.case_id;
                const displayTitle = getDisplayTitle(c);

                return (
                  <div
                    key={c.case_id}
                    className="bg-white rounded-xl border border-purple-200/90 p-5 shadow-sm hover:border-purple-400 transition-all flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="purple">
                            Bản tải lên #{c.case_id.slice(-6)}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="Đổi tên vụ án"
                            onClick={() => {
                              setEditingCaseId(c.case_id);
                              setEditingTitleValue(displayTitle);
                            }}
                            className="p-1.5 rounded-md text-slate-500 hover:text-blue-600 hover:bg-slate-100"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Xóa khỏi danh sách hiển thị"
                            onClick={() => handleHideCase(c.case_id)}
                            className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editingTitleValue}
                            onChange={(e) =>
                              setEditingTitleValue(e.target.value)
                            }
                            className="flex-1 border border-blue-400 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-900 focus:outline-none"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveRename(c.case_id)}
                            className="p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCaseId(null)}
                            className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <h3 className="font-semibold text-slate-900 text-sm leading-snug">
                          {displayTitle}
                        </h3>
                      )}

                      <p className="text-xs text-slate-600 leading-relaxed">
                        {c.description}
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-slate-600 bg-purple-50/60 border border-purple-200/60 px-2.5 py-1 rounded-md num">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-purple-600" />
                          <span>Tải lên: {formatDateVi(c.created_at)}</span>
                        </span>
                        <span className="text-emerald-700 font-semibold">
                          ✓ Gate Check OK
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                      <div className="text-slate-600 num">
                        <b className="text-slate-900">
                          {c.num_customers.toLocaleString()}
                        </b>{" "}
                        KH ·{" "}
                        <b className="text-slate-900">
                          {c.total_nodes.toLocaleString()}
                        </b>{" "}
                        đỉnh ·{" "}
                        <b className="text-slate-900">
                          {c.total_edges.toLocaleString()}
                        </b>{" "}
                        cạnh
                      </div>
                      <Link
                        href={`/workspace?case_id=${encodeURIComponent(
                          c.case_id
                        )}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shrink-0"
                      >
                        <span>Mở Điều Tra</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 3. Modal Popup Upload File .pt & Gate Check 1 */}
      <Modal
        open={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        title="Tải lên Vụ án Đồ thị mới (.pt) & Kiểm định Gate Check 1"
        subtitle="Kiểm tra tự động kích thước đặc trưng 6 lớp thực thể, biên chỉ số cạnh, giá trị NaN/Inf và bổ sung cạnh đảo chiều."
      >
        <div className="space-y-4">
          <form onSubmit={handleUploadSubmit} className="space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const dropped = e.dataTransfer.files?.[0] ?? null;
                handleFilePick(dropped);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`min-h-[135px] rounded-xl border-2 border-dashed p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-300 bg-slate-50/70 hover:border-blue-400"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pt"
                className="hidden"
                onChange={(e) => handleFilePick(e.target.files?.[0] ?? null)}
              />
              <FileUp className="w-7 h-7 text-blue-500 mb-2" />
              {selectedFile ? (
                <>
                  <p className="text-xs font-semibold text-slate-900">
                    {selectedFile.name}
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5 num">
                    {(selectedFile.size / 1024).toFixed(1)} KB · Bấm để đổi file
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold text-slate-700">
                    Kéo thả file <code>.pt</code> vào đây hoặc bấm để chọn
                  </p>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Hỗ trợ PyG HeteroData hoặc Dict chuẩn AusAML
                  </p>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên Vụ án
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ví dụ: Vụ án #6 — Đường dây chuyển khoản"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mô tả ngắn
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Mô tả bối cảnh nghi vấn rửa tiền..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {uploadError && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                {uploadError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Đóng
              </button>
              <button
                type="submit"
                disabled={isUploading || !selectedFile}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang kiểm định...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>Tải lên & Chạy Gate Check 1</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {uploadResult && (
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {uploadResult.gate_check.passed ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600" />
                  )}
                  <span className="font-semibold text-xs text-slate-900">
                    Kết quả Kiểm định Gate Check 1 —{" "}
                    {uploadResult.gate_check.passed
                      ? "ĐẠT (PASSED)"
                      : "KHÔNG ĐẠT"}
                  </span>
                </div>

                {uploadResult.gate_check.passed && (
                  <Link
                    href={`/workspace?case_id=${encodeURIComponent(
                      uploadResult.case.case_id
                    )}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                  >
                    <span>Mở vụ án trong Phòng Điều Tra</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs num">
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <div className="text-slate-600 text-[11px]">node_dims_valid</div>
                  <div
                    className={`font-semibold mt-0.5 ${
                      uploadResult.gate_check.node_dims_valid
                        ? "text-emerald-700"
                        : "text-red-600"
                    }`}
                  >
                    {uploadResult.gate_check.node_dims_valid
                      ? "✓ Hợp lệ"
                      : "✕ Lỗi"}
                  </div>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <div className="text-slate-600 text-[11px]">edge_bounds_valid</div>
                  <div
                    className={`font-semibold mt-0.5 ${
                      uploadResult.gate_check.edge_bounds_valid
                        ? "text-emerald-700"
                        : "text-red-600"
                    }`}
                  >
                    {uploadResult.gate_check.edge_bounds_valid
                      ? "✓ Hợp lệ"
                      : "✕ Lỗi"}
                  </div>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <div className="text-slate-600 text-[11px]">nan_count</div>
                  <div className="font-mono font-semibold text-slate-900 mt-0.5">
                    {uploadResult.gate_check.nan_count}
                  </div>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <div className="text-slate-600 text-[11px]">inf_count</div>
                  <div className="font-mono font-semibold text-slate-900 mt-0.5">
                    {uploadResult.gate_check.inf_count}
                  </div>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <div className="text-slate-600 text-[11px]">reverse_edges</div>
                  <div className="font-mono font-semibold text-slate-900 mt-0.5">
                    {uploadResult.gate_check.reverse_edges_added.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
