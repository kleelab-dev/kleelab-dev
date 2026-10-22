"""The team's library: project templates and saved replies.

Everything here is shared by the whole team, so anyone can change or remove
anything; the activity log says who did.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from kleelab.core.database import get_db
from kleelab.models.library import ProjectTemplate, SavedReply
from kleelab.models.user import User
from kleelab.routers.admin import require_staff
from kleelab.schemas.library import (
    ProjectTemplateIn,
    ProjectTemplateOut,
    SavedReplyIn,
    SavedReplyOut,
    TemplateChecklistItem,
    TemplateFromProject,
    TemplateStage,
)
from kleelab.services import activity
from kleelab.services import projects as project_svc

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_staff)])

# Enough for every kind of site we build, few enough to pick from.
MAX_TEMPLATES = 50
MAX_REPLIES = 100


def _template_out(template: ProjectTemplate) -> ProjectTemplateOut:
    return ProjectTemplateOut(
        id=template.id,
        name=template.name,
        description=template.description,
        stages=[TemplateStage(**stage) for stage in template.stages],
        checklist=[TemplateChecklistItem(**item) for item in template.checklist],
        created_by_name=project_svc.display_name(template.created_by),
        updated_at=template.updated_at,
    )


def _reply_out(reply: SavedReply) -> SavedReplyOut:
    return SavedReplyOut(
        id=reply.id,
        title=reply.title,
        body=reply.body,
        created_by_name=project_svc.display_name(reply.created_by),
        updated_at=reply.updated_at,
    )


def _clean(text: str | None) -> str | None:
    return (text or "").strip() or None


def _fill(template: ProjectTemplate, payload: ProjectTemplateIn | TemplateFromProject) -> None:
    template.name = payload.name.strip()
    template.description = _clean(payload.description)


async def _get_template(db: AsyncSession, template_id: UUID) -> ProjectTemplate:
    template = await db.scalar(
        select(ProjectTemplate).where(ProjectTemplate.id == template_id).options(selectinload(ProjectTemplate.created_by))
    )
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return template


async def _get_reply(db: AsyncSession, reply_id: UUID) -> SavedReply:
    reply = await db.scalar(
        select(SavedReply).where(SavedReply.id == reply_id).options(selectinload(SavedReply.created_by))
    )
    if reply is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved reply not found")
    return reply


async def _room_for(db: AsyncSession, model, limit: int, what: str) -> None:
    count = await db.scalar(select(func.count()).select_from(model))
    if count >= limit:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"There are already {limit} {what}. Remove one you no longer use first.",
        )


# --- Project templates -----------------------------------------------------------


@router.get("/project-templates", response_model=list[ProjectTemplateOut])
async def list_templates(db: AsyncSession = Depends(get_db)) -> list[ProjectTemplateOut]:
    result = await db.scalars(
        select(ProjectTemplate).options(selectinload(ProjectTemplate.created_by)).order_by(ProjectTemplate.name)
    )
    return [_template_out(template) for template in result]


@router.post("/project-templates", response_model=ProjectTemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template(
    payload: ProjectTemplateIn, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> ProjectTemplateOut:
    await _room_for(db, ProjectTemplate, MAX_TEMPLATES, "templates")
    template = ProjectTemplate(created_by_id=staff.id)
    _fill(template, payload)
    template.stages = [stage.model_dump() for stage in payload.stages]
    template.checklist = [item.model_dump() for item in payload.checklist]
    db.add(template)
    await db.flush()
    activity.record(db, staff, "template.create", f"Added the project template {template.name}",
                    subject_type="template", subject_id=template.id)
    await db.commit()
    return _template_out(await _get_template(db, template.id))


@router.put("/project-templates/{template_id}", response_model=ProjectTemplateOut)
async def update_template(
    template_id: UUID, payload: ProjectTemplateIn, db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ProjectTemplateOut:
    template = await _get_template(db, template_id)
    _fill(template, payload)
    template.stages = [stage.model_dump() for stage in payload.stages]
    template.checklist = [item.model_dump() for item in payload.checklist]
    activity.record(db, staff, "template.update", f"Changed the project template {template.name}",
                    subject_type="template", subject_id=template.id)
    await db.commit()
    return _template_out(await _get_template(db, template.id))


@router.delete("/project-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: UUID, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> None:
    template = await _get_template(db, template_id)
    activity.record(db, staff, "template.delete", f"Removed the project template {template.name}",
                    subject_type="template", subject_id=template.id)
    await db.delete(template)
    await db.commit()


@router.post("/projects/{project_id}/save-as-template", response_model=ProjectTemplateOut,
             status_code=status.HTTP_201_CREATED)
async def save_project_as_template(
    project_id: UUID, payload: TemplateFromProject, db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ProjectTemplateOut:
    """Keep a project's steps and getting-started list for the next one like it."""

    project = await project_svc.load_project(db, project_id, staff)
    if not project.stages:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="This project has no steps to save.")
    await _room_for(db, ProjectTemplate, MAX_TEMPLATES, "templates")
    template = ProjectTemplate(created_by_id=staff.id)
    _fill(template, payload)
    template.stages = [
        {"name": stage.name, "description": stage.description} for stage in project.stages[:12]
    ]
    template.checklist = [
        {"title": item.title, "description": item.description} for item in project.checklist[:30]
    ]
    db.add(template)
    await db.flush()
    activity.record(db, staff, "template.create",
                    f"Saved the steps of {project.reference} as the template {template.name}",
                    project_id=project.id, subject_type="template", subject_id=template.id)
    await db.commit()
    return _template_out(await _get_template(db, template.id))


# --- Saved replies -----------------------------------------------------------------


@router.get("/saved-replies", response_model=list[SavedReplyOut])
async def list_replies(db: AsyncSession = Depends(get_db)) -> list[SavedReplyOut]:
    result = await db.scalars(select(SavedReply).options(selectinload(SavedReply.created_by)).order_by(SavedReply.title))
    return [_reply_out(reply) for reply in result]


@router.post("/saved-replies", response_model=SavedReplyOut, status_code=status.HTTP_201_CREATED)
async def create_reply(
    payload: SavedReplyIn, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> SavedReplyOut:
    await _room_for(db, SavedReply, MAX_REPLIES, "saved replies")
    reply = SavedReply(title=payload.title.strip(), body=payload.body.strip(), created_by_id=staff.id)
    db.add(reply)
    await db.flush()
    activity.record(db, staff, "reply.create", f"Added the saved reply {reply.title}",
                    subject_type="saved_reply", subject_id=reply.id)
    await db.commit()
    return _reply_out(await _get_reply(db, reply.id))


@router.put("/saved-replies/{reply_id}", response_model=SavedReplyOut)
async def update_reply(
    reply_id: UUID, payload: SavedReplyIn, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> SavedReplyOut:
    reply = await _get_reply(db, reply_id)
    reply.title = payload.title.strip()
    reply.body = payload.body.strip()
    activity.record(db, staff, "reply.update", f"Changed the saved reply {reply.title}",
                    subject_type="saved_reply", subject_id=reply.id)
    await db.commit()
    return _reply_out(await _get_reply(db, reply.id))


@router.delete("/saved-replies/{reply_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reply(
    reply_id: UUID, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> None:
    reply = await _get_reply(db, reply_id)
    activity.record(db, staff, "reply.delete", f"Removed the saved reply {reply.title}",
                    subject_type="saved_reply", subject_id=reply.id)
    await db.delete(reply)
    await db.commit()
