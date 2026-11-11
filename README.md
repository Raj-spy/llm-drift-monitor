# LLM Drift Monitor

LLM Drift Monitor is an early-stage, multi-component observability application for teams building products with large language models. It is intended to collect model-call telemetry, organize it by application/project, display usage and quality information, run golden-prompt evaluations, and raise alerts.

This README is a maintainer's map of the repository: what each directory/file owns, how requests move through the system, how to run it, and which implementation gaps to revisit. It describes the checked-in code, not an assurance that every planned SaaS capability is complete.

## Contents

- [Project status at a glance](#project-status-at-a-glance)
- [Architecture](#architecture)
- [End-to-end workflows](#end-to-end-workflows)
- [Data model](#data-model)
- [HTTP API](#http-api)
- [Technology and external services](#technology-and-external-services)
- [Run locally](#run-locally)
- [Configuration](#configuration)
- [Deploy](#deploy)
- [Tests and quality checks](#tests-and-quality-checks)
- [Repository map: every source/configuration file](#repository-map-every-sourceconfiguration-file)
- [Current gaps and scale-up checklist](#current-gaps-and-scale-up-checklist)
- [Suggested re-entry path](#suggested-re-entry-path)

## Project status at a glance

| Area | Current implementation |
|---|---|
| Web UI | Next.js 14 App Router frontend. Landing page, Supabase email/password auth, first-project onboarding, and a project dashboard are implemented. |
| API | FastAPI app with project, API-key, telemetry-ingest, metrics, alerts, drift-test, and Stripe billing endpoints. |
| Authentication | Supabase Auth signs users in. The backend looks up a matching `public.users` profile. Dashboard routes use a Supabase-issued bearer token; ingest uses an `lmd_...` project API key. |
| Database | Supabase Postgres. `docs/schema.sql` defines the tables, indexes, RLS policies, triggers, and views. |
| SDK | Python package named `llm-monitor` (`llm_monitor` import). It wraps provider calls, creates telemetry events, queues them in-process, and sends batches to the API. |
| Deployment files | Render/Vercel can host the backend/frontend separately. Docker Compose, Kubernetes, Helm, and GitHub Actions files are also present, but require environment-specific review. |
| Product maturity | Treat as a prototype/early product. Review the [known gaps](#current-gaps-and-scale-up-checklist) before inviting customers or relying on scheduled work and usage limits. |

### Important distinction: intended design vs. implemented design

Some older docs and comments describe capabilities more strongly than the current code supports. For example, the SQL schema has a daily metrics table, but the dashboard metrics endpoint currently calculates its response from raw requests; APScheduler is configured in the API lifespan but the current lifespan implementation is malformed; the app has per-user projects rather than organization/team workspaces; and there is no durable job queue in the ingest path. Where implementation and docs differ, trust the code and the warnings in this README.

## Architecture

```text
Customer application
  └─ Python SDK or direct HTTP
       └─ POST /v1/ingest/batch
            ├─ Validate project API key
            ├─ Normalize / estimate request cost
            ├─ Insert raw event rows into Supabase
            └─ Schedule an in-process spike-check task

Browser
  ├─ Supabase Auth (sign-up/sign-in/session)
  └─ Next.js UI
       └─ FastAPI dashboard routes (Supabase access token)
            ├─ Verify token and user/project ownership
            └─ Read/write Supabase using backend service-role client

FastAPI services
  ├─ Cost service: model pricing, aggregation, anomaly checks
  ├─ Drift service: run prompts against a provider and evaluate responses
  ├─ Alert service: persist alerts and optionally send Slack/email
  └─ Billing routes: Stripe checkout, portal, and webhook updates

Supabase
  ├─ Auth identities
  ├─ User profile and tenant-owned project data
  └─ Raw LLM events, derived metrics, drift tests/results, alerts, API keys
```

### Main component boundaries

1. **`sdk/`** belongs in the customer application. It instruments model calls and communicates with the backend; it does not connect directly to Supabase.
2. **`backend/app/api/`** is the HTTP boundary. Routers validate payloads/authentication, delegate computations to `services/`, and use the shared Supabase client.
3. **`backend/app/services/`** owns cost calculations/aggregation, drift execution, and alert delivery.
4. **`backend/app/core/`** owns settings, Supabase client creation, request authentication, plan definitions, and rate-limiter setup.
5. **`docs/schema.sql`** is the database contract. Tables and foreign keys establish the relationships used by both the UI and backend.
6. **`frontend/src/`** contains the browser application. It uses Supabase directly for user authentication and calls the FastAPI API for product data.

The backend uses the Supabase **service-role** key for database calls. That key bypasses Row Level Security, so the API's own authentication and project-ownership checks are security-critical. Never expose this key to the browser or commit it.

## End-to-end workflows

### 1. Sign up, sign in, and first project

1. The browser Supabase client is created in `frontend/src/lib/supabase.ts`.
2. `frontend/src/hooks/useAuth.tsx` provides session state and calls Supabase Auth for email/password sign-in and sign-up.
3. After sign-in, `frontend/src/app/login/page.tsx` routes the user to `/onboarding`.
4. `frontend/src/app/onboarding/page.tsx` calls `GET /v1/projects`. If the account already owns a project, it routes to `/dashboard`; otherwise it asks for an application name, environment, and optional primary model.
5. Project creation calls `POST /v1/projects`; creation of the initial ingestion key calls `POST /v1/projects/{project_id}/api-keys`.
6. The API stores only the generated key's hash and prefix; the full key is returned once so the user can save it.
7. After saving the key, the user can go straight to the dashboard or view SDK integration examples.

Supabase's `on_auth_user_created` trigger in `docs/schema.sql` creates the corresponding `public.users` profile from the new Auth identity. The profile is what backend dashboard routes look up.

### 2. Capture and ingest an LLM call

1. The SDK's `LLMMonitor` uses model names to choose a provider and wraps/calls the provider client.
2. It extracts model, provider, prompt/response (if enabled), token counts, elapsed time, cost estimate, request metadata, tags, and timestamps.
3. `BatchFlusher` enqueues events in a bounded in-process queue and sends batches on a background thread. A full queue drops telemetry rather than blocking the application call.
4. The SDK attaches the project API key in the HTTP Authorization header when it posts to `/v1/ingest/batch`.
5. `backend/app/core/auth.py` hashes the presented key with SHA-256, looks up an active key and project, and caches the result in process for a short time.
6. `backend/app/api/ingest.py` uses the project's ID from the key record (not the event-supplied project ID), validates/truncates event data, estimates cost when none was provided, and inserts into `llm_requests` in chunks.
7. The route schedules a spike check using FastAPI `BackgroundTasks`. This task is in-process and is not a durable queue.

### 3. Load dashboard data

1. The browser gets the current Supabase session and access token from `useAuth`.
2. `frontend/src/lib/api.ts` sends requests to `NEXT_PUBLIC_API_URL` and attaches the access token as a bearer token.
3. Backend routes call `get_current_user_from_jwt`, load the user profile, and use `verify_project_access` before project-specific operations.
4. The backend's service-role Supabase client reads the project and its data.
5. The dashboard renders overview, cost, latency, model, drift, alert, API-key, and settings views. Data refresh is primarily request/poll based; it is not a WebSocket live stream.

### 4. Costs, alerting, and quality drift

- **Cost estimate:** both SDK and backend have local model-pricing tables. Unknown model names may have no estimate. Keep the two tables aligned or move pricing to a shared/versioned source.
- **Daily aggregation:** `CostAggregator` groups raw request records by project/date/model and upserts `metrics_daily`.
- **Cost/latency/error alerts:** the ingest route performs a current-hour check against data in `metrics_daily`; the cost service also contains a daily baseline detector. Alert rows are created in `alerts`.
- **Notifications:** `AlertService` stores alerts, optionally posts to a project Slack incoming-webhook URL, and optionally sends email through SendGrid.
- **Quality drift:** a drift test stores golden prompts. A run calls the configured target model, asks an evaluator model for a JSON score, computes a weighted score, saves results, updates the baseline/latest score, and creates a quality alert below the project's threshold.
- **Scheduled runs:** APScheduler jobs are intended to aggregate metrics and run hourly/daily checks. See the scheduler issue under [Current gaps](#current-gaps-and-scale-up-checklist) before relying on them.

### 5. Billing

`backend/app/api/billing.py` creates Stripe checkout and customer-portal sessions and updates profile subscription fields from Stripe webhook events. Stripe is optional in local development. Plan definitions also exist in `backend/app/core/billing.py`; billing flows and limit enforcement need end-to-end verification before charging users.

## Data model

The authoritative DDL is [`docs/schema.sql`](./docs/schema.sql).

| Table/view | Purpose and relationships |
|---|---|
| `auth.users` | Supabase-managed identity and credentials. Do not insert user passwords into `public.users`. |
| `public.users` | App profile, keyed by `auth.users.id`; stores email, name, subscription fields, and request counters. A trigger creates a profile on Auth-user insertion. |
| `projects` | Application/workspace unit. Each project belongs to one `public.users` row. Stores environment, default model, alert thresholds, and notification destinations. |
| `api_keys` | Ingest credentials linked to a project and owner. Stores hash, display prefix, active state, optional expiry metadata, and last-used time. |
| `llm_requests` | Raw high-volume telemetry linked to a project: model/provider, tokens, cost, latency, user/session metadata, tags, status, prompt/response, timestamps. |
| `metrics_daily` | Intended pre-aggregated project/date/model totals and latency percentiles. Populated by `CostAggregator`. |
| `drift_tests` | Golden prompt test definition linked to a project, with target/evaluator model, schedule, active state, and latest/baseline scores. |
| `drift_test_results` | A single run and its per-prompt result JSON; linked to a drift test and project. |
| `alerts` | Cost, latency, quality, and error-rate notifications with severity, state, metric context, timestamps, and delivery flags. |
| `v_cost_trend_30d` | SQL view summarizing daily metrics for a rolling 30-day window. |
| `v_model_breakdown` | SQL view grouping daily metrics by project and model for a rolling 30-day window. |

The schema enables RLS and defines ownership policies for most user-facing tables. Backend service-role calls bypass those policies; route-level checks remain necessary. The SQL contains an old comment saying API key hashes are bcrypt; actual current key creation/auth code uses SHA-256, so treat the code as authoritative and update the comment when changing the schema.

## HTTP API

All product routes are mounted under `/v1`; `/health` and `/` are at the root.

### System

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Basic service/version response. |
| `GET` | `/health` | Health-check response used by Render/Docker. |

### Projects, keys, metrics, and dashboard

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/projects` | Create a project for the authenticated user. |
| `GET` | `/v1/projects` | List the authenticated user's projects. |
| `GET` | `/v1/projects/{project_id}` | Get an owned project. |
| `PATCH` | `/v1/projects/{project_id}` | Update supported project settings. |
| `DELETE` | `/v1/projects/{project_id}` | Deactivate a project (soft delete). |
| `POST` | `/v1/projects/{project_id}/api-keys` | Create an API key; full key is returned only at creation. |
| `GET` | `/v1/projects/{project_id}/api-keys` | List key metadata. |
| `DELETE` | `/v1/projects/{project_id}/api-keys/{key_id}` | Revoke/deactivate a key. |
| `GET` | `/v1/projects/{project_id}/metrics?days=30` | Return dashboard metrics for a time range. |
| `GET` | `/v1/projects/{project_id}/alerts` | Dashboard alert list. |
| `PATCH` | `/v1/projects/{project_id}/alerts/{alert_id}` | Update alert status. |

### Ingest

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/v1/ingest/batch` | Project API key | Accept an event batch; current backend caps the model payload at 500 events, and the route also has its own bounds/chunking. |
| `POST` | `/v1/ingest` | Project API key | Hidden-schema alias for the batch route. |

### Alerts

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/alerts/{project_id}` | List alerts, optionally filter by status/type. |
| `GET` | `/v1/alerts/{project_id}/summary` | Return counts by state/severity/type. |
| `POST` | `/v1/alerts/{project_id}/acknowledge` | Acknowledge one alert. |
| `POST` | `/v1/alerts/{project_id}/resolve` | Resolve one alert. |
| `DELETE` | `/v1/alerts/{project_id}/{alert_id}` | Delete one alert. |

### Drift tests

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/projects/{project_id}/drift-tests` | List active tests. |
| `POST` | `/v1/projects/{project_id}/drift-tests` | Create a golden-prompt test. |
| `POST` | `/v1/projects/{project_id}/drift-tests/{test_id}/run` | Start a manual run. |
| `GET` | `/v1/projects/{project_id}/drift-tests/{test_id}/results` | Fetch recent run results. |
| `DELETE` | `/v1/projects/{project_id}/drift-tests/{test_id}` | Deactivate a test. |

There are overlapping drift-test route implementations in `api/dashboard.py` and `api/drift.py`; both routers are mounted. Consolidate them before making API contract changes.

### Billing

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/billing/checkout` | Create a Stripe subscription checkout session. |
| `POST` | `/v1/billing/portal` | Create a customer billing portal session. |
| `GET` | `/v1/billing/subscription` | Read the current profile's subscription fields. |
| `POST` | `/v1/billing/webhook` | Process Stripe subscription events; not listed in public OpenAPI docs. |

## Technology and external services

| Concern | Technology |
|---|---|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, SWR, Chart.js, Lucide icons |
| Identity | Supabase Auth (`@supabase/ssr`, Supabase JS client) |
| Backend | Python 3.12 target in Docker/CI, FastAPI, Pydantic v2, Uvicorn |
| Data | Supabase Postgres and Supabase Python SDK |
| Provider calls for evaluations | OpenAI, Anthropic, Groq Python SDKs |
| Alerts | Slack incoming webhook, SendGrid |
| Payments | Stripe |
| API rate limiting | SlowAPI, currently keyed by remote IP |
| Containers/orchestration | Docker, Compose, Kubernetes manifests, Helm chart |

## Run locally

### Prerequisites

- Python 3.12 recommended (the backend Dockerfile and CI use Python 3.12; Python 3.14 may fail to build pinned native dependencies).
- Node.js 20 recommended for consistency with the frontend Dockerfile.
- A Supabase project and its URL/keys.
- Docker is optional unless using Compose.

### 1. Create the Supabase schema

Open the Supabase SQL Editor and run [`docs/schema.sql`](./docs/schema.sql). Enable email/password sign-in in Supabase Auth. For an account, create the Auth identity through Supabase Auth or the frontend; the schema trigger is responsible for adding its profile.

### 2. Configure and run the backend

Create `backend/.env` locally (do not commit it):

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_KEY=YOUR_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY=YOUR_ANON_KEY
APP_ENV=development
SECRET_KEY=GENERATE_A_LONG_RANDOM_SECRET
BACKEND_CORS_ORIGINS=["http://localhost:3000"]
```

From the repository root:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API health endpoint is `http://localhost:8000/health`. Development API docs are at `http://localhost:8000/docs`; docs are disabled when `APP_ENV=production`.

### 3. Configure and run the frontend

Create `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
NEXT_PUBLIC_API_URL=http://localhost:8000/v1
```

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000`. Sign up/sign in, create an application project, save its one-time API key, then send SDK telemetry.

### 4. Use the SDK from a separate Python application

From the repository root, install the local SDK in editable mode:

```powershell
cd sdk
python -m pip install -e .
```

Example:

```python
from llm_monitor import monitor

monitor.configure(
    api_key="lmd_YOUR_PROJECT_KEY",
    project_id="YOUR_PROJECT_UUID",
    backend_url="http://localhost:8000/v1",
)

result = monitor.chat(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
)
monitor.flush()
```

Set the provider's own credential (for example `OPENAI_API_KEY`) in the customer application. The monitor key authorizes telemetry ingestion; it is not a provider API key.

### Optional Docker Compose

The root `docker-compose.yml` starts the API, Redis, and frontend, and defines an optional Nginx profile. Review the Compose file before using it: some values are development-oriented, and Redis is not currently wired into the backend limiter/queue implementation.

```powershell
docker compose up --build
```

## Configuration

### Backend environment variables

Pydantic reads these environment variable names from `backend/app/core/config.py`. Settings are case-insensitive in the environment. Keep service keys out of browser configuration and git.

| Variable | Required? | Used for |
|---|---:|---|
| `SUPABASE_URL` | Yes | Supabase project endpoint. |
| `SUPABASE_SERVICE_KEY` | Yes | Backend database access; privileged and secret. |
| `SUPABASE_ANON_KEY` | Yes by settings | Supabase public/anonymous key. The frontend also needs its public copy. |
| `APP_ENV` | No | Defaults to `development`; `production` hides FastAPI docs. |
| `SECRET_KEY` | No currently | App secret setting; replace the insecure default for deployment. |
| `BACKEND_CORS_ORIGINS` | No | JSON array of allowed frontend origins, e.g. `["https://your-site.example"]`. |
| `OPENAI_API_KEY` | Optional | Default provider/evaluator key for drift runs. |
| `ANTHROPIC_API_KEY` | Optional | Default provider/evaluator key for Claude drift runs. |
| `GROQ_API_KEY` | Optional | Default provider/evaluator key for Groq drift runs. |
| `SENDGRID_API_KEY` | Optional | Enables email alert delivery. |
| `SENDGRID_FROM_EMAIL` | No | Sender address for email; defaults to `alerts@llmdriftmonitor.com`. |
| `REDIS_URL` | No | Defaults to local Redis; currently not used by the in-memory limiter/task paths. |
| `ENABLE_DRIFT_SCHEDULER` | No | Defaults to `true`; scheduler lifecycle currently needs correction. |
| `DRIFT_SCHEDULER_INTERVAL_HOURS` | No | Defined setting; currently the scheduler jobs use fixed cron schedules. |
| `STRIPE_SECRET_KEY` | Optional | Stripe server API key. |
| `STRIPE_WEBHOOK_SECRET` | Optional | Stripe signature verification secret. |
| `STRIPE_STARTER_PRICE_ID` | Optional | Stripe price ID for Starter plan. |
| `STRIPE_GROWTH_PRICE_ID` | Optional | Stripe price ID for Growth plan. |
| `STRIPE_SCALE_PRICE_ID` | Optional | Stripe price ID for Scale plan. |

Per-project provider keys can also be saved as project fields and take precedence for drift calls. Treat those fields as secrets.

### Frontend environment variables

| Variable | Required? | Used for |
|---|---:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Browser Supabase Auth endpoint. Public value. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser Supabase anonymous key. Public value; rely on correct RLS policies. |
| `NEXT_PUBLIC_API_URL` | Yes for deployment | FastAPI base URL including `/v1`, e.g. `https://api.example.com/v1`. |

The `NEXT_PUBLIC_` prefix means the value is bundled into browser code. Never put a Supabase service-role key, Stripe secret, provider secret, or other private credential in a frontend variable.

### SDK environment variables

| Variable | Used for |
|---|---|
| `LLM_MONITOR_API_KEY` | Project telemetry API key. |
| `LLM_MONITOR_PROJECT_ID` | Project UUID. |
| `LLM_MONITOR_BACKEND_URL` | Backend base URL; configure it with the `/v1` prefix for this API. |
| `LLM_MONITOR_DEBUG` | Enables SDK debug logging when set to `true`. |
| Provider-specific keys | The LLM provider credential used by the monitored client, e.g. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GROQ_API_KEY`. |

## Deploy

### Render backend

For a Render Web Service connected to this repository:

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Runtime | Python |
| Python version | Use Python 3.12.x, not the Render default if it selects 3.14. |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/health` |

Add backend environment variables from the table above in Render's Environment page. Set `APP_ENV=production`, `SECRET_KEY` to a new random value, and `BACKEND_CORS_ORIGINS` to a JSON array containing the exact frontend origin. Render provides `PORT`; do not hardcode it in Render's start command.

### Vercel frontend

Import the same repository into Vercel and set the project **Root Directory** to `frontend`. Configure:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL=https://YOUR_RENDER_BACKEND.onrender.com/v1`

Use the matching Supabase project for frontend and backend. Ensure the backend CORS allowlist includes the deployed Vercel domain. Preview deployments may have different hostnames; add only the origins you intend to support.

### Docker, Kubernetes, and Helm

These are alternate deployment paths. See their file inventories below. Do not assume the checked-in manifests are production-ready; reconcile namespaces, images, secrets, ingress paths, replicas, health probes, and environment values with the target cluster.

## Tests and quality checks

Run commands from the relevant project directory:

```powershell
cd backend
python -m pytest tests -v
```

```powershell
cd sdk
python -m pytest tests -v
```

```powershell
cd frontend
npm run type-check
npm run build
```

`backend/tests/test_llm_quality_deepeval.py` is an optional/model-backed evaluation suite and may require provider credentials and the DeepEval dependency. `backend/test_*.py` files at the backend root are manual or standalone probes, not all part of the `pytest.ini` configured `tests/` suite.

The GitHub Actions workflow runs backend tests, SDK tests, frontend type checking, optional LLM quality tests, Docker builds, and a deployment job. Review the workflow's external secrets and deployment target before enabling it in a fork or a new production environment.

## Repository map: every source/configuration file

### Repository root

| Path | Responsibility |
|---|---|
| `README.md` | This maintainer's guide and project map. |
| `LAUNCH.md` | Earlier step-by-step launch/deployment notes; check against current code before following because some examples may be stale. |
| `Makefile` | Convenience targets for backend/frontend development, tests, lint, and formatting. |
| `package.json`, `package-lock.json` | Small root-level Node dependency manifest/lock; not the frontend's main manifest. Frontend dependencies live under `frontend/`. |
| `docker-compose.yml` | Local/multi-container API, Redis, frontend, and optional Nginx configuration. |
| `kind-config.yaml` | Local `kind` Kubernetes cluster configuration with HTTP/HTTPS host port mappings. |
| `.gitignore` | Excludes virtual environments, build output, environment files, certificates, and other generated/private files. |
| `add-deepeval.patch` | Patch artifact related to DeepEval; not imported by the running application. |
| `.github/workflows/ci.yml` | GitHub Actions pipeline for tests, image builds, and a configured remote deployment. |

Local `.env` files, virtual environments, `node_modules`, `.next`, `.git`, and deployment credentials are intentionally not documented by value. Never commit secrets.

### `backend/` — FastAPI service

#### Application package

| Path | Responsibility |
|---|---|
| `backend/app/__init__.py` | Marks `app` as a Python package. |
| `backend/app/main.py` | Constructs the FastAPI app; configures CORS, error handling, router prefixes, health/root routes, docs visibility, and lifespan. Also contains the APScheduler setup that needs repair. |
| `backend/app/api/__init__.py` | API package marker. |
| `backend/app/api/ingest.py` | SDK ingestion routes, API-key dependency, payload limits/truncation, cost fallback, database insertion, request counter RPC attempt, and background spike checks. |
| `backend/app/api/dashboard.py` | Authenticated project CRUD, API-key management, metrics, alerts, and one implementation of drift-test endpoints. |
| `backend/app/api/alerts.py` | Alert list/summary/acknowledge/resolve/delete endpoints. |
| `backend/app/api/drift.py` | Another set of drift-test CRUD/run/results endpoints. It overlaps routes in `dashboard.py`; consolidate before changing these contracts. |
| `backend/app/api/billing.py` | Stripe checkout and portal creation, subscription lookup, webhook signature handling, and profile subscription updates. |
| `backend/app/core/__init__.py` | Core package marker. |
| `backend/app/core/config.py` | Pydantic settings model, environment variable names/defaults, and cached `get_settings()`. |
| `backend/app/core/supabase.py` | Cached Supabase Python client using the service-role key. |
| `backend/app/core/auth.py` | API-key generation/hash/lookup/cache, dashboard token-to-user lookup, and project ownership dependency. Review JWT verification before public launch. |
| `backend/app/core/limiter.py` | SlowAPI limiter configured with client remote address as the key. It is not currently a distributed Redis limiter. |
| `backend/app/core/billing.py` | Plan entitlement definitions and helper functions for project, drift-test, and monthly request limits. Confirm every relevant route enforces these helpers. |
| `backend/app/models/__init__.py` | Models package marker. |
| `backend/app/models/schemas.py` | Pydantic request/response types for ingestion, projects, keys, metrics, alerts, drift tests/results, and health. |
| `backend/app/services/__init__.py` | Services package marker. |
| `backend/app/services/cost_service.py` | Backend pricing table, cost estimate, daily aggregation, and daily cost/latency spike detector. |
| `backend/app/services/alert_service.py` | Alert-row creation and optional Slack/SendGrid dispatch. |
| `backend/app/services/drift_service.py` | Provider selection, golden-prompt execution, evaluator scoring, result persistence, baseline tracking, and quality-alert creation. |

#### Runtime, scripts, tests, and packaging

| Path | Responsibility |
|---|---|
| `backend/requirements.txt` | Pinned Python runtime dependencies for the API, Supabase, providers, scheduler, billing, and utilities. |
| `backend/Dockerfile` | Multi-stage Python 3.12 image build, non-root runtime user, health check, and Uvicorn command. |
| `backend/pytest.ini` | Pytest discovery and asyncio settings for `backend/tests`. |
| `backend/scripts/setup.py` | Interactive Supabase connection check and optional demo-project/API-key/drift-test seeding. It prints a generated API key; treat that output as secret. |
| `backend/scripts/monthly_reset.py` | Script to reset monthly request counters; intended for an external monthly cron, not automatically scheduled here. |
| `backend/fix_sdk.py` | One-off local script that edits an SDK file at a hard-coded local Python installation path; not part of server runtime or deployment. |
| `backend/tests/test_backend.py` | Unit/integration-style tests for pricing, schemas, API-key utilities, plans, and the health endpoint with mocks. |
| `backend/tests/test_llm_quality_deepeval.py` | External/model-backed quality evaluation tests; optional and credential-dependent. |
| `backend/test_ingest.py` | Manual HTTP ingestion probe using a local API and sample identifiers. |
| `backend/test-alerts.py` | Manual alert API/database probe; expects environment variables and a reachable service. |
| `backend/test-prod.py` | Standalone production-oriented smoke/probe script. |
| `backend/test_load.py` | Standalone load-test/probe script; inspect before running against a live endpoint. |

### `frontend/` — Next.js browser application

#### Next.js routes and UI

| Path | Responsibility |
|---|---|
| `frontend/src/app/layout.tsx` | Root HTML layout, global CSS, app providers, metadata, and Vercel Analytics component. |
| `frontend/src/app/providers.tsx` | Wraps the app in `AuthProvider`. |
| `frontend/src/app/globals.css` | Tailwind directives and global theme/base styles. |
| `frontend/src/app/page.tsx` | Public landing page, product content, and sign-in/dashboard calls to action. |
| `frontend/src/app/login/page.tsx` | Email/password sign-in and sign-up UI; routes signed-in users to setup. |
| `frontend/src/app/onboarding/page.tsx` | First-project workflow, environment/model selection, one-time API-key display, SDK snippets, and routing to dashboard. |
| `frontend/src/app/dashboard/page.tsx` | Dashboard route wrapper; dynamically imports the dashboard application without SSR. |
| `frontend/src/app/dashboard/app.tsx` | Main dashboard application, sidebar/project selection, data loading, charts, tabs, alert/key/settings controls, and authentication checks. |
| `frontend/src/app/dashboard/content.tsx` | Additional/older dashboard content implementation. Check route imports before editing; `dashboard/page.tsx` currently loads `app.tsx`. |
| `frontend/src/app/dashboard/layout.tsx` | Dashboard route layout wrapper; currently passes children through unchanged. |
| `frontend/src/app/billing/page.tsx` | Billing/pricing UI and Stripe-related user flow. |
| `frontend/src/app/sitemap.ts` | Generates the sitemap route. |
| `frontend/src/components/ui/index.tsx` | Shared button, form controls, badges, modal, cards, empty states, spinner, and stat-card primitives. |

#### Frontend hooks and clients

| Path | Responsibility |
|---|---|
| `frontend/src/hooks/useAuth.tsx` | Auth context, Supabase session subscription, sign-in/up/out methods, and access-token exposure. |
| `frontend/src/hooks/useData.ts` | SWR wrappers for project, metric, alert, drift, and key data. Currently appears unused by route imports; inspect before relying on it. |
| `frontend/src/hooks/useApi.ts` | Older/simple SWR metrics hook without the auth-token behavior of `useData`; likely legacy. |
| `frontend/src/lib/api.ts` | Typed FastAPI fetch client, bearer-token attachment, endpoint helpers, and TypeScript API models. |
| `frontend/src/lib/supabase.ts` | Browser Supabase client factory and singleton, using public frontend env vars. |

#### Frontend configuration

| Path | Responsibility |
|---|---|
| `frontend/package.json` | Main frontend dependencies and scripts (`dev`, `build`, `start`, `lint`, `type-check`). |
| `frontend/package-lock.json` | Exact npm dependency resolution for the frontend. |
| `frontend/next.config.js` | Standalone output, server action origins, image hosts, and public build-time environment variables. |
| `frontend/tsconfig.json` | TypeScript compiler configuration. |
| `frontend/tsconfig.tsbuildinfo` | Generated TypeScript incremental-build metadata; not source. |
| `frontend/next-env.d.ts` | Next.js-generated TypeScript declarations. |
| `frontend/tailwind.config.js` | Tailwind content scanning and theme configuration. |
| `frontend/postcss.config.js` | PostCSS plugin configuration for Tailwind/autoprefixer. |
| `frontend/vercel.json` | Vercel framework/build/install/region settings. |
| `frontend/Dockerfile` | Multi-stage Node 20 build and standalone Next.js runtime image. |
| `frontend/Dockerfile.old` | Older Dockerfile kept as a historical/alternate version; current Compose uses `frontend/Dockerfile`. |
| `frontend/.dockerignore` | Excludes irrelevant/private files from Docker build context. |
| `frontend/.gitignore` | Frontend-specific generated/local exclusions. |

### `sdk/` — Python telemetry SDK

| Path | Responsibility |
|---|---|
| `sdk/pyproject.toml` | Package metadata, supported Python versions, dependencies, optional extras, and tool settings. |
| `sdk/README.md` | SDK-focused usage and configuration guide; some sample claims/defaults should be kept aligned with current code. |
| `sdk/llm_monitor/__init__.py` | Exposes `monitor`, `LLMMonitor`, `MonitorConfig`, and package version. |
| `sdk/llm_monitor/config.py` | SDK configuration from arguments/environment: ingest key, project, backend URL, batching, privacy capture, debug, and timeout. |
| `sdk/llm_monitor/monitor.py` | Provider wrappers/calls, event capture, queue/flusher thread, batch submission, and explicit flush. |
| `sdk/llm_monitor/pricing.py` | SDK model pricing/aliases, cost calculation, and provider-name detection. |
| `sdk/tests/conftest.py` | Shared pytest setup for SDK tests. |
| `sdk/tests/test_sdk.py` | SDK config, pricing, queue/flusher, and provider-wrapper tests. |
| `sdk/llm_monitor.egg-info/PKG-INFO` | Generated package metadata snapshot. |
| `sdk/llm_monitor.egg-info/SOURCES.txt` | Generated list of files included in a package build. |
| `sdk/llm_monitor.egg-info/dependency_links.txt` | Generated packaging metadata. |
| `sdk/llm_monitor.egg-info/requires.txt` | Generated dependency metadata. |
| `sdk/llm_monitor.egg-info/top_level.txt` | Generated package import-name metadata. |

The `*.egg-info` directory is generated build metadata, not hand-maintained application code.

### `docs/` — design and database reference

| Path | Responsibility |
|---|---|
| `docs/ARCHITECTURE.md` | Earlier high-level architecture/design description. Read with this README and verify claims against code. |
| `docs/schema.sql` | Supabase schema, RLS, indexes, triggers, and views; database setup source of truth. |

### `deployment/` — reverse proxy

| Path | Responsibility |
|---|---|
| `deployment/nginx/nginx.conf` | Nginx reverse-proxy configuration for a self-hosted/container deployment. |

Nginx certificate files are local deployment secrets and are intentionally not listed.

### `helm/llm-monitor/` — Helm chart

| Path | Responsibility |
|---|---|
| `helm/llm-monitor/Chart.yaml` | Helm chart identity/version metadata. |
| `helm/llm-monitor/.helmignore` | Files excluded from chart packaging. |
| `helm/llm-monitor/values.yaml` | Default backend/frontend replicas, images, services, ingress, and secret placeholders. |
| `helm/llm-monitor/values-dev.yaml` | Development overrides. |
| `helm/llm-monitor/values-staging.yaml` | Staging overrides. |
| `helm/llm-monitor/values-prod.yaml` | Production overrides. |
| `helm/llm-monitor/templates/_helpers.tpl` | Shared Helm naming/label template helpers. |
| `helm/llm-monitor/templates/backend-deployment.yaml` | Backend Kubernetes Deployment template. |
| `helm/llm-monitor/templates/backend-secret.yaml` | Backend secret template. |
| `helm/llm-monitor/templates/backend-service.yaml` | Backend Kubernetes Service template. |
| `helm/llm-monitor/templates/frontend-deployment.yaml` | Frontend Kubernetes Deployment template. |
| `helm/llm-monitor/templates/frontend-service.yaml` | Frontend Kubernetes Service template. |
| `helm/llm-monitor/templates/ingress.yaml` | Ingress routing template. |

### `k8s/` — plain Kubernetes manifests

| Path | Responsibility |
|---|---|
| `k8s/namespace.yaml` | Namespace declaration. |
| `k8s/backend/deployment.yaml` | Backend pod/deployment configuration and secret environment references. |
| `k8s/backend/secret.yaml` | Backend secret manifest/template; do not put real secret values in git. |
| `k8s/backend/service.yaml` | Backend cluster Service. |
| `k8s/frontend/deployment.yaml` | Frontend pod/deployment configuration. |
| `k8s/frontend/service.yaml` | Frontend cluster Service. |
| `k8s/ingress/ingress.yaml` | Host/path routing for frontend and API. |

### `scripts/` — developer and release scripts

| Path | Responsibility |
|---|---|
| `scripts/dev-setup.sh` | Bash-based local setup helper for backend, SDK, and frontend. It creates local env templates and installs dependencies. |
| `scripts/deploy.sh` | Bash deployment helper for backend Docker image, frontend Vercel deployment, and SDK publishing. Review registry/credentials/targets before use. |

## Current gaps and scale-up checklist

These are useful things to revisit before this becomes a customer-facing SaaS:

1. **Fix backend lifespan/scheduler startup.** `backend/app/main.py` yields control before registering scheduler jobs and yields a second time during shutdown. A lifespan context should yield once, with scheduler start before that yield and shutdown in `finally`. Until corrected and tested, don't rely on recurring aggregation/drift jobs.
2. **Verify JWT cryptographic validation.** `backend/app/core/auth.py` currently decodes dashboard tokens with signature verification disabled, then uses the token's subject to find a profile. Validate Supabase JWT signatures and expected issuer/audience using Supabase's supported key/JWKS flow before production use.
3. **Enforce API-key expiry.** Creation can store `expires_at`, but current key authentication checks active state without checking expiry.
4. **Verify/complete usage limits.** Ingestion calls an `increment_request_count` RPC and silently ignores failures; the supplied `docs/schema.sql` does not define that RPC. Also audit project/drift/request limits and ensure they are applied at the API boundary.
5. **Use a durable queue for work.** FastAPI `BackgroundTasks`, the SDK in-memory queue, and process-local caches are lost on process restart and are not coordinated across replicas. Use a durable worker/queue for high-volume ingestion, alert delivery, and evaluations.
6. **Correct measurement semantics.** The current spike check compares averages over different windows and is launched after each batch; test it against representative volume/time-series data. Metrics and cost calculations should be consistent and tested against provider billing.
7. **Make multi-tenant boundaries explicit.** Current ownership is one user → projects. A larger SaaS likely needs organizations/workspaces, memberships, roles, invitations, audit logs, and tenant-aware quotas.
8. **Separate provider secrets from general project responses.** Project response schemas include provider-key fields. Ensure secrets are not returned to the browser or logged; consider dedicated secret storage/update APIs with masked reads.
9. **Plan high-volume storage.** Raw telemetry currently inserts directly through Supabase REST/PostgREST. The schema comments mention partitioning but do not create partitions. Define retention, partitioning, backpressure, idempotency, and archival before scale.
10. **Unify duplicate/outdated implementation surfaces.** Drift routes exist in two modules; SDK and backend have different model pricing tables; there are old hooks, alternate dashboard content, multiple deployment targets, and stale docs. Decide the canonical path for each.
11. **Make observability and failures operational.** Add structured logs/trace IDs, alert-delivery retries, dead-letter handling, metrics for queue depth and provider failures, and explicit health/readiness checks.
12. **Review billing before charging.** Verify Stripe webhook idempotency, price-to-tier mapping, cancellation/dunning behavior, plan checks, and reconciliation. Test with Stripe test mode.
13. **Review privacy defaults.** SDK captures prompt/response text by default. Set an explicit retention/consent policy and make privacy settings easy to configure.
14. **Reconcile deployment artifacts.** Render/Vercel, Compose, Kubernetes, Helm, and GitHub Actions coexist. Pick supported production targets and update each one with the same env names, URLs, image tags, and secret-management approach.

## Suggested re-entry path

When returning to the project after time away, read in this order:

1. This README's [Architecture](#architecture), [End-to-end workflows](#end-to-end-workflows), and [Current gaps](#current-gaps-and-scale-up-checklist).
2. `docs/schema.sql` to understand storage and tenant relationships.
3. `backend/app/main.py`, `backend/app/core/auth.py`, `backend/app/api/ingest.py`, and `backend/app/api/dashboard.py` for runtime/API behavior.
4. `backend/app/services/cost_service.py`, `alert_service.py`, and `drift_service.py` for core monitoring behavior.
5. `frontend/src/hooks/useAuth.tsx`, `frontend/src/app/onboarding/page.tsx`, `frontend/src/app/dashboard/app.tsx`, and `frontend/src/lib/api.ts` for the user journey.
6. `sdk/llm_monitor/config.py`, `sdk/llm_monitor/monitor.py`, and `sdk/llm_monitor/pricing.py` for customer integration.
7. Deployment files only after choosing the deployment target you intend to maintain.

For a new feature, identify the database/API contract first, update backend schemas/routes/services as appropriate, update the frontend API types/client and UI, update SDK/docs if customer-facing, and add tests at the layer that owns the behavior.
