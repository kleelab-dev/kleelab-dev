"""Authentication request and response schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


def validate_password_size(value: str) -> str:
    if len(value.encode("utf-8")) > 72:
        raise ValueError("Password must be 72 bytes or fewer")
    return value


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None

    _validate_password = field_validator("password")(validate_password_size)


class UserLogin(BaseModel):
    email: EmailStr
    password: str

    _validate_password = field_validator("password")(validate_password_size)


class PasswordResetRequest(BaseModel):
    """Carried in the body: a password in a query string ends up in access logs."""

    token: str
    new_password: str = Field(min_length=8)

    _validate_password = field_validator("new_password")(validate_password_size)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    refresh_token: str | None = None
    expires_in: int | None = None


class TwoStepChallenge(BaseModel):
    """The password was right; now the code. No session yet."""

    two_step_required: bool = True
    challenge: str
    expires_in: int


class TwoStepLogin(BaseModel):
    challenge: str
    # A 6-digit code from the app, or a recovery code (xxxx-xxxx).
    code: str = Field(min_length=1, max_length=20)


class TwoStepStatus(BaseModel):
    enabled: bool
    enabled_at: datetime | None
    recovery_codes_left: int


class PasswordConfirm(BaseModel):
    password: str

    _validate_password = field_validator("password")(validate_password_size)


class TwoStepSetup(BaseModel):
    secret: str
    otpauth_uri: str
    # An SVG data URI of the QR code for otpauth_uri.
    qr_svg: str


class TwoStepCode(BaseModel):
    code: str = Field(min_length=1, max_length=20)


class TwoStepDisable(BaseModel):
    password: str
    code: str = Field(min_length=1, max_length=20)

    _validate_password = field_validator("password")(validate_password_size)


class RecoveryCodesOut(BaseModel):
    codes: list[str]


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str | None = None
    all_devices: bool = False


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    full_name: str | None
    avatar_url: str | None
    is_verified: bool
    plan: str
    # client | staff. The interface uses it to show the team their admin view.
    role: str = "client"
    created_at: datetime


class PlanLimitsOut(BaseModel):
    """What a plan includes. Mirrors `services/plans.PlanLimits`."""

    sites: int
    pages_per_site: int
    ai_builds_per_month: int
    ai_calls_per_day: int
    custom_domain: bool
    storefront: bool


class PlanUsageOut(BaseModel):
    """What the account has used."""

    sites: int
    ai_builds_this_month: int
    ai_calls_today: int


class AccountOut(UserOut):
    """`/api/auth/me`.

    Carries the limits and current usage alongside the account so the interface
    never has to hardcode a quota. Hardcoded client limits and server-enforced
    limits disagree the first time a limit changes, and the disagreement always
    surfaces as a confusing error at the moment a user tries to act.
    """

    plan_label: str
    plan_blurb: str
    two_step_enabled: bool = False
    limits: PlanLimitsOut
    usage: PlanUsageOut