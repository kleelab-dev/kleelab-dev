from html import escape

from kleelab.models.page import Page
from kleelab.models.site import Site


def site_base_url(site: Site) -> str:
    return f"https://{site.custom_domain or (site.subdomain + '.kleelab.com' if site.subdomain else '')}"


def generate_sitemap(site: Site, pages: list[Page]) -> str:
    entries = "".join(
        f"<url><loc>{escape(site_base_url(site) + '/' + page.slug.lstrip('/'))}</loc>"
        f"<lastmod>{page.updated_at.isoformat()}</lastmod><priority>0.8</priority></url>"
        for page in pages
    )
    return f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{entries}</urlset>'


def generate_robots_txt(site: Site) -> str:
    return f"User-agent: *\nAllow: /\nSitemap: {site_base_url(site)}/sitemap.xml\n"