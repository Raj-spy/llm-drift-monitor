"""
Dashboard API routes.
All endpoints require JWT authentication (dashboard users).
"""
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..core.auth import (
    generate_api_key,
    get_current_user_from_jwt,
    verify_project_access,
)
from ..core.supabase import get_supabase
from ..models.schemas import (
    AlertResponse,
    AlertUpdate,
    ApiKeyCreate,
    ApiKeyResponse,
    DailyMetric,
    DriftResultResponse,
    DriftTestCreate,
    DriftTestResponse,
    MetricsResponse,
    MetricsSummary,
    ModelBreakdown,
    ProjectCreate,
    ProjectResponse,
)
from ..services.drift_service import DriftDetectionService

router = APIRouter(tags=["Dashboard API"])


# ─── PROJECTS ─────────────────────────────────────────────────────────────────

@router.post("/projects", response_model=ProjectResponse, status_code=201)
async def create_project(
    body: ProjectCreate,
    current_user: dict = Depends(get_current_user_from_jwt),
):
    supabase = get_supabase()

    # Generate unique slug
    base_slug = re.sub(r"[^a-z0-9]+", "-", body.name.lower()).strip("-")
    slug = f"{base_slug}-{uuid.uuid4().hex[:6]}"

    project = {
        "id": str(uuid.uuid4()),
        "owner_id": current_user["id"],
        "name": body.name,
        "description": body.description,
        "slug": slug,
        "environment": body.environment,
        "default_model": body.default_model,
        "alert_email": body.alert_email,
        "slack_webhook_url": body.slack_webhook_url,
        "cost_alert_threshold_pct": body.cost_alert_threshold_pct,
        "latency_alert_threshold_pct": body.latency_alert_threshold_pct,
        "quality_score_threshold": body.quality_score_threshold,
    }

    result = supabase.table("projects").insert(project).execute()
    return ProjectResponse(**result.data[0])


@router.get("/projects", response_model=list[ProjectResponse])
async def list_projects(current_user: dict = Depends(get_current_user_from_jwt)):
    supabase = get_supabase()
    result = (
        supabase.table("projects")
        .select("*")
        .eq("owner_id", current_user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    return [ProjectResponse(**p) for p in result.data]


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    project: dict = Depends(verify_project_access),
):
    return ProjectResponse(**project)


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    current_user: dict = Depends(get_current_user_from_jwt),
    project: dict = Depends(verify_project_access),
):
    supabase = get_supabase()
    supabase.table("projects").update({"is_active": False}).eq("id", project_id).execute()


# ─── API KEYS ─────────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/api-keys", response_model=ApiKeyResponse, status_code=201)
async def create_api_key(
    project_id: str,
    body: ApiKeyCreate,
    current_user: dict = Depends(get_current_user_from_jwt),
    project: dict = Depends(verify_project_access),
):
    supabase = get_supabase()
    full_key, key_hash, key_prefix = generate_api_key()

    expires_at = None
    if body.expires_in_days:
        expires_at = (datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)).isoformat()

    record = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "owner_id": current_user["id"],
        "name": body.name,
        "key_hash": key_hash,
        "key_prefix": key_prefix,
        "expires_at": expires_at,
    }

    result = supabase.table("api_keys").insert(record).execute()
    resp = ApiKeyResponse(**result.data[0])
    resp.full_key = full_key  # Only returned once on creation
    return resp


@router.get("/projects/{project_id}/api-keys", response_model=list[ApiKeyResponse])
async def list_api_keys(
    project_id: str,
    current_user: dict = Depends(get_current_user_from_jwt),
    project: dict = Depends(verify_project_access),
):
    supabase = get_supabase()
    result = (
        supabase.table("api_keys")
        .select("id, name, key_prefix, project_id, is_active, created_at, last_used_at")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    )
    return [ApiKeyResponse(**k) for k in result.data]


@router.delete("/projects/{project_id}/api-keys/{key_id}", status_code=204)
async def revoke_api_key(
    project_id: str,
    key_id: str,
    current_user: dict = Depends(get_current_user_from_jwt),
    project: dict = Depends(verify_project_access),
):
    supabase = get_supabase()
    supabase.table("api_keys").update({"is_active": False}).eq("id", key_id).eq(
        "project_id", project_id
    ).execute()


