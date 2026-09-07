import pytest


@pytest.mark.asyncio
async def test_subscriptions_and_upsell(client, auth_headers):
    # Get current subscription (defaults to None if not yet created)
    curr_res = await client.get("/api/subscriptions/current", headers=auth_headers)
    assert curr_res.status_code == 200

    # Set free plan
    free_res = await client.post(
        "/api/subscriptions",
        json={"plan": "free"},
        headers=auth_headers,
    )
    assert free_res.status_code == 200
    assert free_res.json()["plan"] == "free"

    # Verify current subscription is active free
    curr_res2 = await client.get("/api/subscriptions/current", headers=auth_headers)
    assert curr_res2.status_code == 200
    assert curr_res2.json()["plan"] == "free"

    # Check feature access for custom domain
    check_res = await client.get("/api/upsell/check?feature=custom_domain", headers=auth_headers)
    assert check_res.status_code == 200
    assert check_res.json()["has_access"] is False

    # Submit agency contact lead
    lead_res = await client.post(
        "/api/upsell/contact",
        json={"feature": "custom_enterprise_template", "message": "I need custom design"},
        headers=auth_headers,
    )
    assert lead_res.status_code == 200
    assert lead_res.json()["status"] == "new"

    # Cancel subscription
    cancel_res = await client.put("/api/subscriptions/cancel", headers=auth_headers)
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "cancelled"
