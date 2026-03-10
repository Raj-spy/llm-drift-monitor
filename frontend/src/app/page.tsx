 'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Tooltip, Legend, Filler
} from 'chart.js'
import { Line, Bar, Doughnut } from 'react-chartjs-2'
import {
  Activity, AlertTriangle, ArrowUpRight, ArrowDownRight,
  BarChart3, Bell, Brain, ChevronDown, Clock, DollarSign,
  FlaskConical, Key, LayoutDashboard, LogOut, Plus,
  RefreshCw, Settings, Sparkles, Loader2
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import {
  metricsApi, alertsApi, driftApi, apiKeysApi, projectsApi,
  type MetricsResponse, type Alert, type DriftTest, type ApiKey, type Project
} from '@/lib/api'

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Tooltip, Legend, Filler
)

// ─── Chart defaults ───────────────────────────────────────────────────────────
const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#1e293b', titleColor: '#f1f5f9',
      bodyColor: '#94a3b8', borderColor: '#334155', borderWidth: 1, padding: 12,
    },
  },
  scales: {
    x: { grid: { color: 'rgba(51,65,85,0.5)' }, ticks: { color: '#64748b', font: { size: 11 } } },
    y: { grid: { color: 'rgba(51,65,85,0.5)' }, ticks: { color: '#64748b', font: { size: 11 } } },
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor(diff / 60_000)
  if (h > 24) return `${Math.floor(h / 24)}d ago`
  if (h > 0) return `${h}h ago`
  return `${m}m ago`
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatCard({ label, value, change, icon: Icon, prefix = '', suffix = '', color = 'indigo' }: {
  label: string; value: string | number | undefined; change?: number
  icon: any; prefix?: string; suffix?: string; color?: string
}) {
  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-500/10 text-indigo-400',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-400',
    rose: 'bg-rose-500/10 text-rose-400',
  }
  const isInvertedMetric = label.includes('Cost') || label.includes('Latency') || label.includes('Error')
  const changeGood = change !== undefined ? (isInvertedMetric ? change < 0 : change > 0) : null

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <Icon size={16} />
        </div>
      </div>
      <div>
        <div className="text-2xl font-semibold text-slate-100 tabular-nums">
          {value === undefined ? <span className="text-slate-600">—</span>
            : <>{prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}</>}
        </div>
        {change !== undefined && change !== null && (
          <div className={`flex items-center gap-1 mt-1 text-xs ${changeGood ? 'text-emerald-400' : 'text-red-400'}`}>
            {changeGood ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
            {Math.abs(change).toFixed(1)}% vs last period
          </div>
        )}
      </div>
    </div>
  )
}

