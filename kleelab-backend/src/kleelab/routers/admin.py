"""The KleeLab team's side: set projects up, post progress, answer requests."""

import logging
from datetime import date, timedelta
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.database import get_db
from kleelab.core.security import create_signed_token, get_current_user, get_password_hash
from kleelab.models.agency_lead import AgencyLead
from kleelab.models.project import Project, ProjectInvoice, ProjectStage, ProjectUpdate
from kleelab.models.user import User
from kleelab.schemas.agency import LeadOut
from kleelab.schemas.project import (
    AttentionItem,
    InvoiceCreate,
    InvoicePatch,
    ProjectCreate,
    ProjectCreated,
    ProjectDetail,
    ProjectPatch,
    ProjectSummary,
    RequestPatch,
    StaffMember,
    StaffUpdateCreate,
    StageCreate,
    StageMove,
    StagePatch,
)
from kleelab.services import projects as svc
from kleelab.services.email import send_client_project_notice, send_project_invite_email

logger = logging.getLogger(__name__)

REQUEST_LABELS = {
    "deployment": "help going live",
    "hosting": "hosting",
    "maintenance": "monthly care",
    "change": "a change",
}


async def require_staff(user: User = Depends(get_current_user)) -> User:
    if not svc.is_staff(user):
        # 404, not 403: the admin area should not advertise that it exists.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return user


router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_staff)])


def _notify_client(project: Project, headline: str) -> None:
    if project.client is None:
        return
    try:
        send_client_project_notice(project.client.email, str(project.id), project.title, headline)
    except Exception:  # noqa: BLE001 - the update is saved; the email is a courtesy
        logger.exception("Could not email %s about %s", project.client.email, project.reference)


def _send_invite(client: User, project: Project) -> bool:
    token = create_signed_token({"user_id": str(client.id), "purpose": "password_reset"}, timedelta(days=7))
    try:
        return bool(send_project_invite_email(client.email, client.full_name, project.title, token))
    except Exception:  # noqa: BLE001
        logger.exception("Could not send the invite for %s", project.reference)
        return False


async def _reload(db: AsyncSession, project_id: UUID, staff: User) -> ProjectDetail:
    project = await svc.load_project(db, project_id, staff)
    return svc.detail(project, team=True)


async def _check_owner(db: AsyncSession, owner_id: UUID | None) -> None:
    if owner_id is None:
        return
    owner = await db.get(User, owner_id)
    if owner is None or not svc.is_staff(owner):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="That person is not on the KleeLab team"
        )


def _find_stage(project: Project, stage_id: UUID) -> ProjectStage:
    stage = next((s for s in project.stages if s.id == stage_id), None)
    if stage is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Step not found")
    return stage


def _renumber(stages: list[ProjectStage]) -> None:
    for index, stage in enumerate(stages):
        stage.position = index


def _start_next_if_idle(project: Project, stages: list[ProjectStage]) -> None:
    """If nothing is being worked on but steps remain, start the first one left."""

    if project.status != "active":
        return
    if any(s.status in ("in_progress", "waiting_on_client") for s in stages):
        return
    following = next((s for s in stages if s.status == "upcoming"), None)
    if following is not None:
        following.status = "in_progress"


# --- Team -------------------------------------------------------------------


@router.get("/staff", response_model=list[StaffMember])
async def list_staff(db: AsyncSession = Depends(get_db)) -> list[StaffMember]:
    """Everyone who can be put in charge of a project."""

    result = await db.scalars(select(User).where(User.role == "staff").order_by(User.full_name, User.email))
    return [StaffMember(id=u.id, name=svc.display_name(u) or u.email, email=u.email) for u in result]


# --- Projects ---------------------------------------------------------------


@router.get("/projects", response_model=list[ProjectSummary])
async def list_all_projects(db: AsyncSession = Depends(get_db)) -> list[ProjectSummary]:
    result = await db.scalars(
        select(Project).options(*svc.with_everything()).order_by(Project.updated_at.desc())
    )
    return [svc.summarise(project, team=True) for project in result.unique()]


