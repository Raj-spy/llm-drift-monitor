import os
import httpx
import uuid
from datetime import datetime, timezone

BASE = os.getenv("BASE_URL", "http://localhost:8000/v1")
PROJECT_ID = os.getenv("PROJECT_ID")

JWT = os.getenv("JWT_TOKEN")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not all([PROJECT_ID, JWT, SUPABASE_URL, SUPABASE_KEY]):
    raise ValueError("Missing required environment variables")

headers = {"Authorization": f"Bearer {JWT}"}

sb_headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# Insert critical alert
r = httpx.post(
    f"{SUPABASE_URL}/rest/v1/alerts",
    json={
        "id": str(uuid.uuid4()),
        "project_id": PROJECT_ID,
        "alert_type": "cost_spike",
        "severity": "critical",
        "title": "Cost spike: +200%",
        "message": "Daily cost jumped 200% above baseline",
        "model": "llama-3.3-70b-versatile",
        "metric_value": 0.05,
        "threshold_value": 0.016,
        "percentage_change": 200,
        "status": "active",
        "triggered_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "slack_sent": False,
        "email_sent": False,
    },
    headers=sb_headers,
)

print("Insert:", r.status_code)

r = httpx.get(f"{BASE}/alerts/{PROJECT_ID}/summary", headers=headers)
print("Summary:", r.status_code, r.json())

r = httpx.get(f"{BASE}/alerts/{PROJECT_ID}", headers=headers)
print("Alerts:", r.status_code, r.json())