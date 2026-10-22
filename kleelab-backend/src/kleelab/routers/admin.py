"""The KleeLab team's side: set projects up, post progress, answer requests."""

import logging
from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.database import get_db
from kleelab.core.security import get_current_user
from kleelab.models.agency_lead import AgencyLead, LeadNote
from kleelab.models.project import Project, ProjectInvoice, ProjectStage, ProjectUpdate
from kleelab.models.proposal import Proposal
from kleelab.models.refresh_token import RefreshToken
from kleelab.models.user import User
from kleelab.schemas.agency import LeadDetail, LeadNoteCreate, LeadNoteOut, LeadOut, LeadReplyCreate
from kleelab.schemas.project import (
    AdminInvoiceOut,
    AttentionItem,
    ClientDetail,
    ClientPatch,
    ClientSummary,
    InvoiceCreate,
    InvoiceOut,
    InvoicePatch,
    MoneyTotal,
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
from kleelab.services import activity
from kleelab.services import billing
from kleelab.services import projects as svc
from kleelab.services import proposals as proposal_svc
from kleelab.services import sessions
from kleelab.services.activity import quoted
from kleelab.services.email import send_lead_reply

logger = logging.getLogger(__name__)

REQUEST_LABELS = {
    "deployment": "help going live",
    "hosting": "hosting",
    "maintenance": "monthly care",
    "change": "a change",
}

STEP_STATUS_WORDS = {
    "upcoming": "not started",
    "in_progress": "in progress",
    "waiting_on_client": "waiting on the client",
    "done": "done",
}
PROJECT_STATUS_WORDS = {
    "active": "in progress",
    "on_hold": "paused",
    "completed": "finished",
    "cancelled": "cancelled",
}
PROJECT_FIELD_WORDS = {
    "title": "the name",
    "summary": "the summary",
    "start_date": "the start date",
    "target_date": "the target date",
}


async def require_staff(user: User = Depends(get_current_user)) -> User:
    if not svc.is_staff(user):
        # 404, not 403: the admin area should not advertise that it exists.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return user


router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_staff)])


def _notify_client(project: Project, headline: str) -> None:
    svc.notify_client(project, headline)


def _send_invite(client: User, project: Project) -> bool:
    return svc.send_invite(client, project)


async def _reload(db: AsyncSession, project_id: UUID, staff: User) -> ProjectDetail:
    project = await svc.load_project(db, project_id, staff)
    return svc.detail(project, team=True)


async def _check_owner(db: AsyncSession, owner_id: UUID | None) -> None:
    if owner_id is None:
        return
    owner = await db.get(User, owner_id)
    if owner is None or not svc.is_staff(owner) or not owner.is_active:
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
    """Everyone who can be put in charge of a project. Switched-off teammates are left out."""

    result = await db.scalars(
        select(User).where(User.role == "staff", User.is_active.is_(True)).order_by(User.full_name, User.email)
    )
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

    project, client, invited = await svc.start_project(
        db,
        client_email=str(payload.client_email),
        client_name=payload.client_name,
        title=payload.title,
        summary=payload.summary,
        stages=svc.build_stages(payload.stages),
        owner_id=owner_id,
        welcome_author_id=staff.id,
        lead=lead,
        start_date=payload.start_date,
        target_date=payload.target_date,
    )
    who = svc.display_name(client) or client.email
    activity.record(
        db, staff, "project.create",
        f"Started the project for {who}" + (" and invited them" if invited else "")
        + (" from their enquiry" if lead is not None else ""),
        project_id=project.id, subject_type="project", subject_id=project.id,
    )
    await db.commit()

    if invited:
        _send_invite(client, project)
    else:
        _notify_client(project, "Your new project is on your dashboard")

    return ProjectCreated(project=await _reload(db, project.id, staff), invited=invited)


def _and_list(parts: list[str]) -> str:
    return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]


