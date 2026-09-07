from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.database import get_db
from kleelab.core.security import get_current_user
from kleelab.models.subscription import Subscription
from kleelab.models.user import User
from kleelab.schemas.subscription import SubscriptionCreate, SubscriptionOut
from kleelab.services.stripe_subscription import create_subscription_checkout

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])


@router.post("", response_model=dict)
async def create_subscription(data: SubscriptionCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if data.plan.value == "free":
        subscription = await db.scalar(select(Subscription).where(Subscription.user_id == user.id))
        if subscription:
            subscription.plan = "free"
        else:
            db.add(Subscription(user_id=user.id, plan="free", status="active"))
        await db.commit()
        return {"status": "active", "plan": "free"}
    try:
        return {"checkout_url": create_subscription_checkout(user.id, data.plan.value), "plan": data.plan.value}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/current", response_model=SubscriptionOut | None)
async def current_subscription(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await db.scalar(select(Subscription).where(Subscription.user_id == user.id))


@router.put("/cancel")
async def cancel_subscription(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    subscription = await db.scalar(select(Subscription).where(Subscription.user_id == user.id))
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
    subscription.status = "cancelled"
    await db.commit()
    return {"status": "cancelled"}