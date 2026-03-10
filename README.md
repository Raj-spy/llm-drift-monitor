# LLM Cost & Quality Drift Monitor
_7$ew2_iD39kbkn

> Production-ready LLM observability. Monitor cost, latency, and output quality drift across your AI applications.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.12+](https://img.shields.io/badge/python-3.12+-blue.svg)](https://python.org)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org)

---

## Quick Start

```python
pip install llm-monitor

from llm_monitor import monitor

monitor.configure(
    api_key="lmd_your_key_here",
    project_id="your-project-uuid",
)

# Drop-in replacement for OpenAI calls
response = monitor.chat(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

That's it. Every call is now tracked for cost, latency, and quality.

---

## Architecture

```
Customer App → Python SDK → FastAPI Backend → Supabase DB
                                    ↓               ↓
                            Drift Detection    Next.js Dashboard
                                    ↓               ↓
                            Slack/Email Alerts   Real-time Charts
```

---

## Project Structure

```
llm-drift-monitor/
├── sdk/                     # Python SDK (pip package)
│   └── llm_monitor/
│       ├── __init__.py      # Public API: monitor, LLMMonitor, MonitorConfig
│       ├── monitor.py       # Core wrapper (OpenAI + Anthropic)
│       ├── config.py        # Configuration
│       └── pricing.py       # Model pricing database
│
├── backend/                 # FastAPI backend (Docker)
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py          # FastAPI app + lifespan scheduler
│       ├── api/
│       │   ├── ingest.py    # POST /ingest/batch (SDK data)
│       │   └── dashboard.py # Projects, metrics, alerts, drift tests
│       ├── core/
│       │   ├── config.py    # Settings (pydantic-settings)
│       │   ├── auth.py      # JWT + API key auth
│       │   └── supabase.py  # Supabase client
│       ├── models/
│       │   └── schemas.py   # Pydantic request/response models
│       └── services/
│           ├── cost_service.py   # Cost tracking + spike detection
│           ├── drift_service.py  # Quality drift detection (LLM evaluator)
│           └── alert_service.py  # Slack + email alerting
│
├── frontend/                # Next.js dashboard (Vercel)
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx     # Main dashboard UI
│       │   └── globals.css
│       └── lib/
│           └── api.ts       # Typed API client
│
├── docs/
│   ├── ARCHITECTURE.md      # Full system design
│   └── schema.sql           # Supabase schema (run this first)
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Deployment Guide

### Step 1: Supabase Setup

1. Create project at [supabase.com](https://supabase.com)
2. Go to SQL Editor → run `docs/schema.sql`
3. Copy your project URL and service role key

```bash
# From Supabase Dashboard → Settings → API
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...
SUPABASE_ANON_KEY=eyJhbGci...
```

### Step 2: Backend (Docker)

```bash
cd backend
cp ../.env.example .env
# Fill in your values in .env

# Local development
docker compose up -d

# Production (with nginx + TLS)
docker compose --profile production up -d

# Verify
curl http://localhost:8000/health
# {"status":"ok","version":"0.1.0","environment":"development"}
```

### Step 3: Frontend (Vercel)

```bash
cd frontend
npm install

# Set environment variables
cp ../.env.example .env.local
# Fill in NEXT_PUBLIC_* variables

# Local development
npm run dev

# Deploy to Vercel
npx vercel --prod
```

Set these in Vercel Dashboard → Project Settings → Environment Variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL` (your backend URL)

### Step 4: SDK (PyPI)

```bash
cd sdk

# Install locally for testing
pip install -e ".[all]"

# Publish to PyPI
pip install build twine
python -m build
twine upload dist/*
```

---

## SDK Usage

### Basic Usage

```python
from llm_monitor import monitor

# Configure once at startup
monitor.configure(
    api_key="lmd_your_api_key",
    project_id="your-project-uuid",
    # Optional:
    capture_prompt=True,      # Store prompt text
    capture_response=True,    # Store response text
    flush_interval=5.0,       # Seconds between auto-flushes
    debug=True,               # Log captured events
)

# Use like OpenAI
response = monitor.chat(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Summarize this article: ..."}],
    user_id="user_123",       # Optional: track per-user
    session_id="sess_456",    # Optional: track conversations
    tags={"feature": "summary", "team": "growth"},  # Custom tags
)
```

### Wrap Existing Clients

```python
import openai
from llm_monitor import monitor

# Wrap your existing client — zero code changes needed
client = monitor.wrap_openai(openai.OpenAI())

# Use exactly like before
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### Environment Variables

```bash
LLM_MONITOR_API_KEY=lmd_...
LLM_MONITOR_PROJECT_ID=uuid
LLM_MONITOR_BACKEND_URL=https://api.yourdomain.com
LLM_MONITOR_DEBUG=true
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/ingest/batch` | SDK data ingestion (API key auth) |
| `GET` | `/v1/projects` | List projects |
| `POST` | `/v1/projects` | Create project |
| `GET` | `/v1/projects/{id}/metrics` | Aggregated metrics |
| `GET` | `/v1/projects/{id}/alerts` | Active alerts |
| `PATCH` | `/v1/projects/{id}/alerts/{id}` | Acknowledge/resolve alert |
| `POST` | `/v1/projects/{id}/drift-tests` | Create drift test |
| `POST` | `/v1/projects/{id}/drift-tests/{id}/run` | Run drift test manually |
| `GET` | `/health` | Health check |

---

## Pricing Tiers

| Plan | Price | Requests/month | Projects | Drift Tests | Support |
|------|-------|----------------|----------|-------------|---------|
| **Starter** | $49/mo | 50,000 | 2 | 5 | Email |
| **Growth** | $99/mo | 100,000 | 10 | 20 | Priority |
| **Scale** | $299/mo | Unlimited | Unlimited | Unlimited | Slack |

---

## Quality Drift Detection Algorithm

1. **Upload golden prompts** — define 5-50 test prompts with optional expected responses
2. **Daily runner** — scheduled job calls your LLM model with each prompt
3. **Evaluator scoring** — Claude (or GPT-4o) scores each response 0-10:
   - 10: Perfect quality, matches expected output
   - 7-9: Good, minor differences
   - 4-6: Noticeable quality degradation
   - 0-3: Major failure
4. **Weighted average** — compute overall score (you can weight important prompts higher)
5. **Baseline comparison** — compare to established baseline from first run
6. **Alert trigger** — if score drops below threshold (default: 7.0), fire alert via Slack + email

---

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add feature'`
4. Push: `git push origin feature/my-feature`
5. Create Pull Request

---

## License

MIT — see [LICENSE](LICENSE)
