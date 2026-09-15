"""Authentication request and response schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


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


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    refresh_token: str | None = None
    expires_in: int | None = None


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
    limits: PlanLimitsOut
    usage: PlanUsageOut