from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.models.analytics import AnalyticsEvent


async def get_site_stats(site_id: UUID, db: AsyncSession, days: int = 30) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    events = list((await db.execute(select(AnalyticsEvent).where(AnalyticsEvent.site_id == site_id, AnalyticsEvent.created_at >= since))).scalars().all())
    daily = await db.execute(select(func.date(AnalyticsEvent.created_at), func.count()).where(AnalyticsEvent.site_id == site_id, AnalyticsEvent.created_at >= since).group_by(func.date(AnalyticsEvent.created_at)).order_by(func.date(AnalyticsEvent.created_at)))
    top_pages = await db.execute(select(AnalyticsEvent.path, func.count()).where(AnalyticsEvent.site_id == site_id, AnalyticsEvent.created_at >= since).group_by(AnalyticsEvent.path).order_by(func.count().desc()).limit(10))
    return {"total_views": len(events), "unique_visitors": len({event.visitor_id for event in events if event.visitor_id}), "top_pages": [{"path": path, "views": count} for path, count in top_pages.all()], "referers": {}, "views_by_day": [{"date": str(day), "views": count} for day, count in daily.all()]}