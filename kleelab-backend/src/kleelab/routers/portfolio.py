"""The portfolio: public pages for visitors, and the editor for the team.

Anyone on the team can change anything here; the activity log says who did.
"""

import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.concurrency import run_in_threadpool

from kleelab.core.config import settings
from kleelab.core.database import get_db
from kleelab.models.library import ProjectTemplate
from kleelab.models.portfolio import PUBLIC_STATUSES, PortfolioItem
from kleelab.models.user import User
from kleelab.routers.admin import require_staff
from kleelab.schemas.portfolio import (
    MAX_IMAGES,
    PortfolioEvent,
    PortfolioImageUpload,
    PortfolioItemIn,
    PortfolioItemOut,
    PortfolioOrder,
    PublicPortfolioItem,
)
from kleelab.services import activity, storage
from kleelab.services import portfolio as svc
from kleelab.services import projects as project_svc

public_router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])
router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_staff)])

# Plenty for a studio's portfolio, and a limit on what one page loads.
MAX_ITEMS = 200


def _with_links():
    return (selectinload(PortfolioItem.template), selectinload(PortfolioItem.project))


# --- Visitors ---------------------------------------------------------------------


@public_router.get("", response_model=list[PublicPortfolioItem])
async def list_public(db: AsyncSession = Depends(get_db)) -> list[PublicPortfolioItem]:
    items = await db.scalars(
        select(PortfolioItem)
        .where(PortfolioItem.status.in_(PUBLIC_STATUSES))
        .order_by(PortfolioItem.featured.desc(), PortfolioItem.position, PortfolioItem.published_at.desc())
    )
    return [svc.public_out(item) for item in items]


@public_router.get("/{slug}", response_model=PublicPortfolioItem)
async def get_public(
    slug: str, preview: str | None = Query(default=None, max_length=64), db: AsyncSession = Depends(get_db)
) -> PublicPortfolioItem:
    item = await db.scalar(select(PortfolioItem).where(PortfolioItem.slug == slug))
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if svc.is_public(item):
        return svc.public_out(item)
    # A draft or archived item, for someone the team sent the preview link to.
    if preview and item.status != "archived" and secrets.compare_digest(preview, item.preview_token):
        return svc.public_out(item, preview=True)
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


@public_router.post("/{slug}/events", status_code=status.HTTP_204_NO_CONTENT)
async def record_event(slug: str, payload: PortfolioEvent, db: AsyncSession = Depends(get_db)) -> None:
    """Count a visit or a demo click. Previews and unknown items are ignored, quietly."""

    column = PortfolioItem.view_count if payload.kind == "view" else PortfolioItem.demo_clicks
    await db.execute(
        update(PortfolioItem)
        .where(PortfolioItem.slug == slug, PortfolioItem.status.in_(PUBLIC_STATUSES))
        .values({column.key: column + 1})
    )
    await db.commit()


# --- The team ----------------------------------------------------------------------


async def _get(db: AsyncSession, item_id: UUID) -> PortfolioItem:
    item = await db.scalar(
        select(PortfolioItem)
        .where(PortfolioItem.id == item_id)
        .options(*_with_links())
        .execution_options(populate_existing=True)
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portfolio item not found")
    return item


async def _out(db: AsyncSession, item: PortfolioItem) -> PortfolioItemOut:
    item = await _get(db, item.id)
    counts = await svc.enquiry_counts(db)
    return svc.team_out(item, counts.get(item.id, 0))


async def _room(db: AsyncSession) -> None:
    count = await db.scalar(select(func.count()).select_from(PortfolioItem))
    if count >= MAX_ITEMS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"There are already {MAX_ITEMS} items. Remove some you archived first.",
        )


