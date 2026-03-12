"""
Core LLM Monitor — wraps OpenAI, Anthropic, and Groq calls transparently.
"""
import logging
import os
import queue
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from .config import MonitorConfig
from .pricing import calculate_cost, get_provider

logger = logging.getLogger("llm_monitor")


class RequestEvent:
    """Represents a single captured LLM call."""
    __slots__ = [
        "id", "project_id", "request_id", "model", "provider",
        "environment", "prompt_text", "response_text",
        "prompt_tokens", "completion_tokens", "total_tokens",
        "latency_ms", "cost_usd", "user_id", "session_id",
        "tags", "status", "error_message", "requested_at",
    ]

    def __init__(self, **kwargs):
        for key, val in kwargs.items():
            setattr(self, key, val)

    def to_dict(self) -> dict:
        return {slot: getattr(self, slot, None) for slot in self.__slots__}


class BatchFlusher:
    """Background thread that batches and flushes events to the backend."""

    def __init__(self, config: MonitorConfig):
        self.config = config
        self._queue: queue.Queue[RequestEvent] = queue.Queue(maxsize=config.max_queue_size)
        self._stop_event = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True, name="llm-monitor-flusher")
        self._http = httpx.Client(timeout=config.timeout_seconds)
        self._thread.start()

    def enqueue(self, event: RequestEvent) -> bool:
        try:
            self._queue.put_nowait(event)
            return True
        except queue.Full:
            logger.warning("LLM Monitor: queue full, dropping event")
            return False

    def flush(self) -> None:
        import time
        time.sleep(0.6)  # background thread ko process karne do
        events = []
        while not self._queue.empty():
            try:
                events.append(self._queue.get_nowait())
            except queue.Empty:
                break
        if events:
            self._send_batch(events)

    def shutdown(self) -> None:
        self._stop_event.set()
        self.flush()
        self._thread.join(timeout=10)
        self._http.close()

    def _run(self) -> None:
        batch: list[RequestEvent] = []
        last_flush = time.time()

        while not self._stop_event.is_set():
            try:
                timeout = max(0.1, self.config.flush_interval - (time.time() - last_flush))
                event = self._queue.get(timeout=timeout)
                batch.append(event)
            except queue.Empty:
                pass

            should_flush = (
                len(batch) >= self.config.batch_size
                or (time.time() - last_flush) >= self.config.flush_interval
            )

            if should_flush and batch:
                self._send_batch(batch)
                batch = []
                last_flush = time.time()

    def _send_batch(self, events: list[RequestEvent]) -> None:
        url = f"{self.config.backend_url}/ingest/batch"
        payload = {"events": [e.to_dict() for e in events]}

        try:
            resp = self._http.post(
                url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {self.config.api_key}",
                    "Content-Type": "application/json",
                    "X-SDK-Version": "0.1.0",
                },
            )
            print(f"[LLM Monitor] Sent {len(events)} events -> {resp.status_code}: {resp.text}")
        except Exception as e:
            print(f"[LLM Monitor] Failed to send batch: {e}")


