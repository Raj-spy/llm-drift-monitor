"""
Backend tests.
Run: cd backend && pytest tests/ -v
"""
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

# ─── Cost Service Tests ───────────────────────────────────────────────────────

def test_estimate_cost_gpt4o():
    from app.services.cost_service import estimate_cost
    cost = estimate_cost("gpt-4o", prompt_tokens=1000, completion_tokens=500)
    # 1000 * 2.50/1M + 500 * 10.00/1M = 0.0025 + 0.005 = 0.0075
    assert cost == pytest.approx(0.0075, rel=1e-3)


def test_estimate_cost_claude_haiku():
    from app.services.cost_service import estimate_cost
    cost = estimate_cost("claude-3-5-haiku-20241022", prompt_tokens=10_000, completion_tokens=2_000)
    # 10000 * 0.80/1M + 2000 * 4.00/1M = 0.008 + 0.008 = 0.016
    assert cost == pytest.approx(0.016, rel=1e-3)


def test_estimate_cost_unknown_model():
    from app.services.cost_service import estimate_cost
    cost = estimate_cost("unknown-model-xyz", prompt_tokens=1000, completion_tokens=500)
    assert cost is None


def test_get_supported_models():
    from app.services.cost_service import get_supported_models
    models = get_supported_models()
    assert len(models) > 5
    assert all("model" in m and "provider" in m for m in models)


# ─── Pricing Tests ────────────────────────────────────────────────────────────

def test_sdk_pricing_calculate():
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../sdk"))
    from llm_monitor.pricing import calculate_cost, get_provider

    cost = calculate_cost("gpt-4o", 2000, 1000)
    assert cost is not None
    assert cost > 0

    provider = get_provider("claude-3-5-sonnet-20241022")
    assert provider == "anthropic"

    provider = get_provider("gpt-4o")
    assert provider == "openai"


# ─── Auth Tests ───────────────────────────────────────────────────────────────

def test_generate_api_key():
    from app.core.auth import generate_api_key, _hash_api_key
    full_key, key_hash, key_prefix = generate_api_key()

    assert full_key.startswith("lmd_")
    assert len(full_key) > 20
    assert key_hash == _hash_api_key(full_key)
    assert full_key.startswith(key_prefix)
    assert len(key_prefix) == 12


def test_api_key_hash_deterministic():
    from app.core.auth import _hash_api_key
    key = "lmd_testkey123"
    assert _hash_api_key(key) == _hash_api_key(key)
    assert _hash_api_key("lmd_key1") != _hash_api_key("lmd_key2")


# ─── Schema Tests ─────────────────────────────────────────────────────────────

def test_ingest_event_validation():
    from app.models.schemas import IngestEvent
    event = IngestEvent(
        id="test-id",
        project_id="proj-1",
        model="gpt-4o",
        provider="openai",
        requested_at="2025-01-01T00:00:00Z",
        prompt_tokens=100,
        completion_tokens=50,
    )
    assert event.total_tokens == 150
    assert event.status == "success"


def test_ingest_batch_max_size():
    from app.models.schemas import IngestBatchRequest, IngestEvent
    import pytest

    events = [
        IngestEvent(
            id=f"id-{i}",
            project_id="proj",
            model="gpt-4o",
            provider="openai",
            requested_at="2025-01-01T00:00:00Z",
        )
        for i in range(501)  # over limit
    ]
    with pytest.raises(Exception):
        IngestBatchRequest(events=events)


def test_project_create_validation():
    from app.models.schemas import ProjectCreate
    import pytest

    with pytest.raises(Exception):
        ProjectCreate(name="")   # min_length=1

    p = ProjectCreate(name="My Project")
    assert p.environment == "production"
    assert p.cost_alert_threshold_pct == 30.0


# ─── Billing Tests ────────────────────────────────────────────────────────────

def test_plan_limits():
    from app.core.billing import get_plan_limits
    starter = get_plan_limits("starter")
    scale = get_plan_limits("scale")

    assert starter["monthly_requests"] == 50_000
    assert starter["projects"] == 2
    assert scale["monthly_requests"] == -1   # unlimited


def test_unknown_plan_defaults_to_starter():
    from app.core.billing import get_plan_limits
    limits = get_plan_limits("nonexistent_plan")
    assert limits["monthly_requests"] == 50_000


# ─── API Integration Tests (with mocked Supabase) ────────────────────────────

@pytest.fixture
def mock_supabase(monkeypatch):
    mock = MagicMock()
    monkeypatch.setattr("app.core.supabase.get_supabase", lambda: mock)
    return mock


def test_health_endpoint():
    """Test health check without full app startup."""
    import os
    os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
    os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-key")
    os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")

    with patch("app.core.supabase.get_supabase"):
        from app.main import app
        client = TestClient(app)
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"
