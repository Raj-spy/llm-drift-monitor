"""Pydantic request/response models."""
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


# ─── Ingestion Models ─────────────────────────────────────────────────────────

class IngestEvent(BaseModel):
    """A single captured LLM request from the SDK."""
    id: str
    project_id: str
    request_id: Optional[str] = None
    model: str
    provider: str
    environment: str = "production"
    prompt_text: Optional[str] = None
    response_text: Optional[str] = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    latency_ms: int = 0
    cost_usd: Optional[float] = None
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    tags: dict[str, Any] = Field(default_factory=dict)
    status: str = "success"
    error_message: Optional[str] = None
    requested_at: str  # ISO 8601

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in ("success", "error", "timeout"):
            raise ValueError(f"Invalid status: {v}")
        return v


class IngestBatchRequest(BaseModel):
    events: list[IngestEvent] = Field(..., max_length=10000)


class IngestResponse(BaseModel):
    received: int
    stored: int
    errors: int = 0


# ─── Project Models ───────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    environment: str = "production"
    default_model: str = "gpt-4o"
    alert_email: Optional[str] = None
    slack_webhook_url: Optional[str] = None
    cost_alert_threshold_pct: float = 30.0
    latency_alert_threshold_pct: float = 50.0
    quality_score_threshold: float = 7.0


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    slug: str
    environment: str
    default_model: str
    is_active: bool
    created_at: str
    alert_email: Optional[str] = None
    slack_webhook_url: Optional[str] = None
    cost_alert_threshold_pct: Optional[float] = None
    latency_alert_threshold_pct: Optional[float] = None
    quality_score_threshold: Optional[float] = None


# ─── API Key Models ───────────────────────────────────────────────────────────

class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    expires_in_days: Optional[int] = None  # None = never expires


class ApiKeyResponse(BaseModel):
    id: str
    name: str
    key_prefix: str
    project_id: str
    is_active: bool
    created_at: str
    last_used_at: Optional[str] = None
    # Only included on creation:
    full_key: Optional[str] = None


# ─── Metrics Models ───────────────────────────────────────────────────────────

class MetricsSummary(BaseModel):
    total_requests: int
    total_tokens: int
    total_cost_usd: float
    avg_latency_ms: float
    p99_latency_ms: float
    error_rate: float
    requests_change_pct: float   # vs previous period
    cost_change_pct: float


class DailyMetric(BaseModel):
    date: str
    total_requests: int
    total_tokens: int
    total_cost_usd: float
    avg_latency_ms: float
    model: str


class ModelBreakdown(BaseModel):
    model: str
    provider: str
    total_requests: int
    total_cost_usd: float
    avg_latency_ms: float
    total_tokens: int
    cost_share_pct: float


class MetricsResponse(BaseModel):
    summary: MetricsSummary
    daily_trend: list[DailyMetric]
    model_breakdown: list[ModelBreakdown]
    period_days: int


# ─── Alert Models ─────────────────────────────────────────────────────────────

class AlertResponse(BaseModel):
    id: str
    project_id: str
    alert_type: str
    severity: str
    title: str
    message: str
    model: Optional[str]
    metric_value: Optional[float]
    threshold_value: Optional[float]
    percentage_change: Optional[float]
    status: str
    triggered_at: str
    acknowledged_at: Optional[str] = None


class AlertUpdate(BaseModel):
    status: str = Field(..., pattern="^(acknowledged|resolved)$")


# ─── Drift Test Models ────────────────────────────────────────────────────────

class GoldenPrompt(BaseModel):
    id: Optional[str] = None
    prompt: str = Field(..., min_length=1, max_length=10000)
    expected_response: Optional[str] = Field(None, max_length=10000)
    weight: float = 1.0  # Relative importance in scoring


class DriftTestCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    model: str
    evaluator_model: str = "claude-3-5-haiku-20241022"
    schedule: str = "daily"
    golden_prompts: list[GoldenPrompt] = Field(..., min_length=1, max_length=50)


class DriftTestResponse(BaseModel):
    id: str
    project_id: str
    name: str
    model: str
    schedule: str
    is_active: bool
    last_run_at: Optional[str]
    last_score: Optional[float]
    baseline_score: Optional[float]
    golden_prompt_count: int
    created_at: str


class DriftResultResponse(BaseModel):
    id: str
    drift_test_id: str
    run_at: str
    overall_score: float
    baseline_score: Optional[float]
    score_delta: Optional[float]
    model_used: str
    alert_triggered: bool
    prompt_results: list[dict]


# ─── Dashboard Health Check ───────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "0.1.0"
    environment: str