class LLMMonitor:
    """
    Main monitor class. Wraps LLM API calls to capture observability data.

    Supports: OpenAI, Anthropic, Groq, and any OpenAI-compatible provider.

    Usage:
        from llm_monitor import monitor

        monitor.configure(api_key="lmd_xxx", project_id="proj_yyy")

        # Works with any model — SDK auto-detects provider
        response = monitor.chat(model="gpt-4o", messages=[...])
        response = monitor.chat(model="llama-3.3-70b-versatile", messages=[...])
        response = monitor.chat(model="claude-3-5-sonnet-20241022", messages=[...])

        # Or wrap your existing client
        client = monitor.wrap_openai(openai.OpenAI())
        client = monitor.wrap_groq(Groq())
        client = monitor.wrap_anthropic(anthropic.Anthropic())

    Required env vars (whichever provider you use):
        OPENAI_API_KEY=sk-...
        ANTHROPIC_API_KEY=sk-ant-...
        GROQ_API_KEY=gsk_...
    """

    def __init__(self, config: Optional[MonitorConfig] = None):
        self._config: Optional[MonitorConfig] = config
        self._flusher: Optional[BatchFlusher] = None
        self._configured = False

    def configure(
        self,
        api_key: Optional[str] = None,
        project_id: Optional[str] = None,
        backend_url: Optional[str] = None,
        **kwargs,
    ) -> "LLMMonitor":
        cfg_kwargs = {}
        if api_key:
            cfg_kwargs["api_key"] = api_key
        if project_id:
            cfg_kwargs["project_id"] = project_id
        if backend_url:
            cfg_kwargs["backend_url"] = backend_url
        cfg_kwargs.update(kwargs)

        self._config = MonitorConfig(**cfg_kwargs)
        self._config.validate()
        self._flusher = BatchFlusher(self._config)
        self._configured = True
        logger.info(f"LLM Monitor configured for project {self._config.project_id}")
        return self

    @property
    def config(self) -> MonitorConfig:
        if not self._config:
            raise RuntimeError("LLM Monitor not configured. Call monitor.configure() first.")
        return self._config

    # ─── Direct chat interface ────────────────────────────────────────────────

    def chat(
        self,
        model: str,
        messages: list[dict],
        *,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        tags: Optional[dict] = None,
        **kwargs,
    ) -> Any:
        """
        Make a monitored chat completion call.

        Auto-detects provider from model name:
          gpt-*, o1, o3          → OpenAI    (OPENAI_API_KEY)
          claude-*               → Anthropic (ANTHROPIC_API_KEY)
          llama-*, mixtral-*, gemma-* → Groq (GROQ_API_KEY)
        """
        provider = get_provider(model)

        if provider == "anthropic":
            return self._anthropic_chat(
                model, messages,
                user_id=user_id, session_id=session_id, tags=tags,
                **kwargs,
            )
        elif provider == "groq":
            return self._groq_chat(
                model, messages,
                user_id=user_id, session_id=session_id, tags=tags,
                **kwargs,
            )
        else:
            # Default: OpenAI + any OpenAI-compatible provider
            return self._openai_chat(
                model, messages,
                user_id=user_id, session_id=session_id, tags=tags,
                **kwargs,
            )

    # ─── Provider implementations ─────────────────────────────────────────────

    def _openai_chat(self, model: str, messages: list, **meta) -> Any:
        try:
            import openai
        except ImportError:
            raise ImportError("OpenAI package not found. Run: pip install openai")

        client = openai.OpenAI()  # reads OPENAI_API_KEY from env
        return self._run_openai_compatible(client, model, messages, **meta)

    def _groq_chat(self, model: str, messages: list, **meta) -> Any:
        try:
            from groq import Groq
        except ImportError:
            raise ImportError("Groq package not found. Run: pip install groq")

        client = Groq()  # reads GROQ_API_KEY from env
        return self._run_openai_compatible(client, model, messages, **meta)

    def _run_openai_compatible(self, client: Any, model: str, messages: list, **meta) -> Any:
        """Shared logic for OpenAI-compatible clients (OpenAI, Groq, etc.)"""
        user_id = meta.pop("user_id", None)
        session_id = meta.pop("session_id", None)
        tags = meta.pop("tags", None)

        start = time.time()
        error_msg = None
        response = None
        status = "success"

        try:
            response = client.chat.completions.create(
                model=model, messages=messages, **meta
            )
        except Exception as e:
            status = "error"
            error_msg = str(e)
            raise
        finally:
            latency_ms = int((time.time() - start) * 1000)
            prompt_tokens = completion_tokens = 0
            response_text = None

            if response and hasattr(response, "usage"):
                prompt_tokens = response.usage.prompt_tokens or 0
                completion_tokens = response.usage.completion_tokens or 0
                if response.choices:
                    response_text = response.choices[0].message.content

            self._record(
                model=model,
                messages=messages,
                response_text=response_text,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                latency_ms=latency_ms,
                status=status,
                error_message=error_msg,
                user_id=user_id,
                session_id=session_id,
                tags=tags or {},
            )

        return response

    def _anthropic_chat(self, model: str, messages: list, **meta) -> Any:
        try:
            import anthropic
        except ImportError:
            raise ImportError("Anthropic package not found. Run: pip install anthropic")

        client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env
        user_id = meta.pop("user_id", None)
        session_id = meta.pop("session_id", None)
        tags = meta.pop("tags", None)
        max_tokens = meta.pop("max_tokens", 1024)

        # Separate system message (Anthropic requires it outside messages array)
        system_msg = None
        filtered_messages = []
        for m in messages:
            if m["role"] == "system":
                system_msg = m["content"]
            else:
                filtered_messages.append(m)

        start = time.time()
        error_msg = None
        response = None
        status = "success"

        try:
            call_kwargs: dict = {
                "model": model,
                "max_tokens": max_tokens,
                "messages": filtered_messages,
                **meta,
            }
            if system_msg:
                call_kwargs["system"] = system_msg
            response = client.messages.create(**call_kwargs)
        except Exception as e:
            status = "error"
            error_msg = str(e)
            raise
        finally:
            latency_ms = int((time.time() - start) * 1000)
            prompt_tokens = completion_tokens = 0
            response_text = None

            if response:
                prompt_tokens = response.usage.input_tokens or 0
                completion_tokens = response.usage.output_tokens or 0
                if response.content:
                    response_text = response.content[0].text

            self._record(
                model=model,
                messages=messages,
                response_text=response_text,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                latency_ms=latency_ms,
                status=status,
                error_message=error_msg,
                user_id=user_id,
                session_id=session_id,
                tags=tags or {},
            )

        return response

    # ─── Wrap existing clients ────────────────────────────────────────────────

    def wrap_openai(self, client: Any) -> "OpenAIWrapper":
        """Wrap an existing OpenAI client."""
        return OpenAIWrapper(client, self)

    def wrap_groq(self, client: Any) -> "OpenAIWrapper":
        """Wrap an existing Groq client (uses same OpenAI-compatible interface)."""
        return OpenAIWrapper(client, self)

    def wrap_anthropic(self, client: Any) -> "AnthropicWrapper":
        """Wrap an existing Anthropic client."""
        return AnthropicWrapper(client, self)

    # ─── Internal recording ───────────────────────────────────────────────────

    def _record(
        self,
        model: str,
        messages: list,
        response_text: Optional[str],
        prompt_tokens: int,
        completion_tokens: int,
        latency_ms: int,
        status: str,
        error_message: Optional[str] = None,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        tags: Optional[dict] = None,
    ) -> None:
        if not self._configured or not self._flusher:
            return

        cfg = self.config

        prompt_text = None
        if cfg.capture_prompt and messages:
            last_user_msg = next(
                (m["content"] for m in reversed(messages) if m.get("role") == "user"),
                None,
            )
            if last_user_msg:
                prompt_text = str(last_user_msg)[:cfg.max_prompt_chars]

        if response_text and cfg.capture_response:
            response_text = response_text[:cfg.max_response_chars]
        elif not cfg.capture_response:
            response_text = None

        cost = calculate_cost(model, prompt_tokens, completion_tokens)
        provider = get_provider(model)

        event = RequestEvent(
            id=str(uuid.uuid4()),
            project_id=cfg.project_id,
            request_id=str(uuid.uuid4()),
            model=model,
            provider=provider,
            environment=os.environ.get("APP_ENV", "production"),
            prompt_text=prompt_text,
            response_text=response_text,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
            latency_ms=latency_ms,
            cost_usd=cost,
            user_id=user_id,
            session_id=session_id,
            tags=tags or {},
            status=status,
            error_message=error_message,
            requested_at=datetime.now(timezone.utc).isoformat(),
        )

        self._flusher.enqueue(event)

        if cfg.debug:
            cost_str = f"${cost:.6f}" if cost is not None else "N/A"
            print(
                f"[LLM Monitor] Captured | model={model} provider={provider} "
                f"tokens={prompt_tokens}+{completion_tokens} "
                f"latency={latency_ms}ms cost={cost_str}"
            )

    def flush(self) -> None:
        """Manually flush queued events. Always call this in scripts."""
        if self._flusher:
            self._flusher.flush()
            if self._config and self._config.debug:
                print("[LLM Monitor] Flush complete")

    def shutdown(self) -> None:
        """Gracefully shutdown, flushing remaining events."""
        if self._flusher:
            self._flusher.shutdown()


