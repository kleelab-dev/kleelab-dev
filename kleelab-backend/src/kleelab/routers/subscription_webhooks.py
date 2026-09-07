from datetime import datetime, timezone

import stripe
from fastapi import APIRouter, Header, HTTPException, Request
from sqlalchemy import select

from kleelab.core.config import settings
from kleelab.core.database import AsyncSessionLocal
from kleelab.models.subscription import Subscription

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])


@router.post("/webhook")
async def subscription_webhook(request: Request, stripe_signature: str | None = Header(None)):
    if not settings.STRIPE_WEBHOOK_SECRET or not stripe_signature:
        raise HTTPException(status_code=400, detail="Missing Stripe webhook configuration")
    try:
        event = stripe.Webhook.construct_event(await request.body(), stripe_signature, settings.STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.error.SignatureVerificationError) as exc:
        raise HTTPException(status_code=400, detail="Invalid Stripe webhook") from exc
    stripe_object = event.get("data", {}).get("object", {})
    metadata = stripe_object.get("metadata", {})
    user_id = metadata.get("user_id")
    if not user_id:
        return {"status": "ignored"}
    async with AsyncSessionLocal() as db:
        subscription = await db.scalar(select(Subscription).where(Subscription.user_id == user_id))
        if subscription is None:
            subscription = Subscription(user_id=user_id, plan=metadata.get("plan", "pro"))
            db.add(subscription)
        subscription.stripe_subscription_id = stripe_object.get("subscription") or stripe_object.get("id")
        subscription.status = "cancelled" if event["type"] == "customer.subscription.deleted" else "active"
        if stripe_object.get("current_period_end"):
            subscription.current_period_end = datetime.fromtimestamp(stripe_object["current_period_end"], timezone.utc)
        await db.commit()
    return {"status": "processed"}