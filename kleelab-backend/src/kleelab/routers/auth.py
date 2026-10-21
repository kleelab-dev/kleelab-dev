"""Authentication API routes."""

from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.config import settings
from kleelab.core.database import get_db
from kleelab.core.security import (
    create_signed_token,
    decode_signed_token,
    get_current_user,
    get_password_hash,
    password_fingerprint,
    verify_password,
)
from kleelab.core.time import utcnow
from kleelab.models.user import User
from kleelab.schemas.auth import (
    AccountOut,
    LogoutRequest,
    PasswordConfirm,
    PasswordResetRequest,
    PlanLimitsOut,
    PlanUsageOut,
    RecoveryCodesOut,
    RefreshRequest,
    Token,
    TwoStepChallenge,
    TwoStepCode,
    TwoStepDisable,
    TwoStepLogin,
    TwoStepSetup,
    TwoStepStatus,
    UserCreate,
    UserLogin,
    UserOut,
)
from kleelab.services import activity, sessions, two_step
from kleelab.services.email import (
    send_password_reset_email,
    send_security_notice,
    send_verification_email,
    send_welcome_email,
)
from kleelab.services.plans import plan_state


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


def _wrong_password() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect email or password",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def _authenticate(user_data: UserLogin, db: AsyncSession) -> User:
    ensure_password_supported(user_data.password)
    result = await db.execute(select(User).where(User.email == user_data.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(user_data.password, user.password_hash):
        raise _wrong_password()
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
    return user


# Staff and clients sign in at different doors: the public site uses /login,
# the team dashboard (kleelab-admin) uses /staff-login. Each refuses the other
# kind of account, so a staff password typed into the public site gets nowhere.


@router.post("/login", response_model=Token)
async def login(
    user_data: UserLogin, request: Request, db: AsyncSession = Depends(get_db)
) -> Token:
    """Client sign-in for the public site. Staff accounts are refused."""

    user = await _authenticate(user_data, db)
    if user.role == "staff":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Team accounts sign in on the team dashboard, not here.",
        )
    tokens = await sessions.issue_tokens(user, db, request.headers.get("user-agent"))
    return Token(**tokens)


TWO_STEP_CHALLENGE_MINUTES = 5


@router.post("/staff-login", response_model=Token | TwoStepChallenge)
async def staff_login(
    user_data: UserLogin, request: Request, db: AsyncSession = Depends(get_db)
) -> Token | TwoStepChallenge:
    """Team sign-in for the admin app. Only staff accounts get a session.

    With two-step sign-in on, the right password gets a short-lived challenge
    instead of a session, to be exchanged with a code at /staff-login/two-step.
    """

    ensure_password_supported(user_data.password)
    user = await db.scalar(select(User).where(User.email == user_data.email))
    if user is None or not verify_password(user_data.password, user.password_hash):
        if user is not None and user.role == "staff":
            activity.record(db, user, "auth.sign_in_failed", "Failed to sign in: wrong password", request=request)
            await db.commit()
        raise _wrong_password()
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
    if user.role != "staff":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This sign-in is for the KleeLab team only.",
        )
    if two_step.is_enabled(user):
        challenge = create_signed_token(
            {"user_id": str(user.id), "purpose": "two_step", "pf": password_fingerprint(user)},
            timedelta(minutes=TWO_STEP_CHALLENGE_MINUTES),
        )
        return TwoStepChallenge(challenge=challenge, expires_in=TWO_STEP_CHALLENGE_MINUTES * 60)
    activity.record(db, user, "auth.sign_in", "Signed in", request=request)
    tokens = await sessions.issue_tokens(user, db, request.headers.get("user-agent"))
    return Token(**tokens)


def _too_many_codes(minutes: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=f"Too many wrong codes. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
    )


def _warn_locked(user: User) -> None:
    try:
        send_security_notice(
            user.email,
            "Wrong two-step codes on your KleeLab account",
            [
                f"Someone typed {two_step.MAX_FAILURES} wrong two-step codes for your team account, "
                f"so codes are blocked for {two_step.LOCK_MINUTES} minutes.",
                "If it was you, wait and try again. If not, your password is known to someone: "
                "change it now and tell the team.",
            ],
        )
    except Exception:  # noqa: BLE001
        pass


