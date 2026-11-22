/**
 * Typed API Client kết nối tới FastAPI Backend (http://localhost:8000).
 * Việt (M3 & M4) gọi trực tiếp các hàm này trong các trang và components.
 */

import type {
  AuditTrailResponse,
  BenchmarkSummaryResponse,
  CaseListResponse,
  CaseUploadResponse,
  ExplainPairRequest,
  ExplainPairResponse,
  FeedbackRecord,
  FeedbackRequest,
  GateCheckReport,
  ModelListResponse,
  PredictRequest,
  PredictResponse,
} from "@/types/contract";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:8000";

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API ${path} failed (${res.status}): ${errText}`);
  }
  return res.json() as Promise<T>;
}

export function fetchModels(): Promise<ModelListResponse> {
  return apiRequest<ModelListResponse>("/api/v1/models");
}

export function fetchCases(): Promise<CaseListResponse> {
  return apiRequest<CaseListResponse>("/api/v1/cases");
}

export class GateCheckUploadError extends Error {
  gateCheck: GateCheckReport;

  constructor(message: string, gateCheck: GateCheckReport) {
    super(message);
    this.name = "GateCheckUploadError";
    this.gateCheck = gateCheck;
  }
}

export async function uploadCase(
  title: string,
  description: string,
  file: File
): Promise<CaseUploadResponse> {
  const form = new FormData();
  form.append("title", title);
  form.append("description", description);
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/v1/cases/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    if (res.status === 422) {
      try {
        const body = (await res.json()) as {
          detail?: { message?: string; gate_check?: GateCheckReport };
        };
        if (body?.detail?.gate_check) {
          throw new GateCheckUploadError(
            body.detail.message || "Gate Check 1 thất bại",
            body.detail.gate_check
          );
        }
      } catch (inner) {
        if (inner instanceof GateCheckUploadError) throw inner;
      }
    }
    const errText = await res.text();
    throw new Error(`API /api/v1/cases/upload failed (${res.status}): ${errText}`);
  }
  return res.json() as Promise<CaseUploadResponse>;
}

export function runPrediction(
  caseId: string,
  payload: PredictRequest
): Promise<PredictResponse> {
  return apiRequest<PredictResponse>(`/api/v1/cases/${caseId}/predict`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function explainPair(
  caseId: string,
  payload: ExplainPairRequest
): Promise<ExplainPairResponse> {
  return apiRequest<ExplainPairResponse>(`/api/v1/cases/${caseId}/explain-pair`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function submitFeedback(
  caseId: string,
  payload: FeedbackRequest
): Promise<FeedbackRecord> {
  return apiRequest<FeedbackRecord>(`/api/v1/cases/${caseId}/feedback`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchAuditLogs(caseId?: string): Promise<AuditTrailResponse> {
  const qs = caseId ? `?case_id=${encodeURIComponent(caseId)}` : "";
  return apiRequest<AuditTrailResponse>(`/api/v1/audit${qs}`);
}

export function fetchBenchmarks(): Promise<BenchmarkSummaryResponse> {
  return apiRequest<BenchmarkSummaryResponse>("/api/v1/benchmarks/summary");
}

export function getExportUrl(
  caseId: string,
  format: "csv" | "json" = "csv",
  modelId = "hybrid_v4_full"
): string {
  return `${API_BASE}/api/v1/cases/${encodeURIComponent(caseId)}/export?format=${format}&model_id=${encodeURIComponent(modelId)}`;
}
