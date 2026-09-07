import pytest


@pytest.mark.asyncio
async def test_register_and_login(client):
    # Register
    res = await client.post(
        "/api/auth/register",
        json={"email": "newuser@example.com", "password": "securepassword", "full_name": "New User"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["email"] == "newuser@example.com"
    assert data["full_name"] == "New User"
    assert "id" in data

    # Duplicate registration should fail
    dup_res = await client.post(
        "/api/auth/register",
        json={"email": "newuser@example.com", "password": "securepassword"},
    )
    assert dup_res.status_code == 400

    # Login
    login_res = await client.post(
        "/api/auth/login",
        json={"email": "newuser@example.com", "password": "securepassword"},
    )
    assert login_res.status_code == 200
    token_data = login_res.json()
    assert "access_token" in token_data
    assert token_data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_get_me(client, auth_headers):
    res = await client.get("/api/auth/me", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "email" in data
    assert "id" in data
    assert data["id"] == auth_headers["user_id"]


@pytest.mark.asyncio
async def test_request_password_reset(client):
    res = await client.post("/api/auth/request-password-reset?email=nonexistent@example.com")
    assert res.status_code == 200
    assert res.json() == {"status": "if_account_exists_reset_email_sent"}
