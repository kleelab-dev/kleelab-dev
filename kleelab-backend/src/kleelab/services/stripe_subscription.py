from uuid import UUID

import stripe

from kleelab.core.config import settings


def create_subscription_checkout(user_id: UUID, plan: str) -> str:
    if not settings.STRIPE_SECRET_KEY:
        raise RuntimeError("STRIPE_SECRET_KEY is not configured")
    price = settings.STRIPE_PRICE_PRO if plan == "pro" else settings.STRIPE_PRICE_BUSINESS
    if not price:
        raise RuntimeError("Stripe price is not configured")
    stripe.api_key = settings.STRIPE_SECRET_KEY
    session = stripe.checkout.Session.create(mode="subscription", line_items=[{"price": price, "quantity": 1}], metadata={"user_id": str(user_id), "plan": plan})
    return session.url