'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, ArcElement, Tooltip, Legend, Filler
} from 'chart.js'
import { Line, Bar, Doughnut } from 'react-chartjs-2'
import {
  AlertTriangle, BarChart3, Bell, Brain, Clock, ChevronsUpDown,
  DollarSign, FlaskConical, Key, LayoutDashboard, Loader2,
  LogOut, Plus, RefreshCw, Settings, TrendingUp, TrendingDown,
  Copy, Check, ExternalLink, Activity
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import {
  metricsApi, alertsApi, driftApi, apiKeysApi, projectsApi,
  type MetricsResponse, type Alert, type DriftTest, type ApiKey, type Project
} from '@/lib/api'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler)

const chart = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#fff', titleColor: '#0a0a0a', bodyColor: '#666',
      borderColor: 'rgba(0,0,0,0.1)', borderWidth: 1, padding: 10,
      displayColors: false,
    },
  },
  scales: {
    x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#bbb', font: { size: 10 } }, border: { display: false } },
    y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#bbb', font: { size: 10 } }, border: { display: false } },
  },
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h > 24) return `${Math.floor(h / 24)}d ago`
  if (h > 0) return `${h}h ago`
  return `${Math.floor(diff / 60_000)}m ago`
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-5 h-5 border-[1.5px] border-black/10 border-t-black/40 rounded-full animate-spin" />
    </div>
  )
}

function Empty({ icon: Icon, title, desc }: { icon: any; title: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      <div className="w-10 h-10 bg-black/[0.04] rounded-xl flex items-center justify-center">
        <Icon size={18} className="text-[#ccc]" />
      </div>
      <div>
        <p className="text-sm font-medium text-[#333]">{title}</p>
        {desc && <p className="text-xs text-[#999] mt-1 max-w-xs leading-relaxed">{desc}</p>}
      </div>
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border border-black/[0.07] rounded-xl ${className}`}>{children}</div>
}

function Badge({ children, variant = 'default' }: {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
}) {
  const v = {
    default: 'bg-black/[0.04] text-[#666] border-black/[0.07]',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    warning: 'bg-amber-50 text-amber-700 border-amber-100',
    danger:  'bg-red-50 text-red-600 border-red-100',
    info:    'bg-blue-50 text-blue-700 border-blue-100',
  }[variant]
  return (
    <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${v}`}>
      {children}
    </span>
  )
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="text-[#ccc] hover:text-[#666] transition-colors p-1 rounded"
    >
      {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
    </button>
  )
}

