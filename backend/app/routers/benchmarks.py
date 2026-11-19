"""Router danh mục Mô hình & Số liệu Đối chứng Benchmark (FR-03, FR-06)."""

from fastapi import APIRouter

from ..engine.registry import model_registry
from ..schemas import BenchmarkSummaryResponse, ModelListResponse

router = APIRouter(prefix="/api/v1", tags=["Models & Benchmarks"])


@router.get("/models", response_model=ModelListResponse)
def list_registered_models():
    """Trả về toàn bộ các mô hình đã đăng ký cùng ngưỡng tau_val mặc định."""
    default_id, models = model_registry.list_models()
    return ModelListResponse(default_model_id=default_id, models=models)


@router.get("/benchmarks/summary", response_model=BenchmarkSummaryResponse)
def get_benchmark_summary():
    """Trả về bảng tổng hợp Mean ± Std trên Overall & 5 Scenarios + Hard Negative Showcase."""
    _, models = model_registry.list_models()
    return BenchmarkSummaryResponse(
        evaluation_protocol=model_registry.evaluation_protocol,
        models=models,
        hard_negative_showcase=model_registry.get_hard_negative_showcase(),
    )
