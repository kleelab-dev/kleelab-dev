from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.database import get_db
from kleelab.core.security import get_current_user
from kleelab.models.page import Page
from kleelab.models.site import Site
from kleelab.models.user import User
from kleelab.services.seo import generate_robots_txt, generate_sitemap

router = APIRouter(prefix="/api/sites/{site_id}", tags=["seo"])


async def owned_site(site_id: UUID, user: User, db: AsyncSession) -> Site:
    site = await db.scalar(select(Site).where(Site.id == site_id, Site.user_id == user.id))
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return site


class SEOUpdate(BaseModel):
    name: str | None = None


@router.get("/sitemap.xml")
async def sitemap(site_id: UUID, db: AsyncSession = Depends(get_db)):
    site = await db.get(Site, site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    pages = list((await db.execute(select(Page).where(Page.site_id == site_id))).scalars().all())
    return Response(generate_sitemap(site, pages), media_type="application/xml")


@router.get("/robots.txt")
async def robots(site_id: UUID, db: AsyncSession = Depends(get_db)):
    site = await db.get(Site, site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return Response(generate_robots_txt(site), media_type="text/plain")


@router.get("/seo")
async def get_seo(site_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    site = await owned_site(site_id, user, db)
    return {"site_id": site.id, "name": site.name, "subdomain": site.subdomain, "custom_domain": site.custom_domain}


@router.put("/seo")
async def update_seo(site_id: UUID, data: SEOUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    site = await owned_site(site_id, user, db)
    if data.name is not None:
        site.name = data.name
    await db.commit()
    await db.refresh(site)
    return await get_seo(site_id, user, db)