@router.post("/projects", response_model=ProjectCreated, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ProjectCreated:
    """Set a project up for a client, creating their account if they have none.

    A new client gets an account with an unknown password and an emailed link to
    choose one, so we can start the project before they have ever signed in.
    """

    owner_id = payload.owner_id or staff.id
    await _check_owner(db, owner_id)
    lead = None
    if payload.lead_id is not None:
        lead = await db.get(AgencyLead, payload.lead_id)
        if lead is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enquiry not found")

    email = str(payload.client_email).lower()
    client = await db.scalar(select(User).where(User.email == email))
    invited = False
    if client is None:
        client = User(
            email=email,
            password_hash=get_password_hash(svc.random_password()),
            full_name=payload.client_name,
            provider="invite",
            # They prove the address by using the emailed link.
            is_verified=False,
        )
        db.add(client)
        await db.flush()
        invited = True
    elif svc.is_staff(client):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="That email belongs to a team member. Use the client's own email.",
        )

    project = Project(
        client_id=client.id,
        owner_id=owner_id,
        lead_id=lead.id if lead else None,
        reference=await svc.next_reference(db),
        title=payload.title.strip(),
        summary=payload.summary,
        start_date=payload.start_date,
        target_date=payload.target_date,
        status="active",
        stages=svc.build_stages(payload.stages),
    )
    db.add(project)
    if lead is not None:
        lead.status = "won"
    await db.flush()
    db.add(
        ProjectUpdate(
            project_id=project.id,
            stage_id=project.stages[0].id if project.stages else None,
            author_id=staff.id,
            kind="progress",
            title="Your project has started",
            body="Welcome. This page shows every step of your project. "
            "You can message us here, share files, and approve work when it is ready.",
        )
    )
    await db.commit()

    if invited:
        _send_invite(client, project)
    else:
        _notify_client(project, "Your new project is on your dashboard")

    return ProjectCreated(project=await _reload(db, project.id, staff), invited=invited)


