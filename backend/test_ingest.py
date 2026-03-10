import requests
from datetime import datetime, timezone
import uuid

url = "http://127.0.0.1:8000/v1/ingest/batch"

headers = {
    "Authorization": "Bearer lmd_Th5iI1sJSaI9QSL47yWWHXOq1_7bsCF",
    "Content-Type": "application/json",
}

data = {
    "events": [
        {
            "id": str(uuid.uuid4()),
            "project_id": "376ffa15-c2ab-4bd1-b13d-ecd28b65d447",
            "provider": "openai",
            "model": "gpt-4o",
            "prompt_tokens": 10,
            "completion_tokens": 5,
            "latency_ms": 200,
            "cost_usd": 0.001,
            "requested_at": datetime.now(timezone.utc).isoformat()
        }
    ]
}

res = requests.post(url, json=data, headers=headers)

print(res.status_code)
print(res.json())