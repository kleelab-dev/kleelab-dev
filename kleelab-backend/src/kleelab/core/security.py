"""Password hashing and JWT authentication helpers."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.config import settings
from kleelab.core.database import get_db
from kleelab.models.user import User


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# `auto_error=False` so the same dependency can serve anonymous visitors.
optional_bearer = HTTPBearer(auto_error=False)

# bcrypt only considers the first 72 bytes of a password and raises ValueError
# beyond that. Callers validate this up front (see routers/auth.py), but we
# truncate defensively so hashing can never blow up with a 500.
BCRYPT_MAX_BYTES = 72


def _password_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:BCRYPT_MAX_BYTES]


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against its bcrypt hash."""

    try:
        return bcrypt.checkpw(
            _password_bytes(plain_password), hashed_password.encode("utf-8")
        )
    except (ValueError, TypeError):
        # Malformed/legacy hash - treat as a failed login instead of a 500.
        return False


def get_password_hash(password: str) -> str:
    """Hash a plaintext password with bcrypt."""

    return bcrypt.hashpw(_password_bytes(password), bcrypt.gensalt()).decode("utf-8")


def create_access_token(
    data: dict[str, Any], expires_delta: timedelta | None = None
) -> str:
    """Create a signed JWT with issued-at and expiration claims."""

    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta
        if expires_delta is not None
        else timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"iat": now, "exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_signed_token(data: dict[str, Any], expires_delta: timedelta) -> str:
    """Create a short-lived signed token used for email verification and password resets."""

    to_encode = data.copy()
    to_encode.update({"exp": datetime.now(timezone.utc) + expires_delta})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


# --- Refresh tokens -------------------------------------------------------
# Opaque random strings rather than JWTs, so they can be revoked and rotated.
# Only the hash is persisted.

REFRESH_TOKEN_BYTES = 48


def generate_refresh_token() -> str:
    """Create a new opaque refresh token."""

    return secrets.token_urlsafe(REFRESH_TOKEN_BYTES)


def hash_refresh_token(token: str) -> str:
    """Hash a refresh token for storage and lookup."""

    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def decode_signed_token(token: str) -> dict[str, Any]:
    """Decode and validate a signed token."""

    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Decode a bearer token and return its corresponding user."""

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("user_id")
        if not user_id:
            raise credentials_exception
        user_uuid = UUID(str(user_id))
    except (JWTError, ValueError):
        raise credentials_exception from None

    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_bearer),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Return the signed-in user, or None for an anonymous visitor.

    For public endpoints that behave the same either way but benefit from
    knowing who is asking - a contact form, for instance, where a signed-in
    submission can be attached to the account for follow-up.
    """

    if credentials is None:
        return None

    try:
        payload = jwt.decode(
            credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        user_id = payload.get("user_id")
        if not user_id:
            return None
        user_uuid = UUID(str(user_id))
    except (JWTError, ValueError):
        # An expired or malformed token makes the visitor anonymous; it must not
        # turn a public page into an error.
        return None

    return await db.scalar(select(User).where(User.id == user_uuid))