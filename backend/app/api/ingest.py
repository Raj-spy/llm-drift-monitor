"""POST /ingest — High-throughput SDK data ingestion endpoint."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from ..core.auth import get_current_project_from_api_key
from ..core.supabase import get_supabase
from ..models.schemas import IngestBatchRequest, IngestResponse
from ..services.cost_service import estimate_cost
from ..core.limiter import limiter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ingest", tags=["Ingestion"])

# Security limits
MAX_EVENTS_PER_BATCH = 1000
MAX_PAYLOAD_BYTES = 1_000_000  # 1MB
MAX_FIELD_LENGTH = 10_000      # 10KB per text field


@router.post("/batch", response_model=IngestResponse)
@limiter.limit("200/minute")  # Per IP: 200 requests per minute
async def ingest_batch(
    request: Request,
    payload: IngestBatchRequest,
    auth: dict = Depends(get_current_project_from_api_key),
) -> IngestResponse:
    """
    Receive a batch of LLM request events from the SDK.
    This is the highest-volume endpoint — optimized for throughput.
    """

    # ── Security: Payload size check ─────────────────────────────────
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_PAYLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Payload too large. Max {MAX_PAYLOAD_BYTES // 1024}KB allowed.")

    # ── Security: Max events per batch ───────────────────────────────
    if len(payload.events) > MAX_EVENTS_PER_BATCH:
        raise HTTPException(status_code=400, detail=f"Too many events. Max {MAX_EVENTS_PER_BATCH} per batch.")

    project = auth["project"]
    project_id = project["id"]

    # Normalize events: override project_id with authenticated project
    records = []
    for event in payload.events:
        rec = event.model_dump()
        rec["project_id"] = project_id  # Always use authenticated project ID

        # ── Security: Truncate oversized text fields ──────────────────
        for text_field in ("prompt_text", "response_text", "error_message"):
            if rec.get(text_field) and len(rec[text_field]) > MAX_FIELD_LENGTH:
                rec[text_field] = rec[text_field][:MAX_FIELD_LENGTH]
                logger.warning(f"Truncated {text_field} for project {project_id}")

        # Fill in cost if missing (SDK might not have pricing data)
        if rec.get("cost_usd") is None and rec.get("prompt_tokens") and rec.get("completion_tokens"):
            rec["cost_usd"] = estimate_cost(
                rec["model"], rec["prompt_tokens"], rec["completion_tokens"]
            )

        # Validate and normalize timestamp
        try:
            datetime.fromisoformat(rec["requested_at"].replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            rec["requested_at"] = datetime.now(timezone.utc).isoformat()

        # Remove SDK-internal id field (Supabase generates its own)
        rec.pop("id", None)

        records.append(rec)

    # Bulk insert with error handling
    supabase = get_supabase()
    stored = 0
    errors = 0

    try:
        # Insert in chunks of 100 to avoid Supabase payload limits
        chunk_size = 100
        for i in range(0, len(records), chunk_size):
            chunk = records[i : i + chunk_size]
            result = supabase.table("llm_requests").insert(chunk).execute()
            stored += len(result.data) if result.data else len(chunk)
    except Exception as e:
        logger.error(f"Batch insert error for project {project_id}: {e}")
        errors = len(records)
        stored = 0

    # Increment monthly request counter
    try:
        supabase.rpc("increment_request_count", {
            "user_id": auth["owner_id"],
            "count": len(records),
        }).execute()
    except Exception:
        pass  # Non-critical

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
    auth: dict = Depends(get_current_project_from_api_key),
) -> IngestResponse:
    """Alias for /ingest/batch for single-event ingestion."""
    return await ingest_batch(request, payload, auth)