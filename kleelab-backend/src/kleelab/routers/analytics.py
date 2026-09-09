from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.database import get_db
from kleelab.core.security import get_current_user
from kleelab.models.analytics import AnalyticsEvent
from kleelab.models.site import Site
from kleelab.models.user import User
from kleelab.services.analytics import get_site_stats

router = APIRouter(prefix="/api/sites/{site_id}", tags=["analytics"])


class TrackEvent(BaseModel):
    path: str
    visitor_id: str | None = None
    page_id: UUID | None = None
    event_type: str = "page_view"


@router.post("/track", status_code=201)
async def track(site_id: UUID, event: TrackEvent, request: Request, db: AsyncSession = Depends(get_db)):
    if not await db.scalar(select(Site.id).where(Site.id == site_id)):
        raise HTTPException(status_code=404, detail="Site not found")
    record = AnalyticsEvent(site_id=site_id, page_id=event.page_id, visitor_id=event.visitor_id, path=event.path, event_type=event.event_type, ip_address=request.client.host if request.client else None, user_agent=request.headers.get("user-agent"), referer=request.headers.get("referer"))
    db.add(record)
    await db.commit()
    return {"status": "tracked"}


@router.get("/analytics")
async def analytics(site_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not await db.scalar(select(Site.id).where(Site.id == site_id, Site.user_id == user.id)):
        raise HTTPException(status_code=404, detail="Site not found")
    return await get_site_stats(site_id, db)


@router.get("/analytics/realtime")
async def realtime(site_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not await db.scalar(select(Site.id).where(Site.id == site_id, Site.user_id == user.id)):
        raise HTTPException(status_code=404, detail="Site not found")
    return {"active_visitors": 0, "status": "stub"}