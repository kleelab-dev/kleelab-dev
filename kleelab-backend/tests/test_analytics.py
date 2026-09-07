import pytest


@pytest.mark.asyncio
async def test_analytics_tracking(client, auth_headers):
    # Create site
    site_res = await client.post(
        "/api/sites",
        json={"name": "Analytics Site", "subdomain": "analyticssite"},
        headers=auth_headers,
    )
    site_id = site_res.json()["id"]

    # Public tracking endpoint (no auth headers required)
    track_res = await client.post(
        f"/api/sites/{site_id}/track",
        json={"path": "/", "visitor_id": "visitor-123"},
    )
    assert track_res.status_code == 201
    assert track_res.json()["status"] == "tracked"
