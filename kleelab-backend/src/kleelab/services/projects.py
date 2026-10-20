"""Project rules shared by the client and staff routers.

Kept out of the routers so both sides agree on what "the current stage" and
"waiting on you" mean; the dashboard and the admin list must never disagree.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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
        owner_id=project.owner_id if team else None,
        owner_name=display_name(project.owner) if team else None,
        awaiting_reply=awaiting_reply(project) if team else False,
    )


def detail(project: Project, team: bool = False) -> ProjectDetail:
    """The full project. `team` adds the client's details and the team's own notes."""

    updates = []
    for update in project.updates:
        if update.kind == "note" and not team:
            continue
        out = UpdateOut.model_validate(update)
        if update.author is not None:
            out.author_name = display_name(update.author)
            out.from_team = is_staff(update.author)
        else:
            out.author_name = "KleeLab"
            out.from_team = True
        updates.append(out)
    # Newest first: a client opens the dashboard to see what changed.
    updates.reverse()
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
        files=[_file_out(f) for f in reversed(project.files)],
        invoices=[InvoiceOut.model_validate(i) for i in reversed(project.invoices)],
        client_email=project.client.email if team and project.client else None,
        client_name=project.client.full_name if team and project.client else None,
        owner_id=project.owner_id if team else None,
        owner_name=display_name(project.owner) if team else None,
        lead_id=project.lead_id if team else None,
    )


def _file_out(item: ProjectFile) -> FileOut:
    out = FileOut.model_validate(item)
    out.uploaded_by_name = display_name(item.uploader)
    out.from_team = item.uploader is not None and is_staff(item.uploader)
    return out


async def touch(db: AsyncSession, project: Project) -> None:
    """Mark the project as changed, so lists sort by real activity."""

    project.updated_at = now()


def random_password() -> str:
    """A password nobody knows, for an invited account until its owner sets one."""

    return secrets.token_urlsafe(32)
