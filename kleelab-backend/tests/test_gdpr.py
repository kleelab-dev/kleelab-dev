import pytest


@pytest.mark.asyncio
async def test_gdpr_export_request_and_deletion(client, auth_headers):
    # Create a site to ensure data exists
    await client.post(
        "/api/sites",
        json={"name": "GDPR Site", "subdomain": "gdprsite"},
        headers=auth_headers,
    )

    # 1. Export data
    export_res = await client.get("/api/users/me/export", headers=auth_headers)
    assert export_res.status_code == 200
    data = export_res.json()
    assert "user" in data
    assert len(data["sites"]) == 1

    # 2. Request deletion
    req_res = await client.post("/api/users/me/request-deletion", headers=auth_headers)
    assert req_res.status_code == 200
    assert req_res.json()["status"] == "requested"

    # 3. Delete account
    del_res = await client.delete("/api/users/me", headers=auth_headers)
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"
