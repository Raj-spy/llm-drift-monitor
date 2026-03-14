/**
 * Frontend API client — wraps all backend calls.
 */
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/v1'

async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...fetchOptions } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...fetchOptions, headers })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(error.detail || `API error ${res.status}`)
  }

  return res.json()
}

// ─── Projects ─────────────────────────────────────────────────────────────────
export const projectsApi = {
  list: (token: string) =>
    apiFetch<Project[]>('/projects', { token }),
  get: (id: string, token: string) =>
    apiFetch<Project>(`/projects/${id}`, { token }),
  create: (data: CreateProjectInput, token: string) =>
    apiFetch<Project>('/projects', { method: 'POST', body: JSON.stringify(data), token }),
  update: (projectId: string, data: Partial<UpdateProjectInput>, token: string) =>
    apiFetch<Project>(`/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify(data), token }),
}

// ─── Metrics ──────────────────────────────────────────────────────────────────
export const metricsApi = {
  get: (projectId: string, days = 30, token: string) =>
    apiFetch<MetricsResponse>(`/projects/${projectId}/metrics?days=${days}`, { token }),
}

// ─── Alerts ───────────────────────────────────────────────────────────────────
export const alertsApi = {
  list: (projectId: string, token: string, status = 'active') =>
    apiFetch<Alert[]>(`/projects/${projectId}/alerts?status=${status}`, { token }),
  acknowledge: (projectId: string, alertId: string, token: string) =>
    apiFetch(`/projects/${projectId}/alerts/${alertId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'acknowledged' }),
      token,
    }),
  resolve: (projectId: string, alertId: string, token: string) =>
    apiFetch(`/projects/${projectId}/alerts/${alertId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved' }),
      token,
    }),
}

// ─── Drift Tests ──────────────────────────────────────────────────────────────
export const driftApi = {
  list: (projectId: string, token: string) =>
    apiFetch<DriftTest[]>(`/projects/${projectId}/drift-tests`, { token }),
  create: (projectId: string, data: unknown, token: string) =>
    apiFetch<DriftTest>(`/projects/${projectId}/drift-tests`, {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),
  run: (projectId: string, testId: string, token: string) =>
    apiFetch(`/projects/${projectId}/drift-tests/${testId}/run`, { method: 'POST', token }),
  results: (projectId: string, testId: string, token: string) =>
    apiFetch<DriftResult[]>(`/projects/${projectId}/drift-tests/${testId}/results`, { token }),
}

// ─── API Keys ─────────────────────────────────────────────────────────────────
export const apiKeysApi = {
  list: (projectId: string, token: string) =>
    apiFetch<ApiKey[]>(`/projects/${projectId}/api-keys`, { token }),
  create: (projectId: string, data: { name: string }, token: string) =>
    apiFetch<ApiKey>(`/projects/${projectId}/api-keys`, {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),
  revoke: (projectId: string, keyId: string, token: string) =>
    apiFetch(`/projects/${projectId}/api-keys/${keyId}`, { method: 'DELETE', token }),
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Project {
  id: string
  name: string
  description?: string
  slug: string
  environment: string
  default_model: string
  is_active: boolean
  created_at: string
  alert_email?: string
  slack_webhook_url?: string
  cost_alert_threshold_pct?: number
  latency_alert_threshold_pct?: number
  quality_score_threshold?: number
}

export interface CreateProjectInput {
  name: string
  description?: string
  environment?: string
  default_model?: string
  alert_email?: string
  slack_webhook_url?: string
  cost_alert_threshold_pct?: number
  latency_alert_threshold_pct?: number
}

export interface UpdateProjectInput {
  name?: string
  description?: string
  environment?: string
  default_model?: string
  alert_email?: string | null
  slack_webhook_url?: string | null
  cost_alert_threshold_pct?: number
  latency_alert_threshold_pct?: number
  quality_score_threshold?: number
}

export interface MetricsSummary {
  total_requests: number
  total_tokens: number
  total_cost_usd: number
  avg_latency_ms: number
  p99_latency_ms: number
  error_rate: number
  requests_change_pct: number
  cost_change_pct: number
}

export interface DailyMetric {
  date: string
  total_requests: number
  total_tokens: number
  total_cost_usd: number
  avg_latency_ms: number
  model: string
}

export interface ModelBreakdown {
  model: string
  provider: string
  total_requests: number
  total_cost_usd: number
  avg_latency_ms: number
  total_tokens: number
  cost_share_pct: number
}

export interface MetricsResponse {
  summary: MetricsSummary
  daily_trend: DailyMetric[]
  model_breakdown: ModelBreakdown[]
  period_days: number
}

export interface Alert {
  id: string
  project_id: string
  alert_type: string
  severity: string
  title: string
  message: string
  model?: string
  metric_value?: number
  threshold_value?: number
  percentage_change?: number
  status: string
  triggered_at: string
  acknowledged_at?: string
}

export interface DriftTest {
  id: string
  project_id: string
  name: string
  model: string
  schedule: string
  is_active: boolean
  last_run_at?: string
  last_score?: number
  baseline_score?: number
  golden_prompt_count: number
  created_at: string
}

export interface DriftResult {
  id: string
  drift_test_id: string
  run_at: string
  overall_score: number
  baseline_score?: number
  score_delta?: number
  model_used: string
  alert_triggered: boolean
  prompt_results: PromptResult[]
}

export interface PromptResult {
  prompt_id: string
  prompt: string
  response: string
  score: number
  weight: number
  evaluator_reasoning: string
  status: string
}

export interface ApiKey {
  id: string
  name: string
  key_prefix: string
  project_id: string
  is_active: boolean
  created_at: string
  last_used_at?: string
  full_key?: string
}