async def _describe_project_changes(db: AsyncSession, project: Project, changes: dict) -> str | None:
    parts = []
    for field, value in changes.items():
        if getattr(project, field) == value:
            continue
        if field == "status":
            parts.append(f"the status to {PROJECT_STATUS_WORDS.get(value, value)}")
        elif field == "owner_id":
            owner = await db.get(User, value) if value else None
            parts.append(f"who is in charge to {svc.display_name(owner) or 'nobody'}")
        elif field == "live_url":
            parts.append(f"the live address to {value}" if value else "the live address (removed)")
        else:
            parts.append(PROJECT_FIELD_WORDS.get(field, field.replace("_", " ")))
    return f"Changed {_and_list(parts)}" if parts else None


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
    described = await _describe_project_changes(db, project, changes)
    for field, value in changes.items():
        setattr(project, field, value)
    if described:
        activity.record(db, staff, "project.update", described, project_id=project.id,
                        subject_type="project", subject_id=project.id)
    headline = "Your project is finished and handed over to you"
    if finished:
        balance = await billing.raise_balance(db, project, staff)
        if balance is not None:
            headline += f". {billing.balance_notice(balance)}"
    await svc.touch(db, project)
    await db.commit()
    if finished:
        _notify_client(project, headline)
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
    activity.record(db, staff, "project.invite",
                    f"Sent {svc.display_name(project.client)} a new link to set their password",
                    project_id=project.id, subject_type="project", subject_id=project.id)
    await db.commit()
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
    activity.record(db, staff, "step.add", f"Added the step {quoted(stage.name)}", project_id=project.id,
                    subject_type="project", subject_id=project.id)
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
        activity.record(db, staff, "step.move", f"Moved the step {quoted(stage.name)} {payload.direction}",
                        project_id=project.id, subject_type="project", subject_id=project.id)
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
    activity.record(db, staff, "step.delete", f"Removed the step {quoted(stage.name)}", project_id=project.id,
                    subject_type="project", subject_id=project.id)
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
    old_name, old_status = stage.name, stage.status
    edited = any(getattr(stage, field) != value for field, value in changes.items() if field != "status")
    for field, value in changes.items():
        setattr(stage, field, value)
    if finished:
        described = f"Finished the step {quoted(stage.name)}"
    elif changes.get("status") and changes["status"] != old_status:
        described = f"Set the step {quoted(stage.name)} to {STEP_STATUS_WORDS.get(stage.status, stage.status)}"
    elif stage.name != old_name:
        described = f"Renamed the step {quoted(old_name)} to {quoted(stage.name)}"
    elif edited:
        described = f"Edited the step {quoted(stage.name)}"
    else:
        described = None
    if described:
        activity.record(db, staff, "step.done" if finished else "step.update", described,
                        project_id=project.id, subject_type="project", subject_id=project.id)

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
            if project.status != "cancelled":
                balance = await billing.raise_balance(db, project, staff)
                if balance is not None:
                    headline += f" {billing.balance_notice(balance)}."
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

    if payload.attachment_ids and payload.kind == "note":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Team notes cannot carry files, because the client would see them in their files.",
        )
    if len(set(payload.attachment_ids)) != len(payload.attachment_ids):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="The same file is attached twice")
    attached = svc.claim_attachments(project, staff, payload.attachment_ids)

    update = ProjectUpdate(
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
    db.add(update)
    await db.flush()
    svc.attach(attached, update)
    title = (payload.title or "").strip()
    described = {
        "progress": f"Posted an update {quoted(title or payload.body)}",
        "message": f"Messaged the client: {quoted(payload.body)}",
        "note": f"Added a team note: {quoted(payload.body)}",
        "approval": f"Asked the client to approve {quoted(title)}",
    }[payload.kind]
    if attached:
        described += f" (with {svc.files_phrase(attached)})"
    activity.record(db, staff, f"update.{payload.kind}", described, project_id=project.id,
                    subject_type="project", subject_id=project.id)
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
    if changed:
        activity.record(
            db, staff, "request.update",
            f"Marked the request for {REQUEST_LABELS.get(item.kind, item.kind)} as {payload.status}",
            project_id=project.id, subject_type="project", subject_id=project.id,
        )
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


_money = svc.money


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
        client_name=project.client.full_name if project.client else None,
        client_email=project.client.email if project.client else None,
        project_reference=project.reference,
        project_title=project.title,
    )
    db.add(invoice)
    await db.flush()
    activity.record(
        db, staff, "invoice.create",
        f"Billed {invoice.number}: {invoice.title}, {_money(invoice.amount_cents, invoice.currency)}",
        project_id=project.id, subject_type="invoice", subject_id=invoice.id,
    )
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
    old_status = invoice.status
    edited = any(getattr(invoice, field) != value for field, value in changes.items() if field != "status")
    for field, value in changes.items():
        setattr(invoice, field, value)
    money = _money(invoice.amount_cents, invoice.currency)
    if invoice.status != old_status:
        action, described = {
            "paid": ("invoice.paid", f"Marked {invoice.number} paid ({money})"),
            "cancelled": ("invoice.cancelled", f"Cancelled {invoice.number} ({money})"),
            "unpaid": ("invoice.unpaid", f"Marked {invoice.number} unpaid again"),
        }[invoice.status]
        activity.record(db, staff, action, described, project_id=project.id,
                        subject_type="invoice", subject_id=invoice.id)
    elif edited:
        activity.record(db, staff, "invoice.update", f"Edited {invoice.number}", project_id=project.id,
                        subject_type="invoice", subject_id=invoice.id)
    if invoice.status != old_status:
        svc.set_invoice_status(invoice, invoice.status)
    await svc.touch(db, project)
    await db.commit()
    if newly_paid:
        _notify_client(project, svc.paid_notice(invoice))
    return await _reload(db, project_id, staff)



