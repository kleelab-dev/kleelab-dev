import pytest


@pytest.mark.asyncio
async def test_order_management(client, auth_headers):
    # Create site
    site_res = await client.post(
        "/api/sites",
        json={"name": "Order Site", "subdomain": "ordersite"},
        headers=auth_headers,
    )
    site_id = site_res.json()["id"]

    # 1. Create order
    order_res = await client.post(
        f"/api/sites/{site_id}/orders",
        json={
            "customer_email": "buyer@example.com",
            "customer_name": "Jane Buyer",
            "items": [{"name": "Item A", "quantity": 2, "price": 15.0}],
            "total": 30.0,
        },
        headers=auth_headers,
    )
    assert order_res.status_code == 201
    order = order_res.json()
    order_id = order["id"]
    assert order["customer_email"] == "buyer@example.com"
    assert order["status"] == "pending"

    # 2. List orders
    list_res = await client.get(f"/api/sites/{site_id}/orders", headers=auth_headers)
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1

    # 3. Update order status
    status_res = await client.put(
        f"/api/sites/{site_id}/orders/{order_id}/status",
        json={"status": "paid"},
        headers=auth_headers,
    )
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "paid"

    # 4. Invalid status update
    invalid_res = await client.put(
        f"/api/sites/{site_id}/orders/{order_id}/status",
        json={"status": "invalid_status"},
        headers=auth_headers,
    )
    assert invalid_res.status_code == 400
