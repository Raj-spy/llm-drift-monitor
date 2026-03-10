"""
Alert Service — creates, stores, and dispatches alerts.
Channels: Slack webhook, email (SendGrid), in-app (stored in DB).
"""
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx

from ..core.config import get_settings
from ..core.supabase import get_supabase

logger = logging.getLogger(__name__)


class AlertService:
    def __init__(self):
        self.supabase = get_supabase()
        self.settings = get_settings()

    # ─── Alert Creation ───────────────────────────────────────────────────────

    def create_cost_alert(
        self,
        project_id: str,
        model: Optional[str],
        metric_value: float,
        threshold_value: float,
        percentage_change: float,
    ) -> dict:
        severity = "critical" if percentage_change > 100 else "warning"
        alert = self._create_alert(
            project_id=project_id,
            alert_type="cost_spike",
            severity=severity,
            title=f"Cost spike: +{percentage_change:.0f}%",
            message=(
                f"Daily cost jumped {percentage_change:.0f}% above the 7-day average. "
                f"Current: ${metric_value:.4f} | Baseline: ${threshold_value:.4f}"
            ),
            model=model,
            metric_value=metric_value,
            threshold_value=threshold_value,
            percentage_change=percentage_change,
        )
        self._dispatch(alert)
        return alert

    def create_latency_alert(
        self,
        project_id: str,
        model: Optional[str],
        metric_value: float,
        threshold_value: float,
        percentage_change: float,
    ) -> dict:
        alert = self._create_alert(
            project_id=project_id,
            alert_type="latency_spike",
            severity="warning",
            title=f"Latency spike: +{percentage_change:.0f}%",
            message=(
                f"Average latency is {percentage_change:.0f}% above the 7-day average. "
                f"Current: {metric_value:.0f}ms | Baseline: {threshold_value:.0f}ms"
            ),
            model=model,
            metric_value=metric_value,
            threshold_value=threshold_value,
            percentage_change=percentage_change,
        )
        self._dispatch(alert)
        return alert

    def create_quality_alert(
        self,
        project_id: str,
        test_name: str,
        model: str,
        score: float,
        threshold: float,
        baseline: Optional[float],
    ) -> dict:
        alert = self._create_alert(
            project_id=project_id,
            alert_type="quality_drift",
            severity="critical" if score < threshold * 0.7 else "warning",
            title=f"Quality drift detected in '{test_name}'",
            message=(
                f"Model '{model}' quality score ({score:.1f}/10) dropped below "
                f"threshold ({threshold}/10). "
                + (f"Baseline was {baseline:.1f}/10." if baseline else "")
            ),
            model=model,
            metric_value=score,
            threshold_value=threshold,
            percentage_change=((score - threshold) / threshold * 100) if threshold else None,
        )
        self._dispatch(alert)
        return alert

    # ─── Internal ─────────────────────────────────────────────────────────────

    def _create_alert(self, **kwargs) -> dict:
        alert = {
            "id": str(uuid.uuid4()),
            "status": "active",
            "slack_sent": False,
            "email_sent": False,
            "triggered_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            **kwargs,
        }
        self.supabase.table("alerts").insert(alert).execute()
        return alert

    def _dispatch(self, alert: dict) -> None:
        """Send alert to all configured channels for the project."""
        project = (
            self.supabase.table("projects")
            .select("slack_webhook_url, alert_email, name")
            .eq("id", alert["project_id"])
            .maybe_single()
            .execute()
        ).data

        if not project:
            return

        slack_sent = False
        email_sent = False

        if project.get("slack_webhook_url"):
            slack_sent = self._send_slack(
                webhook_url=project["slack_webhook_url"],
                alert=alert,
                project_name=project["name"],
            )

        if project.get("alert_email"):
            email_sent = self._send_email(
                to_email=project["alert_email"],
                alert=alert,
                project_name=project["name"],
            )

        # Update sent flags
        self.supabase.table("alerts").update(
            {"slack_sent": slack_sent, "email_sent": email_sent}
        ).eq("id", alert["id"]).execute()

    def _send_slack(self, webhook_url: str, alert: dict, project_name: str) -> bool:
        """Send Slack notification via webhook."""
        severity_emoji = {
            "critical": "🚨",
            "warning": "⚠️",
            "info": "ℹ️",
        }.get(alert.get("severity", "warning"), "⚠️")

        alert_type_label = {
            "cost_spike": "Cost Spike",
            "latency_spike": "Latency Spike",
            "quality_drift": "Quality Drift",
            "error_rate": "Error Rate Spike",
        }.get(alert.get("alert_type", ""), alert.get("alert_type", ""))

        payload = {
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": f"{severity_emoji} LLM Monitor Alert — {project_name}",
                    }
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*Type:*\n{alert_type_label}"},
                        {"type": "mrkdwn", "text": f"*Severity:*\n{alert.get('severity', '').title()}"},
                        {"type": "mrkdwn", "text": f"*Title:*\n{alert.get('title', '')}"},
                        {"type": "mrkdwn", "text": f"*Model:*\n{alert.get('model') or 'All models'}"},
                    ]
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Details:*\n{alert.get('message', '')}",
                    }
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": {"type": "plain_text", "text": "View Dashboard"},
                            "url": f"https://app.llmdriftmonitor.com/projects/{alert['project_id']}/alerts",
                            "style": "danger",
                        }
                    ]
                }
            ]
        }

        try:
            resp = httpx.post(webhook_url, json=payload, timeout=5)
            return resp.status_code == 200
        except Exception as e:
            logger.error(f"Slack notification failed: {e}")
            return False

    def _send_email(self, to_email: str, alert: dict, project_name: str) -> bool:
        """Send email via SendGrid."""
        api_key = self.settings.sendgrid_api_key
        if not api_key:
            return False

        subject = f"[LLM Monitor] {alert.get('title', 'Alert')} — {project_name}"
        html_body = f"""
        <html><body style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #ef4444; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">⚠️ LLM Monitor Alert</h1>
          </div>
          <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb;">
            <h2 style="margin-top: 0;">{alert.get('title', '')}</h2>
            <p><strong>Project:</strong> {project_name}</p>
            <p><strong>Type:</strong> {alert.get('alert_type', '').replace('_', ' ').title()}</p>
            <p><strong>Severity:</strong> {alert.get('severity', '').title()}</p>
            {'<p><strong>Model:</strong> ' + alert['model'] + '</p>' if alert.get('model') else ''}
            <div style="background: white; border-left: 4px solid #ef4444; padding: 12px; margin: 16px 0;">
              <p style="margin: 0;">{alert.get('message', '')}</p>
            </div>
            <a href="https://app.llmdriftmonitor.com/projects/{alert['project_id']}/alerts"
               style="background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px;
                      text-decoration: none; display: inline-block; margin-top: 16px;">
              View Dashboard →
            </a>
          </div>
          <div style="padding: 16px; color: #6b7280; font-size: 12px; text-align: center;">
            LLM Drift Monitor — <a href="https://app.llmdriftmonitor.com/settings/notifications">
            Manage notification settings</a>
          </div>
        </body></html>
        """

        payload = {
            "personalizations": [{"to": [{"email": to_email}]}],
            "from": {"email": self.settings.sendgrid_from_email, "name": "LLM Drift Monitor"},
            "subject": subject,
            "content": [{"type": "text/html", "value": html_body}],
        }

        try:
            resp = httpx.post(
                "https://api.sendgrid.com/v3/mail/send",
                json=payload,
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=10,
            )
            return resp.status_code == 202
        except Exception as e:
            logger.error(f"Email notification failed: {e}")
            return False