@router.post("/staff-login/two-step", response_model=Token)
async def staff_login_two_step(
    body: TwoStepLogin, request: Request, db: AsyncSession = Depends(get_db)
) -> Token:
    """Second half of a team sign-in: a code from the app, or a recovery code."""

    expired = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="This sign-in has expired. Start again with your password.",
    )
    try:
        payload = decode_signed_token(body.challenge)
        user_id = UUID(str(payload.get("user_id")))
    except (JWTError, ValueError):
        raise expired from None
    if payload.get("purpose") != "two_step":
        raise expired
    user = await db.get(User, user_id)
    if (
        user is None
        or not user.is_active
        or user.role != "staff"
        or not two_step.is_enabled(user)
        or payload.get("pf") != password_fingerprint(user)
    ):
        raise expired

    now = utcnow()
    minutes = two_step.locked_minutes(user, now)
    if minutes:
        raise _too_many_codes(minutes)
    method = two_step.check(user, body.code, now)
    if method is None:
        activity.record(db, user, "auth.code_failed", "Failed to sign in: wrong two-step code", request=request)
        locked = two_step.just_locked(user, now)
        if locked:
            activity.record(
                db, user, "auth.locked",
                f"Two-step codes blocked for {two_step.LOCK_MINUTES} minutes after {two_step.MAX_FAILURES} wrong ones",
                request=request,
            )
        await db.commit()
        if locked:
            _warn_locked(user)
            raise _too_many_codes(two_step.LOCK_MINUTES)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="That code is not right.")

    summary = "Signed in"
    if method == "recovery":
        summary = f"Signed in with a recovery code ({two_step.recovery_codes_left(user)} left)"
    activity.record(db, user, "auth.sign_in", summary, request=request)
    tokens = await sessions.issue_tokens(user, db, request.headers.get("user-agent"))
    if method == "recovery":
        try:
            send_security_notice(
                user.email,
                "A recovery code was used on your KleeLab account",
                [
                    "Someone signed in to your team account with one of your recovery codes. "
                    f"You have {two_step.recovery_codes_left(user)} left.",
                    "If it was you, make a new set on your Account page. If not, change your password now.",
                ],
            )
        except Exception:  # noqa: BLE001
            pass
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
) -> dict[str, str | bool]:
    """Send a fresh email-verification link to the authenticated user."""

    if current_user.is_verified:
        return {"status": "already_verified", "delivered": False}

    token = create_signed_token(
        {"user_id": str(current_user.id), "purpose": "email_verification"},
        timedelta(hours=24),
    )

    try:
        delivered = send_verification_email(current_user.email, token)
    except Exception as error:  # noqa: BLE001 - surfaced to the caller
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The email provider rejected the request. Please try again shortly.",
        ) from error

    if delivered:
        return {"status": "verification_email_sent", "delivered": True}

    # No provider configured. Say so instead of reporting success, and in
    # development the message (with its link) is in the server log.
    if settings.ENVIRONMENT == "development":
        return {"status": "verification_email_logged", "delivered": False}

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Email delivery is not configured, so a verification link cannot be sent.",
    )