# ─── Client wrappers ──────────────────────────────────────────────────────────

class OpenAIWrapper:
    """Transparent wrapper for OpenAI and Groq clients."""

    def __init__(self, client: Any, monitor: LLMMonitor):
        self._client = client
        self._monitor = monitor
        self.chat = ChatCompletionsWrapper(client.chat.completions, monitor)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._client, name)


class ChatCompletionsWrapper:
    def __init__(self, completions: Any, monitor: LLMMonitor):
        self._completions = completions
        self._monitor = monitor

    def create(self, model: str, messages: list, **kwargs) -> Any:
        user_id = kwargs.pop("user_id", None)
        session_id = kwargs.pop("session_id", None)
        tags = kwargs.pop("tags", None)

        start = time.time()
        error_msg = None
        response = None
        status = "success"

        try:
            response = self._completions.create(model=model, messages=messages, **kwargs)
        except Exception as e:
            status = "error"
            error_msg = str(e)
            raise
        finally:
            latency_ms = int((time.time() - start) * 1000)
            prompt_tokens = completion_tokens = 0
            response_text = None

            if response and hasattr(response, "usage"):
                prompt_tokens = response.usage.prompt_tokens or 0
                completion_tokens = response.usage.completion_tokens or 0
                if response.choices:
                    response_text = response.choices[0].message.content

            self._monitor._record(
                model=model, messages=messages, response_text=response_text,
                prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
                latency_ms=latency_ms, status=status, error_message=error_msg,
                user_id=user_id, session_id=session_id, tags=tags,
            )

        return response

    def __getattr__(self, name: str) -> Any:
        return getattr(self._completions, name)


