import httpx
import uuid
from datetime import datetime, timezone

BASE = "http://localhost:8000/v1"
PROJECT_ID = "a7bc3d84-f958-471e-a400-f09b0c794f86"
JWT = "eyJhbGciOiJFUzI1NiIsImtpZCI6ImU0NWUwODI0LTkwOWEtNDQzOC1iMzdlLWRlZTcwOGYxZTdhYyIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3lzbW1zeXB5dnpheGNrdHNhZHR4LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJiZWM1MjhmNi01NmRlLTRhMDAtODMxZi05YTFiMzE4MzgzYmEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzczMzk0NTcyLCJpYXQiOjE3NzMzOTA5NzIsImVtYWlsIjoieW95ZWs0NjIwNkBpbmRldmdvLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWwiOiJ5b3llazQ2MjA2QGluZGV2Z28uY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImZ1bGxfbmFtZSI6IkFuaWtldCBwcmFqYXBhdCIsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwic3ViIjoiYmVjNTI4ZjYtNTZkZS00YTAwLTgzMWYtOWExYjMxODM4M2JhIn0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3NzMzOTA5NzJ9XSwic2Vzc2lvbl9pZCI6IjhiNjJmNTZjLTVmYjAtNGYxZC1hYzBlLTUyNzU4Nzk1ZDk1MiIsImlzX2Fub255bW91cyI6ZmFsc2V9.gQxC-8UmqxNiCZkQlrf7Vt5yN5-M9MqMCWgEnEDn5Dba-bejCvN78Akc576XV1QTDIgAY_AAkJSBNANYfIe_tw"

SUPABASE_URL = "https://ysmmsypyvzaxcktsadtx.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzbW1zeXB5dnpheGNrdHNhZHR4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk3MTY1NiwiZXhwIjoyMDg4NTQ3NjU2fQ.pvsL1YSSZqie-knWUr55rXyvLPhWIDXXSfaoKr4Izo4"

headers = {"Authorization": f"Bearer {JWT}"}
sb_headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

# Insert critical alert
r = httpx.post(f"{SUPABASE_URL}/rest/v1/alerts", json={
    "id": str(uuid.uuid4()),
    "project_id": PROJECT_ID,
    "alert_type": "cost_spike",
    "severity": "critical",
    "title": "Cost spike: +200%",
    "message": "Daily cost jumped 200% above 7-day average. Current: $0.05 | Baseline: $0.016",
    "model": "llama-3.3-70b-versatile",
    "metric_value": 0.05,
    "threshold_value": 0.016,
    "percentage_change": 200,
    "status": "active",
    "triggered_at": datetime.now(timezone.utc).isoformat(),
    "created_at": datetime.now(timezone.utc).isoformat(),
    "slack_sent": False,
    "email_sent": False,
}, headers=sb_headers)
print("Insert:", r.status_code)

# Summary
r = httpx.get(f"{BASE}/alerts/{PROJECT_ID}/summary", headers=headers)
print("Summary:", r.status_code, r.json())

# All alerts
r = httpx.get(f"{BASE}/alerts/{PROJECT_ID}", headers=headers)
print("Alerts:", r.status_code, r.json())