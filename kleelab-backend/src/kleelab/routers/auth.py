"""Authentication API routes."""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.config import settings
from kleelab.core.database import get_db
from kleelab.core.security import (
    create_signed_token,
    decode_signed_token,
    get_current_user,
    get_password_hash,
    verify_password,
)
from kleelab.models.user import User
from kleelab.schemas.auth import LogoutRequest, RefreshRequest, Token, UserCreate, UserLogin, UserOut
from kleelab.services import sessions
from kleelab.services.email import send_verification_email, send_password_reset_email, send_welcome_email


router = APIRouter(prefix="/api/auth", tags=["auth"])


def ensure_password_supported(password: str) -> None:
    if len(password.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be 72 bytes or fewer",
        )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)) -> User:
    """Register a new user account and send a verification email."""

    ensure_password_supported(user_data.password)
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    user = User(
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        provider="email",
        # Locally (AUTO_VERIFY_EMAILS=true) accounts are usable immediately because
        # email delivery is not configured. Production keeps the verification gate.
        is_verified=settings.AUTO_VERIFY_EMAILS,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_signed_token({"user_id": str(user.id), "purpose": "email_verification"}, timedelta(hours=24))
    try:
        send_verification_email(user.email, token)
        send_welcome_email(user.email, user.full_name)
    except Exception:
        # Account creation must not fail when optional email delivery is unavailable.
        pass
    return user


@router.post("/login", response_model=Token)
async def login(
    user_data: UserLogin, request: Request, db: AsyncSession = Depends(get_db)
) -> Token:
    """Authenticate a user and issue an access + refresh token pair."""

    ensure_password_supported(user_data.password)
    result = await db.execute(select(User).where(User.email == user_data.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(user_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    tokens = await sessions.issue_tokens(user, db, request.headers.get("user-agent"))
    return Token(**tokens)


@router.post("/refresh", response_model=Token)
async def refresh(
    payload: RefreshRequest, request: Request, db: AsyncSession = Depends(get_db)
) -> Token:
    """Exchange a refresh token for a new pair, rotating the old one."""

    try:
        _, tokens = await sessions.rotate(
            payload.refresh_token, db, request.headers.get("user-agent")
        )
    except sessions.RefreshError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(error),
            headers={"WWW-Authenticate": "Bearer"},
        ) from error

    return Token(**tokens)


@router.post("/logout")
async def logout(payload: LogoutRequest, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    """Revoke a refresh token.

    Deliberately unauthenticated: presenting the token is itself proof of
    ownership, and signing out must still work once the access token has expired.
    """

    if payload.refresh_token:
        await sessions.revoke(payload.refresh_token, db)
    return {"status": "signed_out"}


@router.post("/logout-all")
async def logout_all(
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
) -> dict[str, str]:
    """Revoke every active session for the authenticated user."""

    await sessions.revoke_all_for_user(current_user.id, db)
    return {"status": "signed_out_all"}


@router.post("/resend-verification")
async def resend_verification(
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Send a fresh email-verification link to the authenticated user."""

    if current_user.is_verified:
        return {"status": "already_verified"}

    token = create_signed_token(
        {"user_id": str(current_user.id), "purpose": "email_verification"},
        timedelta(hours=24),
    )
    try:
        send_verification_email(current_user.email, token)
    except Exception as error:  # noqa: BLE001 - surfaced to the caller
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email delivery is not configured, so a verification link cannot be sent.",
        ) from error

    return {"status": "verification_email_sent"}


@router.post("/verify-email")
async def verify_email(token: str, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    """Verify an email address from a signed link.

    Unauthenticated on purpose: the link is opened from an inbox, so there may be
    no session. The signed, single-purpose token identifies the user.
    """

    payload = decode_signed_token(token)
    if payload.get("purpose") != "email_verification":
        raise HTTPException(status_code=400, detail="Invalid verification token")

    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid verification token")

    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_verified = True
    await db.commit()
    return {"status": "verified"}


@router.post("/forgot-password")
async def forgot_password(email: str, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    """Alias for /request-password-reset."""

    return await request_password_reset(email, db)


@router.post("/request-password-reset")
async def request_password_reset(email: str, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    """Generate a password reset token and send it to the user if the account exists."""

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        return {"status": "if_account_exists_reset_email_sent"}
    token = create_signed_token({"user_id": str(user.id), "purpose": "password_reset"}, timedelta(minutes=15))
    send_password_reset_email(user.email, token)
    return {"status": "reset_email_sent"}


@router.post("/reset-password")
async def reset_password(token: str, new_password: str, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    """Reset a user's password with a valid signed token."""

    payload = decode_signed_token(token)
    if payload.get("purpose") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid reset token")
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid reset token")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = get_password_hash(new_password)
    await db.commit()
    return {"status": "password_reset"}


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)) -> User:
    """Return the authenticated user."""

    return current_user