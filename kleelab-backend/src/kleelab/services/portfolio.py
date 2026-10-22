"""The portfolio: turning items into what the team and visitors see, checking
demo links, and telling the client site when something changed."""

import asyncio
import ipaddress
import logging
import re
import secrets
import socket
import unicodedata
from datetime import timedelta
from urllib.parse import urlsplit

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.config import settings
from kleelab.core.database import AsyncSessionLocal
from kleelab.models.agency_lead import AgencyLead
from kleelab.models.portfolio import PUBLIC_STATUSES, PortfolioItem
from kleelab.schemas.portfolio import PortfolioImage, PortfolioItemOut, PublicPortfolioItem
from kleelab.services import projects as project_svc

logger = logging.getLogger(__name__)

DAY = 24 * 60 * 60
# Long enough for a slow host, short enough that one dead demo cannot hold up the rest.
CHECK_TIMEOUT_SECONDS = 15
MAX_REDIRECTS = 5
# Some hosts refuse requests that do not look like a browser.
CHECK_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; KleeLab link check; +https://kleelab.com)"}


def new_token() -> str:
    return secrets.token_urlsafe(24)


def slugify(text: str) -> str:
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-")
    return slug[:70].rstrip("-") or "site"


async def free_slug(db: AsyncSession, wanted: str, item_id=None) -> str:
    """`wanted`, or `wanted-2`, `wanted-3`… whichever no other item has."""

    query = select(PortfolioItem.slug).where(PortfolioItem.slug.like(f"{wanted}%"))
    if item_id is not None:
        query = query.where(PortfolioItem.id != item_id)
    taken = set(await db.scalars(query))
    if wanted not in taken:
        return wanted
    n = 2
    while f"{wanted}-{n}" in taken:
        n += 1
    return f"{wanted}-{n}"


def lines(text: str | None) -> list[str]:
    return [line.strip().lstrip("-•* ").strip() for line in (text or "").splitlines() if line.strip()]


def missing(item: PortfolioItem) -> list[str]:
    """What stops the item being shown to visitors."""

    gaps = []
    if not item.summary:
        gaps.append("a short summary")
    if not item.images:
        gaps.append("at least one screenshot")
    elif any(not (image.get("alt") or "").strip() for image in item.images):
        gaps.append("a description for every screenshot")
    if item.kind == "work" and not item.client_permission:
        gaps.append("the client's agreement to show it")
    return gaps


def page_url(item: PortfolioItem) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/portfolio/{item.slug}"


def team_out(item: PortfolioItem, enquiries: int = 0) -> PortfolioItemOut:
    return PortfolioItemOut(
        id=item.id,
        kind=item.kind,
        slug=item.slug,
        title=item.title,
        summary=item.summary,
        body=item.body,
        sector=item.sector,
        tags=list(item.tags or []),
        demo_url=item.demo_url,
        images=[PortfolioImage(**_image(image)) for image in item.images or []],
        client_name=item.client_name,
        client_permission=item.client_permission,
        project_id=item.project_id,
        project_reference=item.project.reference if item.project else None,
        price_cents=item.price_cents,
        currency=item.currency,
        includes=item.includes,
        customisable=item.customisable,
        delivery_days=item.delivery_days,
        exclusive=item.exclusive,
        template_id=item.template_id,
        template_name=item.template.name if item.template else None,
        status=item.status,
        featured=item.featured,
        position=item.position,
        preview_token=item.preview_token,
        public_url=page_url(item),
        preview_url=f"{page_url(item)}?preview={item.preview_token}",
        view_count=item.view_count,
        demo_clicks=item.demo_clicks,
        enquiries=enquiries,
        demo_status=item.demo_status,
        demo_error=item.demo_error,
        demo_checked_at=item.demo_checked_at,
        published_at=item.published_at,
        updated_at=item.updated_at,
        missing=missing(item),
    )


def public_out(item: PortfolioItem, preview: bool = False) -> PublicPortfolioItem:
    for_sale = item.kind == "for_sale"
    return PublicPortfolioItem(
        kind=item.kind,
        slug=item.slug,
        title=item.title,
        summary=item.summary,
        body=item.body,
        sector=item.sector,
        tags=list(item.tags or []),
        demo_url=item.demo_url,
        images=[PortfolioImage(**_image(image)) for image in item.images or []],
        client_name=item.client_name if item.kind == "work" else None,
        price_cents=item.price_cents if for_sale and item.status != "sold" else None,
        currency=item.currency,
        includes=lines(item.includes) if for_sale else [],
        customisable=lines(item.customisable) if for_sale else [],
        delivery_days=item.delivery_days if for_sale else None,
        exclusive=item.exclusive if for_sale else False,
        sold=item.status == "sold",
        featured=item.featured,
        published_at=item.published_at,
        updated_at=item.updated_at,
        preview=preview,
    )


