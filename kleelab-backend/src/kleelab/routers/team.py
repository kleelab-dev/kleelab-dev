"""The team dashboard's team page, activity log and search."""

import logging
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from kleelab.core.database import get_db
from kleelab.core.time import utcnow
from kleelab.core.security import create_signed_token, get_password_hash, password_fingerprint
from kleelab.models.activity import ActivityEvent
from kleelab.models.agency_lead import AgencyLead
from kleelab.models.project import Project, ProjectInvoice, ProjectUpdate
from kleelab.models.refresh_token import RefreshToken
from kleelab.models.user import User
from kleelab.routers.admin import require_staff
from kleelab.schemas.team import (
    ActivityOut,
    ActivityPage,
    AlertList,
    AlertOut,
    SearchClient,
    SearchInvoice,
    SearchLead,
    SearchMessage,
    SearchProject,
    SearchResults,
    SearchTeammate,
    TeamCreate,
    TeamInviteResult,
    TeamMember,
    TeamPatch,
)
from kleelab.services import activity
from kleelab.services import projects as svc
from kleelab.services import sessions, two_step
from kleelab.services.email import send_security_notice, send_staff_invite_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_staff)])


# --- Team -------------------------------------------------------------------------


def _require_two_step(staff: User) -> None:
    """Changing who can get in needs an account that is itself hard to get into."""

    if not two_step.is_enabled(staff):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Turn on two-step sign-in for your own account first (Account page). "
            "Adding or switching off teammates needs it.",
        )


async def _members(db: AsyncSession, staff: User, ids: list[UUID] | None = None) -> list[TeamMember]:
    query = select(User).where(User.role == "staff")
    if ids is not None:
        query = query.where(User.id.in_(ids))
    users = list(await db.scalars(query.order_by(User.is_active.desc(), User.full_name, User.email)))
    user_ids = [u.id for u in users]
    signed_in = dict(
        (
            await db.execute(
                select(RefreshToken.user_id, func.max(RefreshToken.created_at))
                .where(RefreshToken.user_id.in_(user_ids))
                .group_by(RefreshToken.user_id)
            )
        ).all()
    ) if user_ids else {}
    in_charge = dict(
        (
            await db.execute(
                select(Project.owner_id, func.count())
                .where(Project.owner_id.in_(user_ids), Project.status.in_(("active", "on_hold")))
                .group_by(Project.owner_id)
            )
        ).all()
    ) if user_ids else {}
    return [
        TeamMember(
            id=u.id,
            name=u.full_name,
            email=u.email,
            is_active=u.is_active,
            two_step_enabled=two_step.is_enabled(u),
            created_at=u.created_at,
            last_sign_in=signed_in.get(u.id),
            projects_in_charge=int(in_charge.get(u.id, 0)),
            is_you=u.id == staff.id,
        )
        for u in users
    ]


async def _member(db: AsyncSession, staff: User, member_id: UUID) -> TeamMember:
    found = await _members(db, staff, [member_id])
    if not found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teammate not found")
    return found[0]


async def _load_teammate(db: AsyncSession, member_id: UUID) -> User:
    member = await db.get(User, member_id, populate_existing=True)
    if member is None or not svc.is_staff(member):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teammate not found")
    return member


def _send_staff_invite(member: User, inviter: User) -> bool:
    token = create_signed_token(
        {"user_id": str(member.id), "purpose": "password_reset", "pf": password_fingerprint(member)},
        timedelta(days=7),
    )
    try:
        return bool(send_staff_invite_email(member.email, member.full_name, svc.display_name(inviter), token))
    except Exception:  # noqa: BLE001
        logger.exception("Could not send the staff invite to %s", member.email)
        return False


@router.get("/team", response_model=list[TeamMember])
async def list_team(db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)) -> list[TeamMember]:
    return await _members(db, staff)


@router.post("/team", response_model=TeamInviteResult, status_code=status.HTTP_201_CREATED)
async def add_teammate(
    payload: TeamCreate, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> TeamInviteResult:
    """Give someone a team account and email them a link to choose a password."""

    _require_two_step(staff)
    email = str(payload.email).lower()
    if await db.scalar(select(User.id).where(func.lower(User.email) == email)) is not None:
        # Never turn an existing (client) account into a team one: whoever holds
        # that password would suddenly see every client's data.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That email already has a KleeLab account. Use a different address for their team account.",
        )
    member = User(
        email=email,
        password_hash=get_password_hash(svc.random_password()),
        full_name=payload.full_name.strip(),
        provider="invite",
        is_verified=False,
        role="staff",
    )
    db.add(member)
    await db.flush()
    activity.record(db, staff, "team.add", f"Added {member.full_name} ({email}) to the team",
                    subject_type="staff", subject_id=member.id)
    await db.commit()
    sent = _send_staff_invite(member, staff)
    return TeamInviteResult(member=await _member(db, staff, member.id), invite_sent=sent)


