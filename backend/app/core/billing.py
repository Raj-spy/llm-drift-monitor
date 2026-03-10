"""
Subscription tier enforcement middleware.
Checks request limits and feature access per plan.
"""
from typing import Optional
from fastapi import HTTPException, status

# Plan definitions
PLANS = {
    "starter": {
        "monthly_requests": 50_000,
        "projects": 2,
        "drift_tests": 5,
        "data_retention_days": 30,
        "alert_channels": ["email"],
        "api_keys_per_project": 3,
        "price_monthly": 49,
    },
    "growth": {
        "monthly_requests": 100_000,
        "projects": 10,
        "drift_tests": 20,
        "data_retention_days": 90,
        "alert_channels": ["email", "slack"],
        "api_keys_per_project": 10,
        "price_monthly": 99,
    },
    "scale": {
        "monthly_requests": -1,           # unlimited
        "projects": -1,
        "drift_tests": -1,
        "data_retention_days": 365,
        "alert_channels": ["email", "slack", "webhook"],
        "api_keys_per_project": -1,
        "price_monthly": 299,
    },
    "enterprise": {
        "monthly_requests": -1,
        "projects": -1,
        "drift_tests": -1,
        "data_retention_days": -1,        # unlimited
        "alert_channels": ["email", "slack", "webhook", "pagerduty"],
        "api_keys_per_project": -1,
        "price_monthly": 0,               # custom
    },
}


def get_plan_limits(tier: str) -> dict:
    return PLANS.get(tier, PLANS["starter"])


def enforce_project_limit(user: dict) -> None:
    """Raise 403 if user has hit their project limit."""
    from ..core.supabase import get_supabase
    limits = get_plan_limits(user["subscription_tier"])
    if limits["projects"] == -1:
        return

    supabase = get_supabase()
    count_result = (
        supabase.table("projects")
        .select("id", count="exact")
        .eq("owner_id", user["id"])
        .eq("is_active", True)
        .execute()
    )
    count = count_result.count or 0
    if count >= limits["projects"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Project limit reached ({limits['projects']} on {user['subscription_tier']} plan). "
                "Upgrade at https://app.llmdriftmonitor.com/billing"
            ),
        )


def enforce_drift_test_limit(user: dict, project_id: str) -> None:
    """Raise 403 if project has hit drift test limit."""
    from ..core.supabase import get_supabase
    limits = get_plan_limits(user["subscription_tier"])
    if limits["drift_tests"] == -1:
        return

    supabase = get_supabase()
    count_result = (
        supabase.table("drift_tests")
        .select("id", count="exact")
        .eq("project_id", project_id)
        .eq("is_active", True)
        .execute()
    )
    count = count_result.count or 0
    if count >= limits["drift_tests"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Drift test limit reached ({limits['drift_tests']} on {user['subscription_tier']} plan). "
                "Upgrade at https://app.llmdriftmonitor.com/billing"
            ),
        )


def enforce_monthly_request_limit(user: dict) -> None:
    """Raise 429 if user has hit their monthly ingestion limit."""
    limits = get_plan_limits(user["subscription_tier"])
    if limits["monthly_requests"] == -1:
        return
    if user.get("requests_this_month", 0) >= limits["monthly_requests"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Monthly request limit ({limits['monthly_requests']:,}) reached. "
                f"Resets on the 1st. Upgrade at https://app.llmdriftmonitor.com/billing"
            ),
        )
