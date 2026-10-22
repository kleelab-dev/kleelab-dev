"""Care plans and time tracking, for the team."""

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from kleelab.schemas.project import Currency

CareInterval = Literal["month", "year"]
CareStatus = Literal["active", "paused", "ended"]

# A day's work at most; nobody logs more than that in one go.
MAX_ENTRY_MINUTES = 24 * 60


def _clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


class CarePlanCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    includes: str | None = Field(default=None, max_length=3000)
    amount_cents: int = Field(gt=0, le=2_000_000_000)
    currency: Currency
    interval: CareInterval = "month"
    minutes_included: int | None = Field(default=None, ge=15, le=1000 * 60)
    # The first invoice goes out on this day, or straight away when it is today or earlier.
    first_bill_on: date

    _strip = field_validator("includes")(_clean)


class CarePlanPatch(BaseModel):
    """Only what is sent changes. Send minutes_included as null to stop counting hours."""

    name: str | None = Field(default=None, min_length=2, max_length=100)
    includes: str | None = Field(default=None, max_length=3000)
    amount_cents: int | None = Field(default=None, gt=0, le=2_000_000_000)
    currency: Currency | None = None
    interval: CareInterval | None = None
    minutes_included: int | None = Field(default=None, ge=15, le=1000 * 60)
    next_bill_on: date | None = None
    status: CareStatus | None = None

    _strip = field_validator("includes")(_clean)


class CarePlanRow(BaseModel):
    """A live plan on the team's money page."""

    id: UUID
    project_id: UUID
    project_reference: str
    project_title: str
    client_name: str | None
    client_email: str | None
    name: str
    amount_cents: int
    currency: str
    interval: str
    status: str
    next_bill_on: date
    minutes_included: int | None
    minutes_used: int | None


class TimeEntryIn(BaseModel):
    worked_on: date
    minutes: int = Field(ge=1, le=MAX_ENTRY_MINUTES)
    stage_id: UUID | None = None
    note: str | None = Field(default=None, max_length=300)

    _strip = field_validator("note")(_clean)


class TimeEntryOut(BaseModel):
    id: UUID
    project_id: UUID
    user_id: UUID | None
    user_name: str | None
    stage_id: UUID | None
    stage_name: str | None
    worked_on: date
    minutes: int
    note: str | None
    # Only the person who logged it can change it.
    mine: bool
    # Filled in on the timesheet, where entries from many projects are listed.
    project_reference: str | None = None
    project_title: str | None = None


class TimeTotal(BaseModel):
    id: UUID | None
    name: str
    minutes: int


class ProjectTime(BaseModel):
    entries: list[TimeEntryOut]
    total_minutes: int
    by_person: list[TimeTotal]
    by_stage: list[TimeTotal]


class TimeSheet(BaseModel):
    start: date
    end: date
    entries: list[TimeEntryOut]
    total_minutes: int
    by_project: list[TimeTotal]
