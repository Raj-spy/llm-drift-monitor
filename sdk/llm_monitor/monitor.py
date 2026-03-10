"""
Core LLM Monitor — wraps OpenAI and Anthropic calls transparently.
"""
import asyncio
import json
import logging
import queue
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Generator, Iterator, Optional

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
    """
    Background thread that batches and flushes events to the backend.
    Thread-safe, non-blocking for the caller.
    """
    def __init__(self, config: MonitorConfig):
        self.config = config
        self._queue: queue.Queue[RequestEvent] = queue.Queue(maxsize=config.max_queue_size)
        self._stop_event = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True, name="llm-monitor-flusher")
        self._http = httpx.Client(timeout=config.timeout_seconds)
        self._thread.start()

    def enqueue(self, event: RequestEvent) -> bool:
        """Add event to queue. Returns False if queue is full (event dropped)."""
        try:
            self._queue.put_nowait(event)
            return True
        except queue.Full:
            logger.warning("LLM Monitor: queue full, dropping event")
            return False

    def flush(self) -> None:
        """Force immediate flush of all queued events."""
        events = []
        while not self._queue.empty():
            try:
                events.append(self._queue.get_nowait())
            except queue.Empty:
                break
        if events:
            self._send_batch(events)

    def shutdown(self) -> None:
        """Gracefully stop the flusher, sending remaining events."""
        self._stop_event.set()
        self.flush()
        self._thread.join(timeout=10)
        self._http.close()

    def _run(self) -> None:
        """Main flusher loop."""
        batch: list[RequestEvent] = []
        last_flush = time.time()

        while not self._stop_event.is_set():
            # Collect events up to batch_size or flush_interval
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
        """Send a batch of events to the backend."""
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
            if resp.status_code != 200 and self.config.debug:
                print(f"[LLM Monitor] Backend returned {resp.status_code}: {resp.text}")
        except Exception as e:
            if self.config.debug:
                print(f"[LLM Monitor] Failed to send batch: {e}")


class LLMMonitor:
    """
    Main monitor class. Wraps LLM API calls to capture observability data.

    Usage:
        from llm_monitor import monitor

        # Configure once at startup
        monitor.configure(api_key="lmd_xxx", project_id="proj_yyy")

        # Use like the OpenAI client
        response = monitor.chat(model="gpt-4o", messages=[...])

        # Or wrap an existing OpenAI client
        client = monitor.wrap_openai(openai.OpenAI())
        response = client.chat.completions.create(model="gpt-4o", messages=[...])
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
        """
        Configure the monitor. Call this once at application startup.

        Args:
            api_key: Your LLM Monitor API key (lmd_xxx)
            project_id: Your project UUID
            backend_url: Override the backend URL (for self-hosting)
            **kwargs: Additional MonitorConfig fields
        """
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
        Make a chat completion call with automatic monitoring.
        Supports OpenAI and Anthropic models transparently.

        Args:
            model: Model name (e.g. "gpt-4o", "claude-3-5-sonnet-20241022")
            messages: List of message dicts [{"role": "user", "content": "..."}]
            user_id: Optional end-user ID for tracking
            session_id: Optional session/conversation ID
            tags: Optional dict of custom tags
            **kwargs: Additional args passed to the underlying API

        Returns:
            The raw API response (OpenAI or Anthropic format)
        """
        provider = get_provider(model)
        if provider == "openai":
            return self._openai_chat(model, messages, user_id=user_id,
                                     session_id=session_id, tags=tags, **kwargs)
        elif provider == "anthropic":
            return self._anthropic_chat(model, messages, user_id=user_id,
                                        session_id=session_id, tags=tags, **kwargs)
        else:
            raise ValueError(f"Unsupported provider for model '{model}'. "
                             f"Use wrap_openai() or wrap_anthropic() for custom models.")

    def _openai_chat(self, model: str, messages: list, **meta) -> Any:
        try:
            import openai
        except ImportError:
            raise ImportError("openai package required: pip install openai")

        client = openai.OpenAI()
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
            raise ImportError("anthropic package required: pip install anthropic")

        client = anthropic.Anthropic()
        user_id = meta.pop("user_id", None)
        session_id = meta.pop("session_id", None)
        tags = meta.pop("tags", None)
        max_tokens = meta.pop("max_tokens", 1024)

        # Convert OpenAI-style messages to Anthropic format if needed
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
            kwargs: dict = {"model": model, "max_tokens": max_tokens,
                            "messages": filtered_messages, **meta}
            if system_msg:
                kwargs["system"] = system_msg
            response = client.messages.create(**kwargs)
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
        """Wrap an existing OpenAI client for monitoring."""
        return OpenAIWrapper(client, self)

    def wrap_anthropic(self, client: Any) -> "AnthropicWrapper":
        """Wrap an existing Anthropic client for monitoring."""
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

        # Extract prompt text
        prompt_text = None
        if cfg.capture_prompt and messages:
            last_user_msg = next(
                (m["content"] for m in reversed(messages) if m.get("role") == "user"),
                None,
            )
            if last_user_msg:
                prompt_text = str(last_user_msg)[:cfg.max_prompt_chars]

        # Truncate response
        if response_text and cfg.capture_response:
            response_text = response_text[:cfg.max_response_chars]
        elif not cfg.capture_response:
            response_text = None

        cost = calculate_cost(model, prompt_tokens, completion_tokens)

        event = RequestEvent(
            id=str(uuid.uuid4()),
            project_id=cfg.project_id,
            request_id=str(uuid.uuid4()),
            model=model,
            provider=get_provider(model),
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
            print(
                f"[LLM Monitor] Captured: model={model} tokens={prompt_tokens}+{completion_tokens} "
                f"latency={latency_ms}ms cost=${cost:.6f}"
            )

    def flush(self) -> None:
        """Manually flush all queued events to the backend."""
        if self._flusher:
            self._flusher.flush()
            if self._config and self._config.debug:
                print("[LLM Monitor] Flush complete")

    def shutdown(self) -> None:
        """Gracefully shutdown, flushing remaining events."""
        if self._flusher:
            self._flusher.shutdown()


import os  # noqa: E402 (needed for os.environ in _record)


# ─── Client wrappers ──────────────────────────────────────────────────────────

class OpenAIWrapper:
    """Transparent wrapper around an OpenAI client that adds monitoring."""

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
    """Transparent wrapper around an Anthropic client that adds monitoring."""

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