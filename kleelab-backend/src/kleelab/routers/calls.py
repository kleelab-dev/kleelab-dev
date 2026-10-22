"""Free first calls, booked from the site.

Two routers. The public one, under /api/calls, lists open times and takes a
booking; the booker moves or cancels it from the link in their email, with no
account. The team's, under /api/admin/calls, lists calls and cancels one.
Booking makes an enquiry too, so the call sits with everything else the team
knows about that person.
"""

import logging
from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.config import settings
from kleelab.core.database import get_db
from kleelab.models.agency_lead import OPEN_LEAD_STATUSES, AgencyLead
from kleelab.models.call import CallBooking
from kleelab.models.user import User
from kleelab.routers.admin import require_staff
from kleelab.schemas.call import CallBook, CallBooked, CallCancel, CallMove, CallOut, CallSlots, TeamCallOut
from kleelab.services import activity
from kleelab.services import calls as svc
from kleelab.services import email as email_svc
from kleelab.services import projects as project_svc
from kleelab.services.activity import quoted

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/calls", tags=["calls"])
team_router = APIRouter(prefix="/api/admin/calls", tags=["admin"], dependencies=[Depends(require_staff)])

TAKEN = "Someone has just booked that time. Pick another one."
# Calls the team list keeps showing after they happened or were cancelled.
RECENT_DAYS = 14


def _confirm(booking: CallBooking, moved: bool = False) -> None:
    try:
        email_svc.send_call_confirmation(
            booking.email, booking.name, svc.when(booking), booking.duration_minutes,
            svc.manage_url(booking), svc.calendar_url(booking), settings.MEETING_URL, moved=moved,
        )
    except Exception:  # noqa: BLE001 - the booking is already saved
        logger.exception("Could not confirm the call for %s", booking.email)


def _tell_team(booking: CallBooking, subject: str, lines: list[str]) -> None:
    try:
        email_svc.send_team_notice(subject, lines, path=f"leads/{booking.lead_id}")
    except Exception:  # noqa: BLE001
        logger.exception("Could not tell the team about the call with %s", booking.email)


async def _by_token(db: AsyncSession, token: str) -> CallBooking:
    booking = await db.scalar(select(CallBooking).where(CallBooking.token == token).with_for_update())
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call not found")
    return booking


def _check_changeable(booking: CallBooking) -> None:
    if booking.status == "cancelled":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This call is already cancelled.")
    if svc.is_past(booking):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This call has already happened.")


# --- The visitor's side -----------------------------------------------------------


@router.get("/slots", response_model=CallSlots)
async def list_slots(db: AsyncSession = Depends(get_db)) -> CallSlots:
    slots = svc.open_slots(await svc.taken_slots(db))
    return CallSlots(
        duration_minutes=settings.CALL_MINUTES,
        timezone_label=settings.CALL_TIMEZONE_LABEL,
        utc_offset_minutes=settings.CALL_UTC_OFFSET_MINUTES,
        slots=[svc.aware(s) for s in slots],
    )


@router.post("", response_model=CallBooked, status_code=status.HTTP_201_CREATED)
async def book_call(payload: CallBook, request: Request, db: AsyncSession = Depends(get_db)) -> CallBooked:
    starts_at = svc.as_utc(payload.starts_at)
    if payload.website:
        # As with the contact form: look like it worked, keep nothing.
        logger.info("Discarded call booking from %s: honeypot field was filled", payload.email)
        return svc.booked(CallBooking(
            name=payload.name, email=str(payload.email), starts_at=starts_at, duration_minutes=settings.CALL_MINUTES,
            status="booked", token=svc.new_token(),
        ))

    email = str(payload.email).lower()
    already = await db.scalar(
        select(CallBooking).where(
            CallBooking.email == email, CallBooking.status == "booked", CallBooking.starts_at > project_svc.now()
        ).limit(1)
    )
    if already is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"You already have a call booked for {svc.when(already)}. "
            "Use the link in your confirmation email to move it.",
        )
    if not await svc.is_open(db, starts_at):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=TAKEN)

    name = payload.name.strip()
    notes = (payload.notes or "").strip() or None
    company = (payload.company or "").strip() or None
    # An enquiry still being talked about gets the call; otherwise it is a new one.
    lead = await db.scalar(
        select(AgencyLead)
        .where(AgencyLead.email == email, AgencyLead.status.in_(OPEN_LEAD_STATUSES))
        .order_by(AgencyLead.created_at.desc())
        .limit(1)
    )
    if lead is None:
        lead = AgencyLead(email=email, name=name, company=company, message=notes, source="call", status="call")
        db.add(lead)
        await db.flush()
    elif lead.status in ("new", "contacted"):
        # Further along already (a proposal is out) stays where it is.
        lead.status = "call"
    booking = CallBooking(
        lead_id=lead.id, name=name, email=email, company=company, notes=notes,
        starts_at=starts_at, duration_minutes=settings.CALL_MINUTES, status="booked", token=svc.new_token(),
    )
    db.add(booking)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=TAKEN) from None
    activity.record(
        db, None, "call.booked",
        f"Booked a call for {svc.when(booking)}" + (f": {quoted(notes)}" if notes else ""),
        subject_type="lead", subject_id=lead.id, request=request, label=name,
    )
    await db.commit()

    _confirm(booking)
    _tell_team(booking, f"Call booked: {name}, {svc.when(booking)}", [
        f"{name} ({email}){f' from {company}' if company else ''} booked a {booking.duration_minutes}-minute call "
        f"for {svc.when(booking)}.",
        f"They want to talk about: {notes}" if notes else "They did not say what about.",
    ])
    return svc.booked(booking)


