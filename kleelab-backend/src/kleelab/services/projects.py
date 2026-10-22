"""Project rules shared by the client and staff routers.

Kept out of the routers so both sides agree on what "the current stage" and
"waiting on you" mean; the dashboard and the admin list must never disagree.
"""

from __future__ import annotations

import logging
import secrets
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from kleelab.core.security import create_signed_token, get_password_hash, password_fingerprint
from kleelab.models.agency_lead import AgencyLead
from kleelab.models.project import Project, ProjectFile, ProjectInvoice, ProjectStage, ProjectUpdate
from kleelab.models.user import User
from kleelab.schemas.project import (
    FileOut,
    InvoiceOut,
    ProjectDetail,
    ProjectSummary,
    RequestOut,
    StageOut,
    UpdateOut,
)
from kleelab.services import email as email_svc

logger = logging.getLogger(__name__)

# The process we run for almost every build. Staff can pass their own list.
# Worded for the client, who reads these on their dashboard.
DEFAULT_STAGES: list[tuple[str, str | None]] = [
    ("Planning", "We learn how you work and agree exactly what we will build."),
    ("Design", "We show you how it will look. You approve it or ask for changes."),
    ("Build", "We build it. You can try it on a private preview link."),
    ("Testing", "You and your team try it out, and we fix anything that is not right."),
    ("Going live", "We put it online on your own web address."),
    ("Hand-over", "We give you the logins and a short guide, and show you how it works. Then it is yours."),
]


def now() -> datetime:
    # The columns are naive DateTime, matching the rest of the schema.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def is_staff(user: User) -> bool:
    return user.role == "staff"


def with_everything():
    return (
        selectinload(Project.stages),
        selectinload(Project.updates).selectinload(ProjectUpdate.author),
        selectinload(Project.requests),
        selectinload(Project.files).selectinload(ProjectFile.uploader),
        selectinload(Project.invoices),
        selectinload(Project.proposal),
        selectinload(Project.client),
        selectinload(Project.owner),
    )


def display_name(user: User | None) -> str | None:
    if user is None:
        return None
    return user.full_name or user.email.split("@")[0]


async def load_project(db: AsyncSession, project_id: UUID, user: User) -> Project:
    """Fetch a project the user may see, or 404.

    404 rather than 403 for someone else's project, so a client cannot learn which
    project ids exist by probing.
    """

    query = select(Project).where(Project.id == project_id).options(*with_everything())
    if not is_staff(user):
        query = query.where(Project.client_id == user.id)
    project = await db.scalar(query.execution_options(populate_existing=True))
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


async def next_reference(db: AsyncSession) -> str:
    count = await db.scalar(select(func.count()).select_from(Project)) or 0
    # Count-based and then checked, so a deleted project cannot cause a clash.
    number = count + 1
    while await db.scalar(select(Project.id).where(Project.reference == f"PRJ-{number:04d}")):
        number += 1
    return f"PRJ-{number:04d}"


async def next_invoice_number(db: AsyncSession) -> str:
    count = await db.scalar(select(func.count()).select_from(ProjectInvoice)) or 0
    number = count + 1
    while await db.scalar(select(ProjectInvoice.id).where(ProjectInvoice.number == f"INV-{number:04d}")):
        number += 1
    return f"INV-{number:04d}"


def build_stages(names: list[str] | None) -> list[ProjectStage]:
    pairs = [(name.strip(), None) for name in names if name.strip()] if names else DEFAULT_STAGES
    return build_stages_from(pairs)


def build_stages_from(pairs: list[tuple[str, str | None]]) -> list[ProjectStage]:
    """Steps from (name, description) pairs, the first one started."""

    pairs = pairs or DEFAULT_STAGES
    stages = [
        ProjectStage(position=index, name=name[:80], description=description, status="upcoming")
        for index, (name, description) in enumerate(pairs)
    ]
    if stages:
        stages[0].status = "in_progress"
    return stages


def current_stage(project: Project) -> ProjectStage | None:
    """The first stage that is not done, or None once everything is."""

    for stage in project.stages:
        if stage.status != "done":
            return stage
    return None


def pending_approvals(project: Project) -> int:
    return sum(1 for u in project.updates if u.kind == "approval" and u.approval_status == "pending")


def awaiting_reply(project: Project) -> bool:
    """The newest thing said on the project is a message from the client."""

    said = [u for u in project.updates if u.kind != "note"]
    if not said:
        return False
    last = max(said, key=lambda u: u.created_at)
    return last.kind == "message" and last.author is not None and not is_staff(last.author)


