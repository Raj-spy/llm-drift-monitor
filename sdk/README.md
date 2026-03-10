# llm-monitor

> Zero-overhead LLM observability SDK. Drop-in monitoring for OpenAI and Anthropic.

```bash
pip install llm-monitor
```

## Quickstart

```python
from llm_monitor import monitor

# Configure once at startup
monitor.configure(
    api_key="lmd_your_key_here",     # From dashboard → API Keys
    project_id="your-project-uuid",  # From dashboard → Settings
)

# Use like OpenAI — everything is captured automatically
response = monitor.chat(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Summarize this article..."}],
)
print(response.choices[0].message.content)
```

Every call now tracks: **prompt, response, model, token usage, latency, cost estimate, timestamp**.

---

## Usage Patterns

### Pattern 1: Direct `monitor.chat()`

Works with any model from OpenAI or Anthropic:

```python
from llm_monitor import monitor

monitor.configure(api_key="lmd_...", project_id="...")

# OpenAI model
response = monitor.chat(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
    user_id="user_123",         # Optional: track per-user costs
    session_id="sess_456",      # Optional: group by conversation
    tags={"feature": "search"}, # Optional: custom analytics tags
)

# Anthropic model — same interface
response = monitor.chat(
    model="claude-3-5-sonnet-20241022",
    messages=[{"role": "user", "content": "Hello"}],
    max_tokens=1024,
)
```

### Pattern 2: Wrap existing clients (zero migration cost)

```python
import openai
import anthropic
from llm_monitor import monitor

monitor.configure(api_key="lmd_...", project_id="...")

# Wrap OpenAI — use your existing client exactly as before
client = monitor.wrap_openai(openai.OpenAI())
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
)

# Wrap Anthropic
aclient = monitor.wrap_anthropic(anthropic.Anthropic())
response = aclient.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello"}],
)
```

### Pattern 3: Environment variables (12-factor apps)

```bash
export LLM_MONITOR_API_KEY=lmd_your_key
export LLM_MONITOR_PROJECT_ID=your-project-uuid
export LLM_MONITOR_DEBUG=true
```

```python
from llm_monitor import monitor
# Auto-configured from env — no configure() call needed
response = monitor.chat(model="gpt-4o", messages=[...])
```

---

## Configuration Options

```python
monitor.configure(
    api_key="lmd_...",           # Required
    project_id="uuid",           # Required

    # Backend
    backend_url="https://...",   # Default: https://api.llmdriftmonitor.com

    # Data capture
    capture_prompt=True,         # Store prompt text (default: True)
    capture_response=True,       # Store response text (default: True)
    max_prompt_chars=10_000,     # Truncate long prompts
    max_response_chars=10_000,   # Truncate long responses

    # Batching (async, zero-latency overhead)
    batch_size=50,               # Max events per batch
    flush_interval=5.0,          # Seconds between auto-flushes
    max_queue_size=1_000,        # Drop events if queue fills

    # Behavior
    debug=False,                 # Log captured events
    raise_on_error=False,        # Propagate SDK errors
    timeout_seconds=5.0,         # Backend request timeout
)
```

---

## Supported Models

| Provider | Models |
|----------|--------|
| OpenAI | gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4, gpt-3.5-turbo, o1, o1-mini |
| Anthropic | claude-opus-4-5, claude-sonnet-4-5, claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022, claude-3-opus-20240229 |
| Google | gemini-1.5-pro, gemini-1.5-flash |

---

## Privacy Controls

Disable prompt/response capture for sensitive data:

```python
monitor.configure(
    api_key="lmd_...",
    project_id="...",
    capture_prompt=False,    # Only capture token counts + latency
    capture_response=False,
)
```

---

## Manual flush

The SDK auto-flushes every 5 seconds. For scripts or short-lived processes:

```python
import atexit

# Register flush on exit (important for scripts!)
atexit.register(monitor.flush)

# Or call manually
monitor.flush()
```

---

## License

MIT