@router.post("/verify-email")
async def verify_email(token: str, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    """Verify an email address from a signed link.

    Unauthenticated on purpose: the link is opened from an inbox, so there may be
    no session. The signed, single-purpose token identifies the user.
    """

    try:
        payload = decode_signed_token(token)
    except JWTError:
        raise HTTPException(status_code=400, detail="This link has expired. Ask for a new one.") from None
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
    token = create_signed_token(
        {"user_id": str(user.id), "purpose": "password_reset", "pf": password_fingerprint(user)},
        timedelta(minutes=15),
    )
    send_password_reset_email(user.email, token, staff=user.role == "staff")
    return {"status": "reset_email_sent"}


@router.post("/reset-password")
async def reset_password(body: PasswordResetRequest, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    """Set a new password from an emailed link.

    Serves both "forgot password" and the invite a new client gets when the team
    opens a project for them. Every existing session is signed out afterwards.
    """

    try:
        payload = decode_signed_token(body.token)
    except JWTError:
        raise HTTPException(status_code=400, detail="This link has expired. Ask for a new one.") from None
    if payload.get("purpose") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid reset token")
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid reset token")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    # Links carry a fingerprint of the password they were sent for (older
    # links do not), so once a new password is set the link stops working.
    if "pf" in payload and payload["pf"] != password_fingerprint(user):
        raise HTTPException(status_code=400, detail="This link has already been used. Ask for a new one.")
    first_time = not user.is_verified and user.provider == "invite"
    user.password_hash = get_password_hash(body.new_password)
    # Following the link proves the address, which matters for invited clients.
    user.is_verified = True
    if user.role == "staff":
        activity.record(
            db, user, "auth.password_set" if first_time else "auth.password_reset",
            "Chose a password and joined" if first_time else "Reset their password",
            subject_type="staff", subject_id=user.id,
        )
    await db.commit()
    await sessions.revoke_all_for_user(user.id, db)
    return {"status": "password_reset"}


@router.get("/me", response_model=AccountOut)
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AccountOut:
    """Return the authenticated user with its plan and usage."""

    state = await plan_state(db, current_user)
    return AccountOut(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        avatar_url=current_user.avatar_url,
        is_verified=current_user.is_verified,
        plan=state["plan"],
        role=current_user.role,
        created_at=current_user.created_at,
        plan_label=state["label"],
        plan_blurb=state["blurb"],
        two_step_enabled=two_step.is_enabled(current_user),
        limits=PlanLimitsOut(**state["limits"]),
        usage=PlanUsageOut(**state["usage"]),
    )


# --- Two-step sign-in, set up from the team dashboard's Account page --------------------


async def _staff_account(current_user: User = Depends(get_current_user)) -> User:
    # Clients sign in on the public site, which does not ask for codes.
    if current_user.role != "staff":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return current_user


def _check_password(user: User, password: str) -> None:
    # 400, not 401: the session is fine, and a 401 would sign the dashboard out.
    if not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That password is not right.")


def _require_enabled(user: User) -> None:
    if not two_step.is_enabled(user):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Two-step sign-in is not on.")


async def _check_code(db: AsyncSession, user: User, code: str, *, allow_recovery: bool = True) -> str:
    now = utcnow()
    minutes = two_step.locked_minutes(user, now)
    if minutes:
        raise _too_many_codes(minutes)
    method = two_step.check(user, code, now, allow_recovery=allow_recovery)
    if method is None:
        activity.record(db, user, "auth.code_failed", "Typed a wrong two-step code on the Account page")
        await db.commit()
        if two_step.just_locked(user, now):
            _warn_locked(user)
            raise _too_many_codes(two_step.LOCK_MINUTES)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That code is not right.")
    return method


def _notice(user: User, subject: str, line: str) -> None:
    try:
        send_security_notice(
            user.email, subject, [line, "If this was not you, change your password now and tell the team."]
        )
    except Exception:  # noqa: BLE001
        pass


@router.get("/two-step", response_model=TwoStepStatus)
async def two_step_status(user: User = Depends(_staff_account)) -> TwoStepStatus:
    return TwoStepStatus(
        enabled=two_step.is_enabled(user),
        enabled_at=user.two_step_enabled_at,
        recovery_codes_left=two_step.recovery_codes_left(user) if two_step.is_enabled(user) else 0,
    )


@router.post("/two-step/setup", response_model=TwoStepSetup)
async def two_step_setup(
    body: PasswordConfirm, db: AsyncSession = Depends(get_db), user: User = Depends(_staff_account)
) -> TwoStepSetup:
    """Start setting up: a new secret to scan. Nothing changes until /enable gets a code from it."""

    if two_step.is_enabled(user):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Two-step sign-in is already on.")
    _check_password(user, body.password)
    secret = two_step.new_secret()
    user.totp_secret = two_step.encrypt_secret(secret)
    user.two_step_last_step = None
    await db.commit()
    uri = two_step.otpauth_uri(secret, user.email)
    return TwoStepSetup(secret=secret, otpauth_uri=uri, qr_svg=two_step.qr_data_uri(uri))


@router.post("/two-step/enable", response_model=RecoveryCodesOut)
async def two_step_enable(
    body: TwoStepCode, db: AsyncSession = Depends(get_db), user: User = Depends(_staff_account)
) -> RecoveryCodesOut:
    """Finish setting up with a code from the app. Returns the recovery codes, once."""

    if two_step.is_enabled(user):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Two-step sign-in is already on.")
    secret = two_step.decrypt_secret(user.totp_secret)
    if secret is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Start the set-up again.")
    step = two_step.match_code(secret, body.code, None)
    if step is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That code is not right. Use the newest code, and check your phone sets its clock automatically.",
        )
    user.two_step_last_step = step
    user.two_step_enabled_at = utcnow()
    user.two_step_failures = 0
    user.two_step_locked_until = None
    codes = two_step.new_recovery_codes(user)
    activity.record(db, user, "two_step.on", "Turned on two-step sign-in", subject_type="staff", subject_id=user.id)
    await db.commit()
    _notice(user, "Two-step sign-in is on", "Two-step sign-in was turned on for your KleeLab team account.")
    return RecoveryCodesOut(codes=codes)


@router.post("/two-step/disable", response_model=TwoStepStatus)
async def two_step_disable(
    body: TwoStepDisable, db: AsyncSession = Depends(get_db), user: User = Depends(_staff_account)
) -> TwoStepStatus:
    _require_enabled(user)
    _check_password(user, body.password)
    await _check_code(db, user, body.code)
    two_step.turn_off(user)
    activity.record(db, user, "two_step.off", "Turned off two-step sign-in", subject_type="staff", subject_id=user.id)
    await db.commit()
    _notice(user, "Two-step sign-in is off", "Two-step sign-in was turned off for your KleeLab team account.")
    return TwoStepStatus(enabled=False, enabled_at=None, recovery_codes_left=0)


@router.post("/two-step/recovery-codes", response_model=RecoveryCodesOut)
async def two_step_new_recovery_codes(
    body: TwoStepCode, db: AsyncSession = Depends(get_db), user: User = Depends(_staff_account)
) -> RecoveryCodesOut:
    """A fresh set of recovery codes; the old ones stop working. Needs a code from the app."""

    _require_enabled(user)
    await _check_code(db, user, body.code, allow_recovery=False)
    codes = two_step.new_recovery_codes(user)
    activity.record(db, user, "two_step.new_codes", "Made new recovery codes", subject_type="staff", subject_id=user.id)
    await db.commit()
    return RecoveryCodesOut(codes=codes)
