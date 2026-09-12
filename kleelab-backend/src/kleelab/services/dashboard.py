from datetime import datetime, time, timedelta
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


async def get_recent_activity(user_id: UUID, db: AsyncSession, limit: int = 8) -> list[dict]:
    """The newest things that happened across this user's sites.

    Assembled from orders, publication and page edits rather than a single events
    table, because no such table exists - each of those already carries its own
    timestamp, so the feed is derived from what is really there instead of a
    parallel log that could drift from it.
    """

    sites = (
        await db.execute(
            select(
                Site.id, Site.name, Site.subdomain, Site.published_at, Site.created_at
            ).where(Site.user_id == user_id)
        )
    ).all()
    if not sites:
        return []

    site_names = {row.id: row.name for row in sites}
    site_ids = list(site_names)

    events: list[dict] = []

    orders = (
        (
            await db.execute(
                select(Order)
                .where(Order.site_id.in_(site_ids))
                .order_by(Order.created_at.desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    for order in orders:
        events.append(
            {
                "type": "order_received",
                "title": f"Order from {order.customer_email}",
                "description": site_names.get(order.site_id, "Site"),
                # Returned as numbers so the frontend formats them; the API has
                # no business guessing at currency symbols or locale.
                "amount": float(order.total),
                "currency": order.currency,
                "timestamp": order.created_at.isoformat(),
            }
        )

    published = sorted(
        (row for row in sites if row.published_at),
        key=lambda row: row.published_at,
        reverse=True,
    )
    for row in published[:limit]:
        events.append(
            {
                "type": "site_published",
                "title": f"{row.name} published",
                "description": f"{row.subdomain}.kleelab.com" if row.subdomain else "No subdomain yet",
                "timestamp": row.published_at.isoformat(),
            }
        )

    pages = (
        await db.execute(
            select(Page.title, Page.updated_at, Page.site_id)
            .where(Page.site_id.in_(site_ids))
            .order_by(Page.updated_at.desc())
            .limit(limit)
        )
    ).all()
    for page in pages:
        if not page.updated_at:
            continue
        events.append(
            {
                "type": "page_updated",
                "title": f"{page.title} edited",
                "description": site_names.get(page.site_id, "Site"),
                "timestamp": page.updated_at.isoformat(),
            }
        )

    events.sort(key=lambda event: event["timestamp"], reverse=True)
    return events[:limit]


async def get_order_series(user_id: UUID, db: AsyncSession, days: int = 30) -> dict:
    """Orders and revenue per day, for the last `days` days.

    Every day in the window is present even when nothing happened, so the chart
    shows a flat line rather than silently skipping quiet days and compressing
    the timeline.
    """

    site_ids = list(
        (await db.execute(select(Site.id).where(Site.user_id == user_id))).scalars().all()
    )

    today = utcnow().date()
    start = today - timedelta(days=days - 1)
    buckets: dict[str, dict[str, float]] = {
        (start + timedelta(days=offset)).isoformat(): {"orders": 0, "revenue": 0.0}
        for offset in range(days)
    }

    if site_ids:
        orders = (
            await db.execute(
                select(Order.created_at, Order.total).where(
                    Order.site_id.in_(site_ids),
                    Order.created_at >= datetime.combine(start, time.min),
                )
            )
        ).all()
        for order in orders:
            key = order.created_at.date().isoformat()
            if key in buckets:
                buckets[key]["orders"] += 1
                buckets[key]["revenue"] += float(order.total)

    return {"days": [{"date": key, **values} for key, values in buckets.items()]}