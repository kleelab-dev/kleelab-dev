from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.database import get_db
from kleelab.core.security import get_current_user
from kleelab.models.asset import Asset
from kleelab.models.site import Site
from kleelab.models.user import User
from kleelab.schemas.asset import AssetOut
from kleelab.services.upload import delete_asset, upload_file

router = APIRouter(tags=["assets"])


async def owned_asset(asset_id: UUID, user: User, db: AsyncSession) -> Asset:
    result = await db.execute(select(Asset).where(Asset.id == asset_id, Asset.user_id == user.id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@router.post("/api/sites/{site_id}/assets", response_model=AssetOut, status_code=201)
async def create_asset(site_id: UUID, file: UploadFile = File(...), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    site = await db.scalar(select(Site).where(Site.id == site_id, Site.user_id == user.id))
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    try:
        return await upload_file(file, site_id, user.id, db)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/api/sites/{site_id}/assets", response_model=list[AssetOut])
async def list_assets(site_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not await db.scalar(select(Site).where(Site.id == site_id, Site.user_id == user.id)):
        raise HTTPException(status_code=404, detail="Site not found")
    return list((await db.execute(select(Asset).where(Asset.site_id == site_id, Asset.user_id == user.id))).scalars().all())


@router.get("/api/assets/{asset_id}", response_model=AssetOut)
async def get_asset(asset_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await owned_asset(asset_id, user, db)


@router.delete("/api/assets/{asset_id}", status_code=204)
async def remove_asset(asset_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await delete_asset(await owned_asset(asset_id, user, db), db)