@router.post("/projects/{project_id}/invoices/{invoice_id}/remind", response_model=ProjectDetail)
async def remind_invoice(
    project_id: UUID,
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ProjectDetail:
    """Email the client a reminder about an unpaid invoice now, outside the schedule."""

    project = await svc.load_project(db, project_id, staff)
    invoice = next((i for i in project.invoices if i.id == invoice_id), None)
    if invoice is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    if invoice.status != "unpaid":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only an unpaid invoice can be chased")
    if invoice.due_date is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Give the invoice a due date first")
    if not billing.send_reminder(invoice, project, date.today()):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="The reminder email could not be sent")
    # A reminder sent by hand stands in for today's scheduled one, not the ones still to come.
    invoice.last_reminded_at = svc.now()
    activity.record(
        db, staff, "invoice.reminder",
        f"Reminded the client about {invoice.number} ({_money(invoice.amount_cents, invoice.currency)})",
        project_id=project.id, subject_type="invoice", subject_id=invoice.id,
    )
    await db.commit()
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
    due = await db.scalars(
        select(AgencyLead)
        .where(
            AgencyLead.follow_up_on.is_not(None),
            AgencyLead.follow_up_on <= today,
            AgencyLead.status.in_(("new", "contacted")),
        )
        .order_by(AgencyLead.follow_up_on)
    )
    for lead in due:
        items.append(
            AttentionItem(
                kind="follow_up",
                project_id=None,
                reference=None,
                project_title=None,
                text=f"Follow up with {lead.name or lead.email}",
                since=lead.follow_up_on,
                lead_id=lead.id,
            )
        )

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
    status: Literal["new", "contacted", "won", "lost"] | None = None
    # Sent as null to clear the date; left out to keep it.
    follow_up_on: date | None = None


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
async def patch_lead(
    lead_id: UUID, payload: LeadPatch, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> LeadOut:
    lead = await db.get(AgencyLead, lead_id)
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enquiry not found")
    who = lead.name or lead.email
    if payload.status is not None and payload.status != lead.status:
        lead.status = payload.status
        activity.record(db, staff, "lead.status", f"Marked the enquiry from {who} as {payload.status}",
                        subject_type="lead", subject_id=lead.id)
    if "follow_up_on" in payload.model_fields_set and payload.follow_up_on != lead.follow_up_on:
        lead.follow_up_on = payload.follow_up_on
        activity.record(
            db, staff, "lead.follow_up",
            f"Set a follow-up with {who} for {payload.follow_up_on:%d %b %Y}" if payload.follow_up_on
            else f"Cleared the follow-up with {who}",
            subject_type="lead", subject_id=lead.id,
        )
    await db.commit()
    await db.refresh(lead)
    item = LeadOut.model_validate(lead)
    item.project_id = await db.scalar(select(Project.id).where(Project.lead_id == lead.id).limit(1))
    return item


async def _lead_detail(db: AsyncSession, lead_id: UUID) -> LeadDetail:
    lead = await db.scalar(
        select(AgencyLead)
        .where(AgencyLead.id == lead_id)
        .options(selectinload(AgencyLead.notes).selectinload(LeadNote.author))
        # A note may have just been added in this session; reload the list.
        .execution_options(populate_existing=True)
    )
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enquiry not found")
    item = LeadOut.model_validate(lead)
    item.project_id = await db.scalar(select(Project.id).where(Project.lead_id == lead.id).limit(1))
    notes = [
        LeadNoteOut(
            id=note.id,
            kind=note.kind,
            subject=note.subject,
            body=note.body,
            author_name=svc.display_name(note.author),
            created_at=note.created_at,
        )
        for note in lead.notes
    ]
    proposals = await db.scalars(
        select(Proposal).where(Proposal.lead_id == lead.id).order_by(Proposal.created_at.desc())
    )
    return LeadDetail(**item.model_dump(), notes=notes, proposals=[proposal_svc.summarise(p) for p in proposals])


@router.get("/leads/{lead_id}", response_model=LeadDetail)
async def get_lead(lead_id: UUID, db: AsyncSession = Depends(get_db)) -> LeadDetail:
    return await _lead_detail(db, lead_id)


@router.post("/leads/{lead_id}/notes", response_model=LeadDetail, status_code=status.HTTP_201_CREATED)
async def add_lead_note(
    lead_id: UUID,
    payload: LeadNoteCreate,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> LeadDetail:
    """A private note for the team. The enquirer never sees it."""

    lead = await db.get(AgencyLead, lead_id)
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enquiry not found")
    db.add(LeadNote(lead_id=lead_id, author_id=staff.id, kind="note", body=payload.body.strip()))
    activity.record(db, staff, "lead.note", f"Added a note on the enquiry from {lead.name or lead.email}",
                    subject_type="lead", subject_id=lead.id)
    await db.commit()
    return await _lead_detail(db, lead_id)


@router.post("/leads/{lead_id}/reply", response_model=LeadDetail, status_code=status.HTTP_201_CREATED)
async def reply_to_lead(
    lead_id: UUID,
    payload: LeadReplyCreate,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> LeadDetail:
    """Email the enquirer from the dashboard and keep a copy in the enquiry's history."""

    lead = await db.get(AgencyLead, lead_id)
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enquiry not found")
    subject, body = payload.subject.strip(), payload.body.strip()
    if not send_lead_reply(lead.email, subject, body, svc.display_name(staff)):
        # Nothing is recorded, so the history never claims an email that was not sent.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="The email could not be sent. Please try again."
        )
    db.add(LeadNote(lead_id=lead.id, author_id=staff.id, kind="email", subject=subject, body=body))
    activity.record(db, staff, "lead.reply", f"Emailed {lead.name or lead.email}: {quoted(subject)}",
                    subject_type="lead", subject_id=lead.id)
    if lead.status == "new":
        lead.status = "contacted"
    await db.commit()
    return await _lead_detail(db, lead_id)


# --- Numbers for the home page ------------------------------------------------


class AdminStats(BaseModel):
    new_enquiries: int
    enquiries_this_month: int
    follow_ups_due: int
    active_projects: int
    paused_projects: int
    # Active projects with a step waiting on the client or work waiting for sign-off.
    waiting_on_client: int
    unpaid: list[MoneyTotal]
    overdue: list[MoneyTotal]
    paid_this_month: list[MoneyTotal]


async def _money_by_currency(db: AsyncSession, *conditions) -> list[MoneyTotal]:
    rows = await db.execute(
        select(ProjectInvoice.currency, func.sum(ProjectInvoice.amount_cents), func.count())
        # Invoices kept after their project was deleted are records, not work.
        .where(ProjectInvoice.project_id.is_not(None), *conditions)
        .group_by(ProjectInvoice.currency)
        .order_by(ProjectInvoice.currency)
    )
    return [MoneyTotal(currency=currency, cents=int(cents or 0), count=count) for currency, cents, count in rows]


@router.get("/stats", response_model=AdminStats)
async def stats(db: AsyncSession = Depends(get_db)) -> AdminStats:
    today = date.today()
    month_start = today.replace(day=1)

    async def count(*conditions) -> int:
        return int(await db.scalar(select(func.count()).select_from(AgencyLead).where(*conditions)) or 0)

    project_counts = dict(
        (row_status, total)
        for row_status, total in await db.execute(select(Project.status, func.count()).group_by(Project.status))
    )
    waiting = await db.scalar(
        select(func.count(Project.id)).where(
            Project.status == "active",
            or_(
                Project.stages.any(ProjectStage.status == "waiting_on_client"),
                Project.updates.any(
                    and_(ProjectUpdate.kind == "approval", ProjectUpdate.approval_status == "pending")
                ),
            ),
        )
    )

    return AdminStats(
        new_enquiries=await count(AgencyLead.status == "new"),
        enquiries_this_month=await count(AgencyLead.created_at >= month_start),
        follow_ups_due=await count(
            AgencyLead.follow_up_on.is_not(None),
            AgencyLead.follow_up_on <= today,
            AgencyLead.status.in_(("new", "contacted")),
        ),
        active_projects=int(project_counts.get("active", 0)),
        paused_projects=int(project_counts.get("on_hold", 0)),
        waiting_on_client=int(waiting or 0),
        unpaid=await _money_by_currency(db, ProjectInvoice.status == "unpaid"),
        overdue=await _money_by_currency(
            db, ProjectInvoice.status == "unpaid", ProjectInvoice.due_date.is_not(None), ProjectInvoice.due_date < today
        ),
        paid_this_month=await _money_by_currency(
            db, ProjectInvoice.status == "paid", ProjectInvoice.paid_at >= month_start
        ),
    )


# --- Money ------------------------------------------------------------------------


def _admin_invoice(invoice: ProjectInvoice, project: Project) -> AdminInvoiceOut:
    client = project.client
    return AdminInvoiceOut(
        **InvoiceOut.model_validate(invoice).model_dump(),
        project_id=project.id,
        project_title=project.title,
        project_reference=project.reference,
        client_id=client.id if client else None,
        client_name=client.full_name if client else None,
        client_email=client.email if client else None,
    )


@router.get("/invoices", response_model=list[AdminInvoiceOut])
async def list_invoices(db: AsyncSession = Depends(get_db)) -> list[AdminInvoiceOut]:
    """Every invoice on every project, newest first."""

    result = await db.scalars(
        select(ProjectInvoice)
        .where(ProjectInvoice.project_id.is_not(None))
        .options(selectinload(ProjectInvoice.project).selectinload(Project.client))
        .order_by(ProjectInvoice.created_at.desc())
    )
    return [_admin_invoice(invoice, invoice.project) for invoice in result]


# --- Clients ------------------------------------------------------------------------


def _totals(invoices: list[ProjectInvoice], *statuses: str) -> list[MoneyTotal]:
    sums: dict[str, list[int]] = {}
    for invoice in invoices:
        if invoice.status in statuses:
            entry = sums.setdefault(invoice.currency, [0, 0])
            entry[0] += invoice.amount_cents
            entry[1] += 1
    return [MoneyTotal(currency=c, cents=v[0], count=v[1]) for c, v in sorted(sums.items())]


def _client_summary(client: User, projects: list[Project], last_sign_in) -> ClientSummary:
    invoices = [i for p in projects for i in p.invoices]
    return ClientSummary(
        id=client.id,
        name=client.full_name,
        email=client.email,
        is_active=client.is_active,
        created_at=client.created_at,
        last_sign_in=last_sign_in,
        last_activity=max((p.updated_at for p in projects), default=None),
        project_count=len(projects),
        active_projects=sum(1 for p in projects if p.status == "active"),
        billed=_totals(invoices, "unpaid", "paid"),
        paid=_totals(invoices, "paid"),
        outstanding=_totals(invoices, "unpaid"),
    )


async def _last_sign_ins(db: AsyncSession, user_ids: list[UUID]) -> dict[UUID, object]:
    if not user_ids:
        return {}
    rows = await db.execute(
        select(RefreshToken.user_id, func.max(RefreshToken.created_at))
        .where(RefreshToken.user_id.in_(user_ids))
        .group_by(RefreshToken.user_id)
    )
    return dict(rows.all())


async def _load_client(db: AsyncSession, client_id: UUID) -> User:
    client = await db.get(User, client_id, populate_existing=True)
    # Staff are not clients; 404 so this cannot be used to switch a teammate off.
    if client is None or svc.is_staff(client):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    return client


async def _client_projects(db: AsyncSession, client_id: UUID) -> list[Project]:
    result = await db.scalars(
        select(Project)
        .where(Project.client_id == client_id)
        .options(*svc.with_everything())
        .order_by(Project.updated_at.desc())
        .execution_options(populate_existing=True)
    )
    return list(result.unique())


async def _client_detail(db: AsyncSession, client: User) -> ClientDetail:
    projects = await _client_projects(db, client.id)
    last = (await _last_sign_ins(db, [client.id])).get(client.id)
    summary = _client_summary(client, projects, last)
    invoices = sorted(
        (_admin_invoice(i, p) for p in projects for i in p.invoices), key=lambda i: i.created_at, reverse=True
    )
    return ClientDetail(
        **summary.model_dump(),
        projects=[svc.summarise(p, team=True) for p in projects],
        invoices=invoices,
    )


@router.get("/clients", response_model=list[ClientSummary])
async def list_clients(db: AsyncSession = Depends(get_db)) -> list[ClientSummary]:
    """Everyone we have built (or are building) a project for, most recently active first."""

    result = await db.scalars(
        select(Project).options(selectinload(Project.client), selectinload(Project.invoices))
    )
    by_client: dict[UUID, tuple[User, list[Project]]] = {}
    for project in result:
        if project.client is None or svc.is_staff(project.client):
            continue
        by_client.setdefault(project.client.id, (project.client, []))[1].append(project)
    last = await _last_sign_ins(db, list(by_client))
    clients = [_client_summary(user, projects, last.get(user.id)) for user, projects in by_client.values()]
    clients.sort(key=lambda c: c.last_activity or c.created_at, reverse=True)
    return clients


@router.get("/clients/{client_id}", response_model=ClientDetail)
async def get_client(client_id: UUID, db: AsyncSession = Depends(get_db)) -> ClientDetail:
    return await _client_detail(db, await _load_client(db, client_id))


@router.patch("/clients/{client_id}", response_model=ClientDetail)
async def patch_client(
    client_id: UUID, payload: ClientPatch, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> ClientDetail:
    """Rename a client, or switch their access off and on.

    Switching off signs them out everywhere at once: their refresh tokens are
    revoked and every request with an old access token is refused.
    """

    client = await _load_client(db, client_id)
    changes = payload.model_dump(exclude_unset=True)
    label = svc.display_name(client)
    if "full_name" in changes:
        new_name = (changes["full_name"] or "").strip() or None
        if new_name != client.full_name:
            client.full_name = new_name
            activity.record(db, staff, "client.rename", f"Renamed the client {label} to {new_name or client.email}",
                            subject_type="client", subject_id=client.id)
    deactivated = changes.get("is_active") is False and client.is_active
    if changes.get("is_active") is not None and changes["is_active"] != client.is_active:
        client.is_active = changes["is_active"]
        activity.record(
            db, staff, "client.on" if client.is_active else "client.off",
            f"{'Switched on' if client.is_active else 'Switched off'} access for {svc.display_name(client)}",
            subject_type="client", subject_id=client.id,
        )
    await db.commit()
    if deactivated:
        await sessions.revoke_all_for_user(client.id, db)
    return await _client_detail(db, client)


@router.post("/clients/{client_id}/invite")
async def invite_client(
    client_id: UUID, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> dict:
    """Email a fresh 7-day link to set a password, naming their latest project."""

    client = await _load_client(db, client_id)
    if not client.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This client is switched off. Switch them back on first."
        )
    project = await db.scalar(
        select(Project).where(Project.client_id == client.id).order_by(Project.updated_at.desc()).limit(1)
    )
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This client has no project yet")
    if not _send_invite(client, project):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The email could not be sent. Check the email settings and try again.",
        )
    activity.record(db, staff, "client.invite", f"Sent {svc.display_name(client)} a new link to set their password",
                    subject_type="client", subject_id=client.id)
    await db.commit()
    return {"status": "sent", "email": client.email}
