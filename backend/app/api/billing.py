"""
Stripe billing integration.
Handles:
  - Checkout session creation (upgrade flow)
  - Webhook events (subscription lifecycle)
  - Customer portal (manage billing)
"""
import logging
from typing import Optional

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel

from ..core.auth import get_current_user_from_jwt
from ..core.config import get_settings
from ..core.supabase import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["Billing"])

PLAN_PRICE_IDS = {
    "starter": "starter",   # resolved from settings at runtime
    "growth": "growth",
    "scale": "scale",
}

TIER_LIMITS = {
    "starter": 50_000,
    "growth": 100_000,
    "scale": -1,
    "enterprise": -1,
}


def get_stripe():
    settings = get_settings()
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Billing not configured")
    stripe.api_key = settings.stripe_secret_key
    return stripe


# ─── Models ───────────────────────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    plan: str                           # "starter" | "growth" | "scale"
    success_url: str = "https://app.llmdriftmonitor.com/billing/success"
    cancel_url: str = "https://app.llmdriftmonitor.com/billing"


class PortalRequest(BaseModel):
    return_url: str = "https://app.llmdriftmonitor.com/billing"


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/checkout")
async def create_checkout_session(
    body: CheckoutRequest,
    current_user: dict = Depends(get_current_user_from_jwt),
):
    """Create a Stripe Checkout session for plan upgrade."""
    s = get_stripe()
    settings = get_settings()

    price_id_map = {
        "starter": settings.stripe_starter_price_id,
        "growth": settings.stripe_growth_price_id,
        "scale": settings.stripe_scale_price_id,
    }
    price_id = price_id_map.get(body.plan)
    if not price_id:
        raise HTTPException(status_code=400, detail=f"Unknown plan: {body.plan}")

    # Get or create Stripe customer
    customer_id = current_user.get("stripe_customer_id")
    if not customer_id:
        customer = s.Customer.create(
            email=current_user["email"],
            name=current_user.get("full_name"),
            metadata={"user_id": current_user["id"]},
        )
        customer_id = customer.id
        get_supabase().table("users").update(
            {"stripe_customer_id": customer_id}
        ).eq("id", current_user["id"]).execute()

    session = s.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        mode="subscription",
        success_url=body.success_url + "?session_id={CHECKOUT_SESSION_ID}",
        cancel_url=body.cancel_url,
        allow_promotion_codes=True,
        metadata={"user_id": current_user["id"], "plan": body.plan},
    )
    return {"checkout_url": session.url}


@router.post("/portal")
async def create_customer_portal(
    body: PortalRequest,
    current_user: dict = Depends(get_current_user_from_jwt),
):
    """Create a Stripe Customer Portal session for managing subscription."""
    s = get_stripe()
    customer_id = current_user.get("stripe_customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="No billing account found")

    session = s.billing_portal.Session.create(
        customer=customer_id,
        return_url=body.return_url,
    )
    return {"portal_url": session.url}


@router.get("/subscription")
async def get_subscription(current_user: dict = Depends(get_current_user_from_jwt)):
    """Get current subscription details."""
    limits = TIER_LIMITS.get(current_user["subscription_tier"], 50_000)
    return {
        "tier": current_user["subscription_tier"],
        "status": current_user["subscription_status"],
        "monthly_request_limit": current_user["monthly_request_limit"],
        "requests_this_month": current_user.get("requests_this_month", 0),
        "limit_display": "Unlimited" if limits == -1 else f"{limits:,}",
    }


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(request: Request, stripe_signature: str = Header(None)):
    """
    Handle Stripe webhook events.
    Configure in Stripe Dashboard → Webhooks → Add endpoint.
    Events: customer.subscription.updated, customer.subscription.deleted
    """
    settings = get_settings()
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="Webhook not configured")

    payload = await request.body()
    s = get_stripe()

    try:
        event = s.Webhook.construct_event(
            payload, stripe_signature, settings.stripe_webhook_secret
        )
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    supabase = get_supabase()

    if event["type"] in ("customer.subscription.updated", "customer.subscription.created"):
        sub = event["data"]["object"]
        customer_id = sub["customer"]
        new_status = sub["status"]

        # Determine plan tier from price ID
        price_id = sub["items"]["data"][0]["price"]["id"]
        tier = _price_id_to_tier(price_id, settings)

        user_result = (
            supabase.table("users")
            .select("id")
            .eq("stripe_customer_id", customer_id)
            .maybe_single()
            .execute()
        )
        if user_result.data:
            limit = TIER_LIMITS.get(tier, 50_000)
            supabase.table("users").update({
                "subscription_tier": tier,
                "subscription_status": new_status,
                "stripe_subscription_id": sub["id"],
                "monthly_request_limit": limit if limit != -1 else 999_999_999,
            }).eq("id", user_result.data["id"]).execute()
            logger.info(f"User {user_result.data['id']} upgraded to {tier} ({new_status})")

    elif event["type"] == "customer.subscription.deleted":
        sub = event["data"]["object"]
        customer_id = sub["customer"]
        user_result = (
            supabase.table("users")
            .select("id")
            .eq("stripe_customer_id", customer_id)
            .maybe_single()
            .execute()
        )
        if user_result.data:
            supabase.table("users").update({
                "subscription_tier": "starter",
                "subscription_status": "cancelled",
                "monthly_request_limit": 50_000,
            }).eq("id", user_result.data["id"]).execute()
            logger.info(f"Subscription cancelled for user {user_result.data['id']}")

    return {"received": True}


def _price_id_to_tier(price_id: str, settings) -> str:
    mapping = {
        getattr(settings, "stripe_starter_price_id", ""): "starter",
        getattr(settings, "stripe_growth_price_id", ""): "growth",
        getattr(settings, "stripe_scale_price_id", ""): "scale",
    }
    return mapping.get(price_id, "starter")
