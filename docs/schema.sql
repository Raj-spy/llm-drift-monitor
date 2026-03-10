-- ============================================================
-- LLM Cost & Quality Drift Monitor — Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- USERS (extends Supabase auth.users)
-- ============================================================
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    subscription_tier TEXT NOT NULL DEFAULT 'starter'
        CHECK (subscription_tier IN ('starter', 'growth', 'scale', 'enterprise')),
    subscription_status TEXT NOT NULL DEFAULT 'active'
        CHECK (subscription_status IN ('active', 'trialing', 'past_due', 'cancelled')),
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT UNIQUE,
    monthly_request_limit INTEGER NOT NULL DEFAULT 50000,
    requests_this_month INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id);

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE public.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    slug TEXT NOT NULL UNIQUE,
    environment TEXT NOT NULL DEFAULT 'production'
        CHECK (environment IN ('production', 'staging', 'development')),
    default_model TEXT DEFAULT 'gpt-4o',
    alert_email TEXT,
    slack_webhook_url TEXT,
    cost_alert_threshold_pct NUMERIC DEFAULT 30,   -- % spike triggers alert
    latency_alert_threshold_pct NUMERIC DEFAULT 50,
    quality_score_threshold NUMERIC DEFAULT 7.0,   -- out of 10
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_owner ON public.projects(owner_id);
CREATE INDEX idx_projects_slug ON public.projects(slug);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own projects" ON public.projects
    FOR ALL USING (auth.uid() = owner_id);

-- ============================================================
-- API KEYS
-- ============================================================
CREATE TABLE public.api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,   -- bcrypt hash of the actual key
    key_prefix TEXT NOT NULL,        -- first 8 chars for display: "lmd_abc1"
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_project ON public.api_keys(project_id);
CREATE INDEX idx_api_keys_hash ON public.api_keys(key_hash);
CREATE INDEX idx_api_keys_owner ON public.api_keys(owner_id);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own api_keys" ON public.api_keys
    FOR ALL USING (auth.uid() = owner_id);

-- ============================================================
-- LLM REQUESTS (raw ingestion — high volume)
-- ============================================================
CREATE TABLE public.llm_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    -- Request metadata
    request_id TEXT,               -- Optional: caller-provided idempotency key
    model TEXT NOT NULL,           -- e.g. "gpt-4o", "claude-3-5-sonnet-20241022"
    provider TEXT NOT NULL,        -- "openai", "anthropic"
    environment TEXT DEFAULT 'production',
    -- Prompt & response
    prompt_text TEXT,              -- First user message (truncated at 10k chars)
    response_text TEXT,            -- Assistant response (truncated at 10k chars)
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    -- Performance
    latency_ms INTEGER,            -- End-to-end latency in milliseconds
    -- Cost
    cost_usd NUMERIC(12, 8),       -- Estimated cost in USD
    -- Caller context
    user_id TEXT,                  -- Optional: end-user ID from caller app
    session_id TEXT,               -- Optional: session/conversation ID
    tags JSONB DEFAULT '{}',       -- Arbitrary caller-defined tags
    -- Status
    status TEXT DEFAULT 'success' CHECK (status IN ('success', 'error', 'timeout')),
    error_message TEXT,
    -- Timestamps
    requested_at TIMESTAMPTZ NOT NULL,   -- When the LLM call was made
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partition by month for performance at scale
-- (In production, use pg_partman for automated partition management)
CREATE INDEX idx_llm_requests_project_time ON public.llm_requests(project_id, requested_at DESC);
CREATE INDEX idx_llm_requests_model ON public.llm_requests(project_id, model);
CREATE INDEX idx_llm_requests_date ON public.llm_requests(DATE(requested_at));

ALTER TABLE public.llm_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own project requests" ON public.llm_requests
    FOR SELECT USING (
        project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid())
    );
CREATE POLICY "Service role insert requests" ON public.llm_requests
    FOR INSERT WITH CHECK (true);

-- ============================================================
-- METRICS DAILY (aggregated, pre-computed for dashboard speed)
-- ============================================================
CREATE TABLE public.metrics_daily (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    model TEXT NOT NULL,
    -- Volume
    total_requests INTEGER NOT NULL DEFAULT 0,
    successful_requests INTEGER NOT NULL DEFAULT 0,
    failed_requests INTEGER NOT NULL DEFAULT 0,
    -- Tokens
    total_prompt_tokens BIGINT NOT NULL DEFAULT 0,
    total_completion_tokens BIGINT NOT NULL DEFAULT 0,
    total_tokens BIGINT NOT NULL DEFAULT 0,
    -- Cost
    total_cost_usd NUMERIC(14, 6) NOT NULL DEFAULT 0,
    avg_cost_per_request NUMERIC(12, 8),
    -- Latency (ms)
    avg_latency_ms NUMERIC,
    p50_latency_ms NUMERIC,
    p90_latency_ms NUMERIC,
    p99_latency_ms NUMERIC,
    min_latency_ms INTEGER,
    max_latency_ms INTEGER,
    -- Computed at
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, date, model)
);

