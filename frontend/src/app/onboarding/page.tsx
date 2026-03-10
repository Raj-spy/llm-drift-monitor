'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, ArrowRight, Check, Copy, ExternalLink, Sparkles } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { projectsApi, apiKeysApi } from '@/lib/api'
import { Button, Input, Select } from '@/components/ui'

const STEPS = ['Create Project', 'Get API Key', 'Install SDK', 'Done!']

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  // Step 1 form
  const [projectName, setProjectName] = useState('')
  const [environment, setEnvironment] = useState('production')
  const [model, setModel] = useState('gpt-4o')

  // Step 2 result
  const [projectId, setProjectId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [keyName] = useState('Default Key')

  const { token } = useAuth()
  const router = useRouter()

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  async function handleCreateProject() {
    if (!projectName.trim()) { setError('Project name is required'); return }
    setError('')
    setLoading(true)
    try {
      const project = await projectsApi.create({ name: projectName, environment, default_model: model }, token!)
      setProjectId(project.id)
      const key = await apiKeysApi.create(project.id, { name: keyName }, token!)
      setApiKey(key.full_key || '')
      setStep(1)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const codeSnippet = `pip install llm-monitor

from llm_monitor import monitor

monitor.configure(
    api_key="${apiKey || 'lmd_your_key_here'}",
    project_id="${projectId || 'your-project-id'}",
)

# Drop-in for OpenAI
response = monitor.chat(
    model="${model}",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xl">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-10 justify-center">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Activity size={18} className="text-white" />
          </div>
          <span className="font-semibold text-slate-200 text-lg">LLM Drift Monitor</span>
        </div>

        {/* Progress */}
        <div className="flex items-center mb-8">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                  i < step ? 'bg-indigo-600 border-indigo-600 text-white' :
                  i === step ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' :
                  'border-slate-700 text-slate-600'
                }`}>
                  {i < step ? <Check size={14} /> : i + 1}
                </div>
                <span className={`text-xs mt-1 whitespace-nowrap ${i === step ? 'text-slate-300' : 'text-slate-600'}`}>{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 mb-4 ${i < step ? 'bg-indigo-600' : 'bg-slate-800'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-7">

          {/* Step 0: Create Project */}
          {step === 0 && (
            <div>
              <h2 className="text-xl font-semibold text-slate-100 mb-1">Create your first project</h2>
              <p className="text-sm text-slate-500 mb-6">A project represents one of your applications.</p>

              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">{error}</div>
              )}

              <div className="space-y-4">
                <Input
                  label="Project name"
                  placeholder="My AI App"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  hint="e.g. Customer Support Bot, Code Review Assistant"
                />
                <Select
                  label="Environment"
                  value={environment}
                  onChange={e => setEnvironment(e.target.value)}
                  options={[
                    { value: 'production', label: 'Production' },
                    { value: 'staging', label: 'Staging' },
                    { value: 'development', label: 'Development' },
                  ]}
                />
                <Select
                  label="Primary LLM model"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  options={[
                    { value: 'gpt-4o', label: 'GPT-4o (OpenAI)' },
                    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (OpenAI)' },
                    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Anthropic)' },
                    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Anthropic)' },
                    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (Google)' },
                  ]}
                />
                <Button onClick={handleCreateProject} loading={loading} className="w-full" size="lg">
                  Create Project <ArrowRight size={16} />
                </Button>
              </div>
            </div>
          )}

          {/* Step 1: API Key */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-semibold text-slate-100 mb-1">Your API key</h2>
              <p className="text-sm text-slate-500 mb-6">
                Save this key — it won't be shown again.
              </p>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-5 flex items-start gap-2">
                <Sparkles size={15} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-400">Copy and store this API key securely. You won't be able to see it again.</p>
              </div>

              <div className="bg-slate-950 border border-slate-700 rounded-lg p-4 font-mono text-sm text-indigo-300 flex items-center justify-between gap-3 mb-6">
                <span className="truncate">{apiKey}</span>
                <button onClick={() => copy(apiKey, 'key')} className="flex-shrink-0 text-slate-500 hover:text-slate-300">
                  {copied === 'key' ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-2 text-xs text-slate-500">
                <div><span className="text-slate-400">Project ID:</span><br />
                  <code className="text-slate-300">{projectId.slice(0, 20)}...</code>
                </div>
                <div><span className="text-slate-400">Environment:</span><br />
                  <code className="text-slate-300">{environment}</code>
                </div>
              </div>

              <Button onClick={() => setStep(2)} className="w-full mt-4" size="lg">
                I've saved my key <ArrowRight size={16} />
              </Button>
            </div>
          )}

          {/* Step 2: Install SDK */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-semibold text-slate-100 mb-1">Install the SDK</h2>
              <p className="text-sm text-slate-500 mb-5">Add monitoring to your app in under 2 minutes.</p>

              <div className="relative bg-slate-950 border border-slate-700 rounded-lg p-4 mb-5">
                <pre className="text-sm text-slate-300 overflow-x-auto whitespace-pre font-mono leading-relaxed">
                  {codeSnippet}
                </pre>
                <button
                  onClick={() => copy(codeSnippet, 'snippet')}
                  className="absolute top-3 right-3 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 bg-slate-800 px-2 py-1 rounded"
                >
                  {copied === 'snippet' ? <><Check size={12} className="text-emerald-400" />Copied</> : <><Copy size={12} />Copy</>}
                </button>
              </div>

              <p className="text-xs text-slate-500 mb-5">
                Works with OpenAI, Anthropic, and any compatible client. Every call is automatically tracked — no changes to your existing code flow.
              </p>

              <Button onClick={() => setStep(3)} className="w-full" size="lg">
                Done, let's go! <ArrowRight size={16} />
              </Button>
            </div>
          )}

          {/* Step 3: Done */}
          {step === 3 && (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto mb-5">
                <Check size={30} className="text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold text-slate-100 mb-2">You're all set!</h2>
              <p className="text-sm text-slate-400 mb-8">
                Start sending requests — your dashboard will populate within seconds.
              </p>
              <div className="space-y-3">
                <Button onClick={() => router.push('/dashboard')} className="w-full" size="lg">
                  Open Dashboard <ExternalLink size={15} />
                </Button>
                <a
                  href="https://docs.llmdriftmonitor.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm text-slate-500 hover:text-slate-300 transition-colors"
                >
                  View documentation →
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
