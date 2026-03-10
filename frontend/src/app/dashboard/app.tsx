'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, ArcElement, Tooltip, Legend, Filler
} from 'chart.js'
import { Line, Bar, Doughnut } from 'react-chartjs-2'
import {
  Activity, AlertTriangle, ArrowUpRight, ArrowDownRight,
  BarChart3, Bell, Brain, ChevronDown, Clock, DollarSign,
  FlaskConical, Key, LayoutDashboard, Loader2, LogOut,
  Plus, RefreshCw, Settings, Sparkles, FlaskConical as Flask
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import {
  metricsApi, alertsApi, driftApi, apiKeysApi, projectsApi,
  type MetricsResponse, type Alert, type DriftTest, type ApiKey, type Project
} from '@/lib/api'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler)

const chartDefaults = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { backgroundColor: '#1e293b', titleColor: '#f1f5f9', bodyColor: '#94a3b8', borderColor: '#334155', borderWidth: 1, padding: 12 },
  },
  scales: {
    x: { grid: { color: 'rgba(51,65,85,0.5)' }, ticks: { color: '#64748b', font: { size: 11 } } },
    y: { grid: { color: 'rgba(51,65,85,0.5)' }, ticks: { color: '#64748b', font: { size: 11 } } },
  },
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h > 24) return `${Math.floor(h / 24)}d ago`
  if (h > 0) return `${h}h ago`
  return `${Math.floor(diff / 60_000)}m ago`
}

function Spin() {
  return <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-indigo-400" /></div>
}

function Empty({ icon: Icon, title, desc }: { icon: any; title: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mb-4"><Icon size={22} className="text-slate-500" /></div>
      <h3 className="text-sm font-semibold text-slate-300 mb-1">{title}</h3>
      {desc && <p className="text-sm text-slate-500 max-w-xs">{desc}</p>}
    </div>
  )
}

function StatCard({ label, value, change, icon: Icon, prefix = '', suffix = '', color = 'indigo' }: {
  label: string; value?: string | number; change?: number; icon: any; prefix?: string; suffix?: string; color?: string
}) {
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-500/10 text-indigo-400', emerald: 'bg-emerald-500/10 text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-400', rose: 'bg-rose-500/10 text-rose-400',
  }
  const inv = label.includes('Cost') || label.includes('Latency') || label.includes('Error')
  const good = change !== undefined ? (inv ? change < 0 : change > 0) : null
  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors[color]}`}><Icon size={16} /></div>
      </div>
      <div>
        <div className="text-2xl font-semibold text-slate-100 tabular-nums">
          {value === undefined ? <span className="text-slate-600">—</span> : <>{prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}</>}
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 mt-1 text-xs ${good ? 'text-emerald-400' : 'text-red-400'}`}>
            {good ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
            {Math.abs(change).toFixed(1)}% vs last period
          </div>
        )}
      </div>
    </div>
  )
}

