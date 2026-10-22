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

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, LargeBinary, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PostgreSQLUUID
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
    # No delete cascade: invoices are tax records and outlive the project (see
    # ProjectInvoice.project_id). The database sets their project_id to null.
    invoices = relationship(
        "ProjectInvoice",
        back_populates="project",
        cascade="save-update, merge",
        passive_deletes=True,
        order_by="ProjectInvoice.created_at",
    )
    # The proposal the client accepted to start it, if it started that way. Its
    # price says what is still owed at hand-over.
    proposal = relationship(
        "Proposal",
        primaryjoin="and_(Project.id == foreign(Proposal.project_id), Proposal.status == 'accepted')",
        uselist=False,
        viewonly=True,
    )
    # What we need from the client to get going: their logo, their words, access.
    checklist = relationship(
        "ProjectChecklistItem",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="ProjectChecklistItem.position",
    )
    # Everything the client needs once it is theirs, written up at the end.
    handover = relationship("ProjectHandover", back_populates="project", cascade="all, delete-orphan", uselist=False)
    # Looking after it once it is live: the plan that is not ended, if any.
    care_plan = relationship(
        "CarePlan",
        primaryjoin="and_(Project.id == foreign(CarePlan.project_id), CarePlan.status != 'ended')",
        uselist=False,
        viewonly=True,
    )
    # The team's logged hours. The database removes them with the project.
    time_entries = relationship("TimeEntry", viewonly=True, order_by="TimeEntry.worked_on")


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
    # Set when the file came with a message, so the message can show it.
    update_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("project_updates.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Uploaded for a message that is not sent yet: hidden from everyone but the
    # uploader until it is, and cleared away if it never is.
    held: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    project = relationship("Project", back_populates="files")
    uploader = relationship("User")


class ProjectInvoice(Base):
    """Money the client owes for a project.

    Paid by card through Paystack (see `InvoicePayment`), through a link, or by
    bank transfer that the team marks paid by hand.

    An invoice is a financial record the law says we must keep, so deleting the
    client's account (and with it the project) does not delete it. It is left
    detached, with `project_id` null, and the copied client and project details
    below say who it was for. services/retention.py deletes it once the
    retention period is up.
    """

    __tablename__ = "project_invoices"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Null once the project has been deleted.
    project_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Copied in when the invoice is raised, so it still says who was billed for
    # what after the project and account are gone.
    client_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    client_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    project_reference: Mapped[str | None] = mapped_column(String(20), nullable=True)
    project_title: Mapped[str | None] = mapped_column(String(150), nullable=True)
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
    # How it was paid when we know: "paystack" for an online card payment. Null
    # when the team marked it paid by hand.
    paid_via: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # The provider's reference for that payment, for finding it in their dashboard.
    payment_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Which part of an accepted proposal's price this is: deposit | balance | full.
    # Null for an invoice the team wrote by hand.
    kind: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Automatic payment reminders sent so far (see services/billing.py).
    reminders_sent: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    last_reminded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="invoices")


class InvoicePayment(Base):
    """One attempt to pay an invoice online.

    A row per attempt rather than a column on the invoice, because a client can
    press "Pay now" twice and each press gets its own provider reference. Either
    of them may be the one that is paid, so both must stay findable.
    """

    __tablename__ = "invoice_payments"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("project_invoices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    initiated_by: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    provider: Mapped[str] = mapped_column(String(20), nullable=False, default="paystack", server_default="paystack")
    reference: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    # What we asked the provider to charge, so a verified charge can be compared.
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    # pending | success | failed | mismatch (charged, but not what we asked for)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="pending")
    provider_transaction_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    channel: Mapped[str | None] = mapped_column(String(30), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    invoice = relationship("ProjectInvoice")


class ProjectChecklistItem(Base):
    """One thing we need from the client before the work can get going.

    The client ticks it off on their project page; the team can tick it too
    when it arrived some other way, by email or on a call.
    """

    __tablename__ = "project_checklist_items"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    done_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    done_by_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Left by whoever ticked it: "sent by email", "Ada signs off".
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    project = relationship("Project", back_populates="checklist")
    done_by = relationship("User")


class ProjectHandover(Base):
    """The hand-over pack: where everything lives and how to look after it.

    The team writes it while finishing the project and publishes it when it is
    ready; the client sees nothing until then. Items are labelled links and
    facts (the live address, the registrar, where the code is). Passwords never
    go here: they are shared by a password manager or in person.
    """

    __tablename__ = "project_handovers"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # [{"label": str, "value": str | None, "url": str | None}]
    items: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="handover")
