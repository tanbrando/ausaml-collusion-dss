"""SQLAlchemy ORM Models tương ứng với 4 bảng nghiệp vụ trong SRS Mục 6."""

import json
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class CaseRecord(Base):
    __tablename__ = "cases"

    case_id = Column(String(128), primary_key=True, index=True)
    title = Column(String(256), nullable=False)
    description = Column(Text, default="")
    source_type = Column(String(32), nullable=False, default="BUILTIN_DEMO")
    graph_file_path = Column(String(512), nullable=False)
    num_customers = Column(Integer, default=0)
    total_nodes = Column(Integer, default=0)
    total_edges = Column(Integer, default=0)
    validation_passed = Column(Boolean, default=True)
    sample_customer_ids_json = Column(Text, default="[]")
    created_at = Column(DateTime, default=_utcnow)

    prediction_runs = relationship("PredictionRun", back_populates="case", cascade="all, delete-orphan")
    feedbacks = relationship("InvestigatorFeedback", back_populates="case", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="case", cascade="all, delete-orphan")

    @property
    def sample_customer_ids(self):
        try:
            return json.loads(self.sample_customer_ids_json or "[]")
        except Exception:
            return []


class PredictionRun(Base):
    __tablename__ = "prediction_runs"

    run_id = Column(String(128), primary_key=True, index=True)
    case_id = Column(String(128), ForeignKey("cases.case_id"), nullable=False, index=True)
    model_id = Column(String(64), nullable=False)
    threshold_used = Column(Float, nullable=False)
    candidate_pairs_count = Column(Integer, default=0)
    high_risk_count = Column(Integer, default=0)
    execution_time_ms = Column(Float, default=0.0)
    created_at = Column(DateTime, default=_utcnow)

    case = relationship("CaseRecord", back_populates="prediction_runs")


class InvestigatorFeedback(Base):
    __tablename__ = "investigator_feedbacks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String(128), ForeignKey("cases.case_id"), nullable=False, index=True)
    pair_id = Column(String(128), nullable=False, index=True)
    source_cust_id = Column(String(64), nullable=False)
    target_cust_id = Column(String(64), nullable=False)
    model_id = Column(String(64), nullable=False)
    predicted_score = Column(Float, nullable=False)
    action = Column(String(16), nullable=False)  # CONFIRM | DISMISS
    note = Column(Text, default="")
    reviewer_name = Column(String(128), default="Investigator")
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    case = relationship("CaseRecord", back_populates="feedbacks")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String(128), ForeignKey("cases.case_id"), nullable=False, index=True)
    event_type = Column(String(64), nullable=False)  # UPLOAD | PREDICT | FEEDBACK | EXPORT
    payload_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=_utcnow)

    case = relationship("CaseRecord", back_populates="audit_logs")