@router.post("/team/{member_id}/invite")
async def resend_staff_invite(
    member_id: UUID, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> dict:
    """A fresh 7-day link for a teammate who has not signed in yet."""

    member = await _load_teammate(db, member_id)
    if not member.is_active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Switch them back on first.")
    has_signed_in = await db.scalar(select(exists().where(RefreshToken.user_id == member.id)))
    if has_signed_in:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="They have already signed in. If they forgot their password, "
            "they can use “Forgot your password?” on the sign-in page.",
        )
    if not _send_staff_invite(member, staff):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The email could not be sent. Check the email settings and try again.",
        )
    activity.record(db, staff, "team.invite", f"Sent {activity.actor_label(member)} a new invite",
                    subject_type="staff", subject_id=member.id)
    await db.commit()
    return {"status": "sent", "email": member.email}


@router.patch("/team/{member_id}", response_model=TeamMember)
async def patch_teammate(
    member_id: UUID, payload: TeamPatch, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> TeamMember:
    """Rename a teammate, or switch their access off and on."""

    member = await _load_teammate(db, member_id)
    changes = payload.model_dump(exclude_unset=True)
    label = activity.actor_label(member)
    if "full_name" in changes:
        new_name = (changes["full_name"] or "").strip() or None
        if new_name != member.full_name:
            member.full_name = new_name
            activity.record(db, staff, "team.rename", f"Renamed {label} to {new_name or member.email}",
                            subject_type="staff", subject_id=member.id)
    switching = changes.get("is_active") is not None and changes["is_active"] != member.is_active
    if switching:
        _require_two_step(staff)
        if member.id == staff.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="You cannot switch off your own account."
            )
        member.is_active = changes["is_active"]
        activity.record(
            db, staff, "team.on" if member.is_active else "team.off",
            f"{'Switched on' if member.is_active else 'Switched off'} {label}'s team account",
            subject_type="staff", subject_id=member.id,
        )
    await db.commit()
    if switching and not member.is_active:
        await sessions.revoke_all_for_user(member.id, db)
    return await _member(db, staff, member.id)


@router.post("/team/{member_id}/reset-two-step", response_model=TeamMember)
async def reset_teammate_two_step(
    member_id: UUID, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> TeamMember:
    """For a teammate who lost their phone and their recovery codes.

    Their two-step is turned off and they are signed out everywhere; they sign
    in with their password and set it up again.
    """

    _require_two_step(staff)
    member = await _load_teammate(db, member_id)
    if member.id == staff.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Manage your own two-step sign-in on the Account page."
        )
    if not two_step.is_enabled(member):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="They do not have two-step sign-in on.")
    two_step.turn_off(member)
    activity.record(db, staff, "team.two_step_reset", f"Turned off two-step sign-in for {activity.actor_label(member)}",
                    subject_type="staff", subject_id=member.id)
    await db.commit()
    await sessions.revoke_all_for_user(member.id, db)
    try:
        send_security_notice(
            member.email,
            "Two-step sign-in was turned off on your KleeLab account",
            [
                f"{svc.display_name(staff)} turned off two-step sign-in on your team account, "
                "and you have been signed out everywhere.",
                "Sign in with your password, then set two-step sign-in up again on your Account page.",
                "If you did not ask for this, tell the team straight away.",
            ],
        )
    except Exception:  # noqa: BLE001
        logger.exception("Could not email %s about a two-step reset", member.email)
    return await _member(db, staff, member.id)


# --- Activity ------------------------------------------------------------------------


