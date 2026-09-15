"""Site CRUD and publishing API routes."""

from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.config import settings
from kleelab.core.database import get_db
from kleelab.core.security import get_current_user
from kleelab.core.time import utcnow
from kleelab.models.asset import Asset
from kleelab.models.site import Site
from kleelab.models.user import User
from kleelab.schemas.site import SiteCreate, SiteOut, SiteUpdate
from kleelab.services import storage
from kleelab.services.plans import enforce_feature, enforce_site_quota


router = APIRouter(prefix="/api/sites", tags=["sites"])


def public_site_url(site: Site) -> str:
    """Where a published site is reachable.

    Published sites are rendered on demand by the frontend from the stored
    document, so there is no generated bundle to point at — but there are two ways
    to reach the renderer, and the owner should be told the one they will keep.

    With `SITES_DOMAIN` configured, a site is at `{subdomain}.{SITES_DOMAIN}`. That
    is the address to advertise: it is what a customer puts on a van. The path form
    below is the fallback, and it is the only form that works locally, where the
    development host is `localhost` and has no subdomains.
    """

    if site.custom_domain:
        return f"https://{site.custom_domain}"

    domain = settings.SITES_DOMAIN.strip().lower().lstrip(".")
    if domain and site.subdomain:
        return f"https://{site.subdomain}.{domain}"

    base = settings.FRONTEND_URL.rstrip("/")
    if site.subdomain:
        return f"{base}/s/{site.subdomain}"
    return base


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

    await enforce_site_quota(db, current_user)
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
    # Only gate an actual assignment. Clearing a custom domain is always allowed,
    # so a downgraded account can still get its site back onto a KleeLab address.
    if updates.get("custom_domain"):
        enforce_feature(current_user, "custom_domain")
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

    # Deleting the site cascades the asset rows away, which would strand every
    # uploaded file in the provider. Collect the handles first.
    public_ids = list(
        (
            await db.execute(select(Asset.public_id).where(Asset.site_id == site.id))
        ).scalars().all()
    )

    await db.delete(site)
    await db.commit()

    await storage.destroy_images(public_ids)


@router.post("/{site_id}/publish")
async def publish_site(
    site_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str | bool]:
    """Publish one site owned by the authenticated user.

    Verification is required unless `AUTO_VERIFY_EMAILS` is on. That flag is a local
    development switch: with no mail provider nothing can be verified, so nothing
    could be published, and the whole publish-and-view path was untestable end to end.

    The flag is read here rather than only at registration because an account created
    while it was off is still unverified. Checking only on the way in would leave
    those accounts stuck forever, which is the kind of half-applied switch that costs
    an hour of debugging.
    """

    if not current_user.is_verified and not settings.AUTO_VERIFY_EMAILS:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email verification required before publishing")
    site = await get_owned_site(site_id, current_user, db)
    site.is_published = True
    site.published_at = utcnow()
    await db.commit()
    await db.refresh(site)
    return {"message": "Site published", "url": public_site_url(site)}


@router.put(
    "/{site_id}/domain",
    response_model=SiteOut,
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