@router.get("/{token}", response_model=CallOut)
async def read_call(token: str, db: AsyncSession = Depends(get_db)) -> CallOut:
    return svc.public(await _by_token(db, token))


@router.post("/{token}/reschedule", response_model=CallOut)
async def move_call(token: str, payload: CallMove, request: Request, db: AsyncSession = Depends(get_db)) -> CallOut:
    booking = await _by_token(db, token)
    _check_changeable(booking)
    starts_at = svc.as_utc(payload.starts_at)
    if starts_at == booking.starts_at:
        return svc.public(booking)
    if not await svc.is_open(db, starts_at, leave_out=booking.id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=TAKEN)
    was = svc.when(booking)
    booking.starts_at = starts_at
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=TAKEN) from None
    activity.record(db, None, "call.moved", f"Moved their call from {was} to {svc.when(booking)}",
                    subject_type="lead", subject_id=booking.lead_id, request=request, label=booking.name)
    await db.commit()
    _confirm(booking, moved=True)
    _tell_team(booking, f"Call moved: {booking.name}, now {svc.when(booking)}",
               [f"{booking.name} ({booking.email}) moved their call from {was} to {svc.when(booking)}."])
    return svc.public(booking)


@router.post("/{token}/cancel", response_model=CallOut)
async def cancel_call(token: str, payload: CallCancel, request: Request, db: AsyncSession = Depends(get_db)) -> CallOut:
    booking = await _by_token(db, token)
    _check_changeable(booking)
    reason = (payload.reason or "").strip() or None
    booking.status = "cancelled"
    booking.cancelled_at = project_svc.now()
    booking.cancelled_by = "client"
    booking.cancel_reason = reason
    activity.record(
        db, None, "call.cancelled",
        f"Cancelled their call on {svc.when(booking)}" + (f": {quoted(reason)}" if reason else ""),
        subject_type="lead", subject_id=booking.lead_id, request=request, label=booking.name,
    )
    await db.commit()
    try:
        email_svc.send_call_cancelled(booking.email, booking.name, svc.when(booking), svc.book_url(), by_team=False)
    except Exception:  # noqa: BLE001
        logger.exception("Could not confirm the cancelled call for %s", booking.email)
    _tell_team(booking, f"Call cancelled: {booking.name}, {svc.when(booking)}", [
        f"{booking.name} ({booking.email}) cancelled their call on {svc.when(booking)}.",
        f"Their reason: {reason}" if reason else "They did not give a reason.",
    ])
    return svc.public(booking)


# --- The team's side ----------------------------------------------------------------


@team_router.get("", response_model=list[TeamCallOut])
async def list_calls(db: AsyncSession = Depends(get_db)) -> list[TeamCallOut]:
    """Calls still to come, then the last two weeks' worth, soonest first."""

    since = project_svc.now() - timedelta(days=RECENT_DAYS)
    rows = await db.scalars(
        select(CallBooking)
        .where(or_(CallBooking.starts_at >= since, CallBooking.status == "booked"))
        .order_by(CallBooking.starts_at)
        .limit(200)
    )
    return [svc.team(b) for b in rows]


@team_router.post("/{call_id}/cancel", response_model=TeamCallOut)
async def team_cancel_call(
    call_id: UUID, payload: CallCancel, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> TeamCallOut:
    """Cancel on the booker's behalf. They are emailed, with the reason, and asked to pick another time."""

    booking = await db.scalar(select(CallBooking).where(CallBooking.id == call_id).with_for_update())
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call not found")
    _check_changeable(booking)
    reason = (payload.reason or "").strip() or None
    booking.status = "cancelled"
    booking.cancelled_at = project_svc.now()
    booking.cancelled_by = "team"
    booking.cancel_reason = reason
    activity.record(
        db, staff, "call.cancelled",
        f"Cancelled the call with {booking.name} on {svc.when(booking)}" + (f": {quoted(reason)}" if reason else ""),
        subject_type="lead", subject_id=booking.lead_id,
    )
    await db.commit()
    try:
        email_svc.send_call_cancelled(
            booking.email, booking.name, svc.when(booking), svc.book_url(), by_team=True, reason=reason
        )
    except Exception:  # noqa: BLE001
        logger.exception("Could not tell %s their call was cancelled", booking.email)
    return svc.team(booking)
