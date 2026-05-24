# LLM Drift Monitor

> Real-time observability for production LLM applications. Track cost, latency, and output quality — with automatic spike detection and alerts.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.12+](https://img.shields.io/badge/python-3.12+-blue.svg)](https://python.org)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org)
[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://llm-drift-monitor-pi.vercel.app)

---

## The Problem

You ship an AI feature. It works great on day one. Then silently — costs spike 3x, latency doubles, output quality degrades. You find out from a user complaint, not your dashboard.

**LLM Drift Monitor fixes this.**

---

## What It Does

- **Cost monitoring** — track spend per model, per project, per day
- **Latency tracking** — p50, p90, p99 breakdowns across all LLM calls
- **Automatic spike detection** — alerts fire within 60 seconds of a cost or latency anomaly
- **Quality drift detection** — run golden prompt evaluations daily; get alerted when output quality drops
- **Multi-provider** — works with OpenAI, Anthropic, Groq, and any OpenAI-compatible API

---

## 2-Minute Setup

**Python:**
```python
pip install llm-monitor python-dotenv

from llm_monitor import monitor

monitor.configure(
    api_key="lmd_your_key",
    project_id="your-project-id",
    backend_url="https://your-backend.railway.app/v1",
)

response = monitor.chat(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}],
)
monitor.flush()
```

**Node.js:**
```javascript
const axios = require('axios');

async function trackLLM(model, response, latencyMs) {
  await axios.post('https://your-backend.railway.app/v1/ingest/batch', {
    events: [{
      id: crypto.randomUUID(),
      project_id: 'your-project-id',
      model, provider: 'openai', environment: 'production',
      prompt_tokens: response.usage?.prompt_tokens || 0,
      completion_tokens: response.usage?.completion_tokens || 0,
      total_tokens: response.usage?.total_tokens || 0,
      latency_ms: latencyMs, cost_usd: 0, status: 'success',
      requested_at: new Date().toISOString(),
      request_id: crypto.randomUUID(),
      tags: {}, user_id: null, session_id: null,
      prompt_text: null, response_text: null, error_message: null,
    }]
  }, { headers: { Authorization: 'Bearer lmd_your_key' } });
}

const start = Date.now();
const response = await openai.chat.completions.create({ ... });
trackLLM('gpt-4o', response, Date.now() - start);
```

---

## Architecture

```
Your App  →  SDK / HTTP  →  FastAPI Backend  →  Supabase
                                  ↓                  ↓
                          Spike Detection      Real-time Dashboard
                                  ↓
                        Slack / Email Alerts
```

**Stack:**
- **Backend** — FastAPI + APScheduler, deployed on Railway
- **Database** — Supabase (Postgres)
- **Frontend** — Next.js 14, deployed on Vercel
- **SDK** — Python (`pip install llm-monitor`)

---

## How Spike Detection Works

Every ingest batch triggers a background check:

```
Last 1 hour avg  vs  7-day rolling baseline
        ↓
Cost spike > 30%?   → Warning alert
Cost spike > 100%?  → Critical alert
Latency spike > 50%? → Warning alert
Error rate > 20%?   → Warning alert
Error rate > 50%?   → Critical alert
```

Thresholds are configurable per project from the dashboard.

---

## Self-Hosting

### 1. Supabase

```bash
# Create project at supabase.com
# SQL Editor → run docs/schema.sql
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, SECRET_KEY

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_API_URL

npm run dev
```

**Environment variables:**

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `SECRET_KEY` | Random secret for JWT signing |
| `NEXT_PUBLIC_SUPABASE_URL` | Same as SUPABASE_URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `NEXT_PUBLIC_API_URL` | Your backend URL |

---

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/v1/ingest/batch` | API Key | Ingest LLM events from SDK |
| `GET` | `/v1/projects` | JWT | List projects |
| `POST` | `/v1/projects` | JWT | Create project |
| `PATCH` | `/v1/projects/{id}` | JWT | Update project settings |
| `GET` | `/v1/projects/{id}/metrics` | JWT | Real-time metrics |
| `GET` | `/v1/alerts/{id}` | JWT | List alerts |
| `GET` | `/v1/alerts/{id}/summary` | JWT | Alert counts by type |
| `POST` | `/v1/alerts/{id}/acknowledge` | JWT | Acknowledge alert |
| `POST` | `/v1/alerts/{id}/resolve` | JWT | Resolve alert |
| `POST` | `/v1/projects/{id}/drift-tests` | JWT | Create drift test |
| `POST` | `/v1/projects/{id}/drift-tests/{id}/run` | JWT | Run drift test |
| `GET` | `/health` | None | Health check |

---

## Quality Drift Detection

Define golden prompts once. Run them daily. Get alerted when output quality drops.

```python
# Create a drift test via API
POST /v1/projects/{id}/drift-tests
{
  "name": "Customer Support Quality",
  "model": "gpt-4o",
  "evaluator_model": "claude-3-5-haiku-20241022",
  "schedule": "daily",
  "golden_prompts": [
    {
      "prompt": "How do I reset my password?",
      "expected_response": "Click forgot password on login page...",
      "weight": 1.0
    }
  ]
}
```

**Scoring (0-10):**
- **9-10** — Perfect quality
- **7-8** — Good, minor differences
- **4-6** — Noticeable degradation
- **0-3** — Major failure

Alert fires when score drops below threshold (default: 7.0).

---

## Project Structure

```
llm-drift-monitor/
├── sdk/                        # Python SDK
│   └── llm_monitor/
│       ├── monitor.py          # Core wrapper
│       ├── config.py           # Configuration
│       └── pricing.py          # Model pricing
│
├── backend/                    # FastAPI backend
│   └── app/
│       ├── api/
│       │   ├── ingest.py       # SDK ingestion + spike detection
│       │   ├── dashboard.py    # Projects, metrics, drift tests
│       │   └── alerts.py       # Alert CRUD
│       ├── core/
│       │   ├── auth.py         # JWT + API key auth (with caching)
│       │   └── limiter.py      # Rate limiting
│       └── services/
│           ├── cost_service.py  # Cost tracking + spike detection
│           ├── drift_service.py # Quality drift (LLM evaluator)
│           └── alert_service.py # Slack + email dispatch
│
├── frontend/                   # Next.js dashboard
│   └── src/
│       ├── app/dashboard/      # Main dashboard
│       └── lib/api.ts          # Typed API client
│
└── docs/
    └── schema.sql              # Supabase schema
```

---

## Roadmap

- [ ] Node.js SDK (`npm install llmpulse`)
- [ ] Webhook support
- [ ] Team collaboration
- [ ] Custom alert rules
- [ ] OpenTelemetry integration

---

## Contributing

PRs welcome. For major changes, open an issue first.

```bash
git clone https://github.com/Raj-spy/llm-drift-monitor
cd llm-drift-monitor
# See backend/README.md and frontend/README.md for setup
```

---

## License

MIT — free to use, modify, and deploy.

---

<p align="center">
  Built by <a href="https://twitter.com/Rajj_704">@Rajj_704</a>
</p>
