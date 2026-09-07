from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.database import get_db
from kleelab.core.security import get_current_user
from kleelab.models.user import User
from kleelab.services.upsell import check_feature_access, create_agency_lead

router = APIRouter(prefix="/api/upsell", tags=["upsell"])


class LeadRequest(BaseModel):
    feature: str
    message: str | None = None


@router.get("/check")
async def check(feature: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await check_feature_access(feature, user.id, db)


@router.post("/contact")
async def contact(data: LeadRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    lead = await create_agency_lead(user, data.feature, data.message, db)
    return {"id": lead.id, "status": lead.status}