"""Router Human-in-the-Loop Feedback, Audit Logs & Export Báo cáo (FR-05)."""

import csv
import io
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..engine.registry import _canonical_pair, model_registry
from ..models_db import AuditLog, CaseRecord, InvestigatorFeedback
from ..schemas import (
    AuditLogItem,
    AuditTrailResponse,
    FeedbackRecord,
    FeedbackRequest,
    FeedbackStatus,
    PredictRequest,
)

router = APIRouter(prefix="/api/v1", tags=["Feedback & Audit"])


@router.post("/cases/{case_id}/feedback", response_model=FeedbackRecord)
def submit_feedback(case_id: str, req: FeedbackRequest, db: Session = Depends(get_db)):
    """Lưu hoặc cập nhật quyết định CONFIRM / DISMISS của điều tra viên vào DB & Audit Log."""
    case_row = db.query(CaseRecord).filter(CaseRecord.case_id == case_id).first()
    if not case_row:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy vụ án '{case_id}'.")

    canonical_pid = _canonical_pair(req.source, req.target)
    existing = (
        db.query(InvestigatorFeedback)
        .filter(InvestigatorFeedback.case_id == case_id, InvestigatorFeedback.pair_id == canonical_pid)
        .first()
    )
    now = datetime.now(timezone.utc)
    if existing:
        existing.model_id = req.model_id
        existing.predicted_score = req.predicted_score
        existing.action = req.action.value
        existing.note = req.note
        existing.reviewer_name = req.reviewer_name
        existing.updated_at = now
        fb_row = existing
    else:
        fb_row = InvestigatorFeedback(
            case_id=case_id,
            pair_id=canonical_pid,
            source_cust_id=req.source,
            target_cust_id=req.target,
            model_id=req.model_id,
            predicted_score=req.predicted_score,
            action=req.action.value,
            note=req.note,
            reviewer_name=req.reviewer_name,
            updated_at=now,
        )
        db.add(fb_row)

    db.add(
        AuditLog(
            case_id=case_id,
            event_type="FEEDBACK",
            payload_json=json.dumps(
                {
                    "pair_id": canonical_pid,
                    "action": req.action.value,
                    "score": req.predicted_score,
                    "reviewer": req.reviewer_name,
                }
            ),
        )
    )
    db.commit()
    db.refresh(fb_row)
    return FeedbackRecord.model_validate(fb_row)


@router.get("/audit", response_model=AuditTrailResponse)
def get_all_audit_logs(case_id: str = Query(default=None), db: Session = Depends(get_db)):
    """Lấy toàn bộ lịch sử phản hồi Human-in-the-Loop & Audit Logs (cho Màn hình /audit)."""
    fb_q = db.query(InvestigatorFeedback)
    log_q = db.query(AuditLog)
    if case_id:
        fb_q = fb_q.filter(InvestigatorFeedback.case_id == case_id)
        log_q = log_q.filter(AuditLog.case_id == case_id)

    fbs = [FeedbackRecord.model_validate(r) for r in fb_q.order_by(InvestigatorFeedback.updated_at.desc()).all()]
    logs = [AuditLogItem.model_validate(r) for r in log_q.order_by(AuditLog.created_at.desc()).limit(200).all()]
    return AuditTrailResponse(feedbacks=fbs, audit_logs=logs)


@router.get("/cases/{case_id}/export")
def export_case_report(
    case_id: str,
    format: str = Query(default="csv", pattern="^(csv|json)$"),
    model_id: str = Query(default="hybrid_v3_best"),
    db: Session = Depends(get_db),
):
    """Xuất hồ sơ điều tra kèm bằng chứng và trạng thái xác nhận ra CSV hoặc JSON."""
    case_row = db.query(CaseRecord).filter(CaseRecord.case_id == case_id).first()
    if not case_row:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy vụ án '{case_id}'.")

    fb_rows = db.query(InvestigatorFeedback).filter(InvestigatorFeedback.case_id == case_id).all()
    fb_map = {
        r.pair_id: (
            FeedbackStatus.CONFIRMED if r.action == "CONFIRM" else FeedbackStatus.DISMISSED
        )
        for r in fb_rows
    }
    pred = model_registry.predict(case_id, PredictRequest(model_id=model_id), feedback_map=fb_map)

    db.add(AuditLog(case_id=case_id, event_type="EXPORT", payload_json=json.dumps({"format": format, "model_id": model_id})))
    db.commit()

    if format == "json":
        return JSONResponse(
            content={
                "case_id": case_id,
                "case_title": case_row.title,
                "model_used": pred.model_used.model_dump(),
                "predictions": [p.model_dump() for p in pred.predictions],
            }
        )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "pair_id", "source", "target", "score", "risk_level", "feedback_status",
        "ck_gcn_score", "ck_gat_score", "hybrid_v3_score", "top_bridge_path", "explanation_vi",
    ])
    for item in pred.predictions:
        top_path = " -> ".join(item.evidence_paths[0].nodes) if item.evidence_paths else ""
        writer.writerow([
            item.pair_id,
            item.source,
            item.target,
            item.score,
            item.risk_level.value,
            item.feedback_status.value,
            item.model_comparison.ck_gcn_seed42,
            item.model_comparison.ck_gat_seed42,
            item.model_comparison.hybrid_v3_best,
            top_path,
            item.explanation_vi,
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{case_id}_report.csv"'},
    )