def _parse_cursor(before: str | None) -> tuple[datetime, UUID] | None:
    if not before:
        return None
    try:
        stamp, _, event_id = before.partition("~")
        return datetime.fromisoformat(stamp), UUID(event_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Bad cursor") from None


@router.get("/activity", response_model=ActivityPage)
async def list_activity(
    before: str | None = None,
    actor_id: UUID | None = None,
    project_id: UUID | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> ActivityPage:
    """Newest first. Page with `before`, taken from the previous page's `next_before`."""

    query = (
        select(ActivityEvent, Project.reference, Project.title, User.role, User.full_name, User.email)
        .outerjoin(Project, Project.id == ActivityEvent.project_id)
        .outerjoin(User, User.id == ActivityEvent.actor_id)
    )
    if actor_id is not None:
        query = query.where(ActivityEvent.actor_id == actor_id)
    if project_id is not None:
        query = query.where(ActivityEvent.project_id == project_id)
    cursor = _parse_cursor(before)
    if cursor is not None:
        stamp, event_id = cursor
        query = query.where(
            or_(
                ActivityEvent.created_at < stamp,
                (ActivityEvent.created_at == stamp) & (ActivityEvent.id < event_id),
            )
        )
    rows = (
        await db.execute(query.order_by(ActivityEvent.created_at.desc(), ActivityEvent.id.desc()).limit(limit + 1))
    ).all()
    more = len(rows) > limit
    rows = rows[:limit]
    events = [
        ActivityOut(
            id=event.id,
            action=event.action,
            summary=event.summary,
            actor_id=event.actor_id,
            # The current name when the account still exists, else the name it had.
            actor_name=(full_name or email) if email else event.actor_label,
            by_client=role is not None and role != "staff",
            project_id=event.project_id,
            project_reference=reference,
            project_title=title,
            subject_type=event.subject_type,
            subject_id=event.subject_id,
            created_at=event.created_at,
        )
        for event, reference, title, role, full_name, email in rows
    ]
    last = rows[-1][0] if rows and more else None
    return ActivityPage(
        events=events, next_before=f"{last.created_at.isoformat()}~{last.id}" if last is not None else None
    )


# --- Alerts ---------------------------------------------------------------------------

# What a client can do that someone on the team should look at, plus new enquiries.
ALERT_ACTIONS = (
    "update.message",
    "approval.approved",
    "approval.changes_requested",
    "request.create",
    "file.add",
    "lead.create",
    "proposal.viewed",
    "proposal.accepted",
    "proposal.declined",
    "call.booked",
    "call.moved",
    "call.cancelled",
    "checklist.done",
)


def _alerts_query(viewer: User):
    """Alert-worthy events by anyone but the team: clients, and visitors without an account."""

    return (
        select(ActivityEvent, Project.reference, Project.title, User.full_name, User.email)
        .outerjoin(Project, Project.id == ActivityEvent.project_id)
        .outerjoin(User, User.id == ActivityEvent.actor_id)
        .where(
            ActivityEvent.action.in_(ALERT_ACTIONS),
            or_(User.id.is_(None), User.role != "staff"),
            or_(ActivityEvent.actor_id.is_(None), ActivityEvent.actor_id != viewer.id),
        )
    )


@router.get("/alerts", response_model=AlertList)
async def list_alerts(db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)) -> AlertList:
    """The latest alerts, newest first, and how many came in since this teammate last looked."""

    seen_at = staff.alerts_seen_at
    rows = (
        await db.execute(
            _alerts_query(staff).order_by(ActivityEvent.created_at.desc(), ActivityEvent.id.desc()).limit(20)
        )
    ).all()
    unread_query = _alerts_query(staff)
    if seen_at is not None:
        unread_query = unread_query.where(ActivityEvent.created_at > seen_at)
    unread = await db.scalar(select(func.count()).select_from(unread_query.subquery()))
    return AlertList(
        items=[
            AlertOut(
                id=event.id,
                action=event.action,
                summary=event.summary,
                actor_name=(full_name or email) if email else event.actor_label,
                project_id=event.project_id,
                project_reference=reference,
                project_title=title,
                subject_type=event.subject_type,
                subject_id=event.subject_id,
                created_at=event.created_at,
                unread=seen_at is None or event.created_at > seen_at,
            )
            for event, reference, title, full_name, email in rows
        ],
        unread=int(unread or 0),
        seen_at=seen_at,
    )


@router.post("/alerts/seen")
async def mark_alerts_seen(db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)) -> dict:
    """Everything up to now counts as read, on every device this teammate uses."""

    staff.alerts_seen_at = utcnow()
    await db.commit()
    return {"status": "seen", "seen_at": staff.alerts_seen_at.isoformat()}


