"use client";

/**
 * Modal tải lên vụ án (.pt): kéo thả file → nhập tên/mô tả → kiểm định dữ liệu.
 * Hiển thị checklist kiểm định cả khi đạt lẫn khi lỗi HTTP 422 (GateCheckUploadError).
 */

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileUp, UploadCloud } from "lucide-react";
import { GateCheckUploadError, uploadCase } from "@/lib/api";
import type { CaseSummary, GateCheckReport } from "@/types/contract";
import { Modal } from "@/components/ui/Modal";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { GateCheckResult } from "@/components/cases/GateCheckResult";
import { workspaceHref } from "@/components/cases/CaseCard";
import { cn } from "@/lib/cn";

interface UploadCaseModalProps {
  open: boolean;
  onClose: () => void;
  onUploaded: (item: CaseSummary) => void;
}

export function UploadCaseModal({ open, onClose, onUploaded }: UploadCaseModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<GateCheckReport | null>(null);
  const [uploadedCaseId, setUploadedCaseId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const resetResult = () => {
    setError(null);
    setReport(null);
    setUploadedCaseId(null);
  };

  const handleClose = () => {
    resetResult();
    onClose();
  };

  const pickFile = (picked: File | null) => {
    if (!picked) return;
    setFile(picked);
    resetResult();
    if (!title.trim()) setTitle(picked.name.replace(/\.pt$/i, ""));
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!file) {
      setError("Vui lòng chọn hoặc kéo thả một file đồ thị (.pt).");
      return;
    }
    setIsUploading(true);
    resetResult();
    try {
      const res = await uploadCase(
        title.trim() || file.name.replace(/\.pt$/i, ""),
        description.trim() || "Vụ án tải lên bởi điều tra viên",
        file
      );
      setReport(res.gate_check);
      setUploadedCaseId(res.case.case_id);
      onUploaded(res.case);
      setTitle("");
      setDescription("");
      setFile(null);
    } catch (err) {
      if (err instanceof GateCheckUploadError) {
        setError(err.message);
        setReport(err.gateCheck);
      } else {
        setError(err instanceof Error ? err.message : "Tải lên file .pt thất bại.");
      }
    } finally {
      setIsUploading(false);
    }
  };

  const succeeded = Boolean(report?.passed && uploadedCaseId);

  const footer = succeeded ? (
    <>
      <Button variant="secondary" onClick={handleClose}>
        Đóng
      </Button>
      <Link href={workspaceHref(uploadedCaseId!)} className={buttonClasses({ variant: "primary" })}>
        Mở trong phòng điều tra
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </>
  ) : (
    <>
      <Button variant="secondary" onClick={handleClose}>
        Hủy
      </Button>
      <Button
        variant="primary"
        leftIcon={UploadCloud}
        loading={isUploading}
        disabled={!file}
        onClick={() => void submit()}
      >
        {isUploading ? "Đang kiểm định…" : "Tải lên và kiểm định"}
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Tải lên vụ án mới"
      description="File đồ thị .pt (PyG HeteroData hoặc dict chuẩn AusAML) sẽ được kiểm định tự động trước khi điều tra."
      footer={footer}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-5">
        {!succeeded && (
          <>
            <div
              role="button"
              tabIndex={0}
              aria-label={file ? `Đã chọn ${file.name}. Bấm để đổi file` : "Chọn file .pt để tải lên"}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                pickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              data-autofocus
              className={cn(
                "flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-6 text-center transition-colors",
                isDragging
                  ? "border-primary bg-primary-subtle"
                  : "border-line-strong bg-subtle/60 hover:border-primary/60 hover:bg-primary-subtle/40"
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pt"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-primary shadow-sm">
                <FileUp className="h-5 w-5" aria-hidden />
              </span>
              {file ? (
                <>
                  <p className="text-base font-medium text-fg">{file.name}</p>
                  <p className="num text-sm text-muted">
                    {(file.size / 1024).toFixed(1)} KB · Bấm để đổi file
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base font-medium text-fg">
                    Kéo thả file <span className="font-mono">.pt</span> vào đây hoặc bấm để chọn
                  </p>
                  <p className="text-sm text-muted">Chỉ nhận một file mỗi lần tải lên</p>
                </>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tên vụ án">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ví dụ: Đường dây chuyển khoản #6"
                />
              </Field>
              <Field label="Mô tả ngắn" hint="Không bắt buộc">
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Bối cảnh nghi vấn rửa tiền…"
                />
              </Field>
            </div>
            <button type="submit" hidden aria-hidden tabIndex={-1} />
          </>
        )}

        {succeeded && (
          <Alert tone="success" title="Tải lên thành công">
            Vụ án đã qua kiểm định và sẵn sàng để điều tra.
          </Alert>
        )}
        {error && (
          <Alert tone="danger" title="Không thể tải lên">
            {error}
          </Alert>
        )}
        {report && <GateCheckResult report={report} />}
      </form>
    </Modal>
  );
}
