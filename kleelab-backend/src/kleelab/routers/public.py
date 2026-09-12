"""Public, unauthenticated read access to published sites.

Published sites are rendered by the Next.js frontend from the stored document,
so this router only exposes read-only data and never anything unpublished.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.database import get_db
from kleelab.models.page import Page
from kleelab.models.site import Site


router = APIRouter(prefix="/api/public", tags=["public"])

# A page can be stored as the site's home page using any of these slugs.
HOME_SLUGS = {"", "/", "home"}
# Visitor-facing paths a site owner may reasonably request.
FALLBACK_SLUG = "index"


async def get_published_site(subdomain: str, db: AsyncSession) -> Site:
    """Return a site only when it exists and is currently published."""

    result = await db.execute(
        select(Site).where(Site.subdomain == subdomain, Site.is_published.is_(True))
    )
    site = result.scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    return site


def normalize_slug(slug: str | None) -> str:
    """Normalise a requested path into a stored slug."""

    if not slug:
        return "/"
    cleaned = slug.strip()
    if cleaned in HOME_SLUGS:
        return "/"
    return "/" + cleaned.strip("/")


def serialize_page(page: Page) -> dict[str, Any]:
    """Shape a page for public consumption, including SEO fields."""

    return {
        "id": str(page.id),
        "title": page.title,
        "slug": page.slug,
        "content": page.content or {},
        "seo": {
            "title": page.meta_title or page.og_title,
            "description": page.meta_description or page.og_description,
            "image": page.og_image,
        },
    }


@router.get("/resolve")
async def resolve_host(host: str, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    """Map a custom domain to the published site that claims it.

    Used by the frontend's request proxy to serve a site on its own domain.
    """

    normalized = host.strip().lower().split(":")[0]
    site = await db.scalar(
        select(Site).where(
            Site.custom_domain == normalized,
            Site.is_published.is_(True),
        )
    )
    if site is None or not site.subdomain:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No published site for that host",
        )
    return {"subdomain": site.subdomain}


@router.get("/sites/{subdomain}")
async def public_site(subdomain: str, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Return a published site's metadata and page list."""

    site = await get_published_site(subdomain, db)
    pages = (
        (await db.execute(select(Page).where(Page.site_id == site.id).order_by(Page.created_at)))
        .scalars()
        .all()
    )
    return {
        "name": site.name,
        "subdomain": site.subdomain,
        "custom_domain": site.custom_domain,
        "pages": [{"title": page.title, "slug": page.slug} for page in pages],
    }


@router.get("/sites/{subdomain}/page")
async def public_page(
    subdomain: str,
    slug: str = "/",
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return one page of a published site by slug."""

    site = await get_published_site(subdomain, db)
    normalized = normalize_slug(slug)

    page = await db.scalar(select(Page).where(Page.site_id == site.id, Page.slug == normalized))

    # Fall back to any home-page variant before giving up.
    if page is None and normalized == "/":
        page = await db.scalar(
            select(Page).where(Page.site_id == site.id, Page.slug.in_(HOME_SLUGS))
        )

    if page is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page not found")

    return {
        "site": {
            "name": site.name,
            "subdomain": site.subdomain,
            "custom_domain": site.custom_domain,
        },
        "page": serialize_page(page),
    }
