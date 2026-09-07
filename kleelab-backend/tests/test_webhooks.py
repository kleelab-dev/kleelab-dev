import pytest


@pytest.mark.asyncio
async def test_stripe_webhook_without_signature(client):
    res = await client.post("/api/webhooks/stripe", json={})
    assert res.status_code == 400
    assert "Missing Stripe signature" in res.json()["error"]["message"]


@pytest.mark.asyncio
async def test_subscription_webhook_without_secret(client):
    res = await client.post("/api/subscriptions/webhook", json={})
    assert res.status_code == 400
    assert "Missing Stripe webhook configuration" in res.json()["error"]["message"]
