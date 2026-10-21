"""Write to the activity log.

`record` only adds the row; it is saved with the change it describes, in the
same commit, so the log never claims something that was rolled back.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.rate_limiter import client_ip
from kleelab.core.time import utcnow
from kleelab.models.activity import ActivityEvent
from kleelab.models.user import User


def actor_label(user: User | None) -> str | None:
    if user is None:
        return None
    return user.full_name or user.email


def record(
    db: AsyncSession,
    actor: User | None,
    action: str,
    summary: str,
    *,
    project_id: UUID | None = None,
    subject_type: str | None = None,
    subject_id: UUID | None = None,
    request: Request | None = None,
) -> None:
    db.add(
        ActivityEvent(
            actor_id=actor.id if actor else None,
            actor_label=actor_label(actor),
            action=action,
            summary=summary if len(summary) <= 300 else summary[:299] + "…",
            project_id=project_id,
            subject_type=subject_type,
            subject_id=subject_id,
            ip=client_ip(request)[:64] if request is not None else None,
            # Set here rather than by the database so events written in one
            # transaction keep the order they happened in.
            created_at=utcnow(),
        )
    )


def quoted(text: str | None, limit: int = 60) -> str:
    """A short, quoted excerpt for a summary line."""

    text = " ".join((text or "").split())
    if len(text) > limit:
        text = text[: limit - 1].rstrip() + "…"
    return f"“{text}”"