CREATE INDEX idx_metrics_daily_project_date ON public.metrics_daily(project_id, date DESC);
CREATE INDEX idx_metrics_daily_model ON public.metrics_daily(project_id, model, date DESC);

ALTER TABLE public.metrics_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own metrics" ON public.metrics_daily
    FOR SELECT USING (
        project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid())
    );

-- ============================================================
-- DRIFT TESTS (Golden Prompt Sets)
-- ============================================================
CREATE TABLE public.drift_tests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    model TEXT NOT NULL,                -- Which model to test
    evaluator_model TEXT DEFAULT 'claude-3-5-haiku-20241022',
    schedule TEXT DEFAULT 'daily'       -- 'hourly', 'daily', 'weekly'
        CHECK (schedule IN ('hourly', 'daily', 'weekly', 'manual')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    -- Golden prompts stored as JSONB array
    -- [{id, prompt, expected_response, weight}]
    golden_prompts JSONB NOT NULL DEFAULT '[]',
    -- Latest scores
    last_run_at TIMESTAMPTZ,
    last_score NUMERIC,                 -- 0-10
    baseline_score NUMERIC,            -- Established baseline
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_drift_tests_project ON public.drift_tests(project_id);

-- Drift test run results
CREATE TABLE public.drift_test_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    drift_test_id UUID NOT NULL REFERENCES public.drift_tests(id) ON DELETE CASCADE,
    project_id UUID NOT NULL,
    run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    overall_score NUMERIC NOT NULL,       -- 0-10
    baseline_score NUMERIC,
    score_delta NUMERIC,                  -- positive = improvement
    -- Per-prompt results
    prompt_results JSONB NOT NULL DEFAULT '[]',
    -- [{prompt_id, prompt, response, score, evaluator_reasoning}]
    model_used TEXT NOT NULL,
    total_tokens_used INTEGER,
    total_cost_usd NUMERIC(12, 8),
    alert_triggered BOOLEAN DEFAULT false
);

CREATE INDEX idx_drift_results_test ON public.drift_test_results(drift_test_id, run_at DESC);

ALTER TABLE public.drift_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drift_test_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own drift_tests" ON public.drift_tests
    FOR ALL USING (project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()));
CREATE POLICY "Users view own drift_results" ON public.drift_test_results
    FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()));

-- ============================================================
-- ALERTS
-- ============================================================
CREATE TABLE public.alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL
        CHECK (alert_type IN ('cost_spike', 'latency_spike', 'quality_drift', 'error_rate')),
    severity TEXT NOT NULL DEFAULT 'warning'
        CHECK (severity IN ('info', 'warning', 'critical')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    -- Context data
    model TEXT,
    metric_value NUMERIC,          -- The actual value that triggered the alert
    threshold_value NUMERIC,       -- The threshold that was breached
    percentage_change NUMERIC,     -- % change from baseline
    -- Resolution
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'acknowledged', 'resolved')),
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    -- Notification tracking
    slack_sent BOOLEAN DEFAULT false,
    email_sent BOOLEAN DEFAULT false,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_project ON public.alerts(project_id, triggered_at DESC);
CREATE INDEX idx_alerts_status ON public.alerts(project_id, status);

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own alerts" ON public.alerts
    FOR ALL USING (project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()));

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER drift_tests_updated_at BEFORE UPDATE ON public.drift_tests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- New user hook (called by Supabase auth trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- VIEWS for dashboard queries
-- ============================================================

-- 30-day cost trend per project
CREATE VIEW public.v_cost_trend_30d AS
SELECT
    project_id,
    date,
    SUM(total_cost_usd) AS daily_cost,
    SUM(total_requests) AS daily_requests,
    SUM(total_tokens) AS daily_tokens
FROM public.metrics_daily
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY project_id, date
ORDER BY project_id, date;

-- Model breakdown view
CREATE VIEW public.v_model_breakdown AS
SELECT
    project_id,
    model,
    SUM(total_requests) AS total_requests,
    SUM(total_cost_usd) AS total_cost,
    AVG(avg_latency_ms) AS avg_latency,
    SUM(total_tokens) AS total_tokens
FROM public.metrics_daily
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY project_id, model;
