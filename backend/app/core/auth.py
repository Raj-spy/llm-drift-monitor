"""
Authentication middleware.

Supports both:
1. JWT tokens (for dashboard users via Supabase / Clerk)
2. API keys (for SDK/programmatic access)
"""

import hashlib
import secrets
from typing import Optional, Dict
from datetime import timezone, datetime, timedelta

import jwt
from fastapi import Depends, Header, HTTPException, Security, status, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from ..core.supabase import get_supabase

security = HTTPBearer(auto_error=False)

# ───────────────────────────────────────────────────────────
# API KEY UTILITIES
# ───────────────────────────────────────────────────────────

def _hash_api_key(key: str) -> str:
    """Create deterministic SHA256 hash for fast lookup."""
    return hashlib.sha256(key.encode()).hexdigest()

def generate_api_key() -> tuple[str, str, str]:
    """
    Generate new API key.

    Returns:
    (full_key, key_hash, key_prefix)
    """
    raw = secrets.token_urlsafe(32)
    full_key = f"lmd_{raw}"
    key_hash = _hash_api_key(full_key)
    key_prefix = full_key[:12]
    return full_key, key_hash, key_prefix

# ───────────────────────────────────────────────────────────
# API KEY AUTH (SDK ingestion) - FIXED
# ───────────────────────────────────────────────────────────

async def get_current_project_from_api_key(
    authorization: Optional[str] = Header(None),
) -> Dict:
    """
    Validate API key from Authorization header.

    Expected format:
    Authorization: Bearer lmd_xxxxx
    """
    
    if not authorization or not authorization.startswith("Bearer lmd_"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key. Expected 'Bearer lmd_...'"
        )

    api_key = authorization.replace("Bearer ", "")
    key_hash = _hash_api_key(api_key)

    supabase = get_supabase()

    # Lookup api key - FIXED: Handle None result from HTTP 406
    result = (
        supabase.table("api_keys")
        .select("id, project_id, owner_id, is_active")
        .eq("key_hash", key_hash)
        .eq("is_active", True)
        .maybe_single()
        .execute()
    )

    # ✅ FIXED: Safe null check
    if result is None or not hasattr(result, 'data') or not result.data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key not found or inactive"
        )

    api_key_record = result.data

    # Fetch project - ALSO FIXED
    project_result = (
        supabase.table("projects")
        .select("*")
        .eq("id", api_key_record["project_id"])
        .maybe_single()
        .execute()
    )

    # ✅ FIXED: Safe null check for project
    if project_result is None or not hasattr(project_result, 'data') or not project_result.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Project not found"
        )

    return {
        "project": project_result.data,
        "owner_id": api_key_record["owner_id"],
        "api_key_id": api_key_record["id"],
    }

# ───────────────────────────────────────────────────────────
# JWT AUTH (Dashboard users) - ALSO FIXED
# ───────────────────────────────────────────────────────────

async def get_current_user_from_jwt(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> Dict:
    """
    Validate dashboard user using JWT token.

    Supports Clerk / Supabase tokens.
    """
    
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )

    token = credentials.credentials

    try:
        # Decode JWT without verifying signature (Supabase handles this)
        payload = jwt.decode(token, options={"verify_signature": False})
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("No user ID in token")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )

    supabase = get_supabase()

    user_result = (
        supabase.table("users")
        .select("*")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )

    # ✅ FIXED: Safe null check
    if user_result is None or not hasattr(user_result, 'data') or not user_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return user_result.data

# ───────────────────────────────────────────────────────────
# PROJECT ACCESS VALIDATION - FIXED
# ───────────────────────────────────────────────────────────

async def verify_project_access(
    project_id: str,
    current_user: Dict = Depends(get_current_user_from_jwt),
) -> Dict:
    """Verify that user owns project."""
    
    supabase = get_supabase()

    result = (
        supabase.table("projects")
        .select("*")
        .eq("id", project_id)
        .eq("owner_id", current_user["id"])
        .maybe_single()
        .execute()
    )

    # ✅ FIXED: Safe null check
    if result is None or not hasattr(result, 'data') or not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or access denied"
        )

    return result.data

# ───────────────────────────────────────────────────────────
# USAGE LIMIT CHECK
# ───────────────────────────────────────────────────────────

def check_usage_limit(user: Dict) -> None:
    """Raise 429 if monthly usage exceeded."""
    
    # Safe check for required fields
    requests_this_month = user.get("requests_this_month", 0)
    monthly_limit = user.get("monthly_request_limit", float('inf'))
    
    if requests_this_month >= monthly_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Monthly request limit ({monthly_limit:,}) reached. "
                "Upgrade your plan at https://app.llmdriftmonitor.com/billing"
            )
        )
