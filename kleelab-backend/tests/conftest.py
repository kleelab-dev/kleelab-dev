import os
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Ensure test environment settings are set before importing app
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-12345"

from kleelab.core.database import Base, get_db
from kleelab.core.rate_limiter import RateLimitMiddleware
from kleelab.main import app

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


def reset_rate_limits():
    current = app.middleware_stack
    while current:
        if isinstance(current, RateLimitMiddleware):
            current.requests.clear()
        current = getattr(current, "app", None)


@pytest_asyncio.fixture(scope="function")
async def db_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(db_engine):
    session_factory = async_sessionmaker(db_engine, expire_on_commit=False, class_=AsyncSession)
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture(scope="function")
async def client(db_session):
    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        reset_rate_limits()
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def auth_headers(client):
    reset_rate_limits()
    # Unique email per test fixture execution
    import uuid
    user_email = f"testuser_{uuid.uuid4().hex[:8]}@example.com"
    register_res = await client.post(
        "/api/auth/register",
        json={"email": user_email, "password": "password123", "full_name": "Test User"},
    )
    assert register_res.status_code == 201
    user_data = register_res.json()

    login_res = await client.post(
        "/api/auth/login",
        json={"email": user_email, "password": "password123"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}", "user_id": user_data["id"]}