def summarise(project: Project, team: bool = False) -> ProjectSummary:
    stage = current_stage(project)
    return ProjectSummary(
        id=project.id,
        reference=project.reference,
        title=project.title,
        status=project.status,
        target_date=project.target_date,
        current_stage=stage.name if stage else None,
        stages_done=sum(1 for s in project.stages if s.status == "done"),
        stages_total=len(project.stages),
        pending_approvals=pending_approvals(project),
        open_requests=sum(1 for r in project.requests if r.status == "open"),
        unpaid_invoices=sum(1 for i in project.invoices if i.status == "unpaid"),
        updated_at=project.updated_at,
        client_email=project.client.email if team and project.client else None,
        client_name=project.client.full_name if team and project.client else None,
        client_id=project.client_id if team else None,
        owner_id=project.owner_id if team else None,
        owner_name=display_name(project.owner) if team else None,
        awaiting_reply=awaiting_reply(project) if team else False,
    )


def detail(project: Project, team: bool = False) -> ProjectDetail:
    """The full project. `team` adds the client's details and the team's own notes."""

    # Files waiting for a message that has not been sent are nobody else's business.
    shared = [f for f in project.files if not f.held]
    by_update: dict[UUID, list[FileOut]] = {}
    for item in shared:
        if item.update_id is not None:
            by_update.setdefault(item.update_id, []).append(_file_out(item))

    updates = []
    for update in project.updates:
        if update.kind == "note" and not team:
            continue
        out = UpdateOut.model_validate(update)
        out.attachments = by_update.get(update.id, [])
        if update.author is not None:
            out.author_name = display_name(update.author)
            out.from_team = is_staff(update.author)
        else:
            out.author_name = "KleeLab"
            out.from_team = True
        updates.append(out)
    # Newest first: a client opens the dashboard to see what changed.
    updates.reverse()
    balance = balance_owed(project) if project.status != "cancelled" else None
    return ProjectDetail(
        id=project.id,
        reference=project.reference,
        title=project.title,
        summary=project.summary,
        status=project.status,
        start_date=project.start_date,
        target_date=project.target_date,
        live_url=project.live_url,
        created_at=project.created_at,
        updated_at=project.updated_at,
        stages=[StageOut.model_validate(s) for s in project.stages],
        updates=updates,
        requests=[RequestOut.model_validate(r) for r in reversed(project.requests)],
        files=[_file_out(f) for f in reversed(shared)],
        invoices=[InvoiceOut.model_validate(i) for i in reversed(project.invoices)],
        balance_due_cents=balance,
        balance_currency=project.proposal.currency if balance else None,
        client_email=project.client.email if team and project.client else None,
        client_name=project.client.full_name if team and project.client else None,
        client_id=project.client_id if team else None,
        owner_id=project.owner_id if team else None,
        owner_name=display_name(project.owner) if team else None,
        lead_id=project.lead_id if team else None,
    )


def balance_owed(project: Project) -> int | None:
    """What is left of the accepted proposal's price to bill at hand-over, if anything.

    The proposal's total less what was billed up front (the deposit, or the
    whole price when the client chose to pay it all at once). None once the
    balance invoice exists (a cancelled one counts: the team waived it), when the
    client paid in full, or for a project that did not start from a proposal.
    Needs `Project.proposal` loaded.
    """

    proposal = project.__dict__.get("proposal")
    if proposal is None or proposal.payment_choice == "full":
        return None
    if any(i.kind == "balance" for i in project.invoices):
        return None
    live = [i for i in project.invoices if i.status != "cancelled"]
    total = sum(int(item.get("amount_cents", 0)) for item in proposal.items or [])
    upfront = sum(i.amount_cents for i in live if i.kind in ("deposit", "full"))
    rest = total - upfront
    return rest if rest > 0 else None


def claim_attachments(project: Project, user: User, ids: list[UUID]) -> list[ProjectFile]:
    """The unsent files `user` uploaded on this project, one for each id, or a 422.

    Only the uploader can send a file, and only once: a file someone else
    uploaded, one on another project, or one already sent is refused.
    """

    if not ids:
        return []
    wanted = set(ids)
    found = [
        f for f in project.files
        if f.id in wanted and f.held and f.uploaded_by == user.id and f.update_id is None
    ]
    if len(found) != len(wanted):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="One of the attached files is no longer there. Remove it and attach it again.",
        )
    return found


