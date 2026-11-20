"""Pytest fixtures cô lập hoàn toàn file upload & bản ghi SQLite sinh ra trong lúc chạy test."""

import pytest
from app.config import UPLOADS_DIR
from app.database import SessionLocal, init_db_and_seed
from app.models_db import AuditLog, CaseRecord, InvestigatorFeedback, PredictionRun


@pytest.fixture(autouse=True)
def isolate_test_side_effects():
    init_db_and_seed()
    before_uploads = set(UPLOADS_DIR.glob("case_user_*.pt")) if UPLOADS_DIR.exists() else set()

    db = SessionLocal()
    try:
        before_cases = {r[0] for r in db.query(CaseRecord.case_id).all()}
        before_runs = {r[0] for r in db.query(PredictionRun.run_id).all()}
        before_fbs = {r[0] for r in db.query(InvestigatorFeedback.id).all()}
        before_logs = {r[0] for r in db.query(AuditLog.id).all()}
    finally:
        db.close()

    yield

    if UPLOADS_DIR.exists():
        after_uploads = set(UPLOADS_DIR.glob("case_user_*.pt"))
        for leftover in after_uploads - before_uploads:
            leftover.unlink(missing_ok=True)

    db = SessionLocal()
    try:
        db.query(AuditLog).filter(~AuditLog.id.in_(before_logs)).delete(synchronize_session=False)
        db.query(InvestigatorFeedback).filter(~InvestigatorFeedback.id.in_(before_fbs)).delete(synchronize_session=False)
        db.query(PredictionRun).filter(~PredictionRun.run_id.in_(before_runs)).delete(synchronize_session=False)
        db.query(CaseRecord).filter(~CaseRecord.case_id.in_(before_cases)).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()
