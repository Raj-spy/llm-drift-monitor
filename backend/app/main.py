"""
LLM Drift Monitor — FastAPI Backend
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from .core.limiter import limiter
from .api.alerts import router as alerts_router
from .api.billing import router as billing_router
from .api.dashboard import router as dashboard_router
from .api.ingest import router as ingest_router
from .core.config import get_settings
from .models.schemas import HealthResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    settings = get_settings()
    logger.info(f"Starting LLM Drift Monitor API [{settings.app_env}]")

    if settings.enable_drift_scheduler:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from .services.cost_service import CostAggregator, CostSpikeDetector
        from .services.drift_service import DriftDetectionService

        scheduler = AsyncIOScheduler()

        # 01:00 UTC — nightly metric aggregation
        scheduler.add_job(
            CostAggregator().aggregate_all_projects_yesterday,
            "cron", hour=1, minute=0,
            id="nightly_metric_aggregation",
        )

        # 02:00 UTC — spike detection (after aggregation)
        scheduler.add_job(
            lambda: CostSpikeDetector().check_all_projects(),
            "cron", hour=2, minute=0,
            id="daily_spike_check",
        )

        # 06:00 UTC — daily drift tests
        scheduler.add_job(
            lambda: DriftDetectionService().run_all_scheduled_tests("daily"),
            "cron", hour=6, minute=0,
            id="daily_drift_tests",
        )

        # Every hour — hourly drift tests
        scheduler.add_job(
            lambda: DriftDetectionService().run_all_scheduled_tests("hourly"),
            "cron", minute=5,
            id="hourly_drift_tests",
        )

        scheduler.start()
        app.state.scheduler = scheduler
        logger.info("Background scheduler started")

    yield

    if hasattr(app.state, "scheduler"):
        app.state.scheduler.shutdown(wait=False)
    logger.info("LLM Drift Monitor API shutting down")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="LLM Drift Monitor API",
        description=(
            "Production LLM observability — monitor cost, latency, and "
            "quality drift across your AI applications."
        ),
        version="0.1.0",
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        lifespan=lifespan,
    )

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.backend_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(ingest_router, prefix="/v1")
    app.include_router(dashboard_router, prefix="/v1")
    app.include_router(billing_router, prefix="/v1")
    app.include_router(alerts_router, prefix="/v1")

    @app.get("/health", response_model=HealthResponse, tags=["System"])
    async def health():
        return HealthResponse(environment=settings.app_env)

    @app.get("/", include_in_schema=False)
    async def root():
        return JSONResponse({"service": "LLM Drift Monitor API", "version": "0.1.0"})

    return app


app = create_app()