@router.patch("/projects/{project_id}", response_model=ProjectDetail)
async def patch_project(
    project_id: UUID,
    payload: ProjectPatch,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ProjectDetail:
    project = await svc.load_project(db, project_id, staff)
    changes = payload.model_dump(exclude_unset=True)
    if "owner_id" in changes:
        await _check_owner(db, changes["owner_id"])
    if changes.get("live_url") is not None:
        changes["live_url"] = str(changes["live_url"])
    went_live = bool(changes.get("live_url")) and changes["live_url"] != project.live_url
    finished = changes.get("status") == "completed" and project.status != "completed"
    for field, value in changes.items():
        setattr(project, field, value)
    await svc.touch(db, project)
    await db.commit()
    if finished:
        _notify_client(project, "Your project is finished and handed over to you")
    elif went_live:
        _notify_client(project, "Your site is live")
    return await _reload(db, project_id, staff)


@router.post("/projects/{project_id}/invite")
async def resend_invite(
    project_id: UUID, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> dict:
    """Email the client a fresh 7-day link to set their password and sign in."""

    project = await svc.load_project(db, project_id, staff)
    if project.client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This project has no client")
    if not _send_invite(project.client, project):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The email could not be sent. Check the email settings and try again.",
        )
    return {"status": "sent", "email": project.client.email}


# --- Steps ------------------------------------------------------------------


@router.post(
    "/projects/{project_id}/stages", response_model=ProjectDetail, status_code=status.HTTP_201_CREATED
)
async def add_stage(
    project_id: UUID,
    payload: StageCreate,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ProjectDetail:
    """Add a step at the end of the plan."""

    project = await svc.load_project(db, project_id, staff)
    if len(project.stages) >= 20:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A project can have up to 20 steps")
    stage = ProjectStage(
        project_id=project.id,
        position=len(project.stages),
        name=payload.name.strip(),
        description=(payload.description or "").strip() or None,
        status="upcoming",
    )
    project.stages.append(stage)
    _start_next_if_idle(project, project.stages)
    await svc.touch(db, project)
    await db.commit()
    return await _reload(db, project_id, staff)


@router.post("/projects/{project_id}/stages/{stage_id}/move", response_model=ProjectDetail)
async def move_stage(
    project_id: UUID,
    stage_id: UUID,
    payload: StageMove,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ProjectDetail:
    project = await svc.load_project(db, project_id, staff)
    stage = _find_stage(project, stage_id)
    ordered = sorted(project.stages, key=lambda s: s.position)
    index = ordered.index(stage)
    target = index - 1 if payload.direction == "up" else index + 1
    if 0 <= target < len(ordered):
        ordered[index], ordered[target] = ordered[target], ordered[index]
        _renumber(ordered)
        await svc.touch(db, project)
        await db.commit()
    return await _reload(db, project_id, staff)


@router.delete("/projects/{project_id}/stages/{stage_id}", response_model=ProjectDetail)
async def delete_stage(
    project_id: UUID,
    stage_id: UUID,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ProjectDetail:
    """Remove a step. Its updates stay on the timeline, just without a step."""

    project = await svc.load_project(db, project_id, staff)
    stage = _find_stage(project, stage_id)
    if len(project.stages) <= 1:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A project needs at least one step")
    if any(u.stage_id == stage.id and u.kind == "approval" and u.approval_status == "pending" for u in project.updates):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The client still has to answer an approval on this step",
        )
    for update in project.updates:
        if update.stage_id == stage.id:
            update.stage_id = None
    project.stages.remove(stage)
    remaining = sorted(project.stages, key=lambda s: s.position)
    _renumber(remaining)
    _start_next_if_idle(project, remaining)
    await svc.touch(db, project)
    await db.commit()
    return await _reload(db, project_id, staff)


@router.patch("/projects/{project_id}/stages/{stage_id}", response_model=ProjectDetail)
async def patch_stage(
    project_id: UUID,
    stage_id: UUID,
    payload: StagePatch,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ProjectDetail:
    """Rename a step, set its date, or move it along. Finishing one starts the next."""

    project = await svc.load_project(db, project_id, staff)
    stage = _find_stage(project, stage_id)

    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        changes["name"] = (changes["name"] or "").strip() or stage.name
    finished = changes.get("status") == "done" and stage.status != "done"
    for field, value in changes.items():
        setattr(stage, field, value)

    headline = None
    if finished:
        stage.completed_at = svc.now()
        ordered = sorted(project.stages, key=lambda s: s.position)
        following = next((s for s in ordered if s.position > stage.position and s.status == "upcoming"), None)
        if following is not None:
            following.status = "in_progress"
            headline = f"{stage.name} is finished. Next: {following.name}"
        elif all(s.status == "done" for s in project.stages):
            headline = f"{stage.name} is finished. That was the last step."
        else:
            headline = f"{stage.name} is finished."
        db.add(
            ProjectUpdate(
                project_id=project.id,
                stage_id=stage.id,
                author_id=staff.id,
                kind="progress",
                title=f"{stage.name} finished",
                body=headline,
            )
        )
    elif changes.get("status") and changes["status"] != "done":
        stage.completed_at = None

    await svc.touch(db, project)
    await db.commit()
    if headline:
        _notify_client(project, headline)
    return await _reload(db, project_id, staff)


# --- Updates, notes and requests -------------------------------------------


@router.post(
    "/projects/{project_id}/updates", response_model=ProjectDetail, status_code=status.HTTP_201_CREATED
)
async def post_update(
    project_id: UUID,
    payload: StaffUpdateCreate,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ProjectDetail:
    """Post progress, a message, a team note, or ask the client to approve something."""

    project = await svc.load_project(db, project_id, staff)
    stage_id = payload.stage_id
    if stage_id is not None and not any(s.id == stage_id for s in project.stages):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="That step is not on this project"
        )
    if stage_id is None:
        current = svc.current_stage(project)
        stage_id = current.id if current else None

    is_approval = payload.kind == "approval"
    if is_approval and not (payload.title or "").strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Give it a title so the client knows what they are approving",
        )

    db.add(
        ProjectUpdate(
            project_id=project.id,
            stage_id=stage_id,
            author_id=staff.id,
            kind=payload.kind,
            title=(payload.title or "").strip() or None,
            body=payload.body.strip(),
            link_url=str(payload.link_url) if payload.link_url else None,
            link_label=payload.link_label,
            approval_status="pending" if is_approval else None,
        )
    )
    if is_approval and stage_id is not None:
        stage = next(s for s in project.stages if s.id == stage_id)
        if stage.status in ("upcoming", "in_progress"):
            stage.status = "waiting_on_client"
    await svc.touch(db, project)
    await db.commit()

    # A team note is for the team only, so the client is not emailed.
    if payload.kind == "approval":
        _notify_client(project, f"Please take a look and approve: {payload.title}")
    elif payload.kind == "progress":
        _notify_client(project, payload.title or "There is news on your project")
    elif payload.kind == "message":
        _notify_client(project, "You have a new message from the KleeLab team")
    return await _reload(db, project_id, staff)


@router.patch("/projects/{project_id}/requests/{request_id}", response_model=ProjectDetail)
async def patch_request(
    project_id: UUID,
    request_id: UUID,
    payload: RequestPatch,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ProjectDetail:
    project = await svc.load_project(db, project_id, staff)
    item = next((r for r in project.requests if r.id == request_id), None)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    changed = item.status != payload.status
    item.status = payload.status
    await svc.touch(db, project)
    await db.commit()
    if changed and payload.status != "open":
        what = REQUEST_LABELS.get(item.kind, "your request")
        verdicts = {
            "accepted": f"Good news: we will do {what} for you",
            "declined": f"We cannot take on {what} right now. We will message you about it.",
            "done": f"Done: {what}",
        }
        _notify_client(project, verdicts[payload.status])
    return await _reload(db, project_id, staff)


# --- Invoices -----------------------------------------------------------------


def _money(cents: int, currency: str) -> str:
    return f"{currency} {cents / 100:,.2f}"


@router.post(
    "/projects/{project_id}/invoices", response_model=ProjectDetail, status_code=status.HTTP_201_CREATED
)
async def create_invoice(
    project_id: UUID,
    payload: InvoiceCreate,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ProjectDetail:
    """Bill the client. They pay through the link; we mark it paid when it lands."""

    project = await svc.load_project(db, project_id, staff)
    invoice = ProjectInvoice(
        project_id=project.id,
        number=await svc.next_invoice_number(db),
        title=payload.title.strip(),
        amount_cents=payload.amount_cents,
        currency=payload.currency,
        due_date=payload.due_date,
        pay_url=str(payload.pay_url) if payload.pay_url else None,
        status="unpaid",
    )
    db.add(invoice)
    await svc.touch(db, project)
    await db.commit()
    _notify_client(
        project, f"New invoice {invoice.number}: {invoice.title}, {_money(invoice.amount_cents, invoice.currency)}"
    )
    return await _reload(db, project_id, staff)


@router.patch("/projects/{project_id}/invoices/{invoice_id}", response_model=ProjectDetail)
async def patch_invoice(
    project_id: UUID,
    invoice_id: UUID,
    payload: InvoicePatch,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ProjectDetail:
    project = await svc.load_project(db, project_id, staff)
    invoice = next((i for i in project.invoices if i.id == invoice_id), None)
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    changes = payload.model_dump(exclude_unset=True)
    if "pay_url" in changes:
        changes["pay_url"] = str(changes["pay_url"]) if changes["pay_url"] else None
    newly_paid = changes.get("status") == "paid" and invoice.status != "paid"
    for field, value in changes.items():
        setattr(invoice, field, value)
    if "status" in changes:
        invoice.paid_at = svc.now() if invoice.status == "paid" else None
    await svc.touch(db, project)
    await db.commit()
    if newly_paid:
        _notify_client(project, f"Thank you. We have received your payment for {invoice.number}")
    return await _reload(db, project_id, staff)


# --- What needs attention -----------------------------------------------------


@router.get("/overview", response_model=list[AttentionItem])
async def overview(db: AsyncSession = Depends(get_db)) -> list[AttentionItem]:
    """Everything across all projects that is waiting on someone, oldest first."""

    items: list[AttentionItem] = []
    leads = await db.scalars(select(AgencyLead).where(AgencyLead.status == "new").order_by(AgencyLead.created_at))
    for lead in leads:
        items.append(
            AttentionItem(
                kind="new_enquiry",
                project_id=None,
                reference=None,
                project_title=None,
                text=f"New enquiry from {lead.name or lead.email}",
                since=lead.created_at,
                lead_id=lead.id,
            )
        )

    today = date.today()
    projects = await db.scalars(
        select(Project).where(Project.status.in_(("active", "on_hold"))).options(*svc.with_everything())
    )
    for project in projects.unique():
        client = svc.display_name(project.client) or "The client"
        base = {
            "project_id": project.id,
            "reference": project.reference,
            "project_title": project.title,
            "owner_name": svc.display_name(project.owner),
        }
        if svc.awaiting_reply(project):
            last = max((u for u in project.updates if u.kind == "message"), key=lambda u: u.created_at)
            items.append(
                AttentionItem(kind="client_message", text=f"{client} sent a message. Reply needed.", since=last.created_at, **base)
            )
        for request in project.requests:
            if request.status == "open":
                items.append(
                    AttentionItem(
                        kind="open_request",
                        text=f"{client} asked for {REQUEST_LABELS.get(request.kind, request.kind)}",
                        since=request.created_at,
                        **base,
                    )
                )
        for update in project.updates:
            if update.kind == "approval" and update.approval_status == "pending":
                items.append(
                    AttentionItem(
                        kind="waiting_approval",
                        text=f"Waiting for {client} to approve: {update.title or 'your work'}",
                        since=update.created_at,
                        **base,
                    )
                )
        for stage in project.stages:
            if stage.status != "done" and stage.due_date and stage.due_date < today:
                items.append(
                    AttentionItem(kind="overdue_step", text=f"{stage.name} is past its date", since=stage.due_date, **base)
                )
        for invoice in project.invoices:
            if invoice.status == "unpaid":
                late = invoice.due_date is not None and invoice.due_date < today
                amount = _money(invoice.amount_cents, invoice.currency)
                items.append(
                    AttentionItem(
                        kind="unpaid_invoice",
                        text=f"{invoice.number} ({amount}) is {'overdue' if late else 'not paid yet'}",
                        since=invoice.due_date or invoice.created_at,
                        **base,
                    )
                )

    def sort_key(item: AttentionItem) -> str:
        return item.since.isoformat() if item.since else ""

    return sorted(items, key=sort_key)


# --- Enquiries ----------------------------------------------------------------


class LeadPatch(BaseModel):
    status: Literal["new", "contacted", "won", "lost"]


@router.get("/leads", response_model=list[LeadOut])
async def list_leads(db: AsyncSession = Depends(get_db)) -> list[LeadOut]:
    result = await db.scalars(select(AgencyLead).order_by(AgencyLead.created_at.desc()).limit(200))
    leads = list(result)
    linked = await db.execute(select(Project.lead_id, Project.id).where(Project.lead_id.is_not(None)))
    project_for = {lead_id: project_id for lead_id, project_id in linked}
    out = []
    for lead in leads:
        item = LeadOut.model_validate(lead)
        item.project_id = project_for.get(lead.id)
        out.append(item)
    return out


@router.patch("/leads/{lead_id}", response_model=LeadOut)
async def patch_lead(lead_id: UUID, payload: LeadPatch, db: AsyncSession = Depends(get_db)) -> LeadOut:
    lead = await db.get(AgencyLead, lead_id)
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enquiry not found")
    lead.status = payload.status
    await db.commit()
    await db.refresh(lead)
    item = LeadOut.model_validate(lead)
    item.project_id = await db.scalar(select(Project.id).where(Project.lead_id == lead.id).limit(1))
    return item
