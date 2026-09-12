"""Page CRUD API routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.database import get_db
from kleelab.core.security import get_current_user
from kleelab.models.page import Page
from kleelab.models.site import Site
from kleelab.models.user import User
from kleelab.models.page_version import PageVersion
from kleelab.schemas.document import validate_document_payload
from kleelab.schemas.page import PageCreate, PageOut, PageUpdate


router = APIRouter(prefix="/api/sites/{site_id}/pages", tags=["pages"])


async def verify_site_ownership(
    site_id: UUID, current_user: User, db: AsyncSession
) -> Site:
    result = await db.execute(
        select(Site).where(Site.id == site_id, Site.user_id == current_user.id)
    )
    site = result.scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    return site


async def get_owned_page(
    site_id: UUID, page_id: UUID, current_user: User, db: AsyncSession
) -> Page:
    await verify_site_ownership(site_id, current_user, db)
    result = await db.execute(
        select(Page).where(Page.id == page_id, Page.site_id == site_id)
    )
    page = result.scalar_one_or_none()
    if page is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page not found")
    return page


def validate_content(content: dict | None) -> None:
    """Reject a malformed document before it is persisted."""

    try:
        validate_document_payload(content)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error


@router.get("", response_model=list[PageOut])
@router.get("/", response_model=list[PageOut], include_in_schema=False)
async def list_pages(
    site_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Page]:
    await verify_site_ownership(site_id, current_user, db)
    result = await db.execute(select(Page).where(Page.site_id == site_id))
    return list(result.scalars().all())


@router.post("", response_model=PageOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=PageOut, include_in_schema=False)
async def create_page(
    site_id: UUID,
    page_data: PageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Page:
    await verify_site_ownership(site_id, current_user, db)
    payload = page_data.model_dump()
    validate_content(payload.get("content"))
    page = Page(site_id=site_id, **payload)
    db.add(page)
    await db.commit()
    await db.refresh(page)
    return page


@router.get("/{page_id}", response_model=PageOut)
async def get_page(
    site_id: UUID,
    page_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Page:
    return await get_owned_page(site_id, page_id, current_user, db)


@router.put("/{page_id}", response_model=PageOut)
async def update_page(
    site_id: UUID,
    page_id: UUID,
    page_data: PageUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Page:
    page = await get_owned_page(site_id, page_id, current_user, db)
    updates = page_data.model_dump(exclude_unset=True)
    if "content" in updates:
        validate_content(updates["content"])
        latest = await db.scalar(select(PageVersion.version).where(PageVersion.page_id == page.id).order_by(PageVersion.version.desc()).limit(1))
        db.add(PageVersion(page_id=page.id, content=updates["content"] or {}, version=(latest or 0) + 1))
    for field, value in updates.items():
        setattr(page, field, value)
    versions = list((await db.execute(select(PageVersion).where(PageVersion.page_id == page.id).order_by(PageVersion.version.desc()))).scalars().all())
    for old_version in versions[50:]:
        await db.delete(old_version)
    await db.commit()
    await db.refresh(page)
    return page


@router.delete("/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_page(
    site_id: UUID,
    page_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    page = await get_owned_page(site_id, page_id, current_user, db)
    await db.delete(page)
    await db.commit()