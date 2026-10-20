"""The client's side of a project: see progress, talk to us, sign things off."""

import logging
from urllib.parse import quote, unquote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import undefer

from kleelab.core.database import get_db
from kleelab.core.security import get_current_user
from kleelab.models.project import Project, ProjectFile, ProjectRequest, ProjectUpdate
from kleelab.models.user import User
from kleelab.schemas.project import (
    ApprovalDecision,
    MessageCreate,
    ProjectDetail,
    ProjectSummary,
    RequestCreate,
)
from kleelab.services import projects as svc
from kleelab.services.email import send_client_project_notice, send_team_notice

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["projects"])

REQUEST_LABELS = {
    "deployment": "Help going live",
    "hosting": "Hosting",
    "maintenance": "Monthly care",
    "change": "A change",
}

MAX_FILE_BYTES = 10 * 1024 * 1024
# Served as a download, never rendered: an uploaded page or SVG must not be able
# to run script on our origin.
RISKY_TYPES = {"text/html", "image/svg+xml", "application/xhtml+xml", "text/xml", "application/xml", "text/javascript", "application/javascript"}


def _notify_team(subject: str, lines: list[str]) -> None:
    try:
        send_team_notice(subject, lines)
    except Exception:  # noqa: BLE001 - the action itself is already saved
        logger.exception("Could not send team notice %r", subject)


