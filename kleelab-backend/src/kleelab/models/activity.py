"""Activity log: who did what, and when."""

import uuid
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column

from kleelab.core.database import Base


class ActivityEvent(Base):
    """One thing someone did: a change in the team dashboard, a client's message, a sign-in.

    The summary is written when it happens and never rebuilt, so it still reads
    correctly after the project, invoice or person it names has changed.
    """

    __tablename__ = "activity_events"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # The actor's name at the time, kept if their account goes.
    actor_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # e.g. "invoice.paid", "auth.sign_in". See services/activity.py.
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    summary: Mapped[str] = mapped_column(String(300), nullable=False)
    project_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # What it was about, for a link: "project", "lead", "client", "staff", "invoice".
    subject_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    subject_id: Mapped[UUID | None] = mapped_column(PostgreSQLUUID(as_uuid=True), nullable=True)
    # Kept for sign-ins only.
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