class AnthropicWrapper:
    """Transparent wrapper around an Anthropic client."""

    def __init__(self, client: Any, monitor: LLMMonitor):
        self._client = client
        self._monitor = monitor
        self.messages = AnthropicMessagesWrapper(client.messages, monitor)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._client, name)


class AnthropicMessagesWrapper:
    def __init__(self, messages_api: Any, monitor: LLMMonitor):
        self._messages_api = messages_api
        self._monitor = monitor

    def create(self, model: str, messages: list, **kwargs) -> Any:
        user_id = kwargs.pop("user_id", None)
        session_id = kwargs.pop("session_id", None)
        tags = kwargs.pop("tags", None)

        start = time.time()
        error_msg = None
        response = None
        status = "success"

        try:
            response = self._messages_api.create(model=model, messages=messages, **kwargs)
        except Exception as e:
            status = "error"
            error_msg = str(e)
            raise
        finally:
            latency_ms = int((time.time() - start) * 1000)
            prompt_tokens = completion_tokens = 0
            response_text = None

            if response:
                prompt_tokens = response.usage.input_tokens or 0
                completion_tokens = response.usage.output_tokens or 0
                if response.content:
                    response_text = response.content[0].text

            self._monitor._record(
                model=model, messages=messages, response_text=response_text,
                prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
                latency_ms=latency_ms, status=status, error_message=error_msg,
                user_id=user_id, session_id=session_id, tags=tags,
            )

        return response

    def __getattr__(self, name: str) -> Any:
        return getattr(self._messages_api, name)
