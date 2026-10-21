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
from kleelab.models.refresh_token import RefreshToken
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
    # Marked as an access token. Every other signed token (password reset,
    # invite, email verification, two-step challenge) carries the same
    # user_id and signature, so without this any of them would open a session.
    to_encode.update({"iat": now, "exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_signed_token(data: dict[str, Any], expires_delta: timedelta) -> str:
    """Create a short-lived signed token used for email verification and password resets."""

    to_encode = data.copy()
    to_encode.update({"exp": datetime.now(timezone.utc) + expires_delta})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def password_fingerprint(user: User) -> str:
    """Changes whenever the password does.

    Put in a reset or invite link, it makes the link single-use: once a new
    password is set, the link no longer matches.
    """

    return hashlib.sha256(user.password_hash.encode("utf-8")).hexdigest()[:16]


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


# A session that rotates more often than this inside one access token's
# lifetime is not a browser refreshing normally.
MAX_ROTATIONS_FOLLOWED = 20


async def session_alive(db: AsyncSession, session_id: UUID) -> bool:
    """Whether the session an access token was issued for is still signed in.

    Access tokens carry the id of the refresh token issued with them (`sid`).
    Rotation replaces that refresh token, so the chain of replacements is
    followed to the newest one: the session is alive while that one has not
    been revoked. Signing out, "sign out other devices" and a password change
    revoke without a replacement, so the access tokens of those sessions stop
    working straight away instead of lasting until they expire.
    """

    current: UUID | None = session_id
    for _ in range(MAX_ROTATIONS_FOLLOWED):
        record = await db.get(RefreshToken, current)
        if record is None:
            return False
        if record.revoked_at is None:
            return True
        if record.replaced_by is None:
            return False
        current = record.replaced_by
    return False


def token_session_id(token: str) -> UUID | None:
    """The session id in an access token, or None for one issued before sessions were tracked."""

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        sid = payload.get("sid")
        return UUID(str(sid)) if sid else None
    except (JWTError, ValueError):
        return None


async def current_session_id(token: str = Depends(oauth2_scheme)) -> UUID | None:
    """Dependency: the session the caller signed in with. Use next to get_current_user."""

    return token_session_id(token)


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
        if not user_id or payload.get("type") != "access":
            raise credentials_exception
        user_uuid = UUID(str(user_id))
        sid = payload.get("sid")
        session_uuid = UUID(str(sid)) if sid else None
    except (JWTError, ValueError):
        raise credentials_exception from None

    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    # A deactivated account loses access straight away, not when its token expires.
    if user is None or not user.is_active:
        raise credentials_exception
    # So does a session that was signed out, from this device or another one.
    if session_uuid is not None and not await session_alive(db, session_uuid):
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
        if not user_id or payload.get("type") != "access":
            return None
        user_uuid = UUID(str(user_id))
        sid = payload.get("sid")
        session_uuid = UUID(str(sid)) if sid else None
    except (JWTError, ValueError):
        # An expired or malformed token makes the visitor anonymous; it must not
        # turn a public page into an error.
        return None

    user = await db.scalar(select(User).where(User.id == user_uuid))
    if user is None or not user.is_active:
        return None
    if session_uuid is not None and not await session_alive(db, session_uuid):
        return None
    return user
