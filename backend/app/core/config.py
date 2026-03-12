"""Application settings loaded from environment variables."""
from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # ── Supabase ─────────────────────────────────────────────────────
    supabase_url: str
    supabase_service_key: str          # Service role key (bypasses RLS)
    supabase_anon_key: str             # Anon key for client-side operations

    # ── App ──────────────────────────────────────────────────────────
    app_env: str = "development"
    secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    backend_cors_origins: list[str] = ["http://localhost:3000", "https://app.llmdriftmonitor.com"]

    # ── LLM Providers (for drift evaluation) ─────────────────────────
    anthropic_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    groq_api_key: Optional[str] = None  # Groq — llama, mixtral, gemma models

    # ── Alerting ─────────────────────────────────────────────────────
    sendgrid_api_key: Optional[str] = None
    sendgrid_from_email: str = "alerts@llmdriftmonitor.com"

    # ── Redis (for rate limiting & job queuing) ───────────────────────
    redis_url: str = "redis://localhost:6379"

    # ── Feature flags ────────────────────────────────────────────────
    enable_drift_scheduler: bool = True
    drift_scheduler_interval_hours: int = 24

    # ── Stripe ───────────────────────────────────────────────────────
    stripe_secret_key: Optional[str] = None
    stripe_webhook_secret: Optional[str] = None
    stripe_starter_price_id: Optional[str] = None
    stripe_growth_price_id: Optional[str] = None
    stripe_scale_price_id: Optional[str] = None

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]