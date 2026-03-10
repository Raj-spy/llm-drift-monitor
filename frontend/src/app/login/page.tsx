'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, Eye, EyeOff, ArrowRight, Sparkles, Zap, Shield, BarChart3 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Button, Input } from '@/components/ui'

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

  const features = [
    { icon: BarChart3, text: 'Real-time cost tracking across all LLM providers' },
    { icon: Zap, text: 'Latency spike detection with automatic alerts' },
    { icon: Shield, text: 'Quality drift detection using golden prompt evaluations' },
    { icon: Sparkles, text: 'Zero-overhead SDK — one line to instrument your app' },
  ]

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Left — branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-slate-900 border-r border-slate-800 p-12">
        <div>
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Activity size={20} className="text-white" />
            </div>
            <div>
              <div className="font-semibold text-slate-100">LLM Drift Monitor</div>
              <div className="text-xs text-slate-500">Production AI Observability</div>
            </div>
          </div>

          <h1 className="text-4xl font-bold text-slate-100 leading-tight mb-4">
            Monitor your LLMs<br />
            <span className="text-indigo-400">like a pro.</span>
          </h1>
          <p className="text-slate-400 text-lg mb-12">
            Catch cost spikes before your bill does. Detect quality degradation before your users do.
          </p>

          <ul className="space-y-4">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-indigo-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon size={15} className="text-indigo-400" />
                </div>
                <span className="text-sm text-slate-300">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Testimonial */}
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
          <p className="text-sm text-slate-300 italic mb-3">
            "We caught a 10x cost spike on gpt-4o within minutes of it starting. Saved us thousands."
          </p>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">S</div>
            <div>
              <div className="text-xs font-medium text-slate-200">Sarah K.</div>
              <div className="text-xs text-slate-500">Head of AI, TechCorp</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Activity size={16} className="text-white" />
            </div>
            <span className="font-semibold text-slate-100">LLM Drift Monitor</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-100 mb-2">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="text-slate-500 text-sm mb-8">
            {mode === 'login'
              ? "Don't have an account? "
              : 'Already have an account? '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
              className="text-indigo-400 hover:text-indigo-300 font-medium"
            >
              {mode === 'login' ? 'Sign up free' : 'Sign in'}
            </button>
          </p>

          {success && (
            <div className="mb-6 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-400">
              {success}
            </div>
          )}
          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <Input
                label="Full name"
                type="text"
                placeholder="Jane Smith"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                autoComplete="name"
              />
            )}

            <Input
              label="Email address"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-300">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={mode === 'signup' ? 'Min. 8 characters' : '••••••••'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={mode === 'signup' ? 8 : 1}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 hover:border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <Button type="submit" loading={loading} size="lg" className="w-full mt-2">
              {mode === 'login' ? 'Sign in' : 'Create account'}
              <ArrowRight size={16} />
            </Button>
          </form>

          {mode === 'login' && (
            <p className="mt-4 text-center text-xs text-slate-600">
              Forgot your password?{' '}
              <button className="text-indigo-400 hover:underline">Reset it</button>
            </p>
          )}

          {mode === 'signup' && (
            <p className="mt-4 text-xs text-slate-600 text-center">
              By creating an account, you agree to our{' '}
              <a href="/terms" className="text-slate-500 hover:underline">Terms of Service</a>
              {' '}and{' '}
              <a href="/privacy" className="text-slate-500 hover:underline">Privacy Policy</a>.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
