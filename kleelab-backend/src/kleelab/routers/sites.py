"""Site CRUD and publishing API routes."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.database import get_db
from kleelab.core.feature_gate import require_feature
from kleelab.core.security import get_current_user
from kleelab.models.site import Site
from kleelab.models.user import User
from kleelab.schemas.site import SiteCreate, SiteOut, SiteUpdate
from kleelab.services.renderer import generate_static_site


router = APIRouter(prefix="/api/sites", tags=["sites"])


async def get_owned_site(
    site_id: UUID, current_user: User, db: AsyncSession
) -> Site:
    """Fetch a site only when it belongs to the authenticated user."""

    result = await db.execute(
        select(Site).where(Site.id == site_id, Site.user_id == current_user.id)
    )
    site = result.scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    return site


async def ensure_subdomain_available(
    subdomain: str | None, db: AsyncSession, site_id: UUID | None = None
) -> None:
    """Reject a subdomain already assigned to another site."""

    if subdomain is None:
        return

    query = select(Site).where(Site.subdomain == subdomain)
    if site_id is not None:
        query = query.where(Site.id != site_id)
    result = await db.execute(query)
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subdomain already in use",
        )


@router.get("", response_model=list[SiteOut])
@router.get("/", response_model=list[SiteOut], include_in_schema=False)
async def list_sites(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Site]:
    """List only sites owned by the authenticated user."""

    result = await db.execute(select(Site).where(Site.user_id == current_user.id))
    return list(result.scalars().all())


@router.post("", response_model=SiteOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=SiteOut, include_in_schema=False)
async def create_site(
    site_data: SiteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Site:
    """Create a site owned by the authenticated user."""

    await ensure_subdomain_available(site_data.subdomain, db)
    site = Site(
        user_id=current_user.id,
        name=site_data.name,
        subdomain=site_data.subdomain,
        template_id=site_data.template_id,
    )
    db.add(site)
    await db.commit()
    await db.refresh(site)
    return site


@router.get("/{site_id}", response_model=SiteOut)
async def get_site(
    site_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Site:
    """Get one site owned by the authenticated user."""

    return await get_owned_site(site_id, current_user, db)


@router.put("/{site_id}", response_model=SiteOut)
async def update_site(
    site_id: UUID,
    site_data: SiteUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Site:
    """Update one site owned by the authenticated user."""

    site = await get_owned_site(site_id, current_user, db)
    updates = site_data.model_dump(exclude_unset=True)
    if "subdomain" in updates:
        await ensure_subdomain_available(updates["subdomain"], db, site.id)
    for field, value in updates.items():
        setattr(site, field, value)
    await db.commit()
    await db.refresh(site)
    return site


@router.delete("/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_site(
    site_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete one site owned by the authenticated user."""

    site = await get_owned_site(site_id, current_user, db)
    await db.delete(site)
    await db.commit()


@router.post("/{site_id}/publish")
async def publish_site(
    site_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str | bool]:
    """Publish one site owned by the authenticated user after email verification."""

    if not current_user.is_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email verification required before publishing")
    site = await get_owned_site(site_id, current_user, db)
    site.is_published = True
    site.published_at = datetime.now(timezone.utc)
    result = await generate_static_site(site.id, db)
    await db.commit()
    return {"message": "Site published", "url": result["url"]}


@router.put(
    "/{site_id}/domain",
    response_model=SiteOut,
    dependencies=[Depends(require_feature("custom_domain"))],
)
async def set_custom_domain(
    site_id: UUID,
    custom_domain: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Site:
    """Set a custom domain; DNS verification remains a deployment stub."""

    site = await get_owned_site(site_id, current_user, db)
    site.custom_domain = custom_domain.strip().lower()
    await db.commit()
    await db.refresh(site)
    return site


@router.post("/{site_id}/unpublish")
async def unpublish_site(
    site_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool | str]:
    """Unpublish one site owned by the authenticated user."""

    site = await get_owned_site(site_id, current_user, db)
    site.is_published = False
    site.published_at = None
    await db.commit()
    return {"message": "Site unpublished successfully", "is_published": False}