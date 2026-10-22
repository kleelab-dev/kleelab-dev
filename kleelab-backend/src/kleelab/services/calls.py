"""Free first calls: which times are open, and how a booking is shown.

Times are stored as naive UTC like everything else. Opening hours are set in
the team's own time, a fixed offset from UTC (see CALL_UTC_OFFSET_MINUTES), and
the visitor's browser shows each slot in their own time.
"""

from __future__ import annotations

import secrets
from datetime import date, datetime, time, timedelta, timezone
from urllib.parse import urlencode
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.config import settings
from kleelab.models.call import CallBooking
from kleelab.schemas.call import CallBooked, CallOut, TeamCallOut
from kleelab.services import projects as project_svc


def offset() -> timedelta:
    return timedelta(minutes=settings.CALL_UTC_OFFSET_MINUTES)


def as_utc(moment: datetime) -> datetime:
    """Naive UTC, whether the caller sent a time with a zone or without (taken as UTC)."""

    if moment.tzinfo is not None:
        moment = moment.astimezone(timezone.utc).replace(tzinfo=None)
    return moment.replace(second=0, microsecond=0)


def aware(moment: datetime) -> datetime:
    """Marked as UTC on the way out, so a browser never reads it as its own local time."""

    return moment.replace(tzinfo=timezone.utc)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def open_slots(taken: set[datetime], now: datetime | None = None) -> list[datetime]:
    """Every free start time, soonest first: weekdays in opening hours, with enough notice."""

    now = now or project_svc.now()
    step = timedelta(minutes=settings.CALL_MINUTES)
    earliest = now + timedelta(hours=settings.CALL_MIN_NOTICE_HOURS)
    latest = now + timedelta(days=settings.CALL_BOOKING_DAYS)
    first_day: date = (now + offset()).date()
    slots = []
    for days in range(settings.CALL_BOOKING_DAYS + 1):
        day = first_day + timedelta(days=days)
        if day.weekday() >= 5:
            continue
        local = datetime.combine(day, time(settings.CALL_DAY_START_HOUR))
        closes = datetime.combine(day, time(settings.CALL_DAY_END_HOUR))
        while local + step <= closes:
            start = local - offset()
            if earliest <= start <= latest and start not in taken:
                slots.append(start)
            local += step
    return slots


async def taken_slots(db: AsyncSession, leave_out: UUID | None = None) -> set[datetime]:
    query = select(CallBooking.starts_at).where(CallBooking.status == "booked")
    if leave_out is not None:
        query = query.where(CallBooking.id != leave_out)
    return set(await db.scalars(query))


async def is_open(db: AsyncSession, starts_at: datetime, leave_out: UUID | None = None) -> bool:
    return starts_at in open_slots(await taken_slots(db, leave_out))


def is_past(booking: CallBooking) -> bool:
    return booking.starts_at <= project_svc.now()


def when(booking: CallBooking | datetime) -> str:
    """'Tuesday 4 November, 10:30 Lagos time (WAT)', in the team's time."""

    start = booking.starts_at if isinstance(booking, CallBooking) else booking
    local = start + offset()
    return f"{local:%A} {local.day} {local:%B}, {local:%H:%M} {settings.CALL_TIMEZONE_LABEL}"


def manage_url(booking: CallBooking) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/call/{booking.token}"


def book_url() -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/book"


def calendar_url(booking: CallBooking) -> str:
    """A Google Calendar 'add event' link. Other calendars take the details from the email."""

    end = booking.starts_at + timedelta(minutes=booking.duration_minutes)
    details = ["Your free first call with KleeLab."]
    if settings.MEETING_URL:
        details.append(f"Join: {settings.MEETING_URL}")
    details.append(f"Move or cancel: {manage_url(booking)}")
    query = urlencode({
        "action": "TEMPLATE",
        "text": "Call with KleeLab",
        "dates": f"{booking.starts_at:%Y%m%dT%H%M%S}Z/{end:%Y%m%dT%H%M%S}Z",
        "details": "\n".join(details),
        "location": settings.MEETING_URL or "",
    })
    return f"https://calendar.google.com/calendar/render?{query}"


def public(booking: CallBooking) -> CallOut:
    return CallOut(
        name=booking.name,
        company=booking.company,
        notes=booking.notes,
        starts_at=aware(booking.starts_at),
        duration_minutes=booking.duration_minutes,
        status=booking.status,
        past=is_past(booking),
        cancelled_at=booking.cancelled_at,
        cancelled_by=booking.cancelled_by,
        cancel_reason=booking.cancel_reason if booking.cancelled_by == "team" else None,
        # Only for a call still to happen.
        meeting_url=settings.MEETING_URL if booking.status == "booked" else None,
        calendar_url=calendar_url(booking),
        timezone_label=settings.CALL_TIMEZONE_LABEL,
        utc_offset_minutes=settings.CALL_UTC_OFFSET_MINUTES,
    )


def booked(booking: CallBooking) -> CallBooked:
    return CallBooked(**public(booking).model_dump(), token=booking.token)


def team(booking: CallBooking) -> TeamCallOut:
    return TeamCallOut(
        id=booking.id,
        lead_id=booking.lead_id,
        name=booking.name,
        email=booking.email,
        company=booking.company,
        phone=booking.phone,
        notes=booking.notes,
        starts_at=aware(booking.starts_at),
        duration_minutes=booking.duration_minutes,
        status=booking.status,
        cancelled_at=booking.cancelled_at,
        cancelled_by=booking.cancelled_by,
        cancel_reason=booking.cancel_reason,
        created_at=booking.created_at,
    )