# ─── METRICS ──────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/metrics", response_model=MetricsResponse)
async def get_metrics(
    project_id: str,
    days: int = Query(default=30, ge=1, le=90),
    model: Optional[str] = Query(default=None),
    current_user: dict = Depends(get_current_user_from_jwt),
    project: dict = Depends(verify_project_access),
):
    supabase = get_supabase()
    # Read ALL data directly from llm_requests — fully real-time, no aggregation delay
    start_dt = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    prev_dt  = (datetime.now(timezone.utc) - timedelta(days=days * 2)).isoformat()

    q = (
        supabase.table("llm_requests")
        .select("model, cost_usd, prompt_tokens, completion_tokens, latency_ms, status, requested_at")
        .eq("project_id", project_id)
        .gte("requested_at", start_dt)
        .order("requested_at", desc=False)
    )
    if model:
        q = q.eq("model", model)
        q = q.limit(10000)
    rows = q.execute().data or []

    prev_rows = (
        supabase.table("llm_requests")
        .select("cost_usd")
        .eq("project_id", project_id)
        .gte("requested_at", prev_dt)
        .lt("requested_at", start_dt)
        .execute()
    ).data or []

    # Totals
    total_requests = len(rows)
    total_tokens   = sum((r.get("prompt_tokens") or 0) + (r.get("completion_tokens") or 0) for r in rows)
    total_cost     = sum(r.get("cost_usd") or 0.0 for r in rows)
    total_failed   = sum(1 for r in rows if r.get("status") == "error")
    lats           = [r["latency_ms"] for r in rows if r.get("latency_ms")]
    avg_latency    = sum(lats) / len(lats) if lats else 0
    sorted_lats    = sorted(lats)
    p99_latency    = sorted_lats[int(len(sorted_lats) * 0.99)] if sorted_lats else 0
    error_rate     = (total_failed / total_requests * 100) if total_requests else 0

    prev_cost       = sum(r.get("cost_usd") or 0.0 for r in prev_rows)
    prev_requests   = len(prev_rows)
    requests_change = ((total_requests - prev_requests) / prev_requests * 100) if prev_requests else 0
    cost_change     = ((total_cost - prev_cost) / prev_cost * 100) if prev_cost else 0

    # Daily trend grouped by date
    from collections import defaultdict
    day_map: dict[str, dict] = defaultdict(lambda: {"total_requests": 0, "total_tokens": 0, "total_cost_usd": 0.0, "lats": []})
    mdl_map: dict[str, dict] = defaultdict(lambda: {"total_requests": 0, "total_tokens": 0, "total_cost_usd": 0.0, "lats": []})

    for r in rows:
        day = r["requested_at"][:10]
        tok = (r.get("prompt_tokens") or 0) + (r.get("completion_tokens") or 0)
        cst = r.get("cost_usd") or 0.0
        lat = r.get("latency_ms")
        mdl = r.get("model", "unknown")

        day_map[day]["total_requests"] += 1
        day_map[day]["total_tokens"]   += tok
        day_map[day]["total_cost_usd"] += cst
        if lat: day_map[day]["lats"].append(lat)

        mdl_map[mdl]["total_requests"] += 1
        mdl_map[mdl]["total_tokens"]   += tok
        mdl_map[mdl]["total_cost_usd"] += cst
        if lat: mdl_map[mdl]["lats"].append(lat)

    daily_trend = []
    for day in sorted(day_map):
        d = day_map[day]
        l = d["lats"]
        daily_trend.append(DailyMetric(
            date=day, total_requests=d["total_requests"], total_tokens=d["total_tokens"],
            total_cost_usd=round(d["total_cost_usd"], 6),
            avg_latency_ms=round(sum(l)/len(l), 1) if l else 0, model="all",
        ))

    breakdown = []
    for mdl, stats in mdl_map.items():
        l = stats["lats"]
        avg_lat    = sum(l) / len(l) if l else 0
        cost_share = (stats["total_cost_usd"] / total_cost * 100) if total_cost else 0
        provider   = "groq" if any(x in mdl.lower() for x in ["llama","mixtral","gemma","meta","deepseek","kimi","qwen"]) else "anthropic" if mdl.startswith("claude") else "openai"
        breakdown.append(ModelBreakdown(
            model=mdl, provider=provider,
            total_requests=stats["total_requests"],
            total_cost_usd=round(stats["total_cost_usd"], 6),
            avg_latency_ms=round(avg_lat, 1),
            total_tokens=stats["total_tokens"],
            cost_share_pct=round(cost_share, 1),
        ))
    breakdown.sort(key=lambda x: x.total_cost_usd, reverse=True)

    return MetricsResponse(
        summary=MetricsSummary(
            total_requests=total_requests, total_tokens=total_tokens,
            total_cost_usd=round(total_cost, 6),
            avg_latency_ms=round(avg_latency, 1), p99_latency_ms=round(p99_latency, 1),
            error_rate=round(error_rate, 2),
            requests_change_pct=round(requests_change, 1),
            cost_change_pct=round(cost_change, 1),
        ),
        daily_trend=daily_trend, model_breakdown=breakdown, period_days=days,
    )


