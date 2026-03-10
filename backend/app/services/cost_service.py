"""
Cost tracking and aggregation service.

Handles:
- Per-request cost estimation
- Daily metric aggregation (run by cron)
- Cost spike detection
"""
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from ..core.supabase import get_supabase

logger = logging.getLogger(__name__)

# ── Model Pricing (USD per 1M tokens) ────────────────────────────────────────
MODEL_PRICING = {
    # OpenAI
    "gpt-4o":           {"input": 2.50,  "output": 10.00},
    "gpt-4o-mini":      {"input": 0.15,  "output": 0.60},
    "gpt-4-turbo":      {"input": 10.00, "output": 30.00},
    "gpt-4":            {"input": 30.00, "output": 60.00},
    "gpt-3.5-turbo":    {"input": 0.50,  "output": 1.50},
    "o1":               {"input": 15.00, "output": 60.00},
    "o1-mini":          {"input": 3.00,  "output": 12.00},
    # Anthropic
    "claude-opus-4-5":             {"input": 15.00, "output": 75.00},
    "claude-sonnet-4-5":           {"input": 3.00,  "output": 15.00},
    "claude-3-5-sonnet-20241022":  {"input": 3.00,  "output": 15.00},
    "claude-3-5-haiku-20241022":   {"input": 0.80,  "output": 4.00},
    "claude-3-opus-20240229":      {"input": 15.00, "output": 75.00},
    "claude-3-haiku-20240307":     {"input": 0.25,  "output": 1.25},
    # Google
    "gemini-1.5-pro":   {"input": 3.50,  "output": 10.50},
    "gemini-1.5-flash": {"input": 0.075, "output": 0.30},
}


def estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> Optional[float]:
    """Estimate cost in USD for a given model and token counts."""
    pricing = MODEL_PRICING.get(model)
    if not pricing:
        return None
    input_cost = (prompt_tokens / 1_000_000) * pricing["input"]
    output_cost = (completion_tokens / 1_000_000) * pricing["output"]
    return round(input_cost + output_cost, 8)


def get_supported_models() -> list[dict]:
    """Return list of supported models with pricing."""
    return [
        {
            "model": model,
            "input_per_million_usd": p["input"],
            "output_per_million_usd": p["output"],
            "provider": _get_provider(model),
        }
        for model, p in MODEL_PRICING.items()
    ]


def _get_provider(model: str) -> str:
    if model.startswith("gpt-") or model.startswith("o1") or model.startswith("o3"):
        return "openai"
    if model.startswith("claude-"):
        return "anthropic"
    if model.startswith("gemini-"):
        return "google"
    return "unknown"


class CostAggregator:
    """Aggregates raw llm_requests into metrics_daily."""

    def __init__(self):
        self.supabase = get_supabase()

    def aggregate_day(self, project_id: str, target_date: date) -> dict:
        """
        Compute and upsert daily metrics for a project/date combination.
        Typically called by a nightly cron job for the previous day.
        """
        date_str = target_date.isoformat()

        # Fetch all requests for this project/day
        result = (
            self.supabase.table("llm_requests")
            .select("model, prompt_tokens, completion_tokens, total_tokens, latency_ms, cost_usd, status")
            .eq("project_id", project_id)
            .gte("requested_at", f"{date_str}T00:00:00Z")
            .lt("requested_at", f"{(target_date + timedelta(days=1)).isoformat()}T00:00:00Z")
            .execute()
        )

        requests = result.data or []
        if not requests:
            return {}

        # Group by model
        by_model: dict[str, list] = {}
        for req in requests:
            model = req["model"]
            by_model.setdefault(model, []).append(req)

        upserted = {}
        for model, model_requests in by_model.items():
            metrics = self._compute_metrics(model, model_requests, date_str)
            self.supabase.table("metrics_daily").upsert(
                metrics,
                on_conflict="project_id,date,model"
            ).execute()
            upserted[model] = metrics

        return upserted

    def _compute_metrics(self, model: str, requests: list, date_str: str) -> dict:
        successful = [r for r in requests if r["status"] == "success"]
        failed = [r for r in requests if r["status"] != "success"]
        latencies = sorted([r["latency_ms"] for r in successful if r["latency_ms"]])
        costs = [r["cost_usd"] for r in requests if r["cost_usd"]]

        def percentile(data: list, pct: float) -> Optional[float]:
            if not data:
                return None
            k = (len(data) - 1) * pct / 100
            f, c = int(k), int(k) + 1
            if c >= len(data):
                return float(data[-1])
            return data[f] + (data[c] - data[f]) * (k - f)

        total_cost = sum(costs) if costs else 0.0
        total_requests = len(requests)

        return {
            "project_id": requests[0].get("project_id") if requests else None,
            "date": date_str,
            "model": model,
            "total_requests": total_requests,
            "successful_requests": len(successful),
            "failed_requests": len(failed),
            "total_prompt_tokens": sum(r.get("prompt_tokens", 0) or 0 for r in requests),
            "total_completion_tokens": sum(r.get("completion_tokens", 0) or 0 for r in requests),
            "total_tokens": sum(r.get("total_tokens", 0) or 0 for r in requests),
            "total_cost_usd": round(total_cost, 6),
            "avg_cost_per_request": round(total_cost / total_requests, 8) if total_requests else 0,
            "avg_latency_ms": round(sum(latencies) / len(latencies), 1) if latencies else None,
            "p50_latency_ms": percentile(latencies, 50),
            "p90_latency_ms": percentile(latencies, 90),
            "p99_latency_ms": percentile(latencies, 99),
            "min_latency_ms": min(latencies) if latencies else None,
            "max_latency_ms": max(latencies) if latencies else None,
        }

    def aggregate_all_projects_yesterday(self) -> None:
        """Aggregate metrics for all active projects for yesterday. Called nightly."""
        yesterday = date.today() - timedelta(days=1)
        projects = self.supabase.table("projects").select("id").eq("is_active", True).execute()

        for project in projects.data or []:
            try:
                self.aggregate_day(project["id"], yesterday)
                logger.info(f"Aggregated metrics for project {project['id']} on {yesterday}")
            except Exception as e:
                logger.error(f"Failed to aggregate project {project['id']}: {e}")


