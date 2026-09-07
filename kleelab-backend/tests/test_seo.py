import pytest


@pytest.mark.asyncio
async def test_seo_endpoints(client, auth_headers):
    # Create site
    site_res = await client.post(
        "/api/sites",
        json={"name": "SEO Site", "subdomain": "seosite"},
        headers=auth_headers,
    )
    site_id = site_res.json()["id"]

    # Sitemap
    sitemap_res = await client.get(f"/api/sites/{site_id}/sitemap.xml")
    assert sitemap_res.status_code == 200
    assert "xml" in sitemap_res.headers["content-type"]

    # Robots.txt
    robots_res = await client.get(f"/api/sites/{site_id}/robots.txt")
    assert robots_res.status_code == 200
    assert "text/plain" in robots_res.headers["content-type"]

    # Get SEO settings
    seo_res = await client.get(f"/api/sites/{site_id}/seo", headers=auth_headers)
    assert seo_res.status_code == 200
    assert seo_res.json()["name"] == "SEO Site"
