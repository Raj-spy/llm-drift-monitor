'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function useCTA() {
  const router = useRouter()
  return async () => {
    const { data } = await supabase.auth.getSession()
    router.push(data.session ? '/dashboard' : '/login')
  }
}

function Reveal({ children, delay = 0, className = '' }: {
  children: React.ReactNode; delay?: number; className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setV(true); obs.disconnect() }
    }, { threshold: 0.1 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} className={className} style={{
      opacity: v ? 1 : 0,
      transform: v ? 'none' : 'translateY(16px)',
      transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
    }}>{children}</div>
  )
}

export default function LandingPage() {
  const handleCTA = useCTA()
  const [scrolled, setScrolled] = useState(false)
  const [copied, setCopied] = useState(false)
  const [codeTab, setCodeTab] = useState(0)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  function copy(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  const codeSamples = [
    {
      label: 'Python',
      code: `from llm_monitor import monitor
import openai

monitor.configure(
    api_key="lmd_your_key",
    project_id="your_project_id"
)

client = openai.OpenAI()
tracked = monitor.wrap_openai(client)

# Identical to your existing code
response = tracked.chat.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}]
)`
    },
    {
      label: 'Node.js',
      code: `import axios from 'axios'

await axios.post('/v1/ingest/batch', {
  events: [{
    id: crypto.randomUUID(),
    project_id: 'your_project_id',
    model: 'gpt-4o',
    provider: 'openai',
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    latency_ms: latencyMs,
    status: 'success',
    tags: {}
  }]
}, {
  headers: { Authorization: 'Bearer lmd_xxx' }
})`
    }
  ]

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}
      className="min-h-screen bg-[#fafafa] text-[#0a0a0a]">

      <style>{`
        * { -webkit-font-smoothing: antialiased; }
        ::selection { background: rgba(0,0,0,0.08); }
        @keyframes up { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        .a0{animation:up 0.55s 0s ease both}
        .a1{animation:up 0.55s 0.08s ease both}
        .a2{animation:up 0.55s 0.16s ease both}
        .a3{animation:up 0.55s 0.26s ease both}
        .a4{animation:up 0.55s 0.38s ease both}
        .hover-lift { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .hover-lift:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
        .feature-card { transition: background 0.2s, border-color 0.2s; }
        .feature-card:hover { background: #fff; border-color: #e0e0e0; }
        pre { tab-size: 2; }
      `}</style>

      {/* ── NAV ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 h-14 flex items-center px-6 lg:px-10 transition-all ${
        scrolled ? 'bg-white/90 backdrop-blur-md border-b border-black/[0.06]' : 'bg-transparent'
      }`}>
        <div className="w-full max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="1" y="1" width="8" height="8" rx="1.5" fill="#0a0a0a"/>
              <rect x="11" y="1" width="8" height="8" rx="1.5" fill="#0a0a0a" opacity="0.3"/>
              <rect x="1" y="11" width="8" height="8" rx="1.5" fill="#0a0a0a" opacity="0.3"/>
              <rect x="11" y="11" width="8" height="8" rx="1.5" fill="#0a0a0a"/>
            </svg>
            <span className="text-sm font-semibold tracking-tight">LLM Monitor</span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            {[['Features','#features'],['How it works','#how-it-works'],['Pricing','#pricing']].map(([l,h]) => (
              <a key={l} href={h} className="text-sm text-[#666] hover:text-[#0a0a0a] transition-colors">{l}</a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-[#666] hover:text-[#0a0a0a] transition-colors px-3 py-1.5">
              Sign in
            </Link>
            <button onClick={handleCTA}
              className="text-sm font-medium text-white bg-[#0a0a0a] px-4 py-2 rounded-lg hover:bg-[#222] transition-colors">
              Get started
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative pt-36 pb-28 px-6 text-center">
        {/* very subtle gradient */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,0,0,0.025) 0%, transparent 100%)' }} />

        <div className="max-w-3xl mx-auto relative">
          <div className="a0 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-black/10 bg-white text-xs text-[#666] mb-8 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Now in public beta
          </div>

          <h1 className="a1 text-[clamp(38px,6vw,72px)] font-semibold tracking-[-2.5px] leading-[1.05] mb-6 text-[#0a0a0a]">
            Observability for<br />your LLM APIs
          </h1>

          <p className="a2 text-[17px] text-[#666] max-w-xl mx-auto leading-relaxed mb-10">
            Track costs, latency, and quality drift across every OpenAI, Groq,
            and Anthropic call — integrated in three lines of code.
          </p>

          <div className="a3 flex items-center justify-center gap-3 flex-wrap">
            <button onClick={handleCTA}
              className="hover-lift text-sm font-medium text-white bg-[#0a0a0a] px-6 py-3 rounded-lg transition-colors hover:bg-[#222]">
              Start for free
            </button>
            <a href="#how-it-works"
              className="hover-lift text-sm font-medium text-[#444] bg-white border border-black/10 px-6 py-3 rounded-lg hover:border-black/20 transition-all shadow-sm">
              See how it works →
            </a>
          </div>

          <p className="a4 text-xs text-[#aaa] mt-5">No credit card required · 10,000 requests free</p>
        </div>
      </section>

      {/* ── DASHBOARD PREVIEW ── */}
      <section className="px-6 pb-28">
        <Reveal className="max-w-5xl mx-auto">
          <div className="rounded-xl border border-black/[0.08] overflow-hidden bg-white"
            style={{ boxShadow: '0 4px 6px rgba(0,0,0,0.04), 0 20px 60px rgba(0,0,0,0.07)' }}>
            {/* browser bar */}
            <div className="flex items-center gap-2 px-4 py-3 bg-[#f5f5f5] border-b border-black/[0.06]">
              <div className="flex gap-1.5">
                {['#ff5f57','#febc2e','#28c840'].map(c => <span key={c} className="w-3 h-3 rounded-full" style={{background:c}}/>)}
              </div>
              <div className="flex-1 mx-3">
                <div className="bg-white border border-black/[0.08] rounded-md px-3 py-1 text-xs text-[#999] text-center max-w-xs mx-auto">
                  llm-drift-monitor-pi.vercel.app
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>
                Live
              </div>
            </div>
            {/* metrics strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 border-b border-black/[0.05]">
              {[
                { l: 'Total Requests', v: '1,284', d: '+12% this week', up: true },
                { l: 'Total Cost', v: '$0.0247', d: '−8% from last week', up: true },
                { l: 'Avg Latency', v: '342ms', d: 'Stable', up: null },
                { l: 'Error Rate', v: '0.02%', d: 'All good', up: true },
              ].map((m, i) => (
                <div key={m.l} className={`p-5 ${i < 3 ? 'border-r border-black/[0.05]' : ''}`}>
                  <div className="text-xs text-[#999] mb-2">{m.l}</div>
                  <div className="text-xl font-semibold text-[#0a0a0a] tracking-tight mb-1">{m.v}</div>
                  <div className={`text-xs ${m.up === true ? 'text-emerald-600' : m.up === false ? 'text-red-500' : 'text-[#999]'}`}>{m.d}</div>
                </div>
              ))}
            </div>
            {/* fake chart */}
            <div className="p-6">
              <div className="flex items-end gap-1.5 h-24">
                {[35,50,42,68,58,75,62,55,80,70,88,78,95].map((h, i) => (
                  <div key={i} className="flex-1 rounded-sm bg-[#0a0a0a]/[0.06] hover:bg-[#0a0a0a]/10 transition-colors"
                    style={{ height: `${h}%` }} />
                ))}
              </div>
              <div className="flex justify-between mt-2">
                {['Mar 1','Mar 5','Mar 9','Mar 13'].map(d => (
                  <span key={d} className="text-[10px] text-[#ccc]">{d}</span>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── SOCIAL PROOF NUMBERS ── */}
      <section className="px-6 pb-28 border-t border-black/[0.05] pt-20">
        <Reveal>
          <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { n: '3', l: 'Lines to integrate' },
              { n: '$0', l: 'To get started' },
              { n: '<3ms', l: 'SDK overhead' },
              { n: '100%', l: 'Open source' },
            ].map(s => (
              <div key={s.l}>
                <div className="text-3xl font-semibold tracking-tight text-[#0a0a0a] mb-1">{s.n}</div>
                <div className="text-sm text-[#999]">{s.l}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="px-6 py-24 bg-white border-t border-black/[0.05]">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="max-w-lg mb-16">
              <p className="text-xs font-medium text-[#999] uppercase tracking-widest mb-4">Features</p>
              <h2 className="text-[clamp(28px,4vw,44px)] font-semibold tracking-[-1.5px] leading-tight text-[#0a0a0a] mb-4">
                Everything you need,<br />nothing you don't.
              </h2>
              <p className="text-[15px] text-[#666] leading-relaxed">
                Built for developers who ship AI products and need real visibility without extra complexity.
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                title: 'Cost tracking',
                desc: 'See the exact cost of every API call. Broken down by model, endpoint, and time period. No more guessing your monthly bill.',
                icon: (
                  <svg width="18" height="18" fill="none" viewBox="0 0 18 18">
                    <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.5 3.5l1.5 1.5M13 13l1.5 1.5M3.5 14.5l1.5-1.5M13 5l1.5-1.5" stroke="#0a0a0a" strokeWidth="1.5" strokeLinecap="round"/>
                    <circle cx="9" cy="9" r="3" stroke="#0a0a0a" strokeWidth="1.5"/>
                  </svg>
                )
              },
              {
                title: 'Latency monitoring',
                desc: 'Track response times across all your models. Catch slowdowns instantly and compare performance across providers.',
                icon: (
                  <svg width="18" height="18" fill="none" viewBox="0 0 18 18">
                    <circle cx="9" cy="9" r="7.5" stroke="#0a0a0a" strokeWidth="1.5"/>
                    <path d="M9 5v4l2.5 2.5" stroke="#0a0a0a" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                )
              },
              {
                title: 'Drift detection',
                desc: 'Automated quality scoring with golden prompts. Know when your model outputs start degrading before users notice.',
                icon: (
                  <svg width="18" height="18" fill="none" viewBox="0 0 18 18">
                    <path d="M2 13l4-5 3 3 4-6 3 4" stroke="#0a0a0a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )
              },
              {
                title: 'Simple integration',
                desc: 'Three lines of code. Works as a drop-in wrapper around your existing OpenAI, Groq, or Anthropic client.',
                icon: (
                  <svg width="18" height="18" fill="none" viewBox="0 0 18 18">
                    <path d="M5 7l-3 2 3 2M13 7l3 2-3 2M10 4l-2 10" stroke="#0a0a0a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )
              },
              {
                title: 'Multi-project',
                desc: 'Manage all your AI projects in one place. Separate metrics, API keys, and settings per project.',
                icon: (
                  <svg width="18" height="18" fill="none" viewBox="0 0 18 18">
                    <rect x="1.5" y="1.5" width="6" height="6" rx="1" stroke="#0a0a0a" strokeWidth="1.5"/>
                    <rect x="10.5" y="1.5" width="6" height="6" rx="1" stroke="#0a0a0a" strokeWidth="1.5"/>
                    <rect x="1.5" y="10.5" width="6" height="6" rx="1" stroke="#0a0a0a" strokeWidth="1.5"/>
                    <rect x="10.5" y="10.5" width="6" height="6" rx="1" stroke="#0a0a0a" strokeWidth="1.5"/>
                  </svg>
                )
              },
              {
                title: 'Smart alerts',
                desc: 'Set cost caps, latency thresholds, and error rate alerts. Get notified via webhook when something needs attention.',
                icon: (
                  <svg width="18" height="18" fill="none" viewBox="0 0 18 18">
                    <path d="M9 1.5a6 6 0 0 1 6 6c0 5-6 9-6 9s-6-4-6-9a6 6 0 0 1 6-6z" stroke="#0a0a0a" strokeWidth="1.5"/>
                    <circle cx="9" cy="7.5" r="1.5" fill="#0a0a0a"/>
                  </svg>
                )
              },
            ].map((f, i) => (
              <Reveal key={f.title} delay={i * 40}>
                <div className="feature-card p-6 rounded-xl border border-black/[0.07] bg-[#fafafa] cursor-default h-full">
                  <div className="w-8 h-8 rounded-lg bg-black/[0.04] flex items-center justify-center mb-4">
                    {f.icon}
                  </div>
                  <div className="font-medium text-[#0a0a0a] mb-2">{f.title}</div>
                  <p className="text-sm text-[#666] leading-relaxed">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="px-6 py-24 border-t border-black/[0.05]">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-start">
          <div>
            <Reveal>
              <p className="text-xs font-medium text-[#999] uppercase tracking-widest mb-4">How it works</p>
              <h2 className="text-[clamp(28px,4vw,44px)] font-semibold tracking-[-1.5px] leading-tight text-[#0a0a0a] mb-12">
                Set up in minutes,<br />not days.
              </h2>
            </Reveal>

            <div className="space-y-0">
              {[
                { n: '1', t: 'Create your project', d: 'Sign up free, create a project, and get your API key. The whole process takes under two minutes.' },
                { n: '2', t: 'Install the package', d: 'pip install llm-monitor. Works with Python 3.8+ and any OpenAI-compatible client.' },
                { n: '3', t: 'Wrap your client', d: 'Add three lines to your existing code. Your API calls keep working exactly the same way.' },
                { n: '4', t: 'Watch your dashboard', d: 'Costs, latency, and drift scores appear in real time. Set alerts, compare models, ship confidently.' },
              ].map((s, i) => (
                <Reveal key={s.n} delay={i * 60}>
                  <div className="flex gap-5 py-6 border-b border-black/[0.05] last:border-none group">
                    <div className="w-6 h-6 rounded-full border border-black/10 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#0a0a0a] group-hover:border-transparent transition-all">
                      <span className="text-[11px] font-medium text-[#666] group-hover:text-white transition-colors">{s.n}</span>
                    </div>
                    <div>
                      <div className="font-medium text-[#0a0a0a] mb-1.5 text-sm">{s.t}</div>
                      <p className="text-sm text-[#666] leading-relaxed">{s.d}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>

          {/* Code panel */}
          <Reveal delay={100} className="sticky top-24">
            <div className="rounded-xl border border-black/[0.08] overflow-hidden bg-[#0d0d0d]"
              style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.12)' }}>
              {/* tabs */}
              <div className="flex items-center justify-between bg-[#161616] border-b border-white/[0.06] px-1">
                <div className="flex">
                  {codeSamples.map((s, i) => (
                    <button key={s.label} onClick={() => setCodeTab(i)}
                      className={`px-4 py-3 text-xs transition-colors ${
                        codeTab === i ? 'text-white border-b border-white' : 'text-[#555] hover:text-[#888] border-b border-transparent'
                      }`}>
                      {s.label}
                    </button>
                  ))}
                </div>
                <button onClick={() => copy(codeSamples[codeTab].code)}
                  className="text-[11px] text-[#555] hover:text-white transition-colors px-4">
                  {copied ? '✓ copied' : 'copy'}
                </button>
              </div>
              {/* code */}
              <div className="p-5 overflow-auto">
                <pre className="text-[12.5px] leading-[1.75] text-[#ccc] font-mono whitespace-pre">
                  {codeSamples[codeTab].code.split('\n').map((line, i) => (
                    <div key={i} className="flex gap-4">
                      <span className="text-[#333] select-none w-4 text-right flex-shrink-0">{i + 1}</span>
                      <span dangerouslySetInnerHTML={{ __html: line
                        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                        .replace(/(#.*$)/g,'<span style="color:#555">$1</span>')
                        .replace(/(".*?"|'.*?'|`.*?`)/g,'<span style="color:#7dd3fc">$1</span>')
                        .replace(/\b(from|import|async|await|const|let|return)\b/g,'<span style="color:#f472b6">$1</span>')
                        .replace(/\b(monitor|configure|wrap_openai)\b/g,'<span style="color:#a78bfa">$1</span>')
                      }} />
                    </div>
                  ))}
                </pre>
              </div>
              {/* install command */}
              <div className="flex items-center justify-between border-t border-white/[0.05] px-5 py-3">
                <span className="font-mono text-xs text-[#555]">$ pip install llm-monitor</span>
                <button onClick={() => copy('pip install llm-monitor')}
                  className="text-[11px] text-[#444] hover:text-white transition-colors">copy</button>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="px-6 py-24 bg-white border-t border-black/[0.05]">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="text-center max-w-xl mx-auto mb-16">
              <p className="text-xs font-medium text-[#999] uppercase tracking-widest mb-4">Pricing</p>
              <h2 className="text-[clamp(28px,4vw,44px)] font-semibold tracking-[-1.5px] leading-tight text-[#0a0a0a] mb-4">
                Simple pricing
              </h2>
              <p className="text-[15px] text-[#666]">Start free. Scale as you grow. No hidden fees.</p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {[
              {
                name: 'Starter', price: '$0', period: 'Free forever', featured: false,
                desc: 'Perfect for side projects and experiments.',
                features: ['10,000 requests / month', '1 project', '7-day data history', 'Basic dashboard', 'Community support'],
                cta: 'Get started free',
              },
              {
                name: 'Pro', price: '$29', period: 'per month', featured: true,
                desc: 'For teams shipping production AI features.',
                features: ['500K requests / month', 'Up to 10 projects', '90-day history', 'Drift detection', 'Webhook alerts', 'Email support'],
                cta: 'Start free trial',
              },
              {
                name: 'Enterprise', price: 'Custom', period: '', featured: false,
                desc: 'For large teams with custom requirements.',
                features: ['Unlimited requests', 'Unlimited projects', '1-year history', 'Self-hosted option', 'SLA guarantee', 'Dedicated support'],
                cta: 'Talk to us',
              },
            ].map(p => (
              <Reveal key={p.name}>
                <div className={`relative rounded-xl p-7 h-full flex flex-col ${
                  p.featured
                    ? 'bg-[#0a0a0a] text-white border border-transparent'
                    : 'bg-[#fafafa] border border-black/[0.07]'
                }`} style={p.featured ? { boxShadow: '0 20px 60px rgba(0,0,0,0.15)' } : {}}>
                  {p.featured && (
                    <div className="absolute -top-px left-6 px-3 py-1 bg-white text-[#0a0a0a] text-[10px] font-semibold rounded-b-lg tracking-wide">
                      MOST POPULAR
                    </div>
                  )}
                  <div className={`text-sm font-medium mb-1 ${p.featured ? 'text-white' : 'text-[#0a0a0a]'}`}>{p.name}</div>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className={`text-3xl font-semibold tracking-tight ${p.featured ? 'text-white' : 'text-[#0a0a0a]'}`}>{p.price}</span>
                    {p.period && <span className={`text-sm ${p.featured ? 'text-white/50' : 'text-[#999]'}`}>{p.period}</span>}
                  </div>
                  <p className={`text-sm mb-6 ${p.featured ? 'text-white/60' : 'text-[#999]'}`}>{p.desc}</p>
                  <ul className="space-y-2.5 flex-1 mb-7">
                    {p.features.map(f => (
                      <li key={f} className="flex items-start gap-2.5 text-sm">
                        <svg className="mt-0.5 flex-shrink-0" width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <circle cx="7" cy="7" r="6.5" stroke={p.featured ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)'}/>
                          <path d="M4.5 7l1.8 1.8L9.5 5.5" stroke={p.featured ? 'white' : '#0a0a0a'} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span className={p.featured ? 'text-white/70' : 'text-[#555]'}>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <button onClick={handleCTA}
                    className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all ${
                      p.featured
                        ? 'bg-white text-[#0a0a0a] hover:bg-[#f5f5f5]'
                        : 'bg-[#0a0a0a] text-white hover:bg-[#222]'
                    }`}>
                    {p.cta}
                  </button>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="px-6 py-28 border-t border-black/[0.05] text-center">
        <Reveal>
          <div className="max-w-lg mx-auto">
            <h2 className="text-[clamp(28px,4vw,44px)] font-semibold tracking-[-1.5px] leading-tight text-[#0a0a0a] mb-4">
              Start monitoring your<br />LLMs today.
            </h2>
            <p className="text-[15px] text-[#666] mb-8">
              Free to start. No credit card needed. Takes five minutes to set up.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button onClick={handleCTA}
                className="hover-lift text-sm font-medium text-white bg-[#0a0a0a] px-7 py-3 rounded-lg hover:bg-[#222] transition-colors">
                Get started for free
              </button>
              <a href="https://github.com/Raj-spy/llm-drift-monitor" target="_blank"
                className="hover-lift text-sm font-medium text-[#444] bg-white border border-black/10 px-7 py-3 rounded-lg hover:border-black/20 transition-all shadow-sm">
                View on GitHub
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── FOOTER ── */}
      <footer className="px-6 py-8 border-t border-black/[0.05]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <rect x="1" y="1" width="8" height="8" rx="1.5" fill="#0a0a0a"/>
              <rect x="11" y="1" width="8" height="8" rx="1.5" fill="#0a0a0a" opacity="0.3"/>
              <rect x="1" y="11" width="8" height="8" rx="1.5" fill="#0a0a0a" opacity="0.3"/>
              <rect x="11" y="11" width="8" height="8" rx="1.5" fill="#0a0a0a"/>
            </svg>
            <span className="text-sm text-[#999]">LLM Monitor © 2026</span>
          </div>
          <div className="flex gap-6">
            {[['Features','#features'],['Docs','#how-it-works'],['Pricing','#pricing'],
              ['GitHub','https://github.com/Raj-spy/llm-drift-monitor'],['Twitter','https://twitter.com/Rajj_704']
            ].map(([l,h]) => (
              <a key={l} href={h} className="text-sm text-[#999] hover:text-[#0a0a0a] transition-colors">{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}