# --- Search ---------------------------------------------------------------------------


def _like(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _snippet(text: str, q: str, width: int = 120) -> str:
    """About `width` characters of `text` around the first match of `q`, on one line."""

    text = " ".join(text.split())
    if len(text) <= width:
        return text
    at = text.lower().find(" ".join(q.split()).lower())
    start = max(0, min(at - 40, len(text) - width)) if at >= 0 else 0
    piece = text[start:start + width].strip()
    return ("…" if start > 0 else "") + piece + ("…" if start + width < len(text) else "")


def _message_snippet(update: ProjectUpdate, q: str) -> str:
    """From the body when the words are in it; otherwise they matched the title."""

    body = " ".join(update.body.split())
    if update.title and " ".join(q.split()).lower() not in body.lower():
        return _snippet(update.title, q)
    return _snippet(body, q)


@router.get("/search", response_model=SearchResults)
async def search(q: str = Query(min_length=2, max_length=100), db: AsyncSession = Depends(get_db)) -> SearchResults:
    """Projects, clients, enquiries, invoices, teammates and posts matching `q`, a few of each."""

    pattern = _like(q.strip())
    per_kind = 6

    def has(column):
        return column.ilike(pattern, escape="\\")

    projects = await db.scalars(
        select(Project)
        .outerjoin(User, User.id == Project.client_id)
        .where(or_(has(Project.reference), has(Project.title), has(User.full_name), has(User.email)))
        .options(selectinload(Project.client))
        .order_by(Project.updated_at.desc())
        .limit(per_kind)
    )
    clients = await db.scalars(
        select(User)
        .where(
            User.role != "staff",
            exists().where(Project.client_id == User.id),
            or_(has(User.full_name), has(User.email)),
        )
        .order_by(User.full_name, User.email)
        .limit(per_kind)
    )
    leads = await db.scalars(
        select(AgencyLead)
        .where(or_(has(AgencyLead.name), has(AgencyLead.email), has(AgencyLead.company)))
        .order_by(AgencyLead.created_at.desc())
        .limit(per_kind)
    )
    invoices = await db.scalars(
        select(ProjectInvoice)
        .where(ProjectInvoice.project_id.is_not(None), or_(has(ProjectInvoice.number), has(ProjectInvoice.title)))
        .options(selectinload(ProjectInvoice.project))
        .order_by(ProjectInvoice.created_at.desc())
        .limit(per_kind)
    )
    team = await db.scalars(
        select(User)
        .where(User.role == "staff", or_(has(User.full_name), has(User.email)))
        .order_by(User.is_active.desc(), User.full_name, User.email)
        .limit(per_kind)
    )
    messages = (
        await db.execute(
            select(ProjectUpdate, Project.reference, Project.title, User.full_name, User.email)
            .join(Project, Project.id == ProjectUpdate.project_id)
            .outerjoin(User, User.id == ProjectUpdate.author_id)
            .where(or_(has(ProjectUpdate.body), has(ProjectUpdate.title)))
            .order_by(ProjectUpdate.created_at.desc())
            .limit(5)
        )
    ).all()
    return SearchResults(
        projects=[
            SearchProject(
                id=p.id, reference=p.reference, title=p.title, status=p.status,
                client_name=svc.display_name(p.client),
            )
            for p in projects
        ],
        clients=[SearchClient(id=u.id, name=u.full_name, email=u.email, is_active=u.is_active) for u in clients],
        leads=[
            SearchLead(id=lead.id, name=lead.name, email=lead.email, company=lead.company,
                       status=lead.status, created_at=lead.created_at)
            for lead in leads
        ],
        invoices=[
            SearchInvoice(
                id=i.id, number=i.number, title=i.title, status=i.status, amount_cents=i.amount_cents,
                currency=i.currency, due_date=i.due_date, project_id=i.project_id,
                project_reference=i.project.reference,
            )
            for i in invoices
        ],
        team=[SearchTeammate(id=u.id, name=u.full_name, email=u.email, is_active=u.is_active) for u in team],
        messages=[
            SearchMessage(
                id=update.id,
                kind=update.kind,
                snippet=_message_snippet(update, q.strip()),
                project_id=update.project_id,
                project_reference=reference,
                project_title=title,
                author_name=full_name or email,
                created_at=update.created_at,
            )
            for update, reference, title, full_name, email in messages
        ],
    )
