import pytest


@pytest.mark.asyncio
async def test_dashboard_endpoints(client, auth_headers):
    # Get stats
    stats_res = await client.get("/api/dashboard/stats", headers=auth_headers)
    assert stats_res.status_code == 200
    stats = stats_res.json()
    assert "site_count" in stats
    assert "page_count" in stats

    # Get recent activity
    act_res = await client.get("/api/dashboard/recent-activity", headers=auth_headers)
    assert act_res.status_code == 200
    assert isinstance(act_res.json(), list)

    # Get chart data
    chart_res = await client.get("/api/dashboard/chart-data", headers=auth_headers)
    assert chart_res.status_code == 200
    assert "views_over_time" in chart_res.json()
