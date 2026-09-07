from html import escape
import boto3
from uuid import UUID

from jinja2 import Template as JinjaTemplate
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.models.page import Page
from kleelab.models.site import Site
from kleelab.models.template import Template
from kleelab.core.config import settings


def render_section(section: dict) -> str:
    data = section.get("data", {})
    section_type = section.get("type", "text")
    if section_type == "hero":
        return f"<section class='hero'><h1>{escape(str(data.get('title', '')))}</h1><p>{escape(str(data.get('subtitle', '')))}</p></section>"
    if section_type == "gallery":
        return "<section class='gallery'>" + "".join(f"<img src='{escape(str(url))}' alt=''>" for url in data.get("images", [])) + "</section>"
    return f"<section class='{escape(section_type)}'>{data.get('html', escape(str(data.get('text', ''))))}</section>"


def render_page(page: Page, site: Site, template_config: dict) -> str:
    content = page.content or {}
    body = "\n".join(render_section(section) for section in content.get("sections", []))
    html = "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><title>{{ title }}</title><meta name='description' content='{{ description }}'><style>{{ styles }}</style></head><body>{{ body | safe }}</body></html>"
    return JinjaTemplate(html).render(title=page.og_title or page.meta_title or page.title, description=page.meta_description or "", styles=template_config.get("styles", ""), body=body)


async def generate_static_site(site_id: UUID, db: AsyncSession) -> dict[str, str]:
    site = await db.scalar(select(Site).where(Site.id == site_id))
    if not site:
        raise ValueError("Site not found")
    pages = list((await db.execute(select(Page).where(Page.site_id == site_id))).scalars().all())
    template_config = {}
    if site.template_id:
        template = await db.get(Template, site.template_id)
        template_config = template.config if template else {}
    rendered = {"index.html" if page.slug in {"", "/", "home"} else f"{page.slug}.html": render_page(page, site, template_config) for page in pages}
    if settings.AWS_S3_BUCKET:
        client = boto3.client("s3", region_name=settings.AWS_REGION)
        for filename, html in rendered.items():
            client.put_object(
                Bucket=settings.AWS_S3_BUCKET,
                Key=f"sites/{site_id}/public/{filename}",
                Body=html.encode("utf-8"),
                ContentType="text/html; charset=utf-8",
                ACL="public-read",
            )
    base = f"https://{site.custom_domain or (site.subdomain + '.kleelab.com' if site.subdomain else '')}"
    return {"url": base, "status": "success", "files": str(len(rendered))}