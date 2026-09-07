"""Stripe checkout and webhook integration."""

from uuid import UUID

import stripe

from kleelab.core.config import settings


def _configure_stripe() -> None:
    if not settings.STRIPE_SECRET_KEY:
        raise RuntimeError("STRIPE_SECRET_KEY is not configured")
    stripe.api_key = settings.STRIPE_SECRET_KEY


def create_checkout_session(order_id: UUID, site_id: UUID, total: float) -> str:
    """Create a Stripe-hosted checkout session and return its URL."""

    _configure_stripe()
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[
            {
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": f"KleeLab order {order_id}"},
                    "unit_amount": round(total * 100),
                },
                "quantity": 1,
            }
        ],
        metadata={"order_id": str(order_id), "site_id": str(site_id)},
    )
    return session.url


def handle_webhook(payload: bytes, signature: str) -> dict:
    """Verify a Stripe webhook payload and return the parsed event."""

    if not settings.STRIPE_WEBHOOK_SECRET:
        raise RuntimeError("STRIPE_WEBHOOK_SECRET is not configured")
    return stripe.Webhook.construct_event(payload, signature, settings.STRIPE_WEBHOOK_SECRET)