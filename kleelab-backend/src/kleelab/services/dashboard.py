from datetime import timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.time import utcnow
from kleelab.models.analytics import AnalyticsEvent
from kleelab.models.order import Order
from kleelab.models.page import Page
from kleelab.models.product import Product
from kleelab.models.site import Site


async def get_user_stats(user_id: UUID, db: AsyncSession) -> dict:
    site_ids = list((await db.execute(select(Site.id).where(Site.user_id == user_id))).scalars().all())
    if not site_ids:
        return {"site_count": 0, "page_count": 0, "product_count": 0, "order_count": 0, "total_revenue": 0.0, "monthly_views": 0}
    page_count = await db.scalar(select(func.count()).select_from(Page).where(Page.site_id.in_(site_ids)))
    product_count = await db.scalar(select(func.count()).select_from(Product).where(Product.site_id.in_(site_ids)))
    order_count = await db.scalar(select(func.count()).select_from(Order).where(Order.site_id.in_(site_ids)))
    revenue = await db.scalar(select(func.coalesce(func.sum(Order.total), 0)).where(Order.site_id.in_(site_ids), Order.status.in_(["paid", "shipped", "delivered"])))
    views = await db.scalar(select(func.count()).select_from(AnalyticsEvent).where(AnalyticsEvent.site_id.in_(site_ids), AnalyticsEvent.created_at >= utcnow() - timedelta(days=30)))
    return {"site_count": len(site_ids), "page_count": page_count or 0, "product_count": product_count or 0, "order_count": order_count or 0, "total_revenue": float(revenue or 0), "monthly_views": views or 0}


async def get_recent_activity(user_id: UUID, db: AsyncSession) -> list[dict]:
    return [{"type": "dashboard", "message": "Activity feed is ready"}]