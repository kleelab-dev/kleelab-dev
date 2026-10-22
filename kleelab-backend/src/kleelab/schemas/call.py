"""Booking a free first call."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class CallSlots(BaseModel):
    duration_minutes: int
    # The team's time zone, for "our time" next to the visitor's own.
    timezone_label: str
    utc_offset_minutes: int
    # Free start times in UTC, soonest first.
    slots: list[datetime]


class CallBook(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    company: str | None = Field(default=None, max_length=150)
    # The country code and the number, digits only: +2348031234567.
    phone: str = Field(pattern=r"^\+[1-9]\d{6,14}$")
    notes: str | None = Field(default=None, max_length=2000)
    starts_at: datetime
    # Honeypot, as on the contact form: hidden, so only a bot fills it in.
    website: str | None = Field(default=None, max_length=200)


class CallMove(BaseModel):
    starts_at: datetime


class CallCancel(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)


class CallOut(BaseModel):
    """What the booker sees on their manage page."""

    name: str
    company: str | None
    notes: str | None
    starts_at: datetime
    duration_minutes: int
    # booked | cancelled
    status: str
    # True once the call's start time has gone by.
    past: bool
    cancelled_at: datetime | None
    # client | team
    cancelled_by: str | None
    cancel_reason: str | None
    meeting_url: str | None
    calendar_url: str
    timezone_label: str
    utc_offset_minutes: int


class CallBooked(CallOut):
    # The key to the manage page, given once, right after booking.
    token: str


class TeamCallOut(BaseModel):
    id: UUID
    lead_id: UUID
    name: str
    email: str
    company: str | None
    phone: str | None
    notes: str | None
    starts_at: datetime
    duration_minutes: int
    status: str
    cancelled_at: datetime | None
    cancelled_by: str | None
    cancel_reason: str | None
    created_at: datetime