async def _fill(db: AsyncSession, item: PortfolioItem, payload: PortfolioItemIn) -> list[str]:
    """Copy the editor's fields onto the item. Returns the image ids that were removed."""

    if payload.template_id and await db.get(ProjectTemplate, payload.template_id) is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="That template no longer exists.")
    for_sale = payload.kind == "for_sale"
    if payload.status == "sold" and not for_sale:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Only a ready-made site can be marked sold.")

    # Images can be reordered, relabelled or removed here, never added: new ones
    # must come through the upload, so nobody can point the page at any address.
    current = {image["url"]: image for image in item.images or []}
    kept = []
    for image in payload.images:
        if image.url not in current:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                                detail="Add screenshots with the upload button.")
        kept.append({**current[image.url], "alt": image.alt.strip()})
    removed = [image.get("public_id") for url, image in current.items() if url not in {i["url"] for i in kept}]

    item.kind = payload.kind
    item.title = payload.title
    item.slug = await svc.free_slug(db, payload.slug or svc.slugify(payload.title), item.id)
    item.summary = payload.summary
    item.body = payload.body
    item.sector = payload.sector
    item.tags = payload.tags
    if payload.demo_url != item.demo_url:
        item.demo_status = item.demo_error = item.demo_checked_at = None
    item.demo_url = payload.demo_url
    item.images = kept
    item.client_name = payload.client_name if not for_sale else None
    item.client_permission = payload.client_permission if not for_sale else False
    item.price_cents = payload.price_cents if for_sale else None
    item.currency = payload.currency
    item.includes = payload.includes if for_sale else None
    item.customisable = payload.customisable if for_sale else None
    item.delivery_days = payload.delivery_days if for_sale else None
    item.exclusive = payload.exclusive if for_sale else False
    item.template_id = payload.template_id if for_sale else None
    item.featured = payload.featured

    if payload.status in PUBLIC_STATUSES:
        gaps = svc.missing(item)
        if gaps:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                                detail=f"Before it goes on the site it needs {', '.join(gaps)}.")
        if item.published_at is None:
            item.published_at = project_svc.now()
    item.status = payload.status
    return removed


STATUS_WORDS = {"draft": "a draft", "published": "on the site", "sold": "sold", "archived": "archived"}


@router.get("/portfolio", response_model=list[PortfolioItemOut])
async def list_items(db: AsyncSession = Depends(get_db)) -> list[PortfolioItemOut]:
    items = await db.scalars(
        select(PortfolioItem).options(*_with_links()).order_by(PortfolioItem.position, PortfolioItem.created_at.desc())
    )
    counts = await svc.enquiry_counts(db)
    return [svc.team_out(item, counts.get(item.id, 0)) for item in items]


@router.get("/portfolio/{item_id}", response_model=PortfolioItemOut)
async def get_item(item_id: UUID, db: AsyncSession = Depends(get_db)) -> PortfolioItemOut:
    return await _out(db, await _get(db, item_id))


