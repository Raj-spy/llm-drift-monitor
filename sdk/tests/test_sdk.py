"""
SDK Tests.
Run: cd sdk && pytest tests/ -v
"""
import time
import threading
from unittest.mock import MagicMock, patch, call
import pytest

# ─── Config Tests ─────────────────────────────────────────────────────────────

def test_config_requires_api_key():
    from llm_monitor.config import MonitorConfig
    cfg = MonitorConfig(api_key="", project_id="proj-1")
    with pytest.raises(ValueError, match="API key"):
        cfg.validate()


def test_config_requires_project_id():
    from llm_monitor.config import MonitorConfig
    cfg = MonitorConfig(api_key="lmd_test", project_id="")
    with pytest.raises(ValueError, match="Project ID"):
        cfg.validate()


def test_config_from_env(monkeypatch):
    monkeypatch.setenv("LLM_MONITOR_API_KEY", "lmd_from_env")
    monkeypatch.setenv("LLM_MONITOR_PROJECT_ID", "proj_from_env")
    from llm_monitor.config import MonitorConfig
    cfg = MonitorConfig()
    assert cfg.api_key == "lmd_from_env"
    assert cfg.project_id == "proj_from_env"


# ─── Pricing Tests ────────────────────────────────────────────────────────────

def test_calculate_cost_gpt4o():
    from llm_monitor.pricing import calculate_cost
    cost = calculate_cost("gpt-4o", 1000, 500)
    assert cost == pytest.approx(0.0075, rel=1e-3)


def test_calculate_cost_alias():
    """Model aliases should resolve to canonical pricing."""
    from llm_monitor.pricing import calculate_cost
    cost_alias = calculate_cost("gpt-4o-2024-11-20", 1000, 500)
    cost_canon = calculate_cost("gpt-4o", 1000, 500)
    assert cost_alias == cost_canon


def test_calculate_cost_zero_tokens():
    from llm_monitor.pricing import calculate_cost
    cost = calculate_cost("gpt-4o", 0, 0)
    assert cost == 0.0


def test_calculate_cost_unknown_model():
    from llm_monitor.pricing import calculate_cost
    assert calculate_cost("unknown-model", 1000, 500) is None


def test_get_provider():
    from llm_monitor.pricing import get_provider
    assert get_provider("gpt-4o") == "openai"
    assert get_provider("claude-3-5-sonnet-20241022") == "anthropic"
    assert get_provider("gemini-1.5-pro") == "google"
    assert get_provider("o1") == "openai"


# ─── Monitor Configuration Tests ─────────────────────────────────────────────

def test_monitor_configure():
    from llm_monitor.monitor import LLMMonitor
    m = LLMMonitor()
    with patch.object(m, "_flusher", None):
        with patch("llm_monitor.monitor.BatchFlusher") as MockFlusher:
            MockFlusher.return_value = MagicMock()
            m.configure(api_key="lmd_test123", project_id="proj-abc")
            assert m._configured
            assert m.config.api_key == "lmd_test123"


def test_monitor_raises_if_not_configured():
    from llm_monitor.monitor import LLMMonitor
    m = LLMMonitor()
    with pytest.raises(RuntimeError, match="not configured"):
        _ = m.config


# ─── BatchFlusher Tests ───────────────────────────────────────────────────────

def test_batch_flusher_enqueue_and_flush():
    from llm_monitor.config import MonitorConfig
    from llm_monitor.monitor import BatchFlusher, RequestEvent
    import queue as q_mod

    cfg = MonitorConfig(api_key="lmd_test", project_id="proj-1", flush_interval=60.0)
    
    flusher = BatchFlusher.__new__(BatchFlusher)
    flusher.config = cfg
    flusher._queue = q_mod.Queue(maxsize=1000)
    flusher._stop_event = threading.Event()
    flusher._http = MagicMock()

    sent_batches = []
    def mock_send(events):
        sent_batches.append(events)
    flusher._send_batch = mock_send

    # Enqueue 3 events
    for i in range(3):
        e = RequestEvent(
            id=f"id-{i}", project_id="proj-1", request_id=f"req-{i}",
            model="gpt-4o", provider="openai", environment="test",
            prompt_text="hello", response_text="world",
            prompt_tokens=10, completion_tokens=5, total_tokens=15,
            latency_ms=100, cost_usd=0.0001, user_id=None, session_id=None,
            tags={}, status="success", error_message=None,
            requested_at="2025-01-01T00:00:00Z",
        )
        flusher.enqueue(e)

    assert flusher._queue.qsize() == 3
    flusher.flush()
    assert len(sent_batches) == 1
    assert len(sent_batches[0]) == 3


