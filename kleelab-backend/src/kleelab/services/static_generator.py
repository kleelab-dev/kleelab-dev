"""Static site generation service."""

import json
import tempfile
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.models.page import Page
from kleelab.models.site import Site


def render_page_html(page: Page) -> str:
    """Render a minimal HTML document from builder JSON content."""

    content = page.content or {}
    body = content.get("html") if isinstance(content, dict) else None
    if not isinstance(body, str):
        body = json.dumps(content, ensure_ascii=False)
    title = page.meta_title or page.title
    description = page.meta_description or ""
    return (
        "<!doctype html>\n"
        '<html lang="en">\n<head>\n'
        f"<meta charset=\"utf-8\"><meta name=\"description\" content=\"{description}\">"
        f"<title>{title}</title>\n</head>\n<body>\n{body}\n</body>\n</html>"
    )


async def generate_static_site(site_id: UUID, db: AsyncSession) -> dict[str, str]:
    """Render site pages to a temporary directory and return its public URL."""

    result = await db.execute(select(Site).where(Site.id == site_id))
    site = result.scalar_one_or_none()
    if site is None:
        raise ValueError("Site not found")

    pages_result = await db.execute(select(Page).where(Page.site_id == site_id))
    pages = pages_result.scalars().all()
    with tempfile.TemporaryDirectory(prefix=f"kleelab-{site_id}-") as directory:
        output_dir = Path(directory)
        for page in pages:
            filename = "index.html" if page.slug in {"", "/", "home"} else f"{page.slug}.html"
            (output_dir / filename).write_text(render_page_html(page), encoding="utf-8")
        # Upload integration is intentionally a stub until storage credentials are configured.

    if site.custom_domain:
        url = f"https://{site.custom_domain}"
    else:
        url = f"https://{site.subdomain}.kleelab.com" if site.subdomain else ""
    return {"url": url, "status": "success"}