import requests
import uuid
from datetime import datetime, timezone
import random

url = "http://127.0.0.1:8000/v1/ingest/batch"

headers = {
    "Authorization": "Bearer lmd_Th5iI1sJSaI9QSL47yWWHXOq1_7bsCF",
    "Content-Type": "application/json",
}

events = []

for i in range(50):
    events.append({
        "id": str(uuid.uuid4()),
        "project_id": "376ffa15-c2ab-4bd1-b13d-ecd28b65d447",
        "provider": "openai",
        "model": "gpt-4o",
        "prompt_tokens": random.randint(50,200),
        "completion_tokens": random.randint(20,80),
        "latency_ms": random.randint(200,1200),
        "cost_usd": random.random()/100,
        "requested_at": datetime.now(timezone.utc).isoformat()
    })

res = requests.post(url, json={"events": events}, headers=headers)

print(res.json())