"""Cấu hình tập trung cho Backend AML-DSS (tự nạp .env tại thư mục gốc dự án)."""

import os
from pathlib import Path
from typing import List


ROOT_DIR = Path(__file__).resolve().parents[2]
MODELS_DIR = ROOT_DIR / "models"
DATA_DIR = ROOT_DIR / "data"
PROCESSED_DATA_DIR = DATA_DIR / "processed"
DEMO_CASES_DIR = DATA_DIR / "demo_cases"
UPLOADS_DIR = DATA_DIR / "uploads"
REGISTRY_PATH = MODELS_DIR / "model_registry.json"
FROZEN_SCALERS_PATH = MODELS_DIR / "frozen_scalers.pt"
DEMO_MANIFEST_PATH = DEMO_CASES_DIR / "demo_cases_manifest.json"


def _load_dotenv_file(env_path: Path) -> None:
    """Nạp biến từ .env vào os.environ (không ghi đè biến môi trường đã đặt sẵn ở shell)."""
    if not env_path.exists():
        return
    try:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, val)
    except Exception:
        pass


_load_dotenv_file(ROOT_DIR / ".env")


def _resolve_database_url(raw_url: str) -> str:
    """Chuẩn hóa đường dẫn SQLite tương đối về 1 file duy nhất backend/aml_dss.db bất kể CWD."""
    if raw_url.startswith("sqlite:///./"):
        rel_name = raw_url[len("sqlite:///./") :]
        return f"sqlite:///{(ROOT_DIR / 'backend' / rel_name).as_posix()}"
    return raw_url


DATABASE_URL: str = _resolve_database_url(
    os.getenv("DATABASE_URL", f"sqlite:///{(ROOT_DIR / 'backend' / 'aml_dss.db').as_posix()}")
)
USE_MOCK_ENGINE: bool = os.getenv("USE_MOCK_ENGINE", "true").lower() in ("1", "true", "yes")
DEFAULT_MODEL_ID: str = os.getenv("DEFAULT_MODEL_ID", "hybrid_v4_full")
DEVICE: str = os.getenv("DEVICE", "cpu")

_raw_cors = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
CORS_ORIGINS: List[str] = [origin.strip() for origin in _raw_cors.split(",") if origin.strip()]

EXPECTED_NODE_DIMS = {
    "customer": 10,
    "account": 6,
    "device": 6,
    "ip": 4,
    "beneficiary": 8,
    "bank": 4,
}

EXPECTED_BASE_RELATIONS = [
    ("customer", "OWNS", "account"),
    ("customer", "BANKS_WITH", "bank"),
    ("account", "USES_DEVICE", "device"),
    ("account", "USES_IP", "ip"),
    ("account", "TRANSACTS", "account"),
    ("account", "WIRES_TO", "beneficiary"),
    ("customer", "RELATED_TO", "customer"),
]

# Siêu tham số đồng bộ 100% với AML_Hybrid_GAT_GIN.ipynb (v4)
HETERO_V4_CONFIG = {
    "STRUCT_PE_DIM": 16,
    "METAPATH_MAX_ENTITY_DEG": 50,
    "METAPATH_MAX_BENEF_DEG": 60,
    "TX_CUST_Z_THRESH": 1.0,
    "TX_CUST_TOPK_PER_NODE": 25,
    "DROP_REV_BANKS_WITH": True,
}
