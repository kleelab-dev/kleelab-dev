from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.database import get_db
from kleelab.core.security import get_current_user
from kleelab.models.user import User
from kleelab.services.gdpr import delete_user_data, export_user_data

router = APIRouter(prefix="/api/users/me", tags=["gdpr"])


@router.get("/export")
async def export_data(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await export_user_data(user.id, db)


@router.delete("")
async def delete_account(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await delete_user_data(user.id, db)
    return {"status": "deleted"}


@router.post("/request-deletion")
async def request_deletion(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    user.deletion_requested_at = datetime.now(timezone.utc)
    await db.commit()
    return {"status": "requested", "requested_at": user.deletion_requested_at.isoformat(), "grace_period_days": 30}