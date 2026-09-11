"""Async SQLAlchemy engine, session factory, and dependency."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

from kleelab.core.config import settings


engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.SQL_ECHO,
    pool_pre_ping=True,
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)
Base = declarative_base()

from kleelab.models import (  # noqa: E402, F401
    agency_lead, analytics, asset, order, page, page_version, product,
    site, template, user,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async database session and close it after use."""

    async with AsyncSessionLocal() as session:
        yield session