from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.database import get_db
from kleelab.core.security import get_current_user
from kleelab.models.user import User
from kleelab.services.dashboard import get_recent_activity, get_user_stats

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
async def stats(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await get_user_stats(user.id, db)


@router.get("/recent-activity")
async def recent_activity(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await get_recent_activity(user.id, db)


@router.get("/chart-data")
async def chart_data(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return {"views_over_time": [], "revenue_over_time": []}