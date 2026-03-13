"""POST /ingest — High-throughput SDK data ingestion endpoint."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request

from ..core.auth import get_current_project_from_api_key
from ..core.supabase import get_supabase
from ..models.schemas import IngestBatchRequest, IngestResponse
from ..services.cost_service import estimate_cost
from ..core.limiter import limiter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ingest", tags=["Ingestion"])

MAX_EVENTS_PER_BATCH = 1000
MAX_PAYLOAD_BYTES = 1_000_000
MAX_FIELD_LENGTH = 10_000


# ── Real-time spike detection ─────────────────────────────────────────────────

async def check_spikes_background(project_id: str) -> None:
    """
    Runs after every ingest batch.
    Compares last 1 hour avg vs 7-day baseline — fires alert if spike detected.
    """
    try:
        from ..services.alert_service import AlertService
        supabase = get_supabase()
        alert_service = AlertService()

        now = datetime.now(timezone.utc)
        one_hour_ago = now.replace(minute=now.minute - 60 if now.minute >= 60 else now.minute, second=0).isoformat() \
            if False else datetime.fromtimestamp(now.timestamp() - 3600, tz=timezone.utc).isoformat()

        # Last 1 hour requests
        recent = supabase.table("llm_requests") \
            .select("cost_usd, latency_ms, status") \
            .eq("project_id", project_id) \
            .gte("requested_at", one_hour_ago) \
            .execute()

        recent_data = recent.data or []
        if len(recent_data) < 5:
            return  # Not enough data

        # 7-day baseline from metrics_daily
        from datetime import date, timedelta
        week_ago = (date.today() - timedelta(days=7)).isoformat()
        baseline = supabase.table("metrics_daily") \
            .select("total_cost_usd, avg_latency_ms") \
            .eq("project_id", project_id) \
            .gte("date", week_ago) \
            .execute()

        baseline_data = baseline.data or []
        if not baseline_data:
            return  # No baseline yet

        # Compute baselines
        avg_cost_baseline = sum(d["total_cost_usd"] for d in baseline_data) / len(baseline_data)
        latency_baselines = [d["avg_latency_ms"] for d in baseline_data if d["avg_latency_ms"]]
        avg_latency_baseline = sum(latency_baselines) / len(latency_baselines) if latency_baselines else None

        # Compute current hour metrics
        costs = [r["cost_usd"] for r in recent_data if r.get("cost_usd")]
        latencies = [r["latency_ms"] for r in recent_data if r.get("latency_ms")]

        current_cost = sum(costs) / len(costs) if costs else 0
        current_latency = sum(latencies) / len(latencies) if latencies else None

        # Get project thresholds
        project = supabase.table("projects") \
            .select("cost_alert_threshold_pct, latency_alert_threshold_pct") \
            .eq("id", project_id) \
            .maybe_single() \
            .execute()

        if not project.data:
            return

        cost_threshold = project.data.get("cost_alert_threshold_pct", 50)
        latency_threshold = project.data.get("latency_alert_threshold_pct", 50)

        # Duplicate check helper
        def already_alerted(alert_type: str) -> bool:
            existing = supabase.table("alerts") \
                .select("id") \
                .eq("project_id", project_id) \
                .eq("alert_type", alert_type) \
                .eq("status", "active") \
                .gte("triggered_at", datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00:00Z")) \
                .execute()
            return bool(existing.data)

        # Cost spike check
        if avg_cost_baseline > 0 and current_cost > 0:
            cost_change_pct = ((current_cost - avg_cost_baseline) / avg_cost_baseline) * 100
            if cost_change_pct > cost_threshold and not already_alerted("cost_spike"):
                alert_service.create_cost_alert(
                    project_id=project_id,
                    model=None,
                    metric_value=current_cost,
                    threshold_value=avg_cost_baseline,
                    percentage_change=round(cost_change_pct, 2),
                )
                logger.info(f"[spike] cost_spike fired for {project_id}: +{cost_change_pct:.0f}%")

        # Latency spike check
        if avg_latency_baseline and current_latency:
            latency_change_pct = ((current_latency - avg_latency_baseline) / avg_latency_baseline) * 100
            if latency_change_pct > latency_threshold and not already_alerted("latency_spike"):
                alert_service.create_latency_alert(
                    project_id=project_id,
                    model=None,
                    metric_value=current_latency,
                    threshold_value=avg_latency_baseline,
                    percentage_change=round(latency_change_pct, 2),
                )
                logger.info(f"[spike] latency_spike fired for {project_id}: +{latency_change_pct:.0f}%")

    except Exception as e:
        logger.error(f"Spike check failed for {project_id}: {e}")


# ── Ingest endpoint ───────────────────────────────────────────────────────────

@router.post("/batch", response_model=IngestResponse)
@limiter.limit("200/minute")
async def ingest_batch(
    request: Request,
    payload: IngestBatchRequest,
    background_tasks: BackgroundTasks,
    auth: dict = Depends(get_current_project_from_api_key),
) -> IngestResponse:
    """
    Receive a batch of LLM request events from the SDK.
    This is the highest-volume endpoint — optimized for throughput.
    """

    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_PAYLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Payload too large. Max {MAX_PAYLOAD_BYTES // 1024}KB allowed.")

    if len(payload.events) > MAX_EVENTS_PER_BATCH:
        raise HTTPException(status_code=400, detail=f"Too many events. Max {MAX_EVENTS_PER_BATCH} per batch.")

    project = auth["project"]
    project_id = project["id"]

    records = []
    for event in payload.events:
        rec = event.model_dump()
        rec["project_id"] = project_id

        for text_field in ("prompt_text", "response_text", "error_message"):
            if rec.get(text_field) and len(rec[text_field]) > MAX_FIELD_LENGTH:
                rec[text_field] = rec[text_field][:MAX_FIELD_LENGTH]
                logger.warning(f"Truncated {text_field} for project {project_id}")

        if rec.get("cost_usd") is None and rec.get("prompt_tokens") and rec.get("completion_tokens"):
            rec["cost_usd"] = estimate_cost(
                rec["model"], rec["prompt_tokens"], rec["completion_tokens"]
            )

        try:
            datetime.fromisoformat(rec["requested_at"].replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            rec["requested_at"] = datetime.now(timezone.utc).isoformat()

        rec.pop("id", None)
        records.append(rec)

    supabase = get_supabase()
    stored = 0
    errors = 0

    try:
        chunk_size = 100
        for i in range(0, len(records), chunk_size):
            chunk = records[i: i + chunk_size]
            result = supabase.table("llm_requests").insert(chunk).execute()
            stored += len(result.data) if result.data else len(chunk)
    except Exception as e:
        logger.error(f"Batch insert error for project {project_id}: {e}")
        errors = len(records)
        stored = 0

    try:
        supabase.rpc("increment_request_count", {
            "user_id": auth["owner_id"],
            "count": len(records),
        }).execute()
    except Exception:
        pass

    # ── Spike check — background, non-blocking ────────────────────────
    background_tasks.add_task(check_spikes_background, project_id)

    return IngestResponse(
        received=len(payload.events),
        stored=stored,
        errors=errors,
    )


@router.post("", response_model=IngestResponse, include_in_schema=False)
@limiter.limit("200/minute")
async def ingest_single(
    request: Request,
    payload: IngestBatchRequest,
    background_tasks: BackgroundTasks,
    auth: dict = Depends(get_current_project_from_api_key),
) -> IngestResponse:
    """Alias for /ingest/batch for single-event ingestion."""
    return await ingest_batch(request, payload, background_tasks, auth)