function StatCard({ label, value, change, icon: Icon, prefix = '', suffix = '' }: {
  label: string; value?: string | number; change?: number
  icon: any; prefix?: string; suffix?: string
}) {
  const inv = label.includes('Cost') || label.includes('Latency') || label.includes('Error')
  const good = change !== undefined ? (inv ? change < 0 : change > 0) : null
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs text-[#999]">{label}</p>
        <div className="w-7 h-7 bg-black/[0.03] rounded-lg flex items-center justify-center border border-black/[0.05]">
          <Icon size={13} className="text-[#aaa]" />
        </div>
      </div>
      <div className="text-2xl font-semibold text-[#0a0a0a] tracking-tight tabular-nums mb-1.5">
        {value === undefined
          ? <span className="text-[#e0e0e0]">—</span>
          : <>{prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}</>
        }
      </div>
      {change !== undefined && (
        <div className={`flex items-center gap-1 text-xs font-medium ${good ? 'text-emerald-600' : 'text-red-500'}`}>
          {good ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
          {Math.abs(change).toFixed(1)}% vs last period
        </div>
      )}
    </Card>
  )
}

function Sidebar({ activeView, setActiveView, projects, currentProject, setCurrentProject, alertCount }: {
  activeView: string; setActiveView: (v: string) => void
  projects: Project[]; currentProject: Project | null
  setCurrentProject: (p: Project) => void; alertCount: number
}) {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)

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
    <aside className="w-56 bg-white border-r border-black/[0.06] flex flex-col h-screen sticky top-0 flex-shrink-0">
      <div className="px-5 pt-5 pb-4 border-b border-black/[0.05]">
        <div className="flex items-center gap-2.5">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="1" y="1" width="8" height="8" rx="1.5" fill="#0a0a0a"/>
            <rect x="11" y="1" width="8" height="8" rx="1.5" fill="#0a0a0a" opacity="0.25"/>
            <rect x="1" y="11" width="8" height="8" rx="1.5" fill="#0a0a0a" opacity="0.25"/>
            <rect x="11" y="11" width="8" height="8" rx="1.5" fill="#0a0a0a"/>
          </svg>
          <div>
            <div className="text-sm font-semibold text-[#0a0a0a] tracking-tight">LLM Monitor</div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-[#999]">Live</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 py-2.5 border-b border-black/[0.05] relative">
        <button onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-black/[0.03] transition-colors group">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-5 h-5 rounded-md bg-[#0a0a0a] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-[9px] font-bold">{currentProject?.name?.[0]?.toUpperCase() || 'P'}</span>
            </div>
            <span className="text-xs font-medium text-[#333] truncate">{currentProject?.name || 'Select project'}</span>
          </div>
          <ChevronsUpDown size={12} className="text-[#ccc] group-hover:text-[#999] transition-colors flex-shrink-0" />
        </button>

        {open && projects.length > 0 && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute top-full left-3 right-3 mt-1 z-20 bg-white border border-black/[0.08] rounded-xl shadow-lg overflow-hidden py-1">
              {projects.map(p => (
                <button key={p.id} onClick={() => { setCurrentProject(p); setOpen(false) }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-black/[0.03] transition-colors text-left ${p.id === currentProject?.id ? 'text-[#0a0a0a] font-medium' : 'text-[#666]'}`}>
                  <div className="w-5 h-5 rounded-md bg-[#0a0a0a] flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-[9px] font-bold">{p.name[0].toUpperCase()}</span>
                  </div>
                  <span className="truncate flex-1">{p.name}</span>
                  {p.id === currentProject?.id && <Check size={11} className="text-[#0a0a0a]" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {nav.map(({ id, icon: Icon, label, badge }) => (
          <button key={id} onClick={() => setActiveView(id)}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-all ${
              activeView === id
                ? 'bg-[#0a0a0a] text-white font-medium'
                : 'text-[#666] hover:bg-black/[0.04] hover:text-[#0a0a0a]'
            }`}>
            <div className="flex items-center gap-2.5">
              <Icon size={13} />
              {label}
            </div>
            {badge ? (
              <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center leading-none">
                {badge}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-black/[0.05] space-y-1">
        <div className="px-2.5 py-2 rounded-lg bg-[#fafafa] border border-black/[0.05]">
          <p className="text-[10px] font-medium text-[#999] uppercase tracking-wide mb-0.5">Starter Plan</p>
          <p className="text-[11px] text-[#555] truncate">{user?.email}</p>
        </div>
        <button onClick={signOut}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-xs text-[#999] hover:text-[#333] hover:bg-black/[0.03] rounded-lg transition-colors">
          <LogOut size={12} /> Sign out
        </button>
      </div>
    </aside>
  )
}

function OverviewTab({ metrics, alerts, loading, onViewAlerts }: {
  metrics: MetricsResponse | null; alerts: Alert[]; loading: boolean
  onViewAlerts: () => void
}) {
  if (loading) return <Spinner />
  const s = metrics?.summary
  const trend = metrics?.daily_trend || []
  const models = metrics?.model_breakdown || []
  const dates = trend.map(d => d.date.slice(5))
  const activeAlerts = alerts.filter(a => a.status === 'active')
  const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical')

  return (
    <div className="space-y-5">
      {activeAlerts.length > 0 && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${
          criticalAlerts.length > 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
        }`}>
          <AlertTriangle size={15} className={`flex-shrink-0 ${criticalAlerts.length > 0 ? 'text-red-500' : 'text-amber-500'}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${criticalAlerts.length > 0 ? 'text-red-700' : 'text-amber-700'}`}>
              {criticalAlerts.length > 0
                ? `${criticalAlerts.length} critical alert${criticalAlerts.length > 1 ? 's' : ''}`
                : `${activeAlerts.length} active alert${activeAlerts.length > 1 ? 's' : ''}`}
            </p>
            <p className={`text-xs mt-0.5 truncate ${criticalAlerts.length > 0 ? 'text-red-500' : 'text-amber-600'}`}>
              {activeAlerts[0].title}{activeAlerts.length > 1 ? ` and ${activeAlerts.length - 1} more` : ''}
            </p>
          </div>
          <button onClick={onViewAlerts}
            className={`text-xs font-medium whitespace-nowrap hover:underline ${criticalAlerts.length > 0 ? 'text-red-600' : 'text-amber-700'}`}>
            View alerts →
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Requests" value={s?.total_requests} change={s?.requests_change_pct} icon={BarChart3} />
        <StatCard label="Total Cost" value={s?.total_cost_usd?.toFixed(6)} change={s?.cost_change_pct} icon={DollarSign} prefix="$" />
        <StatCard label="Avg Latency" value={s?.avg_latency_ms ? Math.round(s.avg_latency_ms) : undefined} icon={Clock} suffix="ms" />
        <StatCard label="Error Rate" value={s?.error_rate?.toFixed(2)} icon={AlertTriangle} suffix="%" />
      </div>

      {trend.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-medium text-[#0a0a0a]">Daily Cost</h3>
                <p className="text-xs text-[#999] mt-0.5">{metrics?.period_days || 30} days</p>
              </div>
              <span className="text-xs font-mono font-medium text-[#0a0a0a]">
                ${trend.reduce((a, b) => a + b.total_cost_usd, 0).toFixed(6)}
              </span>
            </div>
            <div style={{ height: 180 }}>
              <Line data={{
                labels: dates,
                datasets: [{ data: trend.map(d => d.total_cost_usd), borderColor: '#0a0a0a', backgroundColor: 'rgba(10,10,10,0.04)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 }]
              }} options={chart as any} />
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-medium text-[#0a0a0a]">Daily Requests</h3>
                <p className="text-xs text-[#999] mt-0.5">{metrics?.period_days || 30} days</p>
              </div>
              <span className="text-xs text-[#999]">
                {trend.reduce((a, b) => a + b.total_requests, 0).toLocaleString()} total
              </span>
            </div>
            <div style={{ height: 180 }}>
              <Bar data={{
                labels: dates,
                datasets: [{ data: trend.map(d => d.total_requests), backgroundColor: 'rgba(10,10,10,0.07)', borderRadius: 3, hoverBackgroundColor: 'rgba(10,10,10,0.13)' }]
              }} options={chart as any} />
            </div>
          </Card>
        </div>
      ) : (
        <Card className="p-8">
          <Empty icon={Activity} title="No data yet" desc="Send your first request using the SDK to see metrics here." />
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {models.length > 0 && (
          <Card className="p-5">
            <h3 className="text-sm font-medium text-[#0a0a0a] mb-4">Cost by Model</h3>
            <div style={{ height: 150 }}>
              <Doughnut data={{
                labels: models.map(m => m.model.split('-')[0]),
                datasets: [{ data: models.map(m => m.total_cost_usd), backgroundColor: ['#0a0a0a', '#555', '#999', '#d4d4d4'], borderWidth: 0, hoverOffset: 2 }]
              }} options={{
                responsive: true, maintainAspectRatio: false, cutout: '70%',
                plugins: {
                  legend: { display: true, position: 'bottom' as const, labels: { color: '#999', font: { size: 10 }, padding: 10, boxWidth: 8, boxHeight: 8 } },
                  tooltip: chart.plugins.tooltip,
                },
              }} />
            </div>
          </Card>
        )}
        <Card className={`p-5 ${models.length > 0 ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-[#0a0a0a]">Recent Alerts</h3>
            {activeAlerts.length > 0 && (
              <button onClick={onViewAlerts}>
                <Badge variant="danger">{activeAlerts.length} active</Badge>
              </button>
            )}
          </div>
          {alerts.length === 0 ? (
            <Empty icon={Bell} title="No alerts yet" desc="Alerts appear when thresholds are breached." />
          ) : (
            <div className="space-y-2">
              {alerts.slice(0, 4).map(a => (
                <div key={a.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                  a.status === 'active' ? 'bg-[#fafafa] border-black/[0.06]' : 'border-transparent opacity-40'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.severity === 'critical' ? 'bg-red-500' : 'bg-amber-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#0a0a0a] truncate">{a.title}</p>
                    <p className="text-[11px] text-[#999] truncate">{a.message}</p>
                  </div>
                  <span className="text-[11px] text-[#ccc] whitespace-nowrap">{timeAgo(a.triggered_at)}</span>
                </div>
              ))}
              {alerts.length > 4 && (
                <button onClick={onViewAlerts} className="w-full text-xs text-[#999] hover:text-[#333] py-2 transition-colors">
                  View all {alerts.length} alerts →
                </button>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function CostsTab({ metrics, loading }: { metrics: MetricsResponse | null; loading: boolean }) {
  if (loading) return <Spinner />
  const trend = metrics?.daily_trend || []
  if (trend.length === 0) return <Card className="p-8"><Empty icon={DollarSign} title="No cost data yet" desc="Cost data appears after your first SDK request." /></Card>

  const total = trend.reduce((a, b) => a + b.total_cost_usd, 0)
  const avg = total / trend.length
  const peak = Math.max(...trend.map(d => d.total_cost_usd))
  const peakDay = trend.find(d => d.total_cost_usd === peak)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total (30 days)', value: `$${fmt(total, 6)}` },
          { label: 'Daily average', value: `$${fmt(avg, 6)}` },
          { label: 'Peak day', value: `$${fmt(peak, 6)}`, sub: peakDay?.date.slice(5) },
        ].map(s => (
          <Card key={s.label} className="p-5">
            <p className="text-xs text-[#999] mb-2">{s.label}</p>
            <p className="text-xl font-semibold text-[#0a0a0a] tabular-nums tracking-tight font-mono">{s.value}</p>
            {'sub' in s && s.sub && <p className="text-xs text-[#ccc] mt-0.5">{s.sub}</p>}
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <h3 className="text-sm font-medium text-[#0a0a0a] mb-5">30-Day Cost Trend</h3>
        <div style={{ height: 260 }}>
          <Line data={{
            labels: trend.map(d => d.date.slice(5)),
            datasets: [{ data: trend.map(d => d.total_cost_usd), borderColor: '#0a0a0a', backgroundColor: 'rgba(10,10,10,0.04)', fill: true, tension: 0.4, pointRadius: 2, pointBackgroundColor: '#0a0a0a', borderWidth: 1.5 }]
          }} options={{ ...chart, scales: { ...chart.scales, y: { ...chart.scales.y, ticks: { ...chart.scales.y.ticks, callback: (v: any) => `$${Number(v).toFixed(4)}` } } } } as any} />
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-black/[0.05]">
          <h3 className="text-sm font-medium text-[#0a0a0a]">Daily Breakdown</h3>
        </div>
        <div className="divide-y divide-black/[0.04] max-h-64 overflow-y-auto">
          {[...trend].reverse().map(d => (
            <div key={d.date} className="flex items-center justify-between px-5 py-2.5 hover:bg-black/[0.02] transition-colors">
              <span className="text-xs text-[#666]">{d.date}</span>
              <div className="flex items-center gap-6">
                <span className="text-xs text-[#999]">{d.total_requests.toLocaleString()} reqs</span>
                <span className="text-xs font-mono font-medium text-[#0a0a0a] w-24 text-right">${fmt(d.total_cost_usd, 6)}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function LatencyTab({ metrics, loading }: { metrics: MetricsResponse | null; loading: boolean }) {
  if (loading) return <Spinner />
  const trend = metrics?.daily_trend || []
  if (trend.length === 0) return <Card className="p-8"><Empty icon={Clock} title="No latency data yet" desc="Latency data appears after your first SDK request." /></Card>

  const avg = trend.reduce((a, b) => a + b.avg_latency_ms, 0) / trend.length

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Average', value: `${Math.round(avg)}ms` },
          { label: 'Best day', value: `${Math.min(...trend.map(d => d.avg_latency_ms)).toFixed(0)}ms` },
          { label: 'Worst day', value: `${Math.max(...trend.map(d => d.avg_latency_ms)).toFixed(0)}ms` },
        ].map(s => (
          <Card key={s.label} className="p-5">
            <p className="text-xs text-[#999] mb-2">{s.label}</p>
            <p className="text-xl font-semibold text-[#0a0a0a] tabular-nums tracking-tight">{s.value}</p>
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <h3 className="text-sm font-medium text-[#0a0a0a] mb-5">Average Latency</h3>
        <div style={{ height: 260 }}>
          <Line data={{
            labels: trend.map(d => d.date.slice(5)),
            datasets: [{ data: trend.map(d => d.avg_latency_ms), borderColor: '#0a0a0a', backgroundColor: 'rgba(10,10,10,0.04)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 }]
          }} options={{ ...chart, scales: { ...chart.scales, y: { ...chart.scales.y, ticks: { ...chart.scales.y.ticks, callback: (v: any) => `${v}ms` } } } } as any} />
        </div>
      </Card>
    </div>
  )
}

function ModelsTab({ metrics, loading }: { metrics: MetricsResponse | null; loading: boolean }) {
  if (loading) return <Spinner />
  const models = metrics?.model_breakdown || []
  if (models.length === 0) return <Card className="p-8"><Empty icon={Brain} title="No model data yet" desc="Model breakdown appears after your first SDK request." /></Card>

  const providerVariant: Record<string, any> = { openai: 'success', anthropic: 'warning', groq: 'info' }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Models used', value: models.length },
          { label: 'Total requests', value: models.reduce((a, b) => a + b.total_requests, 0).toLocaleString() },
          { label: 'Total cost', value: `$${fmt(models.reduce((a, b) => a + b.total_cost_usd, 0), 6)}` },
        ].map(s => (
          <Card key={s.label} className="p-5">
            <p className="text-xs text-[#999] mb-2">{s.label}</p>
            <p className="text-xl font-semibold text-[#0a0a0a] tabular-nums tracking-tight">{s.value}</p>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-black/[0.05]">
          <h3 className="text-sm font-medium text-[#0a0a0a]">Model Breakdown</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/[0.05]">
              {['Model', 'Provider', 'Requests', 'Total Cost', 'Avg Latency', 'Share'].map(h => (
                <th key={h} className="px-5 py-3 text-left text-[10px] font-medium text-[#bbb] uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.03]">
            {models.map(m => (
              <tr key={m.model} className="hover:bg-black/[0.02] transition-colors">
                <td className="px-5 py-3.5">
                  <code className="text-[11px] font-mono bg-black/[0.04] px-2 py-1 rounded-md text-[#444]">{m.model}</code>
                </td>
                <td className="px-5 py-3.5">
                  <Badge variant={providerVariant[m.provider] || 'default'}>{m.provider}</Badge>
                </td>
                <td className="px-5 py-3.5 text-xs text-[#444] tabular-nums">{m.total_requests.toLocaleString()}</td>
                <td className="px-5 py-3.5 text-xs font-mono font-medium text-[#0a0a0a]">${fmt(m.total_cost_usd, 6)}</td>
                <td className="px-5 py-3.5 text-xs text-[#444] tabular-nums">{m.avg_latency_ms ? `${Math.round(m.avg_latency_ms)}ms` : '—'}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1 bg-black/[0.06] rounded-full overflow-hidden">
                      <div className="h-1 bg-[#0a0a0a] rounded-full" style={{ width: `${m.cost_share_pct || 0}%` }} />
                    </div>
                    <span className="text-[11px] text-[#999] tabular-nums">{(m.cost_share_pct || 0).toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function DriftTab({ projectId, token }: { projectId: string; token: string }) {
  const [tests, setTests] = useState<DriftTest[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); try { setTests(await driftApi.list(projectId, token)) } catch {} setLoading(false)
  }, [projectId, token])

  useEffect(() => { load() }, [load])

  async function run(id: string) {
    setRunning(id)
    try { await driftApi.run(projectId, id, token); await load() } catch (e: any) { alert(e.message) }
    setRunning(null)
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-[#0a0a0a]">Drift Tests</h2>
        <p className="text-xs text-[#999] mt-0.5">Monitor output quality with golden prompt evaluations</p>
      </div>
      {tests.length === 0 ? (
        <Card className="p-8">
          <Empty icon={FlaskConical} title="No drift tests" desc="Create drift tests via the API to monitor output quality." />
        </Card>
      ) : (
        <div className="space-y-3">
          {tests.map(test => {
            const score = test.last_score
            const scoreColor = score === undefined ? '#ccc' : score >= 8 ? '#10b981' : score >= 6 ? '#f59e0b' : '#ef4444'
            const alert = score !== undefined && score < 7
            return (
              <Card key={test.id} className={`p-5 ${alert ? 'border-red-200' : ''}`}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                      <span className="text-sm font-medium text-[#0a0a0a]">{test.name}</span>
                      {alert && <Badge variant="danger">Quality alert</Badge>}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <code className="text-[11px] font-mono bg-black/[0.04] px-2 py-0.5 rounded text-[#555]">{test.model}</code>
                      <span className="text-[11px] text-[#999]">{test.golden_prompt_count ?? 0} prompts</span>
                      <span className="text-[11px] text-[#999] capitalize">{test.schedule}</span>
                      {test.last_run_at && <span className="text-[11px] text-[#ccc]">Last run {timeAgo(test.last_run_at)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    {score !== undefined && (
                      <div className="text-right">
                        <div className="text-2xl font-semibold tabular-nums tracking-tight" style={{ color: scoreColor }}>{score.toFixed(1)}</div>
                        <div className="text-[10px] text-[#ccc]">/ 10</div>
                      </div>
                    )}
                    <button onClick={() => run(test.id)} disabled={running === test.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#666] bg-black/[0.04] hover:bg-black/[0.07] rounded-lg transition-colors disabled:opacity-40 border border-black/[0.06]">
                      {running === test.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      Run
                    </button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AlertsTab({ projectId, token }: { projectId: string; token: string }) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all')

  const load = useCallback(async () => {
    setLoading(true); try { setAlerts(await alertsApi.list(projectId, token, 'all')) } catch {} setLoading(false)
  }, [projectId, token])

  useEffect(() => { load() }, [load])

  async function action(id: string, act: 'acknowledge' | 'resolve') {
    try {
      act === 'acknowledge' ? await alertsApi.acknowledge(projectId, id, token) : await alertsApi.resolve(projectId, id, token)
      await load()
    } catch (e: any) { alert(e.message) }
  }

  if (loading) return <Spinner />
  const filtered = alerts.filter(a => filter === 'all' || a.status === filter)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#0a0a0a]">Alerts</h2>
          <p className="text-xs text-[#999] mt-0.5">Cost spikes, latency anomalies, quality drift</p>
        </div>
        <div className="flex items-center bg-black/[0.04] rounded-lg p-1 gap-0.5">
          {(['all', 'active', 'resolved'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${
                filter === f ? 'bg-white text-[#0a0a0a] shadow-sm' : 'text-[#999] hover:text-[#333]'
              }`}>{f}</button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <Card className="p-8">
          <Empty icon={Bell} title={filter === 'all' ? 'No alerts' : `No ${filter} alerts`} desc="Alerts fire when thresholds are breached." />
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(a => (
            <Card key={a.id} className={`p-4 ${a.status === 'active' ? (a.severity === 'critical' ? 'border-red-200' : 'border-amber-200') : 'opacity-50'}`}>
              <div className="flex items-start gap-3">
                <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${a.severity === 'critical' ? 'bg-red-500' : 'bg-amber-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-medium text-[#0a0a0a]">{a.title}</span>
                    <Badge variant={a.severity === 'critical' ? 'danger' : 'warning'}>{a.severity}</Badge>
                    <Badge variant={a.status === 'active' ? 'default' : a.status === 'acknowledged' ? 'info' : 'success'}>{a.status}</Badge>
                  </div>
                  <p className="text-xs text-[#666]">{a.message}</p>
                  {a.model && <code className="text-[10px] font-mono bg-black/[0.04] text-[#666] px-2 py-0.5 rounded mt-1.5 inline-block">{a.model}</code>}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[11px] text-[#ccc] mb-2">{timeAgo(a.triggered_at)}</p>
                  {a.status === 'active' && (
                    <div className="flex gap-1.5">
                      <button onClick={() => action(a.id, 'acknowledge')}
                        className="text-xs px-2.5 py-1 bg-black/[0.04] hover:bg-black/[0.07] text-[#666] rounded-lg transition-colors border border-black/[0.06]">Ack</button>
                      <button onClick={() => action(a.id, 'resolve')}
                        className="text-xs px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors border border-emerald-100">Resolve</button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function KeysTab({ projectId, token }: { projectId: string; token: string }) {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); try { setKeys(await apiKeysApi.list(projectId, token)) } catch {} setLoading(false)
  }, [projectId, token])

  useEffect(() => { load() }, [load])

  async function create() {
    if (!newName.trim()) return; setCreating(true)
    try {
      const k = await apiKeysApi.create(projectId, { name: newName }, token)
      if (k.full_key) setNewKey(k.full_key)
      setNewName(''); setShowForm(false); await load()
    } catch (e: any) { alert(e.message) }
    setCreating(false)
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#0a0a0a]">API Keys</h2>
          <p className="text-xs text-[#999] mt-0.5">Manage keys for SDK authentication</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#0a0a0a] hover:bg-[#222] text-white text-xs font-medium rounded-lg transition-colors">
          <Plus size={12} /> New key
        </button>
      </div>

      {newKey && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-xs font-medium text-amber-700 mb-2.5">⚠ Copy now — won't be shown again</p>
          <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
            <code className="text-xs font-mono text-[#333] break-all flex-1">{newKey}</code>
            <CopyBtn text={newKey} />
          </div>
          <button onClick={() => setNewKey(null)} className="mt-2 text-xs text-amber-600 hover:text-amber-800">Dismiss</button>
        </div>
      )}

      {showForm && (
        <Card className="p-4 flex gap-3">
          <input type="text" placeholder="Key name (e.g. Production)"
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && create()}
            className="flex-1 px-3 py-2 bg-[#fafafa] border border-black/[0.1] rounded-lg text-[#0a0a0a] text-xs placeholder-[#bbb] focus:outline-none focus:ring-2 focus:ring-black/10 transition-all"
          />
          <button onClick={create} disabled={creating || !newName.trim()}
            className="px-4 py-2 bg-[#0a0a0a] text-white text-xs rounded-lg disabled:opacity-40 hover:bg-[#222] transition-colors">
            {creating ? <Loader2 size={13} className="animate-spin" /> : 'Create'}
          </button>
        </Card>
      )}

      {keys.length === 0 ? (
        <Card className="p-8"><Empty icon={Key} title="No API keys" desc="Generate a key to start sending data." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/[0.05]">
                {['Name', 'Key', 'Last used', 'Created', 'Status', ''].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-medium text-[#bbb] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.03]">
              {keys.map(k => (
                <tr key={k.id} className="hover:bg-black/[0.02] transition-colors">
                  <td className="px-5 py-3.5 text-xs font-medium text-[#0a0a0a]">{k.name}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <code className="font-mono text-[11px] bg-black/[0.04] px-2 py-0.5 rounded text-[#555]">{k.key_prefix}••••</code>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-[#999]">{k.last_used_at ? timeAgo(k.last_used_at) : 'Never'}</td>
                  <td className="px-5 py-3.5 text-xs text-[#999]">{new Date(k.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant={k.is_active ? 'success' : 'default'}>{k.is_active ? 'Active' : 'Revoked'}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {k.is_active && (
                      <button onClick={async () => {
                        if (!confirm('Revoke this key?')) return
                        try { await apiKeysApi.revoke(projectId, k.id, token); await load() } catch (e: any) { alert(e.message) }
                      }} className="text-xs text-red-400 hover:text-red-600 transition-colors">Revoke</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

// ── Settings ──────────────────────────────────────────────────────────────────
function SettingsTab({ project, token, onProjectUpdate }: {
  project: Project
  token: string
  onProjectUpdate: (p: Project) => void
}) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [costThreshold, setCostThreshold] = useState(project.cost_alert_threshold_pct ?? 30)
  const [latencyThreshold, setLatencyThreshold] = useState(project.latency_alert_threshold_pct ?? 50)
  const [alertEmail, setAlertEmail] = useState(project.alert_email ?? '')
  const [slackWebhook, setSlackWebhook] = useState(project.slack_webhook_url ?? '')

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await projectsApi.update(project.id, {
        cost_alert_threshold_pct: costThreshold,
        latency_alert_threshold_pct: latencyThreshold,
        alert_email: alertEmail || null,
        slack_webhook_url: slackWebhook || null,
      }, token)
      onProjectUpdate(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) { alert(e.message) }
    setSaving(false)
  }

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h2 className="text-sm font-semibold text-[#0a0a0a]">Settings</h2>
        <p className="text-xs text-[#999] mt-0.5">Project configuration and alert thresholds</p>
      </div>

      {/* Project Info */}
      <Card>
        <div className="divide-y divide-black/[0.04]">
          {[
            { label: 'Project name', value: project.name, mono: false, copy: false },
            { label: 'Project ID', value: project.id, mono: true, copy: true },
            { label: 'Environment', value: project.environment, mono: false, copy: false },
          ].map(s => (
            <div key={s.label} className="flex items-center justify-between px-5 py-4">
              <span className="text-xs text-[#999]">{s.label}</span>
              <div className="flex items-center gap-2">
                <span className={`text-xs text-[#0a0a0a] capitalize ${s.mono ? 'font-mono bg-black/[0.04] px-2 py-1 rounded-md' : 'font-medium'}`}>
                  {s.value}
                </span>
                {s.copy && <CopyBtn text={s.value} />}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Alert Thresholds */}
      <Card className="p-5">
        <h3 className="text-xs font-medium text-[#0a0a0a] mb-1">Alert Thresholds</h3>
        <p className="text-xs text-[#999] mb-4">Alert fires when metric exceeds X% above 7-day average</p>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-[#555]">Cost spike threshold</label>
              <span className="text-xs font-mono font-medium text-[#0a0a0a]">{costThreshold}%</span>
            </div>
            <input type="range" min={10} max={200} step={5}
              value={costThreshold}
              onChange={e => setCostThreshold(Number(e.target.value))}
              className="w-full accent-black h-1 rounded-full"
            />
            <div className="flex justify-between text-[10px] text-[#ccc] mt-1">
              <span>10% (sensitive)</span>
              <span>200% (relaxed)</span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-[#555]">Latency spike threshold</label>
              <span className="text-xs font-mono font-medium text-[#0a0a0a]">{latencyThreshold}%</span>
            </div>
            <input type="range" min={10} max={200} step={5}
              value={latencyThreshold}
              onChange={e => setLatencyThreshold(Number(e.target.value))}
              className="w-full accent-black h-1 rounded-full"
            />
            <div className="flex justify-between text-[10px] text-[#ccc] mt-1">
              <span>10% (sensitive)</span>
              <span>200% (relaxed)</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Notifications */}
      <Card className="p-5">
        <h3 className="text-xs font-medium text-[#0a0a0a] mb-1">Notifications</h3>
        <p className="text-xs text-[#999] mb-4">Get notified when alerts fire</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[#555] block mb-1.5">Alert email</label>
            <input type="email" placeholder="you@company.com"
              value={alertEmail}
              onChange={e => setAlertEmail(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#fafafa] border border-black/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10 text-[#0a0a0a] placeholder-[#ccc]"
            />
          </div>
          <div>
            <label className="text-xs text-[#555] block mb-1.5">Slack webhook URL</label>
            <input type="url" placeholder="https://hooks.slack.com/services/..."
              value={slackWebhook}
              onChange={e => setSlackWebhook(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#fafafa] border border-black/[0.1] rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10 text-[#0a0a0a] placeholder-[#ccc]"
            />
          </div>
        </div>
      </Card>

      {/* Save */}
      <button onClick={handleSave} disabled={saving}
        className="w-full h-9 bg-[#0a0a0a] hover:bg-[#222] text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
        {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <><Check size={13} /> Saved!</> : 'Save changes'}
      </button>

      {/* Quick integration */}
      <Card className="p-5">
        <h3 className="text-xs font-medium text-[#0a0a0a] mb-3">Quick integration</h3>
        <div className="bg-[#0d0d0d] rounded-lg p-4 font-mono text-[11px] text-[#888] leading-relaxed">
          <div className="text-[#555]"># Install</div>
          <div className="text-[#ccc] mt-1">pip install llm-monitor</div>
          <div className="mt-3 text-[#555]"># Configure</div>
          <div className="text-[#ccc] mt-1">monitor.configure(</div>
          <div className="text-[#ccc] pl-4">project_id=<span className="text-[#7dd3fc]">"{project.id.slice(0, 8)}..."</span></div>
          <div className="text-[#ccc]">)</div>
        </div>
        <a href="https://github.com/Raj-spy/llm-drift-monitor" target="_blank"
          className="mt-3 flex items-center gap-1.5 text-xs text-[#999] hover:text-[#0a0a0a] transition-colors">
          <ExternalLink size={11} /> View documentation
        </a>
      </Card>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function App() {
  const { user, token, loading: authLoading } = useAuth()
  const router = useRouter()
  const [activeView, setActiveView] = useState('overview')
  const [projects, setProjects] = useState<Project[]>([])
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { if (!authLoading && !user) router.replace('/login') }, [user, authLoading])

  useEffect(() => {
    if (!token) return
    projectsApi.list(token).then(ps => {
      setProjects(ps)
      if (ps.length > 0) setCurrentProject(ps[0])
      else router.replace('/onboarding')
    }).catch(() => {})
  }, [token])

  const loadData = useCallback(async () => {
    if (!currentProject || !token) return
    setLoading(true)
    try {
      const [m, a] = await Promise.all([
        metricsApi.get(currentProject.id, 30, token),
        alertsApi.list(currentProject.id, token, 'all')
      ])
      setMetrics(m); setAlerts(a)
    } catch {}
    setLoading(false)
  }, [currentProject, token])

  useEffect(() => { loadData() }, [loadData])

  // Update project in state after settings save
  function updateCurrentProject(updated: Project) {
    setCurrentProject(updated)
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  if (authLoading) return (
    <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
      <div className="w-5 h-5 border-[1.5px] border-black/10 border-t-black/40 rounded-full animate-spin" />
    </div>
  )
  if (!user) return null

  const alertCount = alerts.filter(a => a.status === 'active').length
  const viewLabel: Record<string, string> = {
    overview: 'Overview', costs: 'Cost Analysis', latency: 'Latency',
    models: 'Models', drift: 'Drift Tests', alerts: 'Alerts',
    keys: 'API Keys', settings: 'Settings',
  }

  return (
    <div className="flex min-h-screen bg-[#fafafa]" style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <style>{`* { -webkit-font-smoothing: antialiased; } input:focus { outline: none; }`}</style>

      <Sidebar
        activeView={activeView} setActiveView={setActiveView}
        projects={projects} currentProject={currentProject}
        setCurrentProject={p => { setCurrentProject(p); setMetrics(null) }}
        alertCount={alertCount}
      />

      <main className="flex-1 overflow-auto min-w-0">
        <header className="sticky top-0 z-10 bg-[#fafafa]/90 backdrop-blur-md border-b border-black/[0.05] px-7 py-3.5 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-[#0a0a0a]">{viewLabel[activeView]}</h1>
            {currentProject && <p className="text-[11px] text-[#bbb] mt-0.5">{currentProject.name}</p>}
          </div>
          <div className="flex items-center gap-2.5">
            {alertCount > 0 && (
              <button onClick={() => setActiveView('alerts')}
                className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-100 px-2.5 py-1.5 rounded-full font-medium hover:bg-red-100 transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                {alertCount} alert{alertCount > 1 ? 's' : ''}
              </button>
            )}
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1.5 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </div>
            <button
              onClick={async () => { setRefreshing(true); await loadData(); setRefreshing(false) }}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-xs text-[#666] hover:text-[#0a0a0a] bg-white border border-black/[0.08] hover:border-black/[0.14] px-3 py-1.5 rounded-lg transition-all disabled:opacity-40 shadow-sm">
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </header>

        <div className="p-7">
          {activeView === 'overview' && (
            <OverviewTab metrics={metrics} alerts={alerts} loading={loading} onViewAlerts={() => setActiveView('alerts')} />
          )}
          {activeView === 'costs'    && <CostsTab metrics={metrics} loading={loading} />}
          {activeView === 'latency'  && <LatencyTab metrics={metrics} loading={loading} />}
          {activeView === 'models'   && <ModelsTab metrics={metrics} loading={loading} />}
          {activeView === 'drift'    && currentProject && token && <DriftTab projectId={currentProject.id} token={token} />}
          {activeView === 'alerts'   && currentProject && token && <AlertsTab projectId={currentProject.id} token={token} />}
          {activeView === 'keys'     && currentProject && token && <KeysTab projectId={currentProject.id} token={token} />}
          {activeView === 'settings' && currentProject && token && (
            <SettingsTab project={currentProject} token={token} onProjectUpdate={updateCurrentProject} />
          )}
        </div>
      </main>
    </div>
  )
}