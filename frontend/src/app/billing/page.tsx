'use client'

import { useState } from 'react'
import { Check, Sparkles, Zap, Building2, ArrowRight } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui'

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 49,
    description: 'For indie developers and small teams.',
    icon: Zap,
    color: 'indigo',
    features: [
      '50,000 requests / month',
      '2 projects',
      '5 drift tests',
      '30-day data retention',
      'Email alerts',
      'API key management',
      'Community support',
    ],
    cta: 'Start with Starter',
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 99,
    description: 'For growing teams with serious LLM workloads.',
    icon: Sparkles,
    color: 'indigo',
    popular: true,
    features: [
      '100,000 requests / month',
      '10 projects',
      '20 drift tests',
      '90-day data retention',
      'Email + Slack alerts',
      'Model comparison dashboard',
      'Priority support',
    ],
    cta: 'Start with Growth',
  },
  {
    id: 'scale',
    name: 'Scale',
    price: 299,
    description: 'Unlimited observability for production-critical systems.',
    icon: Building2,
    color: 'purple',
    features: [
      'Unlimited requests',
      'Unlimited projects',
      'Unlimited drift tests',
      '1-year data retention',
      'Email + Slack + Webhook alerts',
      'Custom evaluator models',
      'SLA guarantee',
      'Dedicated Slack support',
    ],
    cta: 'Start with Scale',
  },
]

export default function BillingPage() {
  const [loading, setLoading] = useState<string | null>(null)
  const { token } = useAuth()

  async function handleUpgrade(planId: string) {
    setLoading(planId)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          plan: planId,
          success_url: `${window.location.origin}/billing/success`,
          cancel_url: `${window.location.origin}/billing`,
        }),
      })
      const data = await res.json()
      if (data.checkout_url) window.location.href = data.checkout_url
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-slate-100 mb-3">Simple, transparent pricing</h1>
        <p className="text-slate-400 max-w-xl mx-auto">
          All plans include a 14-day free trial. No credit card required to start.
        </p>
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {PLANS.map((plan) => {
          const Icon = plan.icon
          return (
            <div
              key={plan.id}
              className={`relative bg-slate-900 border rounded-2xl p-6 flex flex-col ${
                plan.popular
                  ? 'border-indigo-500/60 shadow-lg shadow-indigo-500/10'
                  : 'border-slate-800'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                    MOST POPULAR
                  </span>
                </div>
              )}

              <div className="mb-5">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${
                  plan.popular ? 'bg-indigo-600' : 'bg-slate-800'
                }`}>
                  <Icon size={18} className={plan.popular ? 'text-white' : 'text-slate-400'} />
                </div>
                <h2 className="text-lg font-bold text-slate-100">{plan.name}</h2>
                <p className="text-sm text-slate-500 mt-1">{plan.description}</p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-bold text-slate-100">${plan.price}</span>
                <span className="text-slate-500 text-sm">/month</span>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check size={15} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span className="text-slate-300">{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => handleUpgrade(plan.id)}
                loading={loading === plan.id}
                variant={plan.popular ? 'primary' : 'secondary'}
                className="w-full"
                size="lg"
              >
                {plan.cta} <ArrowRight size={15} />
              </Button>
            </div>
          )
        })}
      </div>

      {/* Enterprise */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800/80 border border-slate-700 rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Building2 size={18} className="text-purple-400" />
            <h3 className="text-lg font-bold text-slate-100">Enterprise</h3>
          </div>
          <p className="text-slate-400 text-sm max-w-lg">
            Custom contracts, SSO, SAML, PagerDuty integration, dedicated infrastructure,
            custom data retention, SLA, and white-glove onboarding.
          </p>
        </div>
        <Button variant="secondary" size="lg" className="whitespace-nowrap flex-shrink-0">
          Talk to sales →
        </Button>
      </div>

      {/* FAQ */}
      <div className="mt-16">
        <h2 className="text-xl font-bold text-slate-100 mb-6 text-center">Common questions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { q: 'What counts as a "request"?', a: 'Each LLM API call captured by the SDK counts as one request. Batch inserts count individually.' },
            { q: 'Can I change plans?', a: 'Yes, upgrade or downgrade anytime. Billing is prorated automatically through Stripe.' },
            { q: 'What happens if I exceed my limit?', a: 'You\'ll receive an email warning at 80% usage. At 100%, new requests are queued but not dropped — you have 48h to upgrade.' },
            { q: 'Is my prompt data stored?', a: 'Prompt and response text is stored encrypted in Supabase. You can disable this in SDK config: capture_prompt=False.' },
          ].map(({ q, a }) => (
            <div key={q} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h4 className="text-sm font-semibold text-slate-200 mb-2">{q}</h4>
              <p className="text-sm text-slate-500">{a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
