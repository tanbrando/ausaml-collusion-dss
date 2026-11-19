"""Cấu hình kết nối SQLAlchemy ORM (hỗ trợ SQLite & PostgreSQL)."""

import json
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import DATABASE_URL

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


BUILTIN_DEMO_CASES = [
    {
        "case_id": "case_01_smurfing_ring",
        "title": "Vụ án #1: Mạng lưới chia nhỏ giao dịch (Smurfing / Structuring)",
        "description": "Cụm 18 khách hàng sử dụng nhiều tài khoản trung gian chia nhỏ giao dịch dưới ngưỡng báo cáo, kèm thiết bị dùng chung.",
        "source_type": "BUILTIN_DEMO",
        "graph_file_path": "data/demo_cases/case_01_smurfing_ring.pt",
        "num_customers": 18,
        "total_nodes": 146,
        "total_edges": 412,
        "validation_passed": True,
        "sample_customer_ids": ["CUST_10492", "CUST_48210", "CUST_00912", "CUST_21804"],
    },
    {
        "case_id": "case_02_shared_device_mule",
        "title": "Vụ án #2: Đường dây Mule dùng chung Thiết bị & Địa chỉ IP",
        "description": "Đường dây rửa tiền đa tầng không có quan hệ KYC trên giấy tờ nhưng dùng chung DEV_0992 và IP_4401.",
        "source_type": "BUILTIN_DEMO",
        "graph_file_path": "data/demo_cases/case_02_shared_device_mule.pt",
        "num_customers": 24,
        "total_nodes": 210,
        "total_edges": 628,
        "validation_passed": True,
        "sample_customer_ids": ["CUST_33102", "CUST_33915", "CUST_19200"],
    },
    {
        "case_id": "case_03_hard_neg_type1_trap",
        "title": "Vụ án #3: Bẫy Type 1 (AML–AML thuộc 2 kịch bản rời nhau)",
        "description": "Case đối chứng: Cả hai đối tượng đều có risk_score cao nhưng thuộc 2 đường dây tách rời; GCN thuần dễ đoán nhầm, Hybrid lọc đúng.",
        "source_type": "BUILTIN_DEMO",
        "graph_file_path": "data/demo_cases/case_03_hard_neg_type1_trap.pt",
        "num_customers": 14,
        "total_nodes": 118,
        "total_edges": 290,
        "validation_passed": True,
        "sample_customer_ids": ["CUST_40111", "CUST_45822", "CUST_41009"],
    },
    {
        "case_id": "case_04_hard_neg_type4_trap",
        "title": "Vụ án #4: Bẫy Type 4 (Khách hàng sạch dùng chung IP/Thiết bị)",
        "description": "Hai khách hàng hợp pháp đăng nhập từ cùng quán net/văn phòng; minh họa cách Hybrid GATv2+GINE hạ FPR xuống gần 0%.",
        "source_type": "BUILTIN_DEMO",
        "graph_file_path": "data/demo_cases/case_04_hard_neg_type4_trap.pt",
        "num_customers": 12,
        "total_nodes": 96,
        "total_edges": 245,
        "validation_passed": True,
        "sample_customer_ids": ["CUST_05120", "CUST_05188"],
    },
    {
        "case_id": "case_05_test_benchmark_3420",
        "title": "Vụ án #5: Toàn tập Test Benchmark (3,420 cặp Inductive)",
        "description": "Tập dữ liệu kiểm định hồi quy toàn đồ thị (Full-Graph Regression) khớp 100% số liệu trên Kaggle Notebook.",
        "source_type": "BUILTIN_DEMO",
        "graph_file_path": "data/demo_cases/case_05_test_benchmark_3420.pt",
        "num_customers": 2150,
        "total_nodes": 15420,
        "total_edges": 48910,
        "validation_passed": True,
        "sample_customer_ids": ["CUST_10492", "CUST_48210", "CUST_33102"],
    },
]


def init_db_and_seed() -> None:
    """Tạo bảng và khởi tạo sẵn 5 Built-in Demo Cases nếu DB còn trống."""
    from .models_db import CaseRecord

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        for item in BUILTIN_DEMO_CASES:
            exists = db.query(CaseRecord).filter(CaseRecord.case_id == item["case_id"]).first()
            if not exists:
                db.add(
                    CaseRecord(
                        case_id=item["case_id"],
                        title=item["title"],
                        description=item["description"],
                        source_type=item["source_type"],
                        graph_file_path=item["graph_file_path"],
                        num_customers=item["num_customers"],
                        total_nodes=item["total_nodes"],
                        total_edges=item["total_edges"],
                        validation_passed=item["validation_passed"],
                        sample_customer_ids_json=json.dumps(item["sample_customer_ids"]),
                        created_at=datetime.now(timezone.utc),
                    )
                )
        db.commit()
    finally:
        db.close()
