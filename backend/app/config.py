"""Cấu hình tập trung cho Backend AML-DSS."""

import os
from pathlib import Path
from typing import List


ROOT_DIR = Path(__file__).resolve().parents[2]
MODELS_DIR = ROOT_DIR / "models"
DATA_DIR = ROOT_DIR / "data"
DEMO_CASES_DIR = DATA_DIR / "demo_cases"
UPLOADS_DIR = DATA_DIR / "uploads"
REGISTRY_PATH = MODELS_DIR / "model_registry.json"

DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{(ROOT_DIR / 'backend' / 'aml_dss.db').as_posix()}")
USE_MOCK_ENGINE: bool = os.getenv("USE_MOCK_ENGINE", "true").lower() in ("1", "true", "yes")
DEFAULT_MODEL_ID: str = os.getenv("DEFAULT_MODEL_ID", "hybrid_v3_best")
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
