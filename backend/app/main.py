"""FastAPI Main Application cho AusAML Collusion DSS."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS, USE_MOCK_ENGINE
from .database import init_db_and_seed
from .routers import benchmarks, cases, feedback, predict


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db_and_seed()
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
        "use_mock_engine": USE_MOCK_ENGINE,
        "service": "ausaml-collusion-dss",
    }
