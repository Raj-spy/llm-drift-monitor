"""
Alerts API — fetch, acknowledge, resolve alerts for a project.
"""
import logging
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..core.auth import get_current_user_from_jwt, verify_project_access
from ..core.supabase import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/alerts", tags=["alerts"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class AlertActionRequest(BaseModel):
    alert_id: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{project_id}")
async def get_alerts(
    project_id: str,
    status: Optional[str] = Query(None),
    alert_type: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    project=Depends(verify_project_access),
):
    """Get all alerts for a project."""
    supabase = get_supabase()

    query = (
        supabase.table("alerts")
        .select("*")
        .eq("project_id", project_id)
        .order("triggered_at", desc=True)
        .limit(limit)
    )

    if status:
        query = query.eq("status", status)
    if alert_type:
        query = query.eq("alert_type", alert_type)

    result = query.execute()
    return {"alerts": result.data or [], "total": len(result.data or [])}


@router.get("/{project_id}/summary")
async def get_alerts_summary(
    project_id: str,
    project=Depends(verify_project_access),
):
    """Alert counts by status/type — for dashboard badge."""
    supabase = get_supabase()

    result = (
        supabase.table("alerts")
        .select("status, alert_type, severity")
        .eq("project_id", project_id)
        .execute()
    )

    alerts = result.data or []

    return {
        "total": len(alerts),
        "active": sum(1 for a in alerts if a["status"] == "active"),
        "acknowledged": sum(1 for a in alerts if a["status"] == "acknowledged"),
        "resolved": sum(1 for a in alerts if a["status"] == "resolved"),
        "critical": sum(1 for a in alerts if a["severity"] == "critical" and a["status"] == "active"),
        "warning": sum(1 for a in alerts if a["severity"] == "warning" and a["status"] == "active"),
        "by_type": {
            "cost_spike": sum(1 for a in alerts if a["alert_type"] == "cost_spike"),
            "latency_spike": sum(1 for a in alerts if a["alert_type"] == "latency_spike"),
            "quality_drift": sum(1 for a in alerts if a["alert_type"] == "quality_drift"),
            "error_rate": sum(1 for a in alerts if a["alert_type"] == "error_rate"),
        }
    }


@router.post("/{project_id}/acknowledge")
async def acknowledge_alert(
    project_id: str,
    body: AlertActionRequest,
    project=Depends(verify_project_access),
):
    """Mark alert as acknowledged."""
    supabase = get_supabase()

    result = (
        supabase.table("alerts")
        .update({
            "status": "acknowledged",
            "acknowledged_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", body.alert_id)
        .eq("project_id", project_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Alert not found")

    return {"success": True, "alert": result.data[0]}


@router.post("/{project_id}/resolve")
async def resolve_alert(
    project_id: str,
    body: AlertActionRequest,
    project=Depends(verify_project_access),
):
    """Mark alert as resolved."""
    supabase = get_supabase()

    result = (
        supabase.table("alerts")
        .update({
            "status": "resolved",
            "resolved_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", body.alert_id)
        .eq("project_id", project_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Alert not found")

    return {"success": True, "alert": result.data[0]}


@router.delete("/{project_id}/{alert_id}")
async def delete_alert(
    project_id: str,
    alert_id: str,
    project=Depends(verify_project_access),
):
    """Delete an alert."""
    supabase = get_supabase()

    result = (
        supabase.table("alerts")
        .delete()
        .eq("id", alert_id)
        .eq("project_id", project_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Alert not found")

    return {"success": True}