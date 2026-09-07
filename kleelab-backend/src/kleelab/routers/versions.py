from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.database import get_db
from kleelab.core.security import get_current_user
from kleelab.models.page import Page
from kleelab.models.page_version import PageVersion
from kleelab.models.site import Site
from kleelab.models.user import User
from kleelab.schemas.version import PageVersionOut

router = APIRouter(prefix="/api/pages/{page_id}/versions", tags=["versions"])


async def owned_page(page_id: UUID, user: User, db: AsyncSession) -> Page:
    result = await db.execute(select(Page).join(Site, Site.id == Page.site_id).where(Page.id == page_id, Site.user_id == user.id))
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.get("", response_model=list[PageVersionOut])
async def list_versions(page_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await owned_page(page_id, user, db)
    return list((await db.execute(select(PageVersion).where(PageVersion.page_id == page_id).order_by(PageVersion.version.desc()))).scalars().all())


@router.get("/{version_id}", response_model=PageVersionOut)
async def get_version(page_id: UUID, version_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await owned_page(page_id, user, db)
    version = await db.scalar(select(PageVersion).where(PageVersion.id == version_id, PageVersion.page_id == page_id))
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


@router.post("/{version_id}/restore", response_model=PageVersionOut)
async def restore_version(page_id: UUID, version_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    page = await owned_page(page_id, user, db)
    version = await db.scalar(select(PageVersion).where(PageVersion.id == version_id, PageVersion.page_id == page_id))
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    latest = await db.scalar(select(func.max(PageVersion.version)).where(PageVersion.page_id == page_id)) or 0
    page.content = version.content
    restored = PageVersion(page_id=page_id, content=version.content, version=latest + 1)
    db.add(restored)
    await db.commit()
    await db.refresh(restored)
    return restored