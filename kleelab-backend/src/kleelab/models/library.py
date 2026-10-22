"""The team's shared library: project templates and saved replies.

Not to be confused with `template.py`, which holds the old site builder's page
templates.
"""

import uuid
from datetime import datetime
from uuid import UUID

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from kleelab.core.database import Base


class ProjectTemplate(Base):
    """A kind of project we build often: its steps and what we ask the client for.

    Picked when starting a project or writing a proposal, so a shop or a booking
    site starts with the right plan instead of the general one.
    """

    __tablename__ = "project_templates"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # For the team: when to use it.
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # [{"name": ..., "description": ...}], worded for the client.
    stages: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # [{"title": ..., "description": ...}], worded for the client.
    checklist: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_by_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    created_by = relationship("User")


class SavedReply(Base):
    """Words the team sends again and again, shared by everyone.

    May hold {first_name}, {project} and {my_name}, filled in when inserted.
    """

    __tablename__ = "saved_replies"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    created_by = relationship("User")
