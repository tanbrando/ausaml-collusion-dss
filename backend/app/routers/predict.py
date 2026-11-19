"""Router Suy luận Dự đoán Liên kết & Giải thích Cặp (FR-02, FR-03, FR-04)."""

import json
from typing import Dict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..engine.registry import model_registry
from ..models_db import AuditLog, CaseRecord, InvestigatorFeedback, PredictionRun
from ..schemas import (
    ExplainPairRequest,
    ExplainPairResponse,
    FeedbackAction,
    FeedbackStatus,
    PredictRequest,
    PredictResponse,
)

router = APIRouter(prefix="/api/v1/cases", tags=["Prediction & Explainability"])


def _load_feedback_status_map(db: Session, case_id: str) -> Dict[str, FeedbackStatus]:
    rows = (
        db.query(InvestigatorFeedback)
        .filter(InvestigatorFeedback.case_id == case_id)
        .order_by(InvestigatorFeedback.id.asc())
        .all()
    )
    mapping: Dict[str, FeedbackStatus] = {}
    for r in rows:
        mapping[r.pair_id] = (
            FeedbackStatus.CONFIRMED if r.action == FeedbackAction.CONFIRM.value else FeedbackStatus.DISMISSED
        )
    return mapping


@router.post("/{case_id}/predict", response_model=PredictResponse)
def predict_case_links(case_id: str, req: PredictRequest, db: Session = Depends(get_db)):
    case_row = db.query(CaseRecord).filter(CaseRecord.case_id == case_id).first()
    if not case_row:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy vụ án '{case_id}'.")

    try:
        fb_map = _load_feedback_status_map(db, case_id)
        res = model_registry.predict(case_id, req, feedback_map=fb_map)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    db.add(
        PredictionRun(
            run_id=res.run_id,
            case_id=case_id,
            model_id=res.model_used.model_id,
            threshold_used=res.model_used.applied_threshold,
            candidate_pairs_count=res.subgraph_stats.candidate_pairs_evaluated,
            high_risk_count=res.subgraph_stats.high_risk_pairs,
            execution_time_ms=res.execution_time_ms,
        )
    )
    db.add(
        AuditLog(
            case_id=case_id,
            event_type="PREDICT",
            payload_json=json.dumps(
                {
                    "run_id": res.run_id,
                    "model_id": res.model_used.model_id,
                    "threshold": res.model_used.applied_threshold,
                    "mode": req.inference_mode.value,
                }
            ),
        )
    )
    db.commit()
    return res


@router.post("/{case_id}/explain-pair", response_model=ExplainPairResponse)
def explain_candidate_pair(case_id: str, req: ExplainPairRequest, db: Session = Depends(get_db)):
    case_row = db.query(CaseRecord).filter(CaseRecord.case_id == case_id).first()
    if not case_row:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy vụ án '{case_id}'.")

    try:
        fb_map = _load_feedback_status_map(db, case_id)
        return model_registry.explain_pair(case_id, req, feedback_map=fb_map)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
