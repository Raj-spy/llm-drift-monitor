'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

type Mode = 'login' | 'signup'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const { signIn, signUp, user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (user) router.replace('/dashboard')
  }, [user])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password)
        if (error) { setError(error.message); return }
        router.push('/dashboard')
      } else {
        const { error } = await signUp(email, password, fullName)
        if (error) { setError(error.message); return }
        setSuccess('Check your email to confirm your account, then sign in.')
        setMode('login')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}
      className="min-h-screen bg-[#fafafa] flex">

      <style>{`
        * { -webkit-font-smoothing: antialiased; }
        input:focus { outline: none; }
        @keyframes up { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .form-in { animation: up 0.45s ease both; }
      `}</style>

      {/* ── LEFT PANEL ── */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-[#0a0a0a] p-14 relative overflow-hidden">
        {/* subtle texture */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />

        {/* top */}
        <div className="relative">
          <div className="flex items-center gap-2.5 mb-16">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="1" y="1" width="8" height="8" rx="1.5" fill="white"/>
              <rect x="11" y="1" width="8" height="8" rx="1.5" fill="white" opacity="0.3"/>
              <rect x="1" y="11" width="8" height="8" rx="1.5" fill="white" opacity="0.3"/>
              <rect x="11" y="11" width="8" height="8" rx="1.5" fill="white"/>
            </svg>
            <span className="text-sm font-semibold text-white tracking-tight">LLM Monitor</span>
          </div>

          <h2 className="text-[38px] font-semibold text-white leading-tight tracking-[-1.5px] mb-5">
            Monitoriing for<br />your LLM APIs.
          </h2>
          <p className="text-[#666] text-[15px] leading-relaxed mb-14">
            Track costs, latency, and quality drift across every API call — integrated in three lines of code.
          </p>

          <div className="space-y-5">
            {[
              { n: '01', t: 'Cost tracking', d: 'See exact costs per call, per model, per user. No surprise invoices.' },
              { n: '02', t: 'Latency monitoring', d: 'P50/P95/P99 across all providers. Catch slowdowns early.' },
              { n: '03', t: 'Drift detection', d: 'Automated quality scores. Know when your model degrades.' },
            ].map(f => (
              <div key={f.n} className="flex gap-4 group">
                <span className="text-[11px] text-[#333] font-medium pt-0.5 w-5 flex-shrink-0">{f.n}</span>
                <div>
                  <div className="text-sm font-medium text-white mb-0.5">{f.t}</div>
                  <div className="text-[13px] text-[#555] leading-relaxed">{f.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* bottom quote */}
        <div className="relative border-t border-white/[0.07] pt-8">
          <p className="text-[13px] text-[#555] leading-relaxed mb-4 italic">
            "We caught a 10× cost spike on gpt-4o within minutes of it starting. Saved us thousands."
          </p>
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold text-white">S</div>
            <div>
              <div className="text-xs font-medium text-[#888]">Sarah K.</div>
              <div className="text-[11px] text-[#444]">Head of AI, TechCorp</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-[380px] form-in">

          {/* mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <rect x="1" y="1" width="8" height="8" rx="1.5" fill="#0a0a0a"/>
              <rect x="11" y="1" width="8" height="8" rx="1.5" fill="#0a0a0a" opacity="0.3"/>
              <rect x="1" y="11" width="8" height="8" rx="1.5" fill="#0a0a0a" opacity="0.3"/>
              <rect x="11" y="11" width="8" height="8" rx="1.5" fill="#0a0a0a"/>
            </svg>
            <span className="text-sm font-semibold text-[#0a0a0a]">LLM Monitor</span>
          </div>

          {/* heading */}
          <div className="mb-8">
            <h1 className="text-[26px] font-semibold text-[#0a0a0a] tracking-[-1px] mb-2">
              {mode === 'login' ? 'Welcome back' : 'Create an account'}
            </h1>
            <p className="text-sm text-[#999]">
              {mode === 'login' ? "New here? " : "Already have an account? "}
              <button
                onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess('') }}
                className="text-[#0a0a0a] font-medium hover:underline underline-offset-2">
                {mode === 'login' ? 'Create a free account' : 'Sign in'}
              </button>
            </p>
          </div>

          {/* alerts */}
          {success && (
            <div className="mb-6 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
              {success}
            </div>
          )}
          {error && (
            <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          {/* form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-[#333] mb-1.5">Full name</label>
                <input
                  type="text"
                  placeholder="Jane Smith"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                  className="w-full px-3.5 py-2.5 bg-white border border-black/[0.12] rounded-lg text-[#0a0a0a] placeholder-[#bbb] text-sm transition-all focus:ring-2 focus:ring-black/10 focus:border-black/25 hover:border-black/20"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[#333] mb-1.5">Email address</label>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3.5 py-2.5 bg-white border border-black/[0.12] rounded-lg text-[#0a0a0a] placeholder-[#bbb] text-sm transition-all focus:ring-2 focus:ring-black/10 focus:border-black/25 hover:border-black/20"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-[#333]">Password</label>
                {mode === 'login' && (
                  <button type="button" className="text-xs text-[#999] hover:text-[#0a0a0a] transition-colors">
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={mode === 'signup' ? 'Min. 8 characters' : '••••••••'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={mode === 'signup' ? 8 : 1}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  className="w-full px-3.5 py-2.5 bg-white border border-black/[0.12] rounded-lg text-[#0a0a0a] placeholder-[#bbb] text-sm transition-all focus:ring-2 focus:ring-black/10 focus:border-black/25 hover:border-black/20 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#bbb] hover:text-[#666] transition-colors">
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#0a0a0a] text-white text-sm font-medium rounded-lg hover:bg-[#222] disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-2"
              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
              {loading
                ? <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="white" strokeWidth="3"/>
                      <path className="opacity-80" fill="white" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
                    </svg>
                    {mode === 'login' ? 'Signing in…' : 'Creating account…'}
                  </span>
                : mode === 'login' ? 'Sign in' : 'Create account'
              }
            </button>
          </form>

          {/* footer note */}
          {mode === 'signup' && (
            <p className="mt-5 text-[12px] text-[#bbb] text-center leading-relaxed">
              By creating an account you agree to our{' '}
              <a href="/terms" className="text-[#999] hover:text-[#0a0a0a] underline underline-offset-2 transition-colors">Terms</a>
              {' '}and{' '}
              <a href="/privacy" className="text-[#999] hover:text-[#0a0a0a] underline underline-offset-2 transition-colors">Privacy Policy</a>.
            </p>
          )}

          {/* back to home */}
          <div className="mt-8 text-center">
            <a href="/" className="text-[12px] text-[#bbb] hover:text-[#666] transition-colors">
              ← Back to home
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}