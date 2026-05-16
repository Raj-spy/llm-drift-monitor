LLM Drift Monitor
Production observability for LLM applications. Real-time cost, latency, and quality monitoring with automatic anomaly detection and alerting.
LICENSE
https://python.org
https://nextjs.org
https://llm-drift-monitor-pi.vercel.app
Overview
Production LLM deployments degrade silently. Cost spikes 3x overnight. Latency doubles. Output quality drifts. Most teams discover this from user complaints, not their monitoring stack.
LLM Drift Monitor provides real-time observability for multi-provider LLM workloads — cost tracking, latency analysis, automatic anomaly detection, and quality drift monitoring through golden prompt evaluation.
Live deployment: llm-drift-monitor-pi.vercel.app
Capabilities
Table
Feature	Description
Cost Monitoring	Per-model, per-project, per-day spend tracking with budget alerting
Latency Analysis	p50, p90, p99 percentile breakdowns across all LLM providers
Anomaly Detection	Automatic spike detection against 7-day rolling baselines; alerts within 60 seconds
Quality Drift	Golden prompt evaluation with LLM-as-judge scoring; daily automated runs
Multi-Provider	OpenAI, Anthropic, Groq, and any OpenAI-compatible API
Quick Start
Python SDK
Python
Copy
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
Node.js
JavaScript
Copy
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
Architecture
plain
Copy
┌─────────┐    ┌─────────────┐    ┌──────────────┐    ┌──────────┐
│ Your App │───▶│ SDK / HTTP  │───▶│ FastAPI      │───▶│ Supabase │
│         │    │             │    │ Backend      │    │ (Postgres│
└─────────┘    └─────────────┘    └──────┬───────┘    └──────────┘
                                         │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
            ┌─────────────┐      ┌─────────────────┐      ┌──────────────┐
            │ Spike       │      │ Real-time       │      │ Slack /      │
            │ Detection   │      │ Dashboard       │      │ Email Alerts │
            └─────────────┘      └─────────────────┘      └──────────────┘
Infrastructure:
Backend — FastAPI + APScheduler on Railway
Database — Supabase (PostgreSQL)
Frontend — Next.js 14 on Vercel
SDK — Python package (llm-monitor)
Anomaly Detection
Background processing on every ingest batch:
Table
Metric	Baseline	Warning Threshold	Critical Threshold
Cost	7-day rolling average	+30%	+100%
Latency	7-day rolling average	+50%	—
Error Rate	7-day rolling average	>20%	>50%
Thresholds are configurable per project via dashboard.
Quality Drift Detection
Automated evaluation pipeline:
Define golden prompts with expected responses
Schedule daily evaluation runs
LLM-as-judge scores output quality (0-10 scale)
Alert fires when score drops below configurable threshold (default: 7.0)
Scoring:
9-10 — Production-ready quality
7-8 — Acceptable with minor degradation
4-6 — Significant drift detected
0-3 — Critical quality failure
Self-Hosting
Prerequisites
Supabase project
Railway or equivalent hosting
Node.js 18+ (frontend)
Python 3.12+ (backend)
Database Setup
bash
Copy
# Create project at supabase.com
# Run schema initialization: docs/schema.sql
Backend Deployment
bash
Copy
cd backend
cp .env.example .env
# Configure: SUPABASE_URL, SUPABASE_SERVICE_KEY, SECRET_KEY

pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
Frontend Deployment
bash
Copy
cd frontend
npm install
cp .env.example .env.local
# Configure: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_API_URL

npm run build
# Deploy to Vercel or preferred platform
Required Environment Variables
Table
Variable	Purpose	Required By
SUPABASE_URL	Database connection	Backend
SUPABASE_SERVICE_KEY	Service-role database access	Backend
SECRET_KEY	JWT signing	Backend
NEXT_PUBLIC_SUPABASE_URL	Client-side database access	Frontend
NEXT_PUBLIC_SUPABASE_ANON_KEY	Anonymous database access	Frontend
NEXT_PUBLIC_API_URL	Backend API endpoint	Frontend
API Reference
Event Ingestion
Table
Method	Endpoint	Authentication	Description
POST	/v1/ingest/batch	API Key	Bulk LLM event ingestion
Project Management
Table
Method	Endpoint	Authentication	Description
GET	/v1/projects	JWT	List all projects
POST	/v1/projects	JWT	Create new project
PATCH	/v1/projects/{id}	JWT	Update project configuration
GET	/v1/projects/{id}/metrics	JWT	Real-time metrics aggregation
Alerting
Table
Method	Endpoint	Authentication	Description
GET	/v1/alerts/{id}	JWT	List active alerts
GET	/v1/alerts/{id}/summary	JWT	Alert counts by severity
POST	/v1/alerts/{id}/acknowledge	JWT	Acknowledge alert
POST	/v1/alerts/{id}/resolve	JWT	Resolve alert
Quality Drift
Table
Method	Endpoint	Authentication	Description
POST	/v1/projects/{id}/drift-tests	JWT	Create drift test configuration
POST	/v1/projects/{id}/drift-tests/{id}/run	JWT	Execute drift evaluation
Health
Table
Method	Endpoint	Authentication	Description
GET	/health	None	Service health check
Project Structure
plain
Copy
llm-drift-monitor/
├── sdk/
│   └── llm_monitor/
│       ├── monitor.py          # Instrumentation wrapper
│       ├── config.py           # Client configuration
│       └── pricing.py          # Provider pricing catalog
│
├── backend/
│   └── app/
│       ├── api/
│       │   ├── ingest.py       # Event ingestion + anomaly detection
│       │   ├── dashboard.py    # Metrics + project management
│       │   └── alerts.py       # Alert lifecycle management
│       ├── core/
│       │   ├── auth.py         # JWT + API key authentication
│       │   └── limiter.py      # Request rate limiting
│       └── services/
│           ├── cost_service.py      # Cost aggregation + spike detection
│           ├── drift_service.py     # Quality evaluation pipeline
│           └── alert_service.py     # Notification dispatch
│
├── frontend/
│   └── src/
│       ├── app/dashboard/      # Analytics dashboard
│       └── lib/api.ts          # Typed API client
│
└── docs/
    └── schema.sql              # Database schema definition
Development
bash
Copy
git clone https://github.com/Raj-spy/llm-drift-monitor
cd llm-drift-monitor

# Backend setup
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend setup
cd ../frontend
npm install
npm run dev
Roadmap
Table
Item	Status	Priority
Node.js SDK	Planned	High
Webhook integrations	Planned	Medium
Team collaboration features	Planned	Medium
Custom alert rule engine	Planned	Medium
OpenTelemetry integration	Planned	Low
Contributing
Pull requests welcome. For substantial changes, open an issue for discussion prior to implementation.
License
MIT — see LICENSE for details.
<p align="center">
  <a href="https://twitter.com/Rajj_704">@Rajj_704</a>
</p>