@router.post("/portfolio", response_model=PortfolioItemOut, status_code=status.HTTP_201_CREATED)
async def create_item(
    payload: PortfolioItemIn, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> PortfolioItemOut:
    await _room(db)
    first = await db.scalar(select(PortfolioItem.position).order_by(PortfolioItem.position).limit(1))
    item = PortfolioItem(created_by_id=staff.id, preview_token=svc.new_token(), position=(first or 0) - 1, images=[])
    # A new item has no screenshots yet, so it always starts as a draft.
    await _fill(db, item, payload.model_copy(update={"status": "draft", "images": []}))
    db.add(item)
    await db.flush()
    activity.record(db, staff, "portfolio.create", f"Started the portfolio item {item.title}",
                    subject_type="portfolio", subject_id=item.id)
    await db.commit()
    return await _out(db, item)


@router.put("/portfolio/{item_id}", response_model=PortfolioItemOut)
async def update_item(
    item_id: UUID, payload: PortfolioItemIn, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> PortfolioItemOut:
    item = await _get(db, item_id)
    was_public = svc.is_public(item)
    before = item.status
    removed = await _fill(db, item, payload)
    if item.status != before:
        text = f"Marked {item.title} as {STATUS_WORDS[item.status]}"
    else:
        text = f"Changed the portfolio item {item.title}"
    activity.record(db, staff, "portfolio.update", text, subject_type="portfolio", subject_id=item.id)
    await db.commit()
    await storage.destroy_images(removed)
    if was_public or svc.is_public(item):
        await svc.refresh_site()
    return await _out(db, item)


@router.delete("/portfolio/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(item_id: UUID, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)) -> None:
    item = await _get(db, item_id)
    was_public = svc.is_public(item)
    images = [image.get("public_id") for image in item.images or []]
    activity.record(db, staff, "portfolio.delete", f"Removed the portfolio item {item.title}",
                    subject_type="portfolio", subject_id=item.id)
    await db.delete(item)
    await db.commit()
    await storage.destroy_images(images)
    if was_public:
        await svc.refresh_site()


@router.put("/portfolio-order", response_model=list[PortfolioItemOut])
async def reorder(
    payload: PortfolioOrder, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> list[PortfolioItemOut]:
    """Put the items in this order. Any not named keep their place after them."""

    items = {item.id: item for item in await db.scalars(select(PortfolioItem))}
    order = [item_id for item_id in dict.fromkeys(payload.ids) if item_id in items]
    rest = sorted((i for i in items.values() if i.id not in order), key=lambda i: i.position)
    for position, item in enumerate([items[i] for i in order] + rest):
        item.position = position
    activity.record(db, staff, "portfolio.order", "Changed the order of the portfolio", subject_type="portfolio")
    await db.commit()
    await svc.refresh_site()
    return await list_items(db)


@router.post("/portfolio/{item_id}/images", response_model=PortfolioItemOut, status_code=status.HTTP_201_CREATED)
async def upload_image(
    item_id: UUID, payload: PortfolioImageUpload, db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> PortfolioItemOut:
    item = await _get(db, item_id)
    if len(item.images or []) >= MAX_IMAGES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=f"An item can have {MAX_IMAGES} screenshots. Remove one first.")
    try:
        data, content_type = storage.decode_data_url(payload.data)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error
    if content_type not in storage.ALLOWED_IMAGE_TYPES - {"image/gif"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Use a PNG, JPEG, WebP or AVIF screenshot.")
    if len(data) > settings.MAX_UPLOAD_BYTES:
        limit_mb = settings.MAX_UPLOAD_BYTES // (1024 * 1024)
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail=f"That image is larger than {limit_mb}MB.")
    try:
        result = await run_in_threadpool(
            storage.upload_image, data, content_type, f"{settings.CLOUDINARY_FOLDER}/portfolio"
        )
    except storage.StorageNotConfigured as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    except storage.StorageUploadFailed as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail="The image could not be stored. Try again.") from error
    url = result.get("secure_url") or result.get("url")
    if not url:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="The image could not be stored. Try again.")

    # The item may have changed while the upload ran; add to the latest copy.
    item = await _get(db, item_id)
    item.images = [*(item.images or []), {
        "url": url,
        "public_id": result.get("public_id"),
        "alt": payload.alt.strip(),
        "width": result.get("width"),
        "height": result.get("height"),
    }]
    activity.record(db, staff, "portfolio.image", f"Added a screenshot to {item.title}",
                    subject_type="portfolio", subject_id=item.id)
    await db.commit()
    if svc.is_public(item):
        await svc.refresh_site()
    return await _out(db, item)


@router.post("/portfolio/{item_id}/check-demo", response_model=PortfolioItemOut)
async def check_demo(item_id: UUID, db: AsyncSession = Depends(get_db)) -> PortfolioItemOut:
    item = await _get(db, item_id)
    if not item.demo_url:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Add a demo link first.")
    await svc.check_demo(item)
    await db.commit()
    return await _out(db, item)


@router.post("/projects/{project_id}/portfolio", response_model=PortfolioItemOut, status_code=status.HTTP_201_CREATED)
async def draft_from_project(
    project_id: UUID, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> PortfolioItemOut:
    """Start a portfolio draft from a finished project: its name, client and live address."""

    project = await project_svc.load_project(db, project_id, staff)
    existing = await db.scalar(select(PortfolioItem).where(PortfolioItem.project_id == project.id).limit(1))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This project is already in the portfolio.")
    await _room(db)

    live = project.live_url
    if not live and project.handover is not None:
        for entry in project.handover.items or []:
            if entry.get("url") and "live" in (entry.get("label") or "").lower():
                live = entry["url"]
                break
    first = await db.scalar(select(PortfolioItem.position).order_by(PortfolioItem.position).limit(1))
    item = PortfolioItem(
        kind="work",
        slug=await svc.free_slug(db, svc.slugify(project.title)),
        title=project.title[:120],
        summary=(project.summary or "")[:300].strip(),
        client_name=project_svc.display_name(project.client),
        demo_url=live,
        project_id=project.id,
        images=[],
        tags=[],
        preview_token=svc.new_token(),
        position=(first or 0) - 1,
        created_by_id=staff.id,
    )
    db.add(item)
    await db.flush()
    activity.record(db, staff, "portfolio.create", f"Started a portfolio item from {project.reference}",
                    project_id=project.id, subject_type="portfolio", subject_id=item.id)
    await db.commit()
    return await _out(db, item)
