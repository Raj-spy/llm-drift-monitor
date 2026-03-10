# LLM Cost & Quality Drift Monitor — System Architecture

## Overview

A production-ready SaaS platform that monitors LLM API usage in real-time, tracking cost, latency, and output quality drift. Think Datadog, but purpose-built for LLM applications.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CUSTOMER APPLICATION                          │
│                                                                       │
│   from llm_monitor import monitor                                     │
│   response = monitor.chat(model="gpt-4o", messages=messages)         │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ Python SDK (llm_monitor)
                            │ • Wraps OpenAI/Anthropic calls
                            │ • Captures: prompt, response, tokens,
                            │   latency, cost estimate, timestamp
                            │ • Async batch flush to backend
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FASTAPI BACKEND (Docker)                           │
│                                                                       │
│  POST /ingest          ──► Ingestion Service                         │
│  GET  /metrics         ──► Aggregation Service                       │
│  POST /projects        ──► Project Management                        │
│  GET  /alerts          ──► Alert Service                             │
│  POST /drift-tests     ──► Drift Detection Service                   │
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Cost Tracker │  │ Drift Engine │  │   Alert Manager          │  │
│  │              │  │              │  │                          │  │
│  │ Per-model    │  │ Golden prompt│  │ Slack / Email /          │  │
│  │ pricing      │  │ daily runner │  │ Dashboard webhooks       │  │
│  │ Daily/monthly│  │ LLM evaluator│  │                          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         SUPABASE                                      │
│                                                                       │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐ ┌──────────────────┐   │
│  │ projects │ │  users   │ │ llm_requests│ │  metrics_daily   │   │
│  └──────────┘ └──────────┘ └─────────────┘ └──────────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐                         │
│  │ api_keys │ │  alerts  │ │ drift_tests │                         │
│  └──────────┘ └──────────┘ └─────────────┘                         │
│                                                                       │
│  Auth │ Row Level Security │ Realtime │ Storage                      │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    NEXT.JS DASHBOARD (Vercel)                         │
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │   Overview   │  │ Cost Charts  │  │   Drift Detection        │  │
│  │   (KPIs)     │  │ Token Usage  │  │   Results                │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Latency     │  │    Model     │  │   Alert Management       │  │
│  │  Charts      │  │  Comparison  │  │                          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. Python SDK (`llm_monitor`)
- Thin wrapper around OpenAI and Anthropic clients
- Captures all request/response metadata transparently
- Async queue with configurable batch flush (default: every 5s or 50 requests)
- Offline-tolerant: logs to local buffer if backend unreachable
- Zero latency overhead (async background thread)

### 2. FastAPI Backend
- Stateless, horizontally scalable
- JWT auth via Supabase
- Rate limiting per API key (based on subscription tier)
- Background workers for drift test scheduling

### 3. Supabase Database
- PostgreSQL with Row Level Security (multi-tenant isolation)
- Realtime subscriptions for live dashboard updates
- Storage for golden prompt datasets

### 4. Metrics Processing
- Raw requests → aggregated daily metrics (cron job)
- Rolling 7-day / 30-day baselines for anomaly detection
- Percentile calculations (p50, p90, p99 latency)

### 5. Drift Detection
- Golden prompts stored per project
- Daily scheduled runner calls target LLM
- Evaluator LLM (Claude) scores response vs baseline (0-10 scale)
- Threshold alerting when score drops > 20%

### 6. Alerting
- Cost spike: >30% day-over-day increase
- Latency spike: >50% increase vs 7-day rolling average
- Quality drift: score drops below configurable threshold
- Channels: Slack webhook, email (SendGrid), in-app

### 7. Multi-tenancy & SaaS
- Projects scoped to organizations
- API key generation with hashed storage
- Subscription tiers with usage limits enforced at middleware
- Stripe integration hooks for billing