@router.get("", response_model=list[ProjectSummary])
async def list_projects(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> list[ProjectSummary]:
    """Projects where the signed-in user is the client, most recently active first."""

    result = await db.scalars(
        select(Project)
        .where(Project.client_id == user.id)
        .options(*svc.with_everything())
        .order_by(Project.updated_at.desc())
    )
    return [svc.summarise(project) for project in result.unique()]


@router.get("/{project_id}", response_model=ProjectDetail)
async def get_project(
    project_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> ProjectDetail:
    project = await svc.load_project(db, project_id, user)
    return svc.detail(project, team=svc.is_staff(user))


@router.post("/{project_id}/messages", response_model=ProjectDetail, status_code=status.HTTP_201_CREATED)
async def post_message(
    project_id: UUID,
    payload: MessageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectDetail:
    project = await svc.load_project(db, project_id, user)
    stage = svc.current_stage(project)
    db.add(
        ProjectUpdate(
            project_id=project.id,
            stage_id=stage.id if stage else None,
            author_id=user.id,
            kind="message",
            body=payload.body.strip(),
        )
    )
    await svc.touch(db, project)
    await db.commit()
    if not svc.is_staff(user):
        _notify_team(
            f"[{project.reference}] New message from {user.email}",
            [project.title, payload.body.strip()],
        )
    project = await svc.load_project(db, project_id, user)
    return svc.detail(project, team=svc.is_staff(user))


@router.post("/{project_id}/approvals/{update_id}", response_model=ProjectDetail)
async def decide_approval(
    project_id: UUID,
    update_id: UUID,
    payload: ApprovalDecision,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectDetail:
    """The client signs something off, or asks for changes.

    Only the client decides. A team member approving their own request would
    make the sign-off meaningless.
    """

    project = await svc.load_project(db, project_id, user)
    if project.client_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the client can sign this off")

    update = next((u for u in project.updates if u.id == update_id and u.kind == "approval"), None)
    if update is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval not found")
    if update.approval_status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This has already been answered")
    if payload.decision == "changes_requested" and not (payload.note or "").strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Tell us what you would like changed",
        )

    update.approval_status = payload.decision
    update.approval_note = (payload.note or "").strip() or None
    update.resolved_at = svc.now()
    # Asking for sign-off put the stage in the client's court; once nothing on it
    # is left to answer, it is back in ours.
    if update.stage_id is not None:
        stage = next((s for s in project.stages if s.id == update.stage_id), None)
        still_pending = any(
            u.stage_id == update.stage_id and u.kind == "approval" and u.approval_status == "pending"
            for u in project.updates
        )
        if stage is not None and stage.status == "waiting_on_client" and not still_pending:
            stage.status = "in_progress"
    await svc.touch(db, project)
    await db.commit()

    verdict = "approved" if payload.decision == "approved" else "asked for changes on"
    _notify_team(
        f"[{project.reference}] {user.email} {verdict} {update.title or 'a sign-off'}",
        [project.title, update.approval_note or ""],
    )
    project = await svc.load_project(db, project_id, user)
    return svc.detail(project)


@router.post("/{project_id}/requests", response_model=ProjectDetail, status_code=status.HTTP_201_CREATED)
async def create_request(
    project_id: UUID,
    payload: RequestCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectDetail:
    """Ask for add-on work: deployment, hosting, a maintenance plan, or a change."""

    project = await svc.load_project(db, project_id, user)
    already_open = any(r.kind == payload.kind and r.status == "open" for r in project.requests)
    if already_open and payload.kind != "change":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have an open request for this. We will be in touch.",
        )

    db.add(
        ProjectRequest(
            project_id=project.id,
            kind=payload.kind,
            message=(payload.message or "").strip() or None,
            status="open",
        )
    )
    await svc.touch(db, project)
    await db.commit()
    _notify_team(
        f"[{project.reference}] {REQUEST_LABELS[payload.kind]} requested by {user.email}",
        [project.title, payload.message or ""],
    )
    project = await svc.load_project(db, project_id, user)
    return svc.detail(project, team=svc.is_staff(user))


# --- Files ------------------------------------------------------------------


def _clean_filename(raw: str | None) -> str:
    name = unquote(raw or "").replace("\\", "/").split("/")[-1].strip()
    name = "".join(ch for ch in name if ch.isprintable())
    return (name or "file")[:255]


@router.post("/{project_id}/files", response_model=ProjectDetail, status_code=status.HTTP_201_CREATED)
async def upload_file(
    project_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectDetail:
    """Share a file on the project. The body is the file itself; X-File-Name names it.

    A raw body rather than a multipart form: one file at a time is all the
    dashboard sends, and it keeps the size check in our hands while reading.
    """

    project = await svc.load_project(db, project_id, user)
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_FILE_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Files can be up to 10 MB")
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Files can be up to 10 MB")
    if not data:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="That file is empty")

    filename = _clean_filename(request.headers.get("x-file-name"))
    content_type = (request.headers.get("content-type") or "application/octet-stream").split(";")[0].strip()[:120]
    db.add(
        ProjectFile(
            project_id=project.id,
            uploaded_by=user.id,
            filename=filename,
            content_type=content_type or "application/octet-stream",
            size=len(data),
            data=bytes(data),
        )
    )
    await svc.touch(db, project)
    await db.commit()

    if svc.is_staff(user):
        if project.client is not None:
            try:
                send_client_project_notice(
                    project.client.email, str(project.id), project.title, f"We shared a file with you: {filename}"
                )
            except Exception:  # noqa: BLE001
                logger.exception("Could not email the client about a file on %s", project.reference)
    else:
        _notify_team(f"[{project.reference}] {user.email} uploaded {filename}", [project.title])
    project = await svc.load_project(db, project_id, user)
    return svc.detail(project, team=svc.is_staff(user))


@router.get("/{project_id}/files/{file_id}")
async def download_file(
    project_id: UUID,
    file_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    project = await svc.load_project(db, project_id, user)
    item = await db.scalar(
        select(ProjectFile)
        .where(ProjectFile.id == file_id, ProjectFile.project_id == project.id)
        .options(undefer(ProjectFile.data))
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    media_type = "application/octet-stream" if item.content_type in RISKY_TYPES else item.content_type
    ascii_name = item.filename.encode("ascii", "ignore").decode().replace('"', "") or "file"
    return Response(
        content=item.data,
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(item.filename)}",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.delete("/{project_id}/files/{file_id}", response_model=ProjectDetail)
async def delete_file(
    project_id: UUID,
    file_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectDetail:
    """Remove a file. The person who shared it can, and so can the team."""

    project = await svc.load_project(db, project_id, user)
    item = next((f for f in project.files if f.id == file_id), None)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    if not svc.is_staff(user) and item.uploaded_by != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the person who shared this file can remove it")
    await db.delete(item)
    await svc.touch(db, project)
    await db.commit()
    project = await svc.load_project(db, project_id, user)
    return svc.detail(project, team=svc.is_staff(user))
