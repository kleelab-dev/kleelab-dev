from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.models.agency_lead import AgencyLead
from kleelab.models.subscription import Subscription
from kleelab.models.user import User

FEATURE_PLANS = {"custom_domain": "pro", "advanced_analytics": "pro", "agency_support": "business"}
PLAN_RANK = {"free": 0, "pro": 1, "business": 2}


async def check_feature_access(feature: str, user_id: UUID, db: AsyncSession) -> dict:
    required = FEATURE_PLANS.get(feature, "free")
    subscription = await db.scalar(select(Subscription).where(Subscription.user_id == user_id))
    plan = subscription.plan if subscription and subscription.status == "active" else "free"
    allowed = PLAN_RANK.get(plan, 0) >= PLAN_RANK[required]
    return {"has_access": allowed, "message": "Feature available" if allowed else f"Upgrade to {required}", "cta": "Upgrade plan", "contact_url": "/api/upsell/contact"}


async def create_agency_lead(user: User, feature: str, message: str | None, db: AsyncSession) -> AgencyLead:
    lead = AgencyLead(user_id=user.id, email=user.email, name=user.full_name, feature_requested=feature, message=message)
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    return lead