class CostSpikeDetector:
    """Detects cost spikes by comparing today's metrics to rolling baselines."""

    def __init__(self):
        self.supabase = get_supabase()

    def check_project(self, project_id: str) -> list[dict]:
        """
        Check for cost and latency spikes for a project.
        Returns list of alert dicts if thresholds are breached.
        """
        alerts = []

        # Get project thresholds
        project = (
            self.supabase.table("projects")
            .select("cost_alert_threshold_pct, latency_alert_threshold_pct, id")
            .eq("id", project_id)
            .maybe_single()
            .execute()
        ).data

        if not project:
            return []

        today = date.today()
        yesterday = today - timedelta(days=1)
        week_ago = today - timedelta(days=7)

        # Fetch last 8 days of daily totals
        metrics_result = (
            self.supabase.table("metrics_daily")
            .select("date, total_cost_usd, avg_latency_ms, total_requests")
            .eq("project_id", project_id)
            .gte("date", week_ago.isoformat())
            .order("date", desc=True)
            .execute()
        )

        daily = metrics_result.data or []
        if len(daily) < 2:
            return []

        yesterday_data = next((d for d in daily if d["date"] == yesterday.isoformat()), None)
        prev_7_days = [d for d in daily if d["date"] < yesterday.isoformat()]

        if not yesterday_data or not prev_7_days:
            return []

        # Compute 7-day averages
        avg_cost = sum(d["total_cost_usd"] for d in prev_7_days) / len(prev_7_days)
        avg_latencies = [d["avg_latency_ms"] for d in prev_7_days if d["avg_latency_ms"]]
        avg_latency = sum(avg_latencies) / len(avg_latencies) if avg_latencies else None

        # Check cost spike
        if avg_cost > 0:
            cost_change_pct = ((yesterday_data["total_cost_usd"] - avg_cost) / avg_cost) * 100
            if cost_change_pct > project["cost_alert_threshold_pct"]:
                alerts.append({
                    "project_id": project_id,
                    "alert_type": "cost_spike",
                    "severity": "critical" if cost_change_pct > 100 else "warning",
                    "title": f"Cost spike detected: +{cost_change_pct:.0f}%",
                    "message": (
                        f"Daily cost jumped from ${avg_cost:.4f} (7-day avg) "
                        f"to ${yesterday_data['total_cost_usd']:.4f} "
                        f"({cost_change_pct:.0f}% increase)."
                    ),
                    "metric_value": yesterday_data["total_cost_usd"],
                    "threshold_value": avg_cost,
                    "percentage_change": round(cost_change_pct, 2),
                })

        # Check latency spike
        if avg_latency and yesterday_data.get("avg_latency_ms"):
            latency_change_pct = (
                (yesterday_data["avg_latency_ms"] - avg_latency) / avg_latency
            ) * 100
            if latency_change_pct > project["latency_alert_threshold_pct"]:
                alerts.append({
                    "project_id": project_id,
                    "alert_type": "latency_spike",
                    "severity": "warning",
                    "title": f"Latency spike detected: +{latency_change_pct:.0f}%",
                    "message": (
                        f"Average latency jumped from {avg_latency:.0f}ms (7-day avg) "
                        f"to {yesterday_data['avg_latency_ms']:.0f}ms."
                    ),
                    "metric_value": yesterday_data["avg_latency_ms"],
                    "threshold_value": avg_latency,
                    "percentage_change": round(latency_change_pct, 2),
                })

        return alerts
