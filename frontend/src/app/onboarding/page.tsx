'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, Copy, ExternalLink, Loader2, LogOut, Sparkles } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { projectsApi, apiKeysApi } from '@/lib/api'

const STEPS = ['Create Project', 'Save API Key', 'Install SDK', 'Done!']

type Stack = 'python' | 'nodejs' | 'api'

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [checkingAccount, setCheckingAccount] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [accountError, setAccountError] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [stack, setStack] = useState<Stack>('python')

  const [projectName, setProjectName] = useState('')
  const [environment, setEnvironment] = useState('production')
  const [model, setModel] = useState('gpt-4o')

  const [projectId, setProjectId] = useState('')
  const [apiKey, setApiKey] = useState('')

  const { token, user, loading: authLoading, signOut } = useAuth()
  const router = useRouter()
  const backendBaseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/v1').replace(/\/+$/, '')

  useEffect(() => {
    if (authLoading) return
    if (!user || !token) {
      router.replace('/login')
      return
    }

    let active = true
    setCheckingAccount(true)
    setAccountError('')
    projectsApi.list(token)
      .then(projects => {
        if (active && projects.length > 0) router.replace('/dashboard')
      })
      .catch(() => {
        if (active) setAccountError('We couldn’t check your projects. Please try again.')
      })
      .finally(() => {
        if (active) setCheckingAccount(false)
      })

    return () => { active = false }
  }, [authLoading, user, token, router])

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopied(id)
        setTimeout(() => setCopied(null), 2000)
      })
      .catch(() => setError('Clipboard access failed. Please copy the text manually.'))
  }

  async function handleCreateProject() {
    if (!projectName.trim()) { setError('Project name is required'); return }
    if (!token) { setError('Your session expired. Please sign in again.'); router.replace('/login'); return }
    setError('')
    setLoading(true)
    try {
      let id = projectId
      if (!id) {
        const project = await projectsApi.create({ name: projectName.trim(), environment, default_model: model.trim() || 'gpt-4o' }, token)
        id = project.id
        setProjectId(id)
      }
      const key = await apiKeysApi.create(id, { name: 'Default Key' }, token)
      setApiKey(key.full_key || '')
      setStep(1)
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Project setup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (authLoading || checkingAccount) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center" role="status" aria-live="polite">
        <Loader2 className="animate-spin text-[#666]" size={20} />
        <span className="sr-only">Checking your account</span>
      </div>
    )
  }

  if (accountError) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-xl border border-black/[0.08] bg-white p-6 text-center">
          <p className="text-sm font-medium text-[#0a0a0a]">Couldn’t load your projects</p>
          <p className="mt-2 text-sm text-[#777]">{accountError}</p>
          <button onClick={() => window.location.reload()} className="mt-5 rounded-lg bg-[#0a0a0a] px-4 py-2 text-sm font-medium text-white">
            Try again
          </button>
        </div>
      </div>
    )
  }

const pythonInstall = `pip install llm-monitor python-dotenv`

const pythonSnippet = `from dotenv import load_dotenv
load_dotenv()

from llm_monitor import monitor

monitor.configure(
    api_key="${apiKey || 'lmd_your_key_here'}",
    project_id="${projectId || 'your-project-id'}",
    backend_url="${backendBaseUrl}",
)

# Add this to the file where your LLM calls happen
# e.g. main.py, app.py, routes/chat.py, services/ai.py
# Replace your existing LLM calls with monitor.chat()

response = monitor.chat(
    model="${model || 'llama-3.3-70b-versatile'}",
    messages=[{"role": "user", "content": "Your message here"}],
)
monitor.flush()
print(response.choices[0].message.content)`

//  node js sdk 

const nodeInstall = `npm install axios`