@router.get("/projects/{project_id}/alerts", response_model=list[AlertResponse])
async def get_alerts(
    project_id: str,
    status_filter: Optional[str] = Query(default="active", alias="status"),
    limit: int = Query(default=50, le=200),
    current_user: dict = Depends(get_current_user_from_jwt),
    project: dict = Depends(verify_project_access),
):
    supabase = get_supabase()
    query = (
        supabase.table("alerts")
        .select("*")
        .eq("project_id", project_id)
        .order("triggered_at", desc=True)
        .limit(limit)
    )
    if status_filter and status_filter != "all":
        query = query.eq("status", status_filter)

    result = query.execute()
    return [AlertResponse(**a) for a in result.data]


@router.patch("/projects/{project_id}/alerts/{alert_id}", response_model=AlertResponse)
async def update_alert(
    project_id: str,
    alert_id: str,
    body: AlertUpdate,
    current_user: dict = Depends(get_current_user_from_jwt),
    project: dict = Depends(verify_project_access),
):
    supabase = get_supabase()
    updates: dict = {"status": body.status}
    now = datetime.now(timezone.utc).isoformat()
    if body.status == "acknowledged":
        updates["acknowledged_at"] = now
    elif body.status == "resolved":
        updates["resolved_at"] = now

    result = (
        supabase.table("alerts")
        .update(updates)
        .eq("id", alert_id)
        .eq("project_id", project_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Alert not found")
    return AlertResponse(**result.data[0])


# ─── DRIFT TESTS ──────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/drift-tests", response_model=DriftTestResponse, status_code=201)
async def create_drift_test(
    project_id: str,
    body: DriftTestCreate,
    current_user: dict = Depends(get_current_user_from_jwt),
    project: dict = Depends(verify_project_access),
):
    supabase = get_supabase()
    prompts_with_ids = []
    for p in body.golden_prompts:
        d = p.model_dump()
        if not d.get("id"):
            d["id"] = str(uuid.uuid4())
        prompts_with_ids.append(d)

    record = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "name": body.name,
        "description": body.description,
        "model": body.model,
        "evaluator_model": body.evaluator_model,
        "schedule": body.schedule,
        "golden_prompts": prompts_with_ids,
    }
    result = supabase.table("drift_tests").insert(record).execute()
    data = result.data[0]
    data["golden_prompt_count"] = len(prompts_with_ids)
    return DriftTestResponse(**data)


@router.get("/projects/{project_id}/drift-tests", response_model=list[DriftTestResponse])
async def list_drift_tests(
    project_id: str,
    current_user: dict = Depends(get_current_user_from_jwt),
    project: dict = Depends(verify_project_access),
):
    supabase = get_supabase()
    result = (
        supabase.table("drift_tests")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    )
    out = []
    for t in result.data:
        t["golden_prompt_count"] = len(t.get("golden_prompts", []))
        out.append(DriftTestResponse(**t))
    return out


@router.post("/projects/{project_id}/drift-tests/{test_id}/run", response_model=DriftResultResponse)
async def run_drift_test(
    project_id: str,
    test_id: str,
    current_user: dict = Depends(get_current_user_from_jwt),
    project: dict = Depends(verify_project_access),
):
    """Manually trigger a drift test run."""
    svc = DriftDetectionService()
    result = svc.run_drift_test(test_id)
    if not result:
        raise HTTPException(status_code=404, detail="Drift test not found or failed")
    return DriftResultResponse(**result)


@router.get("/projects/{project_id}/drift-tests/{test_id}/results", response_model=list[DriftResultResponse])
async def get_drift_results(
    project_id: str,
    test_id: str,
    limit: int = Query(default=30, le=100),
    current_user: dict = Depends(get_current_user_from_jwt),
    project: dict = Depends(verify_project_access),
):
    supabase = get_supabase()
    result = (
        supabase.table("drift_test_results")
        .select("*")
        .eq("drift_test_id", test_id)
        .order("run_at", desc=True)
        .limit(limit)
        .execute()
    )
    return [DriftResultResponse(**r) for r in result.data]