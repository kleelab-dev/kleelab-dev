"""Payment provider webhook routes."""

from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Request, status
from sqlalchemy import select

from kleelab.core.database import AsyncSessionLocal
from kleelab.models.order import Order
from kleelab.services.stripe_service import handle_webhook


router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@router.post("/stripe")
async def stripe_webhook(request: Request, stripe_signature: str | None = Header(None)) -> dict[str, str]:
    """Verify and process Stripe payment events."""

    payload = await request.body()
    if not stripe_signature:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Stripe signature")
    try:
        event = handle_webhook(payload, stripe_signature)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Stripe webhook") from exc

    event_type = event.get("type")
    if event_type not in {"checkout.session.completed", "payment_intent.succeeded", "payment_intent.payment_failed"}:
        return {"status": "ignored"}

    event_object = event.get("data", {}).get("object", {})
    metadata = event_object.get("metadata", {})
    order_id = metadata.get("order_id")
    if not order_id:
        return {"status": "ignored"}

    try:
        order_uuid = UUID(order_id)
    except ValueError:
        return {"status": "ignored"}

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Order).where(Order.id == order_uuid))
        order = result.scalar_one_or_none()
        if order is None:
            return {"status": "ignored"}
        order.status = "paid" if event_type != "payment_intent.payment_failed" else "pending"
        order.stripe_payment_id = event_object.get("payment_intent") or event_object.get("id")
        await db.commit()

    return {"status": "processed"}