function AlertBadge({ type, severity }: { type: string; severity: string }) {
  const t: Record<string, { l: string; c: string }> = {
    cost_spike:    { l: 'Cost',    c: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    latency_spike: { l: 'Latency', c: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    quality_drift: { l: 'Quality', c: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  }
  const s: Record<string, string> = { critical: 'bg-red-500/15 text-red-400 border-red-500/30', warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30' }
  const td = t[type] || { l: type, c: 'bg-slate-700 text-slate-300 border-slate-600' }
  return (
    <div className="flex gap-2">
      <span className={`text-xs px-2 py-0.5 rounded-full border ${td.c}`}>{td.l}</span>
      <span className={`text-xs px-2 py-0.5 rounded-full border ${s[severity] || ''}`}>{severity}</span>
    </div>
  )
}

function ScoreRing({ score, baseline }: { score: number; baseline: number }) {
  const color = score >= 8 ? '#10b981' : score >= 6 ? '#f59e0b' : '#ef4444'
  const delta = score - baseline
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-10 h-10 flex-shrink-0">
        <svg viewBox="0 0 36 36" className="rotate-[-90deg] w-10 h-10">
          <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#1e293b" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.9155" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${(score/10)*100} ${100-(score/10)*100}`} strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ color }}>{score.toFixed(1)}</span>
      </div>
      <div>
        <div className="text-sm font-medium text-slate-200">{score.toFixed(1)}<span className="text-slate-500 text-xs">/10</span></div>
        <div className={`text-xs ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}</div>
      </div>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ activeView, setActiveView, projects, currentProject, setCurrentProject, alertCount }: {
  activeView: string; setActiveView: (v: string) => void
  projects: Project[]; currentProject: Project | null; setCurrentProject: (p: Project) => void
  alertCount: number
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
    <aside className="w-60 bg-slate-900 border-r border-slate-800 flex flex-col h-screen sticky top-0 flex-shrink-0">
      {/* Logo */}
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
        <button onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-5 h-5 rounded bg-indigo-600/30 flex items-center justify-center flex-shrink-0">
              <span className="text-indigo-400 text-[9px] font-bold">{currentProject?.name?.[0]?.toUpperCase() || 'P'}</span>
            </div>
            <span className="text-slate-200 font-medium truncate">{currentProject?.name || 'Select project'}</span>
          </div>
          <ChevronDown size={14} className={`text-slate-500 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && projects.length > 0 && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute top-full left-3 right-3 mt-1 z-20 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
              {projects.map(p => (
                <button key={p.id} onClick={() => { setCurrentProject(p); setOpen(false) }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-slate-700 transition-colors text-left ${p.id === currentProject?.id ? 'text-indigo-400' : 'text-slate-300'}`}>
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

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ id, icon: Icon, label, badge }) => (
          <button key={id} onClick={() => setActiveView(id)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${activeView === id ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
            <div className="flex items-center gap-2.5"><Icon size={15} />{label}</div>
            {badge ? <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{badge}</span> : null}
          </button>
        ))}
      </nav>

      {/* Plan + signout */}
      <div className="px-3 py-4 border-t border-slate-800">
        <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles size={13} className="text-indigo-400" />
            <span className="text-xs font-semibold text-indigo-400">Starter Plan</span>
          </div>
          <div className="text-xs text-slate-400">LLM Drift Monitor</div>
        </div>
        <button onClick={signOut}
          className="mt-3 w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors">
          <LogOut size={14} />
          <span className="text-xs truncate">{user?.email}</span>
        </button>
      </div>
    </aside>
  )
}

// ─── Tab content ──────────────────────────────────────────────────────────────
function OverviewTab({ metrics, alerts, loading }: { metrics: MetricsResponse | null; alerts: Alert[]; loading: boolean }) {
  if (loading) return <Spin />
  const s = metrics?.summary
  const trend = metrics?.daily_trend || []
  const models = metrics?.model_breakdown || []
  const dates = trend.map(d => d.date.slice(5))
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Requests" value={s?.total_requests} change={s?.requests_change_pct} icon={BarChart3} color="indigo" />
        <StatCard label="Total Cost" value={s?.total_cost_usd?.toFixed(6)} change={s?.cost_change_pct} icon={DollarSign} prefix="$" color="emerald" />
        <StatCard label="Avg Latency" value={s?.avg_latency_ms ? Math.round(s.avg_latency_ms) : undefined} icon={Clock} suffix="ms" color="amber" />
        <StatCard label="Error Rate" value={s?.error_rate?.toFixed(2)} icon={AlertTriangle} suffix="%" color="rose" />
      </div>
      {trend.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div><h3 className="text-sm font-semibold text-slate-200">Daily Cost</h3><p className="text-xs text-slate-500 mt-0.5">Last {metrics?.period_days || 30} days</p></div>
              <span className="text-xs text-slate-500 font-mono">${trend.reduce((a,b)=>a+b.total_cost_usd,0).toFixed(6)} total</span>
            </div>
            <div style={{ height: 180 }}>
              <Line data={{ labels: dates, datasets: [{ data: trend.map(d=>d.total_cost_usd), borderColor:'#6366f1', backgroundColor:'rgba(99,102,241,0.1)', fill:true, tension:0.4, pointRadius:0, borderWidth:2 }] }}
                options={{ ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, ticks: { ...chartDefaults.scales.y.ticks, callback: (v:any) => `$${v}` } } } } as any} />
            </div>
          </div>
          <div className="card p-5">
            <div className="mb-4"><h3 className="text-sm font-semibold text-slate-200">Daily Requests</h3><p className="text-xs text-slate-500 mt-0.5">Last {metrics?.period_days || 30} days</p></div>
            <div style={{ height: 180 }}>
              <Bar data={{ labels: dates, datasets: [{ data: trend.map(d=>d.total_requests), backgroundColor:'rgba(16,185,129,0.7)', borderRadius:3 }] }} options={chartDefaults as any} />
            </div>
          </div>
        </div>
      ) : (
        <div className="card p-8"><Empty icon={BarChart3} title="No data yet" desc="Send your first request using the SDK to see metrics here." /></div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {models.length > 0 && (
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">Cost by Model</h3>
            <div style={{ height: 160 }}>
              <Doughnut data={{ labels: models.map(m=>m.model.split('-')[0]), datasets: [{ data: models.map(m=>m.total_cost_usd), backgroundColor:['#6366f1','#10b981','#f59e0b','#ef4444'], borderWidth:0 }] }}
                options={{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:true, position:'bottom' as const, labels:{ color:'#64748b', font:{size:10}, padding:12 } }, tooltip:chartDefaults.plugins.tooltip }, cutout:'65%' }} />
            </div>
          </div>
        )}
        <div className={`card p-5 ${models.length > 0 ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200">Recent Alerts</h3>
            {alerts.filter(a=>a.status==='active').length > 0 && <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">{alerts.filter(a=>a.status==='active').length} active</span>}
          </div>
          {alerts.length === 0 ? <Empty icon={Bell} title="No alerts yet" desc="Alerts appear when cost, latency, or quality thresholds are breached." /> : (
            <div className="space-y-3">
              {alerts.slice(0,3).map(a => (
                <div key={a.id} className={`flex items-start gap-3 p-3 rounded-lg border ${a.status==='active' ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-900 border-slate-800 opacity-60'}`}>
                  <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${a.severity==='critical' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-medium text-slate-200">{a.title}</span><AlertBadge type={a.alert_type} severity={a.severity} /></div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{a.message}</p>
                  </div>
                  <span className="text-xs text-slate-600 whitespace-nowrap">{timeAgo(a.triggered_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CostsTab({ metrics, loading }: { metrics: MetricsResponse | null; loading: boolean }) {
  if (loading) return <Spin />
  const trend = metrics?.daily_trend || []
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">Cost Analysis</h2>
      {trend.length === 0 ? <div className="card p-8"><Empty icon={DollarSign} title="No cost data yet" desc="Cost data appears after your first SDK request." /></div> : (
        <>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">30-Day Cost Trend</h3>
            <div style={{ height: 300 }}>
              <Line data={{ labels: trend.map(d=>d.date.slice(5)), datasets: [{ label:'Daily Cost (USD)', data: trend.map(d=>d.total_cost_usd), borderColor:'#6366f1', backgroundColor:'rgba(99,102,241,0.1)', fill:true, tension:0.4, pointRadius:3, borderWidth:2 }] }}
                options={chartDefaults as any} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total (30 days)', value: `$${trend.reduce((a,b)=>a+b.total_cost_usd,0).toFixed(6)}` },
              { label: 'Daily Average',   value: `$${(trend.reduce((a,b)=>a+b.total_cost_usd,0)/trend.length).toFixed(6)}` },
              { label: 'Peak Day',        value: `$${Math.max(...trend.map(d=>d.total_cost_usd)).toFixed(6)}` },
            ].map(({ label, value }) => (
              <div key={label} className="card p-5 text-center">
                <div className="text-2xl font-bold text-slate-100">{value}</div>
                <div className="text-xs text-slate-500 mt-1">{label}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function LatencyTab({ metrics, loading }: { metrics: MetricsResponse | null; loading: boolean }) {
  if (loading) return <Spin />
  const trend = metrics?.daily_trend || []
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">Latency Analysis</h2>
      {trend.length === 0 ? <div className="card p-8"><Empty icon={Clock} title="No latency data yet" desc="Latency data appears after your first SDK request." /></div> : (
        <>
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">Average Latency (ms)</h3>
            <div style={{ height: 300 }}>
              <Line data={{ labels: trend.map(d=>d.date.slice(5)), datasets: [{ label:'Avg Latency (ms)', data:trend.map(d=>d.avg_latency_ms), borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.1)', fill:true, tension:0.4, pointRadius:0, borderWidth:2 }] }}
                options={{ ...chartDefaults, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, ticks: { ...chartDefaults.scales.y.ticks, callback:(v:any)=>`${v}ms` } } } } as any} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Average',   value: `${Math.round(trend.reduce((a,b)=>a+b.avg_latency_ms,0)/trend.length)}ms` },
              { label: 'Best Day',  value: `${Math.min(...trend.map(d=>d.avg_latency_ms)).toFixed(0)}ms` },
              { label: 'Worst Day', value: `${Math.max(...trend.map(d=>d.avg_latency_ms)).toFixed(0)}ms` },
            ].map(({ label, value }) => (
              <div key={label} className="card p-5 text-center">
                <div className="text-2xl font-bold text-slate-100">{value}</div>
                <div className="text-xs text-slate-500 mt-1">{label}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ModelsTab({ metrics, loading }: { metrics: MetricsResponse | null; loading: boolean }) {
  if (loading) return <Spin />
  const models = metrics?.model_breakdown || []
  if (models.length === 0) return <div className="card p-8"><Empty icon={Brain} title="No model data yet" desc="Model breakdown appears after your first SDK request." /></div>
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-100">Model Comparison</h2>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/50"><tr>{['Model','Provider','Requests','Total Cost','Avg Latency','Cost Share'].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-800">
            {models.map((m,i) => (
              <tr key={m.model} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3"><span className="font-mono text-xs bg-slate-800 px-2 py-1 rounded text-slate-300">{m.model}</span></td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${m.provider==='openai'?'bg-emerald-500/15 text-emerald-400':m.provider==='anthropic'?'bg-orange-500/15 text-orange-400':'bg-blue-500/15 text-blue-400'}`}>{m.provider}</span></td>
                <td className="px-4 py-3 text-slate-300 tabular-nums">{m.total_requests.toLocaleString()}</td>
                <td className="px-4 py-3 text-slate-300 tabular-nums font-medium">${m.total_cost_usd.toFixed(6)}</td>
                <td className="px-4 py-3 text-slate-300 tabular-nums">{m.avg_latency_ms?`${Math.round(m.avg_latency_ms)}ms`:'—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full max-w-24"><div className="h-1.5 rounded-full" style={{ width:`${m.cost_share_pct}%`, backgroundColor:['#6366f1','#10b981','#f59e0b','#ef4444'][i%4] }} /></div>
                    <span className="text-slate-400 text-xs">{m.cost_share_pct?.toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DriftTab({ projectId, token }: { projectId: string; token: string }) {
  const [tests, setTests] = useState<DriftTest[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<string | null>(null)
  const load = useCallback(async () => { setLoading(true); try { setTests(await driftApi.list(projectId, token)) } catch {} setLoading(false) }, [projectId, token])
  useEffect(() => { load() }, [load])
  async function run(id: string) { setRunning(id); try { await driftApi.run(projectId, id, token); await load() } catch (e:any) { alert(e.message) } setRunning(null) }
  if (loading) return <Spin />
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-semibold text-slate-100">Quality Drift Tests</h2><p className="text-sm text-slate-500 mt-0.5">Monitor output quality using golden prompt evaluations</p></div>
      </div>
      {tests.length === 0 ? <div className="card p-8"><Empty icon={FlaskConical} title="No drift tests yet" desc="Create drift tests via the API to monitor output quality." /></div> : (
        <div className="grid gap-4">
          {tests.map(test => (
            <div key={test.id} className={`card p-5 ${test.last_score!==undefined&&test.last_score<7?'border-red-500/30':''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="font-medium text-slate-200">{test.name}</h3>
                    {test.last_score!==undefined&&test.last_score<7&&<span className="text-xs bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">⚠ Quality Alert</span>}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 flex-wrap">
                    <span className="font-mono bg-slate-800 px-2 py-0.5 rounded">{test.model}</span>
                    <span>{test.golden_prompt_count??0} prompts</span>
                    <span className="capitalize">{test.schedule}</span>
                    {test.last_run_at&&<span>Last run: {timeAgo(test.last_run_at)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {test.last_score!==undefined&&test.baseline_score!==undefined&&<ScoreRing score={test.last_score} baseline={test.baseline_score} />}
                  <button onClick={() => run(test.id)} disabled={running===test.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50">
                    {running===test.id?<Loader2 size={12} className="animate-spin"/>:<RefreshCw size={12}/>} Run Now
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AlertsTab({ projectId, token }: { projectId: string; token: string }) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all'|'active'|'resolved'>('all')
  const load = useCallback(async () => { setLoading(true); try { setAlerts(await alertsApi.list(projectId, token, 'all')) } catch {} setLoading(false) }, [projectId, token])
  useEffect(() => { load() }, [load])
  async function action(id: string, act: 'acknowledge'|'resolve') {
    try { act==='acknowledge'?await alertsApi.acknowledge(projectId,id,token):await alertsApi.resolve(projectId,id,token); await load() } catch (e:any) { alert(e.message) }
  }
  if (loading) return <Spin />
  const filtered = alerts.filter(a => filter==='all'||a.status===filter)
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-semibold text-slate-100">Alerts</h2><p className="text-sm text-slate-500 mt-0.5">Cost spikes, latency anomalies, and quality drift</p></div>
        <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
          {(['all','active','resolved'] as const).map(f=><button key={f} onClick={()=>setFilter(f)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${filter===f?'bg-slate-700 text-slate-200':'text-slate-500 hover:text-slate-300'}`}>{f}</button>)}
        </div>
      </div>
      {filtered.length===0?<div className="card p-8"><Empty icon={Bell} title={filter==='all'?'No alerts yet':`No ${filter} alerts`} desc="Alerts fire when thresholds are breached." /></div>:(
        <div className="space-y-3">
          {filtered.map(a=>(
            <div key={a.id} className={`card p-4 ${a.status==='active'&&a.severity==='critical'?'border-red-500/40':a.status==='active'?'border-amber-500/30':''}`}>
              <div className="flex items-start gap-4">
                <div className={`mt-1 p-1.5 rounded-lg flex-shrink-0 ${a.severity==='critical'?'bg-red-500/15':'bg-amber-500/15'}`}><AlertTriangle size={14} className={a.severity==='critical'?'text-red-400':'text-amber-400'}/></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap"><h3 className="font-medium text-slate-200">{a.title}</h3><AlertBadge type={a.alert_type} severity={a.severity}/></div>
                  <p className="text-sm text-slate-400 mt-1">{a.message}</p>
                  {a.model&&<span className="text-xs font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded mt-2 inline-block">{a.model}</span>}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs text-slate-500">{timeAgo(a.triggered_at)}</div>
                  {a.status==='active'&&<div className="flex gap-2 mt-2">
                    <button onClick={()=>action(a.id,'acknowledge')} className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded transition-colors">Acknowledge</button>
                    <button onClick={()=>action(a.id,'resolve')} className="text-xs px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded transition-colors">Resolve</button>
                  </div>}
                </div>
              </div>
            </div>
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
  const [newKey, setNewKey] = useState<string|null>(null)
  const load = useCallback(async () => { setLoading(true); try { setKeys(await apiKeysApi.list(projectId, token)) } catch {} setLoading(false) }, [projectId, token])
  useEffect(() => { load() }, [load])
  async function create() {
    if (!newName.trim()) return; setCreating(true)
    try { const k = await apiKeysApi.create(projectId,{name:newName},token); if(k.full_key) setNewKey(k.full_key); setNewName(''); setShowForm(false); await load() } catch(e:any){alert(e.message)}
    setCreating(false)
  }
  if (loading) return <Spin />
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">API Keys</h2>
        <button onClick={()=>setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"><Plus size={15}/>Generate Key</button>
      </div>
      {newKey&&<div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4"><p className="text-xs text-amber-400 font-medium mb-2">⚠ Copy now — won't be shown again</p><code className="text-sm font-mono text-amber-300 break-all">{newKey}</code><button onClick={()=>setNewKey(null)} className="mt-3 block text-xs text-amber-500 hover:text-amber-300">Dismiss</button></div>}
      {showForm&&<div className="card p-4 flex gap-3">
        <input type="text" placeholder="Key name (e.g. Production SDK)" value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&create()} className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
        <button onClick={create} disabled={creating||!newName.trim()} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg disabled:opacity-50">{creating?<Loader2 size={14} className="animate-spin"/>:'Create'}</button>
      </div>}
      {keys.length===0?<div className="card p-8"><Empty icon={Key} title="No API keys" desc="Generate a key to start sending data with the SDK." /></div>:(
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/50"><tr>{['Name','Key','Last Used','Created','Status',''].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-800">
              {keys.map(k=>(
                <tr key={k.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-200">{k.name}</td>
                  <td className="px-4 py-3"><code className="font-mono text-xs bg-slate-800 px-2 py-1 rounded text-slate-400">{k.key_prefix}••••</code></td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{k.last_used_at?timeAgo(k.last_used_at):'Never'}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{new Date(k.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${k.is_active?'bg-emerald-500/15 text-emerald-400':'bg-slate-700 text-slate-500'}`}>{k.is_active?'Active':'Revoked'}</span></td>
                  <td className="px-4 py-3 text-right">{k.is_active&&<button onClick={async()=>{if(!confirm('Revoke?'))return;try{await apiKeysApi.revoke(projectId,k.id,token);await load()}catch(e:any){alert(e.message)}}} className="text-xs text-red-400 hover:text-red-300">Revoke</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
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
    projectsApi.list(token).then(ps => { setProjects(ps); if (ps.length > 0) {
    setCurrentProject(ps[0])
} else {
    router.replace('/onboarding') } }).catch(()=>{})
  }, [token])
 
  const loadData = useCallback(async () => {
    if (!currentProject || !token) return
    setLoading(true)
    try {
      const [m, a] = await Promise.all([metricsApi.get(currentProject.id, 30, token), alertsApi.list(currentProject.id, token, 'all')])
      setMetrics(m); setAlerts(a)
    } catch {}
    setLoading(false)
  }, [currentProject, token])

  useEffect(() => { loadData() }, [loadData])

  if (authLoading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
  if (!user) return null

  return (
    <div className="flex min-h-screen">
      <Sidebar
        activeView={activeView} setActiveView={setActiveView}
        projects={projects} currentProject={currentProject}
        setCurrentProject={p => { setCurrentProject(p); setMetrics(null) }}
        alertCount={alerts.filter(a => a.status === 'active').length}
      />
      <main className="flex-1 overflow-auto min-w-0">
        <header className="sticky top-0 z-10 bg-gray-950/80 backdrop-blur-md border-b border-slate-800 px-6 py-3.5 flex items-center justify-between">
          <h1 className="text-base font-semibold text-slate-200 capitalize">{activeView.replace('keys','API Keys').replace('drift','Drift Tests')}</h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />Live
            </div>
            <button onClick={async()=>{setRefreshing(true);await loadData();setRefreshing(false)}} disabled={refreshing}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
              <RefreshCw size={12} className={refreshing?'animate-spin':''} />Refresh
            </button>
          </div>
        </header>
        <div className="p-6">
          {activeView==='overview' && <OverviewTab metrics={metrics} alerts={alerts} loading={loading} />}
          {activeView==='costs'    && <CostsTab metrics={metrics} loading={loading} />}
          {activeView==='latency'  && <LatencyTab metrics={metrics} loading={loading} />}
          {activeView==='models'   && <ModelsTab metrics={metrics} loading={loading} />}
          {activeView==='drift'    && currentProject && token && <DriftTab projectId={currentProject.id} token={token} />}
          {activeView==='alerts'   && currentProject && token && <AlertsTab projectId={currentProject.id} token={token} />}
          {activeView==='keys'     && currentProject && token && <KeysTab projectId={currentProject.id} token={token} />}
          {activeView==='settings' && currentProject && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-100">Settings</h2>
              <div className="card p-5 space-y-4">
                <div><p className="text-xs text-slate-500 mb-1">Project ID</p><code className="text-sm font-mono text-slate-300 bg-slate-800 px-3 py-2 rounded block">{currentProject.id}</code></div>
                <div><p className="text-xs text-slate-500 mb-1">Project Name</p><p className="text-sm text-slate-300">{currentProject.name}</p></div>
                <div><p className="text-xs text-slate-500 mb-1">Environment</p><p className="text-sm text-slate-300 capitalize">{currentProject.environment}</p></div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}