const nodeSnippet = `const axios = require('axios');

async function trackLLM(model, response, latencyMs) {
  const { prompt_tokens = 0, completion_tokens = 0, total_tokens = 0 } = response.usage ?? {};
  await axios.post(
    '${backendBaseUrl}/ingest/batch',
    { events: [{
      id: crypto.randomUUID(),
      project_id: '${projectId || 'your-project-id'}',
      model, provider: 'groq', environment: 'production',
      prompt_tokens, completion_tokens, total_tokens,
      latency_ms: latencyMs, cost_usd: 0, status: 'success',
      requested_at: new Date().toISOString(),
      request_id: crypto.randomUUID(),
      tags: {}, user_id: null, session_id: null,
      prompt_text: null, response_text: null, error_message: null,
    }]},
    { headers: { Authorization: 'Bearer ${apiKey || 'lmd_your_key_here'}' } }
  ).catch(() => {});
}

// Usage — add after every LLM call:
const start = Date.now();
const response = await groq.chat.completions.create({
  model: '${model || 'llama-3.3-70b-versatile'}',
  messages: [{ role: 'user', content: 'Hello!' }],
});
trackLLM('${model || 'llama-3.3-70b-versatile'}', response, Date.now() - start);`

const apiSnippet = `import httpx, time, uuid

start = time.time()
# response = your_llm_call(...)
latency_ms = int((time.time() - start) * 1000)

httpx.post(
    "${backendBaseUrl}/ingest/batch",
    json={"events": [{
        "id": str(uuid.uuid4()),
        "project_id": "${projectId || 'your-project-id'}",
        "model": "${model || 'llama-3.3-70b-versatile'}",
        "provider": "groq",
        "environment": "production",
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "latency_ms": latency_ms,
        "cost_usd": 0,
        "status": "success",
        "requested_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "request_id": str(uuid.uuid4()),
        "tags": {}, "user_id": None, "session_id": None,
        "prompt_text": None, "response_text": None, "error_message": None,
    }]},
    headers={"Authorization": "Bearer ${apiKey || 'lmd_your_key_here'}"},
    timeout=5,
)`

  const stackConfig = {
    python: { install: pythonInstall, snippet: pythonSnippet, installId: 'py-install', snippetId: 'py-snippet' },
    nodejs: { install: nodeInstall, snippet: nodeSnippet, installId: 'node-install', snippetId: 'node-snippet' },
    api: { install: null, snippet: apiSnippet, installId: null, snippetId: 'api-snippet' },
  }

  const current = stackConfig[stack]

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .ob-root {
          min-height: 100vh;
          background: #fafafa;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        .ob-wrap { width: 100%; max-width: 620px; }

        .ob-logo {
          display: flex;
          align-items: center;
          gap: 8px;
          justify-content: center;
          margin-bottom: 36px;
        }
        .ob-logo-text {
          font-size: 14px;
          font-weight: 600;
          color: #0a0a0a;
          letter-spacing: -0.01em;
        }

        .ob-steps {
          display: flex;
          align-items: flex-start;
          margin-bottom: 28px;
        }
        .ob-step-item {
          display: flex;
          align-items: center;
          flex: 1;
        }
        .ob-step-item:last-child { flex: none; }
        .ob-step-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
        }
        .ob-step-dot {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 600;
          transition: all 0.2s;
          border: 1.5px solid #e4e4e7;
          color: #a1a1aa;
          background: #fff;
        }
        .ob-step-dot.done { background: #0a0a0a; border-color: #0a0a0a; color: #fff; }
        .ob-step-dot.active { background: #fff; border-color: #0a0a0a; color: #0a0a0a; }
        .ob-step-name {
          font-size: 10.5px;
          color: #a1a1aa;
          white-space: nowrap;
          font-weight: 500;
        }
        .ob-step-name.active { color: #0a0a0a; }
        .ob-step-line {
          flex: 1;
          height: 1px;
          background: #e4e4e7;
          margin: 0 8px;
          margin-bottom: 18px;
          transition: background 0.3s;
        }
        .ob-step-line.done { background: #0a0a0a; }

        .ob-card {
          background: #fff;
          border: 1px solid #e4e4e7;
          border-radius: 12px;
          padding: 32px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }

        .ob-title {
          font-size: 15px;
          font-weight: 600;
          color: #0a0a0a;
          margin-bottom: 4px;
          letter-spacing: -0.01em;
        }
        .ob-subtitle {
          font-size: 13px;
          color: #71717a;
          margin-bottom: 22px;
          line-height: 1.5;
        }

        .ob-error {
          margin-bottom: 16px;
          padding: 10px 13px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          font-size: 12.5px;
          color: #dc2626;
        }

        .ob-field { margin-bottom: 14px; }
        .ob-label {
          display: block;
          font-size: 12.5px;
          font-weight: 500;
          color: #3f3f46;
          margin-bottom: 6px;
        }
        .ob-input {
          width: 100%;
          height: 36px;
          padding: 0 12px;
          background: #fff;
          border: 1px solid #d4d4d8;
          border-radius: 7px;
          font-size: 13px;
          color: #0a0a0a;
          font-family: inherit;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .ob-input::placeholder { color: #a1a1aa; }
        .ob-input:focus {
          border-color: #0a0a0a;
          box-shadow: 0 0 0 3px rgba(10,10,10,0.06);
        }
        .ob-hint { font-size: 11.5px; color: #a1a1aa; margin-top: 4px; }

        .ob-select {
          width: 100%;
          height: 36px;
          padding: 0 12px;
          background: #fff;
          border: 1px solid #d4d4d8;
          border-radius: 7px;
          font-size: 13px;
          color: #0a0a0a;
          font-family: inherit;
          outline: none;
          cursor: pointer;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
        }
        .ob-select:focus {
          border-color: #0a0a0a;
          box-shadow: 0 0 0 3px rgba(10,10,10,0.06);
        }

        .ob-btn {
          width: 100%;
          height: 36px;
          padding: 0 16px;
          background: #0a0a0a;
          color: #fff;
          border: none;
          border-radius: 7px;
          font-size: 13px;
          font-weight: 500;
          font-family: inherit;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          margin-top: 6px;
          transition: background 0.15s;
          letter-spacing: -0.01em;
        }
        .ob-btn:hover { background: #222; }
        .ob-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .ob-warn {
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 8px;
          padding: 11px 13px;
          margin-bottom: 18px;
          display: flex;
          align-items: flex-start;
          gap: 9px;
        }
        .ob-warn-icon { flex-shrink: 0; color: #d97706; margin-top: 1px; }
        .ob-warn-text { font-size: 12px; color: #92400e; line-height: 1.5; }

        .ob-key-block {
          background: #fafafa;
          border: 1px solid #e4e4e7;
          border-radius: 8px;
          padding: 14px 15px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 20px;
        }
        .ob-key-text {
          font-family: 'SF Mono', 'Fira Mono', monospace;
          font-size: 12px;
          color: #0a0a0a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ob-copy-btn {
          flex-shrink: 0;
          background: none;
          border: 1px solid #e4e4e7;
          border-radius: 6px;
          padding: 5px 9px;
          cursor: pointer;
          color: #71717a;
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11.5px;
          font-family: inherit;
          transition: all 0.15s;
        }
        .ob-copy-btn:hover { background: #f4f4f5; color: #0a0a0a; border-color: #d4d4d8; }

        .ob-meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 4px;
        }
        .ob-meta-label {
          font-size: 11px;
          color: #a1a1aa;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 3px;
        }
        .ob-meta-value {
          font-family: 'SF Mono', 'Fira Mono', monospace;
          font-size: 12px;
          color: #3f3f46;
        }

        .ob-divider { height: 1px; background: #f4f4f5; margin: 18px 0; }

        .ob-section-label {
          font-size: 11.5px;
          font-weight: 600;
          color: #71717a;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 8px;
        }

        /* Stack tabs */
        .ob-tabs {
          display: flex;
          gap: 6px;
          margin-bottom: 20px;
          background: #f4f4f5;
          padding: 4px;
          border-radius: 8px;
        }
        .ob-tab {
          flex: 1;
          height: 30px;
          border: none;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.15s;
          background: transparent;
          color: #71717a;
        }
        .ob-tab.active {
          background: #fff;
          color: #0a0a0a;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }
        .ob-tab:hover:not(.active) { color: #3f3f46; }

        /* File location badge */
        .ob-file-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 6px;
          padding: 5px 10px;
          font-size: 11.5px;
          color: #15803d;
          font-family: 'SF Mono', 'Fira Mono', monospace;
          margin-bottom: 10px;
        }

        .ob-code-wrap {
          position: relative;
          background: #fafafa;
          border: 1px solid #e4e4e7;
          border-radius: 8px;
          padding: 14px 16px;
          margin-bottom: 16px;
        }
        .ob-code {
          font-family: 'SF Mono', 'Fira Mono', 'Cascadia Code', monospace;
          font-size: 11.5px;
          color: #3f3f46;
          white-space: pre;
          overflow-x: auto;
          line-height: 1.7;
        }
        .ob-code-copy {
          position: absolute;
          top: 10px;
          right: 10px;
          background: #fff;
          border: 1px solid #e4e4e7;
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 11px;
          font-family: inherit;
          color: #71717a;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: all 0.15s;
        }
        .ob-code-copy:hover { background: #f4f4f5; color: #0a0a0a; }

        .ob-note {
          background: #f0f9ff;
          border: 1px solid #bae6fd;
          border-radius: 8px;
          padding: 10px 13px;
          font-size: 12px;
          color: #0369a1;
          line-height: 1.6;
          margin-bottom: 14px;
        }
        .ob-note code {
          font-family: 'SF Mono', 'Fira Mono', monospace;
          background: rgba(3,105,161,0.08);
          padding: 1px 5px;
          border-radius: 3px;
          font-size: 11.5px;
        }

        .ob-success-center { text-align: center; }
        .ob-check-circle {
          width: 52px;
          height: 52px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 18px;
        }
        .ob-docs-link {
          display: block;
          font-size: 12.5px;
          color: #a1a1aa;
          text-decoration: none;
          margin-top: 14px;
          transition: color 0.15s;
        }
        .ob-docs-link:hover { color: #0a0a0a; }

        .ob-step-desc {
          font-size: 12px;
          color: #71717a;
          margin-bottom: 12px;
          line-height: 1.6;
          padding: 8px 12px;
          background: #fafafa;
          border-radius: 7px;
          border-left: 3px solid #e4e4e7;
        }
        .ob-env-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .ob-env-option {
          min-height: 72px;
          padding: 11px 12px;
          text-align: left;
          border: 1px solid #e4e4e7;
          border-radius: 8px;
          background: #fff;
          cursor: pointer;
          font-family: inherit;
        }
        .ob-env-option:hover { border-color: #a1a1aa; }
        .ob-env-option.selected {
          border-color: #0a0a0a;
          box-shadow: 0 0 0 1px #0a0a0a;
          background: #fafafa;
        }
        .ob-env-name { display: block; font-size: 12px; font-weight: 600; color: #18181b; }
        .ob-env-desc { display: block; margin-top: 4px; font-size: 10.5px; line-height: 1.4; color: #71717a; }
        .ob-skip {
          width: 100%;
          padding: 10px 12px;
          margin-top: 9px;
          background: transparent;
          border: 0;
          color: #71717a;
          font-family: inherit;
          font-size: 12px;
          cursor: pointer;
        }
        .ob-skip:hover { color: #0a0a0a; }
        @media (max-width: 520px) {
          .ob-root { padding: 18px 14px; }
          .ob-card { padding: 22px 18px; }
          .ob-env-grid { grid-template-columns: 1fr; }
          .ob-env-option { min-height: 0; }
        }
      `}</style>

      <div className="ob-root">
        <div className="ob-wrap">

          {/* Logo */}
          <div className="ob-logo">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
              <rect x="1" y="1" width="8" height="8" rx="1.5" fill="#0a0a0a"/>
              <rect x="11" y="1" width="8" height="8" rx="1.5" fill="#0a0a0a" opacity="0.25"/>
              <rect x="1" y="11" width="8" height="8" rx="1.5" fill="#0a0a0a" opacity="0.25"/>
              <rect x="11" y="11" width="8" height="8" rx="1.5" fill="#0a0a0a"/>
            </svg>
            <span className="ob-logo-text">LLM Monitor</span>
          </div>

          <div className="flex items-center justify-between mb-5 text-xs text-[#71717a]">
            <span>Workspace setup</span>
            <button
              className="inline-flex items-center gap-1.5 hover:text-[#0a0a0a]"
              onClick={async () => { await signOut(); router.replace('/login') }}
            >
              <LogOut size={12} /> Sign out
            </button>
          </div>

          {/* Steps */}
          <div className="ob-steps">
            {STEPS.map((label, i) => (
              <div key={label} className="ob-step-item">
                <div className="ob-step-col">
                  <div className={`ob-step-dot ${i < step ? 'done' : i === step ? 'active' : ''}`}>
                    {i < step ? <Check size={12} /> : i + 1}
                  </div>
                  <span className={`ob-step-name ${i === step ? 'active' : ''}`}>{label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`ob-step-line ${i < step ? 'done' : ''}`} />
                )}
              </div>
            ))}
          </div>

          <div className="ob-card">

            {/* ── Step 0: Create Project ── */}
            {step === 0 && (
              <div>
                <div className="ob-title">Create your first project</div>
                <div className="ob-subtitle">Start with one application. You can connect your LLM traffic now or return to setup later.</div>

                {error && <div className="ob-error">{error}</div>}

                <div className="ob-field">
                  <label className="ob-label" htmlFor="project-name">Application name</label>
                  <input
                    id="project-name"
                    className="ob-input"
                    placeholder="e.g. Customer support assistant"
                    value={projectName}
                    onChange={e => setProjectName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
                    required
                    maxLength={100}
                  />
                  <div className="ob-hint">A clear name helps you recognize this application in your workspace.</div>
                </div>

                <div className="ob-field">
                  <div className="ob-label">Environment</div>
                  <div className="ob-env-grid" role="radiogroup" aria-label="Application environment">
                    {[
                      { value: 'production', name: 'Production', description: 'Live customer traffic' },
                      { value: 'staging', name: 'Staging', description: 'Pre-release testing' },
                      { value: 'development', name: 'Development', description: 'Local development' },
                    ].map(option => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={environment === option.value}
                        className={`ob-env-option ${environment === option.value ? 'selected' : ''}`}
                        onClick={() => setEnvironment(option.value)}
                      >
                        <span className="ob-env-name">{option.name}</span>
                        <span className="ob-env-desc">{option.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ob-field">
                  <label className="ob-label" htmlFor="primary-model">Primary LLM model <span className="font-normal text-[#999]">(optional)</span></label>
                  <input
                    id="primary-model"
                    className="ob-input"
                    type="text"
                    list="models-list"
                    placeholder="e.g. gpt-4o"
                    value={model}
                    onChange={e => setModel(e.target.value)}
                  />
                  <datalist id="models-list">
                    <option value="gpt-4o" />
                    <option value="gpt-4o-mini" />
                    <option value="gpt-4-turbo" />
                    <option value="claude-3-5-sonnet-20241022" />
                    <option value="claude-3-5-haiku-20241022" />
                    <option value="claude-3-opus-20240229" />
                    <option value="gemini-1.5-pro" />
                    <option value="gemini-1.5-flash" />
                    <option value="llama-3.3-70b-versatile" />
                    <option value="llama-3.1-8b-instant" />
                    <option value="mistral-large-latest" />
                  </datalist>
                  <div className="ob-hint">Used as the default label in your project. You can change it later.</div>
                </div>

                <button className="ob-btn" onClick={handleCreateProject} disabled={loading}>
                  {loading ? 'Creating your project…' : <>Create project <ArrowRight size={14} /></>}
                </button>
              </div>
            )}

            {/* ── Step 1: API Key ── */}
            {step === 1 && (
              <div>
                <div className="ob-title">Your API key</div>
                <div className="ob-subtitle">Save this key — it won't be shown again.</div>

                <div className="ob-warn">
                  <Sparkles size={13} className="ob-warn-icon" />
                  <div className="ob-warn-text">
                    Copy and store this key securely in your <code style={{ fontFamily: 'monospace', background: 'rgba(180,83,9,0.08)', padding: '1px 4px', borderRadius: 3 }}>.env</code> file. You won't be able to retrieve it again.
                  </div>
                </div>

                <div className="ob-key-block">
                  <span className="ob-key-text">{apiKey}</span>
                  <button className="ob-copy-btn" onClick={() => copy(apiKey, 'key')}>
                    {copied === 'key'
                      ? <><Check size={11} color="#16a34a" /> Copied</>
                      : <><Copy size={11} /> Copy</>}
                  </button>
                </div>

                <div className="ob-divider" />

                <div className="ob-meta-grid">
                  <div>
                    <div className="ob-meta-label">Project ID</div>
                    <div className="ob-meta-value">{projectId.slice(0, 18)}…</div>
                  </div>
                  <div>
                    <div className="ob-meta-label">Environment</div>
                    <div className="ob-meta-value">{environment}</div>
                  </div>
                </div>

                <div className="ob-divider" />

                <button className="ob-btn" onClick={() => router.replace('/dashboard')}>
                  I've saved my key — open dashboard <ArrowRight size={14} />
                </button>
                <button className="ob-skip" onClick={() => setStep(2)}>
                  Show me how to connect my app
                </button>
              </div>
            )}

            {/* ── Step 2: Install SDK ── */}
            {step === 2 && (
              <div>
                <div className="ob-title">Add to your project</div>
                <div className="ob-subtitle">Select your stack — we'll show you exactly where to add the code.</div>

                {/* Stack tabs */}
                <div className="ob-tabs">
                  <button className={`ob-tab ${stack === 'python' ? 'active' : ''}`} onClick={() => setStack('python')}>
                    🐍 Python
                  </button>
                  <button className={`ob-tab ${stack === 'nodejs' ? 'active' : ''}`} onClick={() => setStack('nodejs')}>
                    🟢 Node.js
                  </button>
                  <button className={`ob-tab ${stack === 'api' ? 'active' : ''}`} onClick={() => setStack('api')}>
                    🔌 Direct API
                  </button>
                </div>

                {/* Python */}
                {stack === 'python' && (
                  <>
                    <div className="ob-step-desc">
                      Open the file where your LLM calls happen — e.g. <code style={{fontFamily:'monospace'}}>main.py</code>, <code style={{fontFamily:'monospace'}}>app.py</code>, <code style={{fontFamily:'monospace'}}>services/ai.py</code>, or <code style={{fontFamily:'monospace'}}>routes/chat.py</code>. Add the code below at the top of that file.
                    </div>

                    <div className="ob-section-label">1 — Install</div>
                    <div className="ob-code-wrap">
                      <pre className="ob-code">{current.install}</pre>
                      <button className="ob-code-copy" onClick={() => copy(current.install!, current.installId!)}>
                        {copied === current.installId ? <><Check size={11} color="#16a34a" /> Copied</> : <><Copy size={11} /> Copy</>}
                      </button>
                    </div>

                    <div className="ob-section-label">2 — Add to your LLM file</div>
                    <div className="ob-file-badge">
                      📁 your-project/main.py  (or wherever your LLM calls are)
                    </div>
                    <div className="ob-code-wrap">
                      <pre className="ob-code">{current.snippet}</pre>
                      <button className="ob-code-copy" onClick={() => copy(current.snippet, current.snippetId)}>
                        {copied === current.snippetId ? <><Check size={11} color="#16a34a" /> Copied</> : <><Copy size={11} /> Copy</>}
                      </button>
                    </div>

                    <div className="ob-note">
                      💡 Make sure your <code>.env</code> file has: <code>GROQ_API_KEY=gsk_...</code> or <code>OPENAI_API_KEY=sk-...</code>
                    </div>
                  </>
                )}

                {/* Node.js */}
                {stack === 'nodejs' && (
                  <>
                    <div className="ob-step-desc">
                      Open the file where you call Groq/OpenAI — e.g. <code style={{fontFamily:'monospace'}}>groq.js</code>, <code style={{fontFamily:'monospace'}}>openai.js</code>, <code style={{fontFamily:'monospace'}}>services/ai.js</code>, or <code style={{fontFamily:'monospace'}}>utils/llm.js</code>. Add the <code style={{fontFamily:'monospace'}}>trackLLM()</code> helper and call it after every LLM response.
                    </div>

                    <div className="ob-section-label">1 — Install</div>
                    <div className="ob-code-wrap">
                      <pre className="ob-code">{current.install}</pre>
                      <button className="ob-code-copy" onClick={() => copy(current.install!, current.installId!)}>
                        {copied === current.installId ? <><Check size={11} color="#16a34a" /> Copied</> : <><Copy size={11} /> Copy</>}
                      </button>
                    </div>

                    <div className="ob-section-label">2 — Add to your LLM file</div>
                    <div className="ob-file-badge">
                      📁 your-project/services/ai.js  (or wherever your LLM calls are)
                    </div>
                    <div className="ob-code-wrap">
                      <pre className="ob-code">{current.snippet}</pre>
                      <button className="ob-code-copy" onClick={() => copy(current.snippet, current.snippetId)}>
                        {copied === current.snippetId ? <><Check size={11} color="#16a34a" /> Copied</> : <><Copy size={11} /> Copy</>}
                      </button>
                    </div>

                    <div className="ob-note">
                      💡 Just add <code>trackLLM(model, response, latencyMs)</code> after every existing LLM call — no other changes needed.
                    </div>
                  </>
                )}

                {/* Direct API */}
                {stack === 'api' && (
                  <>
                    <div className="ob-step-desc">
                      Works with any language — Ruby, Go, PHP, curl, etc. After your LLM call completes, send a POST request to our ingest endpoint with the response data.
                    </div>

                    <div className="ob-section-label">Add after your LLM call</div>
                    <div className="ob-file-badge">
                      📁 any file in any language — just HTTP POST
                    </div>
                    <div className="ob-code-wrap">
                      <pre className="ob-code">{current.snippet}</pre>
                      <button className="ob-code-copy" onClick={() => copy(current.snippet, current.snippetId)}>
                        {copied === current.snippetId ? <><Check size={11} color="#16a34a" /> Copied</> : <><Copy size={11} /> Copy</>}
                      </button>
                    </div>

                    <div className="ob-note">
                      💡 Set <code>provider</code> to <code>groq</code>, <code>openai</code>, or <code>anthropic</code> — and fill in token counts from <code>response.usage</code>.
                    </div>
                  </>
                )}

                <button className="ob-btn" onClick={() => setStep(3)}>
                  Done, let's go! <ArrowRight size={14} />
                </button>
                <button className="ob-skip" onClick={() => router.replace('/dashboard')}>
                  Finish later — go to dashboard
                </button>
              </div>
            )}

            {/* ── Step 3: Done ── */}
            {step === 3 && (
              <div className="ob-success-center">
                <div className="ob-check-circle">
                  <Check size={22} color="#16a34a" />
                </div>
                <div className="ob-title">You're all set!</div>
                <div className="ob-subtitle" style={{ marginTop: 6, marginBottom: 24 }}>
                  Start sending requests — your dashboard will populate within seconds.
                </div>
                <button className="ob-btn" onClick={() => router.replace('/dashboard')}>
                  Open Dashboard <ExternalLink size={13} />
                </button>
                <a
                  className="ob-docs-link"
                  href="https://github.com/Raj-spy/llm-drift-monitor"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View documentation →
                </a>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  )
}
