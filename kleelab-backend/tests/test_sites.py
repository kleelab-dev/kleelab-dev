import pytest


@pytest.mark.asyncio
async def test_site_crud_and_publishing(client, auth_headers):
    # 1. Create site
    create_res = await client.post(
        "/api/sites",
        json={"name": "My Portfolio", "subdomain": "myportfolio"},
        headers=auth_headers,
    )
    assert create_res.status_code == 201
    site = create_res.json()
    site_id = site["id"]
    assert site["name"] == "My Portfolio"
    assert site["subdomain"] == "myportfolio"
    assert site["is_published"] is False

    # Duplicate subdomain check
    dup_res = await client.post(
        "/api/sites",
        json={"name": "Another Site", "subdomain": "myportfolio"},
        headers=auth_headers,
    )
    assert dup_res.status_code == 400

    # 2. List sites
    list_res = await client.get("/api/sites", headers=auth_headers)
    assert list_res.status_code == 200
    sites = list_res.json()
    assert len(sites) == 1
    assert sites[0]["id"] == site_id

    # 3. Get site
    get_res = await client.get(f"/api/sites/{site_id}", headers=auth_headers)
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "My Portfolio"

    # 4. Update site
    update_res = await client.put(
        f"/api/sites/{site_id}",
        json={"name": "Updated Portfolio"},
        headers=auth_headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["name"] == "Updated Portfolio"

    # 5. Try publishing site without email verification (should fail with 403)
    pub_res = await client.post(f"/api/sites/{site_id}/publish", headers=auth_headers)
    assert pub_res.status_code == 403

    # 6. Delete site
    del_res = await client.delete(f"/api/sites/{site_id}", headers=auth_headers)
    assert del_res.status_code == 204

    # 7. Confirm deleted
    get_after_del = await client.get(f"/api/sites/{site_id}", headers=auth_headers)
    assert get_after_del.status_code == 404


@pytest.mark.asyncio
async def test_custom_domain_feature_gate(client, auth_headers):
    # Create site
    create_res = await client.post(
        "/api/sites",
        json={"name": "Domain Test Site", "subdomain": "domaintest"},
        headers=auth_headers,
    )
    site_id = create_res.json()["id"]

    # Setting custom domain should return 402 Payment Required for free plan
    domain_res = await client.put(
        f"/api/sites/{site_id}/domain",
        json={"custom_domain": "mysite.com"},
        headers=auth_headers,
    )
    assert domain_res.status_code == 402