def test_batch_flusher_drops_when_full():
    from llm_monitor.config import MonitorConfig
    from llm_monitor.monitor import BatchFlusher, RequestEvent
    import queue as q_mod

    cfg = MonitorConfig(api_key="lmd_test", project_id="proj-1", max_queue_size=2)
    flusher = BatchFlusher.__new__(BatchFlusher)
    flusher.config = cfg
    flusher._queue = q_mod.Queue(maxsize=2)
    flusher._stop_event = threading.Event()
    flusher._http = MagicMock()

    def make_event(i):
        return RequestEvent(
            id=f"id-{i}", project_id="proj-1", request_id=f"req-{i}",
            model="gpt-4o", provider="openai", environment="test",
            prompt_text=None, response_text=None,
            prompt_tokens=0, completion_tokens=0, total_tokens=0,
            latency_ms=0, cost_usd=None, user_id=None, session_id=None,
            tags={}, status="success", error_message=None,
            requested_at="2025-01-01T00:00:00Z",
        )

    r1 = flusher.enqueue(make_event(1))
    r2 = flusher.enqueue(make_event(2))
    r3 = flusher.enqueue(make_event(3))   # should be dropped

    assert r1 is True
    assert r2 is True
    assert r3 is False  # dropped


# ─── OpenAI Wrapper Tests ─────────────────────────────────────────────────────

def test_wrap_openai_captures_metrics():
    from llm_monitor.monitor import LLMMonitor

    m = LLMMonitor()
    with patch("llm_monitor.monitor.BatchFlusher") as MockFlusher:
        mock_flusher = MagicMock()
        MockFlusher.return_value = mock_flusher
        m.configure(api_key="lmd_test", project_id="proj-1")

    # Mock OpenAI client
    mock_openai = MagicMock()
    mock_response = MagicMock()
    mock_response.usage.prompt_tokens = 50
    mock_response.usage.completion_tokens = 25
    mock_response.choices[0].message.content = "Hello!"
    mock_openai.chat.completions.create.return_value = mock_response

    wrapped = m.wrap_openai(mock_openai)
    result = wrapped.chat.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hi"}],
    )

    # Verify underlying API was called
    mock_openai.chat.completions.create.assert_called_once()

    # Verify event was enqueued
    mock_flusher.enqueue.assert_called_once()
    event = mock_flusher.enqueue.call_args[0][0]
    assert event.model == "gpt-4o"
    assert event.prompt_tokens == 50
    assert event.completion_tokens == 25
    assert event.total_tokens == 75
    assert event.cost_usd is not None
    assert event.latency_ms >= 0


def test_record_captures_error_status():
    from llm_monitor.monitor import LLMMonitor

    m = LLMMonitor()
    with patch("llm_monitor.monitor.BatchFlusher") as MockFlusher:
        mock_flusher = MagicMock()
        MockFlusher.return_value = mock_flusher
        m.configure(api_key="lmd_test", project_id="proj-1")

    mock_openai = MagicMock()
    mock_openai.chat.completions.create.side_effect = Exception("Rate limit exceeded")

    wrapped = m.wrap_openai(mock_openai)
    with pytest.raises(Exception, match="Rate limit"):
        wrapped.chat.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": "Hi"}],
        )

    # Error should still be captured
    mock_flusher.enqueue.assert_called_once()
    event = mock_flusher.enqueue.call_args[0][0]
    assert event.status == "error"
    assert "Rate limit" in event.error_message


def test_prompt_truncation():
    from llm_monitor.monitor import LLMMonitor

    m = LLMMonitor()
    with patch("llm_monitor.monitor.BatchFlusher") as MockFlusher:
        mock_flusher = MagicMock()
        MockFlusher.return_value = mock_flusher
        m.configure(
            api_key="lmd_test", project_id="proj-1",
            max_prompt_chars=10,
        )

    m._record(
        model="gpt-4o",
        messages=[{"role": "user", "content": "A" * 100}],
        response_text="response",
        prompt_tokens=10, completion_tokens=5,
        latency_ms=100, status="success",
    )

    event = mock_flusher.enqueue.call_args[0][0]
    assert len(event.prompt_text) == 10


def test_capture_disabled():
    from llm_monitor.monitor import LLMMonitor

    m = LLMMonitor()
    with patch("llm_monitor.monitor.BatchFlusher") as MockFlusher:
        mock_flusher = MagicMock()
        MockFlusher.return_value = mock_flusher
        m.configure(
            api_key="lmd_test", project_id="proj-1",
            capture_prompt=False,
            capture_response=False,
        )

    m._record(
        model="gpt-4o",
        messages=[{"role": "user", "content": "secret prompt"}],
        response_text="secret response",
        prompt_tokens=10, completion_tokens=5,
        latency_ms=100, status="success",
    )

    event = mock_flusher.enqueue.call_args[0][0]
    assert event.prompt_text is None
    assert event.response_text is None