def attach(files: list[ProjectFile], update: ProjectUpdate) -> None:
    """Put files on a saved update and make them visible. Call after a flush."""

    for item in files:
        item.update_id = update.id
        item.held = False


def files_phrase(files: list[ProjectFile]) -> str:
    return f"{len(files)} file{'s' if len(files) != 1 else ''}" if files else ""


def _file_out(item: ProjectFile) -> FileOut:
    out = FileOut.model_validate(item)
    out.uploaded_by_name = display_name(item.uploader)
    out.from_team = item.uploader is not None and is_staff(item.uploader)
    return out


def money(cents: int, currency: str) -> str:
    return f"{currency} {cents / 100:,.2f}"


def set_invoice_status(invoice: ProjectInvoice, new_status: str) -> None:
    """Change an invoice's status and keep the paid fields in step with it.

    The one place an invoice becomes paid or stops being paid, whether the team
    marks it by hand or a card payment lands. How it was paid (`paid_via`) is
    the caller's to set after this; leaving "paid" clears it.
    """

    invoice.status = new_status
    invoice.paid_at = now() if new_status == "paid" else None
    if new_status != "paid":
        invoice.paid_via = None
        invoice.payment_reference = None


def paid_notice(invoice: ProjectInvoice) -> str:
    """What the client is told when an invoice is paid."""

    return f"Thank you. We have received your payment for {invoice.number}"


def notify_client(project: Project, headline: str) -> None:
    """Email the client about their project. The change is already saved; this is a courtesy."""

    if project.client is None:
        return
    try:
        email_svc.send_client_project_notice(project.client.email, str(project.id), project.title, headline)
    except Exception:  # noqa: BLE001
        logger.exception("Could not email %s about %s", project.client.email, project.reference)


async def touch(db: AsyncSession, project: Project) -> None:
    """Mark the project as changed, so lists sort by real activity."""

    project.updated_at = now()


def random_password() -> str:
    """A password nobody knows, for an invited account until its owner sets one."""

    return secrets.token_urlsafe(32)


async def start_project(
    db: AsyncSession,
    *,
    client_email: str,
    client_name: str | None,
    title: str,
    summary: str | None,
    stages: list[ProjectStage],
    owner_id: UUID | None,
    welcome_author_id: UUID | None,
    lead: AgencyLead | None = None,
    start_date: date | None = None,
    target_date: date | None = None,
) -> tuple[Project, User, bool]:
    """Set a project up for a client, creating their account if they have none.

    A new client gets an account with an unknown password and an emailed link to
    choose one (sent by the caller after the commit), so we can start the project
    before they have ever signed in. Returns the project, the client and whether
    the account is new. Nothing is committed here.
    """

    email = client_email.lower()
    client = await db.scalar(select(User).where(User.email == email))
    invited = False
    if client is None:
        client = User(
            email=email,
            password_hash=get_password_hash(random_password()),
            full_name=client_name,
            provider="invite",
            # They prove the address by using the emailed link.
            is_verified=False,
        )
        db.add(client)
        await db.flush()
        invited = True
    elif is_staff(client):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="That email belongs to a team member. Use the client's own email.",
        )

    project = Project(
        client_id=client.id,
        owner_id=owner_id,
        lead_id=lead.id if lead else None,
        reference=await next_reference(db),
        title=title.strip(),
        summary=summary,
        start_date=start_date,
        target_date=target_date,
        status="active",
        stages=stages,
    )
    db.add(project)
    if lead is not None:
        lead.status = "won"
    await db.flush()
    db.add(
        ProjectUpdate(
            project_id=project.id,
            stage_id=project.stages[0].id if project.stages else None,
            author_id=welcome_author_id,
            kind="progress",
            title="Your project has started",
            body="Welcome. This page shows every step of your project. "
            "You can message us here, share files, and approve work when it is ready.",
        )
    )
    return project, client, invited


def send_invite(client: User, project: Project) -> bool:
    """Email a client a 7-day link to choose a password, naming their project."""

    token = create_signed_token(
        {"user_id": str(client.id), "purpose": "password_reset", "pf": password_fingerprint(client)},
        timedelta(days=7),
    )
    try:
        return bool(email_svc.send_project_invite_email(client.email, client.full_name, project.title, token))
    except Exception:  # noqa: BLE001
        logger.exception("Could not send the invite for %s", project.reference)
        return False
