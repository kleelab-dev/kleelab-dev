import pytest


@pytest.mark.asyncio
async def test_page_crud_and_versions(client, auth_headers):
    # Create site
    site_res = await client.post(
        "/api/sites",
        json={"name": "Page Test Site", "subdomain": "pagetest"},
        headers=auth_headers,
    )
    site_id = site_res.json()["id"]

    # 1. Create page
    page_res = await client.post(
        f"/api/sites/{site_id}/pages",
        json={"title": "Home Page", "slug": "home", "content": {"sections": [{"type": "hero", "data": {"title": "Welcome"}}]}},
        headers=auth_headers,
    )
    assert page_res.status_code == 201
    page = page_res.json()
    page_id = page["id"]
    assert page["title"] == "Home Page"

    # 2. List pages
    list_res = await client.get(f"/api/sites/{site_id}/pages", headers=auth_headers)
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1

    # 3. Get page
    get_res = await client.get(f"/api/sites/{site_id}/pages/{page_id}", headers=auth_headers)
    assert get_res.status_code == 200

    # 4. Update page (creates page version)
    update_res = await client.put(
        f"/api/sites/{site_id}/pages/{page_id}",
        json={"title": "Updated Home Page", "content": {"sections": [{"type": "hero", "data": {"title": "Welcome V2"}}]}},
        headers=auth_headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["title"] == "Updated Home Page"

    # 5. List versions
    versions_res = await client.get(f"/api/pages/{page_id}/versions", headers=auth_headers)
    assert versions_res.status_code == 200
    versions = versions_res.json()
    assert len(versions) == 1
    version_id = versions[0]["id"]

    # 6. Restore version
    restore_res = await client.post(f"/api/pages/{page_id}/versions/{version_id}/restore", headers=auth_headers)
    assert restore_res.status_code == 200

    # 7. Delete page
    del_res = await client.delete(f"/api/sites/{site_id}/pages/{page_id}", headers=auth_headers)
    assert del_res.status_code == 204
