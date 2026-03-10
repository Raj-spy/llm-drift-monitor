"""Supabase client setup."""
from functools import lru_cache

from supabase import Client, create_client

from .config import get_settings


@lru_cache
def get_supabase() -> Client:
    """Return a cached Supabase service-role client."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_key)
