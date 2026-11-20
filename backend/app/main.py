"""FastAPI Main Application cho AusAML Collusion DSS."""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS
from .database import init_db_and_seed
from .engine.registry import model_registry
from .routers import benchmarks, cases, feedback, predict

logger = logging.getLogger("ausaml.dss")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db_and_seed()
    if not model_registry.use_mock:
        try:
            elapsed_ms = model_registry.warmup()
            logger.info("Pre-warmed Real PyTorch AI Engine in %.1f ms", elapsed_ms)
        except Exception as exc:
            logger.warning("Pre-warm AI Engine không hoàn tất (sẽ nạp lazy khi có request): %s", exc)
    yield


app = FastAPI(
    title="AusAML Collusion DSS API",
    description="Decision Support System for Covert AML Accomplice Link Prediction (Model-Agnostic GNN Engine)",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(benchmarks.router)
app.include_router(cases.router)
app.include_router(predict.router)
app.include_router(feedback.router)


@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "ok",
        "use_mock_engine": model_registry.use_mock,
        "service": "ausaml-collusion-dss",
    }