def _image(image: dict) -> dict:
    return {
        "url": image["url"],
        "alt": image.get("alt") or "",
        "width": image.get("width"),
        "height": image.get("height"),
    }


async def enquiry_counts(db: AsyncSession) -> dict:
    rows = await db.execute(
        select(AgencyLead.portfolio_item_id, func.count())
        .where(AgencyLead.portfolio_item_id.is_not(None))
        .group_by(AgencyLead.portfolio_item_id)
    )
    return dict(rows.all())


def is_public(item: PortfolioItem) -> bool:
    return item.status in PUBLIC_STATUSES


# --- Telling the client site --------------------------------------------------------


async def refresh_site() -> None:
    """Ask the client site to drop its copy of the portfolio. Best effort: without
    it the site still catches up within five minutes."""

    if not settings.REVALIDATE_SECRET:
        return
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(
                f"{settings.FRONTEND_URL.rstrip('/')}/revalidate",
                json={"tag": "portfolio"},
                headers={"Authorization": f"Bearer {settings.REVALIDATE_SECRET}"},
            )
    except httpx.HTTPError:
        logger.warning("Could not ask the client site to refresh the portfolio", exc_info=True)


# --- Demo links ---------------------------------------------------------------------


def _private_host(url: str) -> bool:
    """Whether the address points inside our own network. The check runs on the
    server, so it must not become a way to probe what sits next to it."""

    host = urlsplit(url).hostname
    if not host:
        return True
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(host, None)}
    except OSError:
        return False  # Unknown hosts fail the request itself, with a clearer message.
    return any(not ipaddress.ip_address(address.split("%")[0]).is_global for address in addresses)


async def check_link(url: str) -> str | None:
    """None when the page answers, otherwise what went wrong, in words."""

    try:
        async with httpx.AsyncClient(timeout=CHECK_TIMEOUT_SECONDS, headers=CHECK_HEADERS) as client:
            # Redirects are followed by hand so every hop gets the same private-address check.
            for _ in range(MAX_REDIRECTS + 1):
                if await asyncio.to_thread(_private_host, url):
                    return "It points to a private address, so it was not checked."
                response = await client.get(url)
                if not response.is_redirect:
                    break
                url = str(response.next_request.url) if response.next_request else url
            else:
                return "It redirects too many times."
    except httpx.TimeoutException:
        return "It did not answer within 15 seconds."
    except httpx.HTTPError as error:
        return f"It could not be reached ({type(error).__name__})."
    if response.status_code >= 400:
        return f"It answered with error {response.status_code}."
    return None


async def check_demo(item: PortfolioItem) -> None:
    if not item.demo_url:
        item.demo_status = item.demo_error = item.demo_checked_at = None
        return
    problem = await check_link(item.demo_url)
    item.demo_status = "broken" if problem else "ok"
    item.demo_error = problem
    item.demo_checked_at = project_svc.now()


async def check_demos(db: AsyncSession) -> int:
    """Check every demo link that visitors can see, or that has not been checked for a day.
    Returns how many are broken."""

    stale = project_svc.now() - timedelta(hours=20)
    items = list(
        await db.scalars(
            select(PortfolioItem).where(
                PortfolioItem.demo_url.is_not(None),
                PortfolioItem.status != "archived",
                (PortfolioItem.demo_checked_at.is_(None)) | (PortfolioItem.demo_checked_at < stale),
            )
        )
    )
    broken = 0
    for item in items:
        await check_demo(item)
        broken += item.demo_status == "broken"
    await db.commit()
    return broken


async def run_daily() -> None:
    """Check demo links now, then once a day, for as long as the app runs."""

    while True:
        try:
            async with AsyncSessionLocal() as db:
                broken = await check_demos(db)
            if broken:
                logger.warning("Portfolio: %d demo links are not working.", broken)
        except Exception:
            logger.exception("Portfolio demo checks failed; trying again tomorrow.")
        await asyncio.sleep(DAY)
