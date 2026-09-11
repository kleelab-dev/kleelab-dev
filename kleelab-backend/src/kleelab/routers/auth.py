"""Authentication API routes."""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.config import settings
from kleelab.core.database import get_db
from kleelab.core.security import (
    create_access_token,
    create_signed_token,
    decode_signed_token,
    get_current_user,
    get_password_hash,
    verify_password,
)
from kleelab.models.user import User
from kleelab.schemas.auth import Token, UserCreate, UserLogin, UserOut
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
async def login(user_data: UserLogin, db: AsyncSession = Depends(get_db)) -> Token:
    """Authenticate a user and return a bearer token."""

    ensure_password_supported(user_data.password)
    result = await db.execute(select(User).where(User.email == user_data.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(user_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        data={"user_id": str(user.id)},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return Token(access_token=access_token)


@router.post("/verify-email")
async def verify_email(token: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict[str, str]:
    """Verify the current user's email using a signed JWT token."""

    payload = decode_signed_token(token)
    if payload.get("purpose") != "email_verification":
        raise HTTPException(status_code=400, detail="Invalid verification token")
    if str(current_user.id) != payload.get("user_id"):
        raise HTTPException(status_code=400, detail="Token does not match the active user")
    current_user.is_verified = True
    await db.commit()
    return {"status": "verified"}


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