"""Site media uploads, backed by Cloudinary."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from kleelab.core.config import settings
from kleelab.core.database import get_db
from kleelab.core.security import get_current_user
from kleelab.models.asset import Asset
from kleelab.models.site import Site
from kleelab.models.user import User
from kleelab.schemas.asset import AssetOut, AssetUpload
from kleelab.services import storage


router = APIRouter(prefix="/api/sites/{site_id}/assets", tags=["assets"])


async def verify_site_ownership(site_id: UUID, current_user: User, db: AsyncSession) -> Site:
    site = await db.scalar(
        select(Site).where(Site.id == site_id, Site.user_id == current_user.id)
    )
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    return site


@router.get("", response_model=list[AssetOut])
@router.get("/", response_model=list[AssetOut], include_in_schema=False)
async def list_assets(
    site_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Asset]:
    await verify_site_ownership(site_id, current_user, db)
    result = await db.execute(
        select(Asset).where(Asset.site_id == site_id).order_by(Asset.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=AssetOut, include_in_schema=False)
async def upload_asset(
    site_id: UUID,
    payload: AssetUpload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Asset:
    await verify_site_ownership(site_id, current_user, db)

    try:
        data, content_type = storage.decode_data_url(payload.data)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error

    if content_type not in storage.ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported image type '{content_type}'.",
        )

    if len(data) > settings.MAX_UPLOAD_BYTES:
        limit_mb = settings.MAX_UPLOAD_BYTES // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image is larger than {limit_mb}MB.",
        )

    try:
        result = await run_in_threadpool(storage.upload_image, data, content_type)
    except storage.StorageNotConfigured as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)
        ) from error
    except storage.StorageUploadFailed as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)
        ) from error

    url = result.get("secure_url") or result.get("url")
    if not url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The media provider did not return an image URL.",
        )

    asset = Asset(
        site_id=site_id,
        user_id=current_user.id,
        filename=payload.filename[:255],
        file_type=content_type,
        file_size=len(data),
        url=url,
        public_id=(result.get("public_id") or None),
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return asset


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(
    site_id: UUID,
    asset_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await verify_site_ownership(site_id, current_user, db)
    asset = await db.scalar(select(Asset).where(Asset.id == asset_id, Asset.site_id == site_id))
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    # Read the identifier before the row goes away, then reclaim the remote file
    # after the database agrees the asset is gone.
    public_id = asset.public_id
    await db.delete(asset)
    await db.commit()

    await storage.destroy_images([public_id])
