'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, Copy, ExternalLink, Sparkles } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { projectsApi, apiKeysApi } from '@/lib/api'

const STEPS = ['Create Project', 'Save API Key', 'Install SDK', 'Done!']

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const [projectName, setProjectName] = useState('')
  const [environment, setEnvironment] = useState('production')
  const [model, setModel] = useState('')

  const [projectId, setProjectId] = useState('')
  const [apiKey, setApiKey] = useState('')

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
      const project = await projectsApi.create({ name: projectName, environment, default_model: model || 'gpt-4o' }, token!)
      setProjectId(project.id)
      const key = await apiKeysApi.create(project.id, { name: 'Default Key' }, token!)
      setApiKey(key.full_key || '')
      setStep(1)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const installSnippet = `pip install llm-monitor groq python-dotenv`

const configSnippet = `from dotenv import load_dotenv
load_dotenv()  # .env file se GROQ_API_KEY / OPENAI_API_KEY padho

from llm_monitor import monitor

monitor.configure(
    api_key="${apiKey || 'lmd_your_key_here'}",
    project_id="${projectId || 'your-project-id'}",
    backend_url="https://innovative-learning-production-7c85.up.railway.app/v1",
)

response = monitor.chat(
    model="${model || 'llama-3.3-70b-versatile'}",
    messages=[{"role": "user", "content": "Your message here"}],
)
monitor.flush()
print(response.choices[0].message.content)`
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

        .ob-wrap { width: 100%; max-width: 480px; }

        /* Logo */
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

        /* Steps */
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

        /* Card */
        .ob-card {
          background: #fff;
          border: 1px solid #e4e4e7;
          border-radius: 12px;
          padding: 28px;
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

        /* Error */
        .ob-error {
          margin-bottom: 16px;
          padding: 10px 13px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          font-size: 12.5px;
          color: #dc2626;
        }

        /* Fields */
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

        /* Button */
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

        /* Warning */
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

        /* API key block */
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

        /* Meta */
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

        /* Divider */
        .ob-divider { height: 1px; background: #f4f4f5; margin: 18px 0; }

        /* SDK section label */
        .ob-section-label {
          font-size: 11.5px;
          font-weight: 600;
          color: #71717a;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 8px;
        }

        /* Code block */
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
          font-size: 12px;
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

        /* Note */
        .ob-note {
          background: #f0f9ff;
          border: 1px solid #bae6fd;
          border-radius: 8px;
          padding: 10px 13px;
          font-size: 12px;
          color: #0369a1;
          line-height: 1.6;
          margin-bottom: 18px;
        }
        .ob-note code {
          font-family: 'SF Mono', 'Fira Mono', monospace;
          background: rgba(3,105,161,0.08);
          padding: 1px 5px;
          border-radius: 3px;
          font-size: 11.5px;
        }

        .ob-caption {
          font-size: 12px;
          color: #a1a1aa;
          line-height: 1.6;
          margin-bottom: 18px;
        }

        /* Success */
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

          {/* Card */}
          <div className="ob-card">

            {/* ── Step 0: Create Project ── */}
            {step === 0 && (
              <div>
                <div className="ob-title">Create your first project</div>
                <div className="ob-subtitle">A project represents one of your applications.</div>

                {error && <div className="ob-error">{error}</div>}

                <div className="ob-field">
                  <label className="ob-label">Project name</label>
                  <input
                    className="ob-input"
                    placeholder="My AI App"
                    value={projectName}
                    onChange={e => setProjectName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
                  />
                  <div className="ob-hint">e.g. Customer Support Bot, Code Review Assistant</div>
                </div>

                <div className="ob-field">
                  <label className="ob-label">Environment</label>
                  <select className="ob-select" value={environment} onChange={e => setEnvironment(e.target.value)}>
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="development">Development</option>
                  </select>
                </div>

                <div className="ob-field">
                  <label className="ob-label">Primary LLM model</label>
                  <input
                    className="ob-input"
                    type="text"
                    list="models-list"
                    placeholder="e.g. gpt-4o, llama-3.3-70b, claude-3-5-sonnet..."
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
                  <div className="ob-hint">Type your model name or pick from suggestions</div>
                </div>

                <button className="ob-btn" onClick={handleCreateProject} disabled={loading}>
                  {loading ? 'Creating…' : <>Create Project <ArrowRight size={14} /></>}
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

                <button className="ob-btn" onClick={() => setStep(2)}>
                  I've saved my key <ArrowRight size={14} />
                </button>
              </div>
            )}

            {/* ── Step 2: Install SDK ── */}
            {step === 2 && (
              <div>
                <div className="ob-title">Install the SDK</div>
                <div className="ob-subtitle">Two steps — under 2 minutes.</div>

                {/* Install */}
                <div className="ob-section-label">1 — Install</div>
                <div className="ob-code-wrap">
                  <pre className="ob-code">{installSnippet}</pre>
                  <button className="ob-code-copy" onClick={() => copy(installSnippet, 'install')}>
                    {copied === 'install'
                      ? <><Check size={11} color="#16a34a" /> Copied</>
                      : <><Copy size={11} /> Copy</>}
                  </button>
                </div>

                {/* Configure */}
                <div className="ob-section-label">2 — Add to your code</div>
                <div className="ob-code-wrap">
                  <pre className="ob-code">{configSnippet}</pre>
                  <button className="ob-code-copy" onClick={() => copy(configSnippet, 'config')}>
                    {copied === 'config'
                      ? <><Check size={11} color="#16a34a" /> Copied</>
                      : <><Copy size={11} /> Copy</>}
                  </button>
                </div>

                {/* Important note about provider key */}
                <div className="ob-note">
                  💡 The SDK automatically reads <code>OPENAI_API_KEY</code> or <code>ANTHROPIC_API_KEY</code> from your environment — no extra setup needed if you're already using these models.
                </div>

                <div className="ob-note">
  💡 Make sure your provider API key is set in <code>.env</code> file:<br/>
  <code>GROQ_API_KEY=gsk_...</code> or <code>OPENAI_API_KEY=sk-...</code>
</div>

                <button className="ob-btn" onClick={() => setStep(3)}>
                  Done, let's go! <ArrowRight size={14} />
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
                <button className="ob-btn" onClick={() => router.push('/dashboard')}>
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