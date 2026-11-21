"use client";

/**
 * MÀN HÌNH 1 (M4 - Việt): Case Command Center (/)
 * - 4 KPI Cards tổng quan hệ thống (50,000 Customers, 6 Node Types, 14 Relations, Registered GNN Checkpoints)
 * - Grid hiển thị 5 Hồ sơ Vụ án mẫu từ fetchCases() + nút "Mở Phòng Điều Tra" -> /workspace?case_id=...
 * - Khu vực kéo thả Upload File .pt Vụ án mới gọi uploadCase() + hiển thị bảng Gate Check 1
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  FileUp,
  GitFork,
  Layers,
  Loader2,
  ShieldCheck,
  UploadCloud,
  Users,
  XCircle,
} from "lucide-react";
import { fetchCases, fetchModels, uploadCase } from "@/lib/api";
import type {
  CaseSummary,
  CaseUploadResponse,
  ModelInfo,
} from "@/types/contract";

export default function CaseCommandCenterPage() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload state
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
    setIsUploading(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const res = await uploadCase(
        title.trim() || selectedFile.name,
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
      sub: "Khách hàng trong AusAML",
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
      <header>
        <h1 className="text-2xl font-bold text-slate-900">
          Case Command Center — Trung tâm Điều hành Vụ án AML
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Chọn một hồ sơ vụ án mẫu để mở Phòng Điều Tra tức thì, hoặc tải lên file đồ thị PyTorch (<code>.pt</code>) mới để kiểm định <b>Gate Check 1</b>.
        </p>
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
              className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-start justify-between gap-3"
            >
              <div>
                <div className="text-xs font-medium text-slate-500">
                  {card.label}
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-1">
                  {card.value}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
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

      {/* 2. Grid 5 Hồ sơ Vụ án mẫu */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Hồ sơ Vụ án Điều tra ({cases.length})
          </h2>
          <span className="text-xs text-slate-500">
            Bấm &ldquo;Mở Phòng Điều Tra&rdquo; để chạy suy luận GNN trực tiếp
          </span>
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
            {cases.map((c) => (
              <div
                key={c.case_id}
                className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-blue-300 transition-colors flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        c.source_type === "BUILTIN_DEMO"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-purple-50 text-purple-700 border-purple-200"
                      }`}
                    >
                      {c.source_type === "BUILTIN_DEMO"
                        ? "VỤ ÁN MẪU"
                        : "USER UPLOAD"}
                    </span>
                    {c.validation_passed && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
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
                  <div className="text-slate-500">
                    <b>{c.num_customers.toLocaleString()}</b> KH ·{" "}
                    <b>{c.total_nodes.toLocaleString()}</b> đỉnh ·{" "}
                    <b>{c.total_edges.toLocaleString()}</b> cạnh
                  </div>
                  <Link
                    href={`/workspace?case_id=${encodeURIComponent(c.case_id)}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors shrink-0"
                  >
                    <span>Mở Phòng Điều Tra</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Upload File .pt & Gate Check 1 */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <UploadCloud className="w-5 h-5 text-blue-600" />
          <div>
            <h2 className="font-semibold text-slate-900 text-sm">
              Tải lên Vụ án Đồ thị mới (.pt) & Kiểm định Gate Check 1
            </h2>
            <p className="text-xs text-slate-500">
              Hệ thống sẽ kiểm tra tự động kích thước đặc trưng 6 lớp thực thể, biên chỉ số cạnh, NaN/Inf và tự bổ sung cạnh đảo chiều.
            </p>
          </div>
        </div>

        <form onSubmit={handleUploadSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5">
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
              className={`h-full min-h-[150px] rounded-xl border-2 border-dashed p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
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
              <FileUp className="w-8 h-8 text-blue-500 mb-2" />
              {selectedFile ? (
                <>
                  <p className="text-xs font-semibold text-slate-900">
                    {selectedFile.name}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {(selectedFile.size / 1024).toFixed(1)} KB · Bấm để đổi file
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-medium text-slate-700">
                    Kéo thả file <code>.pt</code> vào đây hoặc bấm để chọn
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Hỗ trợ PyG HeteroData hoặc Dict chuẩn AusAML
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="lg:col-span-7 space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tên Vụ án
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ví dụ: Vụ án #6 — Đường dây chuyển khoản xuyên biên giới"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Mô tả ngắn
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Mô tả bối cảnh nghi vấn rửa tiền của đồ thị..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              {uploadError ? (
                <span className="text-xs text-red-600">{uploadError}</span>
              ) : (
                <span className="text-[11px] text-slate-400">
                  Kết quả kiểm định Gate Check 1 sẽ hiển thị ngay bên dưới.
                </span>
              )}
              <button
                type="submit"
                disabled={isUploading || !selectedFile}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:bg-slate-300 transition-colors shrink-0"
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
          </div>
        </form>

        {/* Gate Check 1 Report */}
        {uploadResult && (
          <div className="mt-4 p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {uploadResult.gate_check.passed ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
                <span className="font-semibold text-sm text-slate-900">
                  Kết quả Kiểm định Gate Check 1 —{" "}
                  {uploadResult.gate_check.passed ? "ĐẠT (PASSED)" : "KHÔNG ĐẠT"}
                </span>
              </div>

              {uploadResult.gate_check.passed && (
                <Link
                  href={`/workspace?case_id=${encodeURIComponent(
                    uploadResult.case.case_id
                  )}`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                >
                  <span>Mở vụ án vừa tải lên</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <div className="text-slate-500">node_dims_valid</div>
                <div
                  className={`font-semibold mt-0.5 ${
                    uploadResult.gate_check.node_dims_valid
                      ? "text-emerald-700"
                      : "text-red-600"
                  }`}
                >
                  {uploadResult.gate_check.node_dims_valid ? "✓ Hợp lệ" : "✕ Lỗi"}
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <div className="text-slate-500">edge_bounds_valid</div>
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
                <div className="text-slate-500">nan_count</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {uploadResult.gate_check.nan_count}
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <div className="text-slate-500">inf_count</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {uploadResult.gate_check.inf_count}
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <div className="text-slate-500">reverse_edges_added</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {uploadResult.gate_check.reverse_edges_added.toLocaleString()}
                </div>
              </div>
            </div>

            {uploadResult.gate_check.warnings.length > 0 && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <b>Cảnh báo:</b> {uploadResult.gate_check.warnings.join(" · ")}
              </div>
            )}
            {uploadResult.gate_check.errors.length > 0 && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                <b>Lỗi:</b> {uploadResult.gate_check.errors.join(" · ")}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
