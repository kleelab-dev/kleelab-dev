"""Session lifecycle: issue, rotate, and revoke refresh tokens."""

from datetime import timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.config import settings
from kleelab.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
)
from kleelab.core.time import utcnow
from kleelab.models.refresh_token import RefreshToken
from kleelab.models.user import User


class RefreshError(Exception):
    """Raised when a refresh token cannot be exchanged for a new session."""


def _access_token_for(user: User) -> str:
    return create_access_token(
        data={"user_id": str(user.id)},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


async def issue_tokens(
    user: User, db: AsyncSession, user_agent: str | None = None
) -> dict[str, Any]:
    """Mint a fresh access + refresh token pair and persist the refresh token."""

    raw_refresh = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw_refresh),
            expires_at=utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            user_agent=(user_agent or "")[:255] or None,
        )
    )
    await db.commit()

    return {
        "access_token": _access_token_for(user),
        "refresh_token": raw_refresh,
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


async def rotate(
    raw_token: str, db: AsyncSession, user_agent: str | None = None
) -> tuple[User, dict[str, Any]]:
    """Exchange a refresh token for a new pair, revoking the old one.

    Presenting an already-revoked token is treated as theft: every session for
    that user is revoked rather than silently issuing another pair.
    """

    record = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_token))
    )
    if record is None:
        raise RefreshError("Unknown refresh token")

    if record.revoked_at is not None:
        await revoke_all_for_user(record.user_id, db)
        raise RefreshError("Refresh token has already been used")

    if record.expires_at <= utcnow():
        raise RefreshError("Refresh token has expired")

    user = await db.get(User, record.user_id)
    if user is None or not user.is_active:
        raise RefreshError("Account is unavailable")

    tokens = await issue_tokens(user, db, user_agent)

    replacement = await db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == hash_refresh_token(tokens["refresh_token"])
        )
    )
    record.revoked_at = utcnow()
    record.replaced_by = replacement.id if replacement else None
    await db.commit()

    return user, tokens


async def revoke(raw_token: str, db: AsyncSession) -> None:
    """Revoke a single refresh token. Unknown tokens are ignored."""

    record = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_token))
    )
    if record is not None and record.revoked_at is None:
        record.revoked_at = utcnow()
        await db.commit()


async def revoke_all_for_user(user_id: UUID, db: AsyncSession) -> None:
    """Revoke every active refresh token for a user (sign out everywhere)."""

    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    await db.commit()
