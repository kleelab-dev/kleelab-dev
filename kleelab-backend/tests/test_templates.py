import pytest


@pytest.mark.asyncio
async def test_templates_api(client):
    # List templates
    list_res = await client.get("/api/templates")
    assert list_res.status_code == 200
    assert isinstance(list_res.json(), list)

    # Categories
    cat_res = await client.get("/api/templates/categories")
    assert cat_res.status_code == 200
    assert isinstance(cat_res.json(), list)
