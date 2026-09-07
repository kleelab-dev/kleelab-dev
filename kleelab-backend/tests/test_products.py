import pytest


@pytest.mark.asyncio
async def test_product_crud(client, auth_headers):
    # Create site
    site_res = await client.post(
        "/api/sites",
        json={"name": "Ecom Site", "subdomain": "ecomsite"},
        headers=auth_headers,
    )
    site_id = site_res.json()["id"]

    # 1. Create product
    prod_res = await client.post(
        f"/api/sites/{site_id}/products",
        json={"name": "T-Shirt", "description": "100% Cotton", "price": 29.99, "stock": 10},
        headers=auth_headers,
    )
    assert prod_res.status_code == 201
    product = prod_res.json()
    product_id = product["id"]
    assert product["name"] == "T-Shirt"
    assert product["price"] == 29.99

    # 2. List products
    list_res = await client.get(f"/api/sites/{site_id}/products", headers=auth_headers)
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1

    # 3. Update product
    update_res = await client.put(
        f"/api/sites/{site_id}/products/{product_id}",
        json={"price": 24.99, "stock": 15},
        headers=auth_headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["price"] == 24.99
    assert update_res.json()["stock"] == 15

    # 4. Delete product
    del_res = await client.delete(f"/api/sites/{site_id}/products/{product_id}", headers=auth_headers)
    assert del_res.status_code == 204
