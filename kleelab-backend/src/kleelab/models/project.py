"""Client projects: what we are building for someone, and how far along it is.

A project is the client's window into the work. It moves through an ordered list
of stages (discovery to handover), and everything that happens along the way is
an entry on its timeline: a progress note from us, a message from either side, or
a request for the client's sign-off. Add-on work the client asks for afterwards
(deployment, hosting, maintenance, a change) is a request.

Statuses are strings rather than database enums for the same reason the user's
plan is: adding a value is a code change in one place, not a migration.
"""

import uuid
from datetime import date, datetime
from uuid import UUID

from sqlalchemy import Date, DateTime, ForeignKey, Integer, LargeBinary, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, deferred, mapped_column, relationship

from kleelab.core.database import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Short human reference shown on the dashboard, e.g. "PRJ-0142".
    reference: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    # active | on_hold | completed | cancelled
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active")
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Where the finished thing lives, once it lives anywhere.
    live_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # The team member who looks after this project.
    owner_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # The enquiry it started as, if any.
    lead_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("agency_leads.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    client = relationship("User", foreign_keys=[client_id])
    owner = relationship("User", foreign_keys=[owner_id])
    stages = relationship(
        "ProjectStage", back_populates="project", cascade="all, delete-orphan", order_by="ProjectStage.position"
    )
    updates = relationship(
        "ProjectUpdate", back_populates="project", cascade="all, delete-orphan", order_by="ProjectUpdate.created_at"
    )
    requests = relationship(
        "ProjectRequest", back_populates="project", cascade="all, delete-orphan", order_by="ProjectRequest.created_at"
    )
    files = relationship(
        "ProjectFile", back_populates="project", cascade="all, delete-orphan", order_by="ProjectFile.created_at"
    )
    invoices = relationship(
        "ProjectInvoice", back_populates="project", cascade="all, delete-orphan", order_by="ProjectInvoice.created_at"
    )


class ProjectStage(Base):
    __tablename__ = "project_stages"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # upcoming | in_progress | waiting_on_client | done
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="upcoming", server_default="upcoming")
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    project = relationship("Project", back_populates="stages")


class ProjectUpdate(Base):
    """One entry on a project's timeline."""

    __tablename__ = "project_updates"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("project_stages.id", ondelete="SET NULL"), nullable=True
    )
    author_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # progress (from us) | message (either side) | approval (we ask the client to sign off)
    # | note (team only: the client never sees it)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str | None] = mapped_column(String(150), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # A link rather than an upload: designs live in Figma, builds on a preview URL.
    link_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    link_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Approvals only: pending | approved | changes_requested
    approval_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    approval_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    project = relationship("Project", back_populates="updates")
    author = relationship("User")


class ProjectRequest(Base):
    """Add-on work a client asks for: deployment, hosting, maintenance or a change."""

    __tablename__ = "project_requests"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # deployment | hosting | maintenance | change
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # open | accepted | declined | done
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open", server_default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="requests")


class ProjectFile(Base):
    """A file either side shared on a project.

    The bytes live in the row (deferred, so listing files never loads them). The
    API host's disk is wiped on every deploy, and a size cap keeps this sane.
    """

    __tablename__ = "project_files"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    uploaded_by: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    data: Mapped[bytes] = deferred(mapped_column(LargeBinary, nullable=False))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    project = relationship("Project", back_populates="files")
    uploader = relationship("User")


class ProjectInvoice(Base):
    """Money the client owes for a project. Paid through a link, never through us."""

    __tablename__ = "project_invoices"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # e.g. "INV-0007"
    number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    # Whole minor units, so no float rounding ever reaches an invoice.
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # unpaid | paid | cancelled
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="unpaid", server_default="unpaid")
    pay_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="invoices")
