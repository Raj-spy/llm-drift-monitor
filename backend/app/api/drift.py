"""
Drift Tests API — CRUD + run drift tests for a project.

Endpoints consumed by the frontend driftApi:
  GET    /projects/{project_id}/drift-tests
  POST   /projects/{project_id}/drift-tests
  POST   /projects/{project_id}/drift-tests/{test_id}/run
  GET    /projects/{project_id}/drift-tests/{test_id}/results
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel, Field

from ..core.auth import verify_project_access
from ..core.supabase import get_supabase
from fastapi import Depends

logger = logging.getLogger(__name__)
router = APIRouter(tags=["drift"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class GoldenPrompt(BaseModel):
    id: Optional[str] = None
    prompt: str
    expected_response: Optional[str] = None
    weight: float = 1.0


class CreateDriftTestRequest(BaseModel):
    name: str
    model: str
    evaluator_model: str = "claude-3-5-haiku-20241022"
    schedule: str = "daily"          # "daily" | "hourly" | "manual"
    golden_prompts: List[GoldenPrompt] = Field(default_factory=list)
    quality_score_threshold: Optional[float] = None


class DriftTestResponse(BaseModel):
    id: str
    project_id: str
    name: str
    model: str
    evaluator_model: str
    schedule: str
    is_active: bool
    last_run_at: Optional[str]
    last_score: Optional[float]
    baseline_score: Optional[float]
    golden_prompt_count: int
    created_at: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _format_test(row: dict) -> dict:
    """Normalize a DB row into the shape the frontend expects."""
    prompts = row.get("golden_prompts") or []
    return {
        "id": row["id"],
        "project_id": row["project_id"],
        "name": row["name"],
        "model": row["model"],
        "evaluator_model": row.get("evaluator_model", "claude-3-5-haiku-20241022"),
        "schedule": row.get("schedule", "daily"),
        "is_active": row.get("is_active", True),
        "last_run_at": row.get("last_run_at"),
        "last_score": row.get("last_score"),
        "baseline_score": row.get("baseline_score"),
        "golden_prompt_count": len(prompts),
        "created_at": row["created_at"],
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/drift-tests")
async def list_drift_tests(
    project_id: str,
    project=Depends(verify_project_access),
):
    """Return all drift tests for a project."""
    supabase = get_supabase()

    result = (
        supabase.table("drift_tests")
        .select("*")
        .eq("project_id", project_id)
        .eq("is_active", True)
        .order("created_at", desc=True)
        .execute()
    )

    return [_format_test(row) for row in (result.data or [])]


@router.post("/projects/{project_id}/drift-tests", status_code=201)
async def create_drift_test(
    project_id: str,
    body: CreateDriftTestRequest,
    project=Depends(verify_project_access),
):
    """Create a new drift test with golden prompts."""
    supabase = get_supabase()

    prompts = [
        {
            "id": p.id or str(uuid.uuid4()),
            "prompt": p.prompt,
            "expected_response": p.expected_response,
            "weight": p.weight,
        }
        for p in body.golden_prompts
    ]

    record = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "name": body.name,
        "model": body.model,
        "evaluator_model": body.evaluator_model,
        "schedule": body.schedule,
        "golden_prompts": prompts,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    result = supabase.table("drift_tests").insert(record).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create drift test")

    return _format_test(result.data[0])


@router.post("/projects/{project_id}/drift-tests/{test_id}/run")
async def run_drift_test(
    project_id: str,
    test_id: str,
    background_tasks: BackgroundTasks,
    project=Depends(verify_project_access),
):
    """
    Trigger a drift test run.
    Runs in the background so the UI doesn't time out on long evaluations.
    """
    supabase = get_supabase()

    # Verify test belongs to this project
    test = (
        supabase.table("drift_tests")
        .select("id, name, project_id")
        .eq("id", test_id)
        .eq("project_id", project_id)
        .eq("is_active", True)
        .maybe_single()
        .execute()
    )

    if not test.data:
        raise HTTPException(status_code=404, detail="Drift test not found")

    # Run in background so request returns immediately
    def _run():
        from ..services.drift_service import DriftDetectionService
        DriftDetectionService().run_drift_test(test_id)

    background_tasks.add_task(_run)

    return {
        "success": True,
        "message": f"Drift test '{test.data['name']}' started",
        "test_id": test_id,
    }


@router.get("/projects/{project_id}/drift-tests/{test_id}/results")
async def get_drift_test_results(
    project_id: str,
    test_id: str,
    limit: int = Query(10, le=50),
    project=Depends(verify_project_access),
):
    """Return past run results for a drift test."""
    supabase = get_supabase()

    # Verify test belongs to this project
    test = (
        supabase.table("drift_tests")
        .select("id")
        .eq("id", test_id)
        .eq("project_id", project_id)
        .maybe_single()
        .execute()
    )

    if not test.data:
        raise HTTPException(status_code=404, detail="Drift test not found")

    results = (
        supabase.table("drift_test_results")
        .select("*")
        .eq("drift_test_id", test_id)
        .eq("project_id", project_id)
        .order("run_at", desc=True)
        .limit(limit)
        .execute()
    )

    return results.data or []


@router.delete("/projects/{project_id}/drift-tests/{test_id}")
async def delete_drift_test(
    project_id: str,
    test_id: str,
    project=Depends(verify_project_access),
):
    """Soft-delete (deactivate) a drift test."""
    supabase = get_supabase()

    result = (
        supabase.table("drift_tests")
        .update({"is_active": False})
        .eq("id", test_id)
        .eq("project_id", project_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Drift test not found")

    return {"success": True}