function AlertBadge({ type, severity }: { type: string; severity: string }) {
  const typeMap: Record<string, { label: string; cls: string }> = {
    cost_spike:    { label: 'Cost',    cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    latency_spike: { label: 'Latency', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    quality_drift: { label: 'Quality', cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
    error_rate:    { label: 'Error',   cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  }
  const sevMap: Record<string, string> = {
    critical: 'bg-red-500/15 text-red-400 border-red-500/30',
    warning:  'bg-amber-500/15 text-amber-400 border-amber-500/30',
    info:     'bg-blue-500/15 text-blue-400 border-blue-500/30',
  }
  const t = typeMap[type] || { label: type, cls: 'bg-slate-700 text-slate-300 border-slate-600' }
  return (
    <div className="flex gap-2">
      <span className={`text-xs px-2 py-0.5 rounded-full border ${t.cls}`}>{t.label}</span>
      <span className={`text-xs px-2 py-0.5 rounded-full border ${sevMap[severity] || ''}`}>{severity}</span>
    </div>
  )
}

function ScoreRing({ score, baseline }: { score: number; baseline: number }) {
  const pct = (score / 10) * 100
  const color = score >= 8 ? '#10b981' : score >= 6 ? '#f59e0b' : '#ef4444'
  const delta = score - baseline
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-10 h-10 flex-shrink-0">
        <svg viewBox="0 0 36 36" className="rotate-[-90deg] w-10 h-10">
          <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#1e293b" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.9155" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ color }}>
          {score.toFixed(1)}
        </span>
      </div>
      <div>
        <div className="text-sm font-medium text-slate-200">{score.toFixed(1)}<span className="text-slate-500 text-xs">/10</span></div>
        <div className={`text-xs ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)} vs baseline
        </div>
      </div>
    </div>
  )
}

function EmptyState({ icon: Icon, title, description }: { icon: any; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mb-4">
        <Icon size={22} className="text-slate-500" />
      </div>
      <h3 className="text-sm font-semibold text-slate-300 mb-1">{title}</h3>
      {description && <p className="text-sm text-slate-500 max-w-xs">{description}</p>}
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 size={24} className="animate-spin text-indigo-400" />
    </div>
  )
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
function Sidebar({
  activeView, setActiveView, projects, currentProject, setCurrentProject, alertCount
}: {
  activeView: string
  setActiveView: (v: string) => void
  projects: Project[]
  currentProject: Project | null
  setCurrentProject: (p: Project) => void
  alertCount: number
}) {
  const { user, signOut } = useAuth()
  const [projectOpen, setProjectOpen] = useState(false)

  const nav = [
    { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
    { id: 'costs',    icon: DollarSign,      label: 'Cost Analysis' },
    { id: 'latency',  icon: Clock,           label: 'Latency' },
    { id: 'models',   icon: Brain,           label: 'Models' },
    { id: 'drift',    icon: FlaskConical,    label: 'Drift Tests' },
    { id: 'alerts',   icon: Bell,            label: 'Alerts', badge: alertCount },
    { id: 'keys',     icon: Key,             label: 'API Keys' },
    { id: 'settings', icon: Settings,        label: 'Settings' },
  ]

  return (
    <aside className="w-60 bg-slate-900 border-r border-slate-800 flex flex-col h-screen sticky top-0 flex-shrink-0">
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Activity size={16} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100">LLM Monitor</div>
            <div className="text-xs text-slate-500">Drift Detection</div>
          </div>
        </div>
      </div>

      {/* Project switcher */}
      <div className="px-3 py-3 border-b border-slate-800 relative">
        <button
          onClick={() => setProjectOpen(!projectOpen)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors text-sm"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-5 h-5 rounded bg-indigo-600/30 flex items-center justify-center flex-shrink-0">
              <span className="text-indigo-400 text-[9px] font-bold">
                {currentProject?.name?.[0]?.toUpperCase() || 'P'}
              </span>
            </div>
            <span className="text-slate-200 font-medium truncate">{currentProject?.name || 'Select project'}</span>
          </div>
          <ChevronDown size={14} className={`text-slate-500 flex-shrink-0 transition-transform ${projectOpen ? 'rotate-180' : ''}`} />
        </button>
        {projectOpen && projects.length > 0 && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setProjectOpen(false)} />
            <div className="absolute top-full left-3 right-3 mt-1 z-20 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
              {projects.map(p => (
                <button key={p.id}
                  onClick={() => { setCurrentProject(p); setProjectOpen(false) }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-slate-700 transition-colors text-left ${p.id === currentProject?.id ? 'text-indigo-400' : 'text-slate-300'}`}
                >
                  <div className="w-5 h-5 rounded bg-indigo-600/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-[9px] font-bold text-indigo-400">{p.name[0].toUpperCase()}</span>
                  </div>
                  <span className="truncate">{p.name}</span>
                  {p.id === currentProject?.id && <span className="ml-auto">✓</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ id, icon: Icon, label, badge }) => (
          <button key={id} onClick={() => setActiveView(id)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              activeView === id ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-2.5"><Icon size={15} />{label}</div>
            {badge ? <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{badge}</span> : null}
          </button>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-slate-800">
        <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 rounded-lg p-3 mb-2">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles size={13} className="text-indigo-400" />
            <span className="text-xs font-semibold text-indigo-400">Starter Plan</span>
          </div>
          <div className="text-xs text-slate-400">LLM Drift Monitor</div>
        </div>
        <button onClick={signOut}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <LogOut size={13} />
          <span className="text-xs truncate">{user?.email}</span>
        </button>
      </div>
    </aside>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ metrics, alerts, loading }: { metrics: MetricsResponse | null; alerts: Alert[]; loading: boolean }) {
  if (loading) return <Spinner />

  const s = metrics?.summary
  const trend = metrics?.daily_trend || []
  const models = metrics?.model_breakdown || []
  const dates = trend.map(d => d.date.slice(5))
  const costData = trend.map(d => d.total_cost_usd)
  const requestData = trend.map(d => d.total_requests)
  const activeAlerts = alerts.filter(a => a.status === 'active')

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Requests" value={s?.total_requests} change={s?.requests_change_pct} icon={BarChart3} color="indigo" />
        <StatCard label="Total Cost" value={s?.total_cost_usd?.toFixed(4)} change={s?.cost_change_pct} icon={DollarSign} prefix="$" color="emerald" />
        <StatCard label="Avg Latency" value={s?.avg_latency_ms ? Math.round(s.avg_latency_ms) : undefined} icon={Clock} suffix="ms" color="amber" />
        <StatCard label="Error Rate" value={s?.error_rate?.toFixed(2)} icon={AlertTriangle} suffix="%" color="rose" />
      </div>

      {trend.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Daily Cost</h3>
                <p className="text-xs text-slate-500 mt-0.5">Last {metrics?.period_days || 30} days</p>
              </div>
              <span className="text-xs text-slate-500 font-mono">${costData.reduce((a, b) => a + b, 0).toFixed(4)} total</span>
            </div>
            <div style={{ height: 180 }}>
              <Line data={{
                labels: dates,
                datasets: [{ data: costData, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }]
              }} options={{ ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, ticks: { ...chartDefaults.scales.y.ticks, callback: (v: any) => `$${v}` } } } } as any} />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-200">Daily Requests</h3>
              <p className="text-xs text-slate-500 mt-0.5">Last {metrics?.period_days || 30} days</p>
            </div>
            <div style={{ height: 180 }}>
              <Bar data={{
                labels: dates,
                datasets: [{ data: requestData, backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 3 }]
              }} options={chartDefaults as any} />
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
          <EmptyState icon={BarChart3} title="No data yet" description="Send your first request using the SDK to see metrics here." />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {models.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">Cost by Model</h3>
            <div style={{ height: 160 }}>
              <Doughnut data={{
                labels: models.map(m => m.model.split('-')[0]),
                datasets: [{ data: models.map(m => m.total_cost_usd), backgroundColor: ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6'], borderWidth: 0 }]
              }} options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'bottom' as const, labels: { color: '#64748b', font: { size: 10 }, padding: 12 } }, tooltip: chartDefaults.plugins.tooltip },
                cutout: '65%',
              }} />
            </div>
          </div>
        )}

        <div className={`bg-slate-900 border border-slate-800 rounded-xl p-5 ${models.length > 0 ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200">Recent Alerts</h3>
            {activeAlerts.length > 0 && (
              <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">{activeAlerts.length} active</span>
            )}
          </div>
          {alerts.length === 0 ? (
            <EmptyState icon={Bell} title="No alerts" description="Alerts will appear here when cost, latency, or quality thresholds are breached." />
          ) : (
            <div className="space-y-3">
              {alerts.slice(0, 3).map(alert => (
                <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-lg border ${alert.status === 'active' ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-900 border-slate-800 opacity-60'}`}>
                  <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${alert.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-200">{alert.title}</span>
                      <AlertBadge type={alert.alert_type} severity={alert.severity} />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{alert.message}</p>
                  </div>
                  <span className="text-xs text-slate-600 whitespace-nowrap flex-shrink-0">{timeAgo(alert.triggered_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Costs Tab ────────────────────────────────────────────────────────────────
function CostsTab({ metrics, loading }: { metrics: MetricsResponse | null; loading: boolean }) {
  if (loading) return <Spinner />
  const trend = metrics?.daily_trend || []

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">Cost Analysis</h2>
      {trend.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
          <EmptyState icon={DollarSign} title="No cost data yet" description="Cost data appears after your first SDK request." />
        </div>
      ) : (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">30-Day Cost Trend</h3>
            <div style={{ height: 300 }}>
              <Line data={{
                labels: trend.map(d => d.date.slice(5)),
                datasets: [{ label: 'Daily Cost (USD)', data: trend.map(d => d.total_cost_usd), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.4, pointRadius: 3, borderWidth: 2 }]
              }} options={{ ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, ticks: { ...chartDefaults.scales.y.ticks, callback: (v: any) => `$${Number(v).toFixed(4)}` } } } } as any} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
              <div className="text-2xl font-bold text-slate-100">${trend.reduce((a, b) => a + b.total_cost_usd, 0).toFixed(4)}</div>
              <div className="text-xs text-slate-500 mt-1">Total (30 days)</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
              <div className="text-2xl font-bold text-slate-100">${(trend.reduce((a, b) => a + b.total_cost_usd, 0) / trend.length).toFixed(4)}</div>
              <div className="text-xs text-slate-500 mt-1">Daily Average</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
              <div className="text-2xl font-bold text-slate-100">${Math.max(...trend.map(d => d.total_cost_usd)).toFixed(4)}</div>
              <div className="text-xs text-slate-500 mt-1">Peak Day</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Latency Tab ──────────────────────────────────────────────────────────────
function LatencyTab({ metrics, loading }: { metrics: MetricsResponse | null; loading: boolean }) {
  if (loading) return <Spinner />
  const trend = metrics?.daily_trend || []

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">Latency Analysis</h2>
      {trend.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
          <EmptyState icon={Clock} title="No latency data yet" description="Latency data appears after your first SDK request." />
        </div>
      ) : (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">Average Latency (ms)</h3>
            <div style={{ height: 300 }}>
              <Line data={{
                labels: trend.map(d => d.date.slice(5)),
                datasets: [{ label: 'Avg Latency (ms)', data: trend.map(d => d.avg_latency_ms), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }]
              }} options={{ ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, ticks: { ...chartDefaults.scales.y.ticks, callback: (v: any) => `${v}ms` } } } } as any} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
              <div className="text-2xl font-bold text-slate-100">{Math.round(trend.reduce((a, b) => a + b.avg_latency_ms, 0) / trend.length)}ms</div>
              <div className="text-xs text-slate-500 mt-1">Average</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
              <div className="text-2xl font-bold text-slate-100">{Math.min(...trend.map(d => d.avg_latency_ms)).toFixed(0)}ms</div>
              <div className="text-xs text-slate-500 mt-1">Best Day</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
              <div className="text-2xl font-bold text-slate-100">{Math.max(...trend.map(d => d.avg_latency_ms)).toFixed(0)}ms</div>
              <div className="text-xs text-slate-500 mt-1">Worst Day</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Models Tab ───────────────────────────────────────────────────────────────
function ModelsTab({ metrics, loading }: { metrics: MetricsResponse | null; loading: boolean }) {
  if (loading) return <Spinner />
  const models = metrics?.model_breakdown || []

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">Model Comparison</h2>
      {models.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
          <EmptyState icon={Brain} title="No model data yet" description="Model breakdown appears after your first SDK request." />
        </div>
      ) : (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50">
                <tr>
                  {['Model', 'Provider', 'Requests', 'Total Cost', 'Avg Latency', 'Cost Share'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {models.map((m, i) => (
                  <tr key={m.model} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3"><span className="font-mono text-xs bg-slate-800 px-2 py-1 rounded text-slate-300">{m.model}</span></td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        m.provider === 'openai' ? 'bg-emerald-500/15 text-emerald-400' :
                        m.provider === 'anthropic' ? 'bg-orange-500/15 text-orange-400' :
                        'bg-blue-500/15 text-blue-400'
                      }`}>{m.provider}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 tabular-nums">{m.total_requests.toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-300 tabular-nums font-medium">${m.total_cost_usd.toFixed(6)}</td>
                    <td className="px-4 py-3 text-slate-300 tabular-nums">{m.avg_latency_ms ? `${Math.round(m.avg_latency_ms)}ms` : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-800 rounded-full max-w-24">
                          <div className="h-1.5 rounded-full" style={{ width: `${m.cost_share_pct}%`, backgroundColor: ['#6366f1','#10b981','#f59e0b','#ef4444'][i % 4] }} />
                        </div>
                        <span className="text-slate-400 text-xs tabular-nums">{m.cost_share_pct?.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">Latency by Model</h3>
            <div style={{ height: 200 }}>
              <Bar data={{
                labels: models.map(m => m.model.split('-').slice(0, 2).join('-')),
                datasets: [{ label: 'Avg Latency (ms)', data: models.map(m => m.avg_latency_ms || 0), backgroundColor: 'rgba(99,102,241,0.7)', borderRadius: 4 }]
              }} options={{ ...chartDefaults as any, plugins: { ...chartDefaults.plugins, legend: { display: true, labels: { color: '#64748b', font: { size: 11 } } } }, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, ticks: { ...chartDefaults.scales.y.ticks, callback: (v: any) => `${v}ms` } } } } as any} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Drift Tests Tab ──────────────────────────────────────────────────────────
function DriftTab({ projectId, token }: { projectId: string; token: string }) {
  const [tests, setTests] = useState<DriftTest[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setTests(await driftApi.list(projectId, token)) } catch {}
    setLoading(false)
  }, [projectId, token])

  useEffect(() => { load() }, [load])

  async function runTest(testId: string) {
    setRunning(testId)
    try {
      await driftApi.run(projectId, testId, token)
      await load()
    } catch (e: any) {
      alert(`Run failed: ${e.message}`)
    }
    setRunning(null)
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Quality Drift Tests</h2>
          <p className="text-sm text-slate-500 mt-0.5">Monitor output quality using golden prompt evaluations</p>
        </div>
      </div>

      {tests.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
          <EmptyState icon={FlaskConical} title="No drift tests yet" description="Run the setup wizard to create your first drift test, or use the API to add golden prompts." />
        </div>
      ) : (
        <div className="grid gap-4">
          {tests.map(test => {
            const isAlert = test.last_score !== undefined && test.last_score < 7
            return (
              <div key={test.id} className={`bg-slate-900 border rounded-xl p-5 ${isAlert ? 'border-red-500/30' : 'border-slate-800'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-medium text-slate-200">{test.name}</h3>
                      {isAlert && <span className="text-xs bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">⚠ Quality Alert</span>}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 flex-wrap">
                      <span className="font-mono bg-slate-800 px-2 py-0.5 rounded">{test.model}</span>
                      <span>{test.golden_prompt_count ?? 0} prompts</span>
                      <span className="capitalize">{test.schedule}</span>
                      {test.last_run_at && <span>Last run: {timeAgo(test.last_run_at)}</span>}
                      {!test.last_run_at && <span className="text-slate-600">Never run</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {test.last_score !== undefined && test.baseline_score !== undefined && (
                      <ScoreRing score={test.last_score} baseline={test.baseline_score} />
                    )}
                    {test.last_score !== undefined && test.baseline_score === undefined && (
                      <div className="text-sm text-slate-400">Score: {test.last_score.toFixed(1)}/10</div>
                    )}
                    <button
                      onClick={() => runTest(test.id)}
                      disabled={running === test.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {running === test.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      Run Now
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Alerts Tab ───────────────────────────────────────────────────────────────
function AlertsTab({ projectId, token, onAlertsChange }: { projectId: string; token: string; onAlertsChange: (n: number) => void }) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await alertsApi.list(projectId, token, 'all')
      setAlerts(all)
      onAlertsChange(all.filter(a => a.status === 'active').length)
    } catch {}
    setLoading(false)
  }, [projectId, token])

  useEffect(() => { load() }, [load])

  async function handleAction(alertId: string, action: 'acknowledge' | 'resolve') {
    try {
      if (action === 'acknowledge') await alertsApi.acknowledge(projectId, alertId, token)
      else await alertsApi.resolve(projectId, alertId, token)
      await load()
    } catch (e: any) { alert(e.message) }
  }

  if (loading) return <Spinner />
  const filtered = alerts.filter(a => filter === 'all' || a.status === filter)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Alerts</h2>
          <p className="text-sm text-slate-500 mt-0.5">Cost spikes, latency anomalies, and quality drift</p>
        </div>
        <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
          {(['all', 'active', 'resolved'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${filter === f ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
          <EmptyState icon={Bell} title={filter === 'all' ? 'No alerts yet' : `No ${filter} alerts`} description="Alerts fire automatically when thresholds are breached." />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(alert => (
            <div key={alert.id} className={`bg-slate-900 border rounded-xl p-4 ${
              alert.status === 'active' && alert.severity === 'critical' ? 'border-red-500/40' :
              alert.status === 'active' ? 'border-amber-500/30' : 'border-slate-800'
            }`}>
              <div className="flex items-start gap-4">
                <div className={`mt-1 p-1.5 rounded-lg flex-shrink-0 ${alert.severity === 'critical' ? 'bg-red-500/15' : 'bg-amber-500/15'}`}>
                  <AlertTriangle size={14} className={alert.severity === 'critical' ? 'text-red-400' : 'text-amber-400'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="font-medium text-slate-200">{alert.title}</h3>
                    <AlertBadge type={alert.alert_type} severity={alert.severity} />
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      alert.status === 'active' ? 'bg-slate-700 text-slate-300' :
                      alert.status === 'acknowledged' ? 'bg-blue-500/15 text-blue-400' :
                      'bg-emerald-500/15 text-emerald-400'
                    }`}>{alert.status}</span>
                  </div>
                  <p className="text-sm text-slate-400 mt-1">{alert.message}</p>
                  {alert.model && <span className="text-xs font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded mt-2 inline-block">{alert.model}</span>}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs text-slate-500">{timeAgo(alert.triggered_at)}</div>
                  {alert.status === 'active' && (
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => handleAction(alert.id, 'acknowledge')} className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded transition-colors">Ack</button>
                      <button onClick={() => handleAction(alert.id, 'resolve')} className="text-xs px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded transition-colors">Resolve</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── API Keys Tab ─────────────────────────────────────────────────────────────
function KeysTab({ projectId, token }: { projectId: string; token: string }) {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setKeys(await apiKeysApi.list(projectId, token)) } catch {}
    setLoading(false)
  }, [projectId, token])

  useEffect(() => { load() }, [load])

  async function createKey() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const key = await apiKeysApi.create(projectId, { name: newName }, token)
      if (key.full_key) setNewKey(key.full_key)
      setNewName('')
      setShowForm(false)
      await load()
    } catch (e: any) { alert(e.message) }
    setCreating(false)
  }

  async function revokeKey(keyId: string) {
    if (!confirm('Revoke this API key? This cannot be undone.')) return
    try { await apiKeysApi.revoke(projectId, keyId, token); await load() } catch (e: any) { alert(e.message) }
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">API Keys</h2>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus size={15} />Generate Key
        </button>
      </div>

      {newKey && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <p className="text-xs text-amber-400 font-medium mb-2">⚠ Copy this key now — it won't be shown again</p>
          <code className="text-sm font-mono text-amber-300 break-all">{newKey}</code>
          <button onClick={() => setNewKey(null)} className="mt-3 block text-xs text-amber-500 hover:text-amber-300">Dismiss</button>
        </div>
      )}

      {showForm && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex gap-3">
          <input
            type="text" placeholder="Key name (e.g. Production SDK)"
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createKey()}
            className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button onClick={createKey} disabled={creating || !newName.trim()} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg disabled:opacity-50 transition-colors">
            {creating ? <Loader2 size={14} className="animate-spin" /> : 'Create'}
          </button>
        </div>
      )}

      {keys.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
          <EmptyState icon={Key} title="No API keys yet" description="Generate a key to start sending data with the SDK." />
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/50">
              <tr>{['Name', 'Key', 'Last Used', 'Created', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {keys.map(key => (
                <tr key={key.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-200">{key.name}</td>
                  <td className="px-4 py-3"><code className="font-mono text-xs bg-slate-800 px-2 py-1 rounded text-slate-400">{key.key_prefix}••••</code></td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{key.last_used_at ? timeAgo(key.last_used_at) : 'Never'}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{new Date(key.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${key.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-500'}`}>
                      {key.is_active ? 'Active' : 'Revoked'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {key.is_active && <button onClick={() => revokeKey(key.id)} className="text-xs text-red-400 hover:text-red-300 transition-colors">Revoke</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, token, loading: authLoading } = useAuth()
  const router = useRouter()

  const [activeView, setActiveView] = useState('overview')
  const [projects, setProjects] = useState<Project[]>([])
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [alertCount, setAlertCount] = useState(0)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [user, authLoading])

  // Load projects
  useEffect(() => {
    if (!token) return
    projectsApi.list(token).then(ps => {
      setProjects(ps)
      if (ps.length > 0) setCurrentProject(ps[0])
    }).catch(() => {})
  }, [token])

  // Load metrics + alerts when project changes
  const loadData = useCallback(async () => {
    if (!currentProject || !token) return
    setMetricsLoading(true)
    setAlertsLoading(true)
    try {
      const [m, a] = await Promise.all([
        metricsApi.get(currentProject.id, 30, token),
        alertsApi.list(currentProject.id, token, 'all'),
      ])
      setMetrics(m)
      setAlerts(a)
      setAlertCount(a.filter(x => x.status === 'active').length)
    } catch {}
    setMetricsLoading(false)
    setAlertsLoading(false)
  }, [currentProject, token])

  useEffect(() => { loadData() }, [loadData])

  async function refresh() {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }

  if (authLoading) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><Loader2 size={28} className="animate-spin text-indigo-400" /></div>
  }
  if (!user) return null

  const viewContent: Record<string, React.ReactNode> = {
    overview: <OverviewTab metrics={metrics} alerts={alerts} loading={metricsLoading} />,
    costs:    <CostsTab metrics={metrics} loading={metricsLoading} />,
    latency:  <LatencyTab metrics={metrics} loading={metricsLoading} />,
    models:   <ModelsTab metrics={metrics} loading={metricsLoading} />,
    drift:    currentProject && token ? <DriftTab projectId={currentProject.id} token={token} /> : <Spinner />,
    alerts:   currentProject && token ? <AlertsTab projectId={currentProject.id} token={token} onAlertsChange={setAlertCount} /> : <Spinner />,
    keys:     currentProject && token ? <KeysTab projectId={currentProject.id} token={token} /> : <Spinner />,
    settings: (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-100">Settings</h2>
        {currentProject && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="text-sm text-slate-400">Project ID</div>
            <code className="text-sm font-mono text-slate-300 bg-slate-800 px-3 py-2 rounded block">{currentProject.id}</code>
            <div className="text-sm text-slate-400 mt-3">Environment</div>
            <div className="text-sm text-slate-300 capitalize">{currentProject.environment}</div>
          </div>
        )}
      </div>
    ),
  }

  return (
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        projects={projects}
        currentProject={currentProject}
        setCurrentProject={p => { setCurrentProject(p); setMetrics(null) }}
        alertCount={alertCount}
      />

      <main className="flex-1 overflow-auto min-w-0">
        <header className="sticky top-0 z-10 bg-gray-950/80 backdrop-blur-md border-b border-slate-800 px-6 py-3.5 flex items-center justify-between">
          <h1 className="text-base font-semibold text-slate-200 capitalize">{activeView}</h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              Live
            </div>
            <button onClick={refresh} disabled={refreshing} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />Refresh
            </button>
          </div>
        </header>

        <div className="p-6">
          {viewContent[activeView] ?? (
            <div className="flex items-center justify-center h-64 text-slate-500">
              <div className="text-center"><Settings size={32} className="mx-auto mb-3 opacity-30" /><p>Coming soon</p></div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}