"""Router quản lý Hồ sơ Vụ án & Upload file .pt (FR-01)."""

import json
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..config import UPLOADS_DIR
from ..database import get_db
from ..engine.validator import DataValidator
from ..models_db import AuditLog, CaseRecord
from ..schemas import CaseListResponse, CaseSummary, CaseUploadResponse

router = APIRouter(prefix="/api/v1/cases", tags=["Cases"])


def _to_case_summary(row: CaseRecord) -> CaseSummary:
    return CaseSummary(
        case_id=row.case_id,
        title=row.title,
        description=row.description or "",
        source_type=row.source_type,  # type: ignore[arg-type]
        num_customers=row.num_customers,
        total_nodes=row.total_nodes,
        total_edges=row.total_edges,
        validation_passed=row.validation_passed,
        sample_customer_ids=row.sample_customer_ids,
        created_at=row.created_at,
    )


@router.get("", response_model=CaseListResponse)
def list_cases(db: Session = Depends(get_db)):
    """Lấy danh sách 5 Built-in Demo Cases và các vụ án do người dùng upload."""
    rows = db.query(CaseRecord).order_by(CaseRecord.created_at.asc()).all()
    return CaseListResponse(cases=[_to_case_summary(r) for r in rows])


@router.post("/upload", response_model=CaseUploadResponse)
async def upload_case(
    title: str = Form(...),
    description: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload file đồ thị .pt mới, chạy Gate Check 1 và lưu vào Database."""
    if not file.filename or not file.filename.endswith(".pt"):
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ định dạng file đồ thị PyTorch (.pt).")

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    case_id = f"case_user_{uuid.uuid4().hex[:8]}"
    dest_path = UPLOADS_DIR / f"{case_id}.pt"

    content = await file.read()
    with open(dest_path, "wb") as f:
        f.write(content)

    meta, report = DataValidator.validate_pt_file(dest_path)
    if not report.passed:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail={"message": "Gate Check 1 thất bại", "gate_check": report.model_dump()})

    record = CaseRecord(
        case_id=case_id,
        title=title,
        description=description,
        source_type="USER_UPLOAD",
        graph_file_path=str(dest_path),
        num_customers=meta["num_customers"],
        total_nodes=meta["total_nodes"],
        total_edges=meta["total_edges"],
        validation_passed=True,
        sample_customer_ids_json=json.dumps(meta["sample_customer_ids"]),
        created_at=datetime.now(timezone.utc),
    )
    db.add(record)
    db.add(
        AuditLog(
            case_id=case_id,
            event_type="UPLOAD",
            payload_json=json.dumps({"filename": file.filename, "total_nodes": meta["total_nodes"]}),
        )
    )
    db.commit()
    db.refresh(record)

    return CaseUploadResponse(case=_to_case_summary(record), gate_check=report)
