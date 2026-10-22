"""Proposals: what we offer to build for an enquirer, and their answer.

A proposal grows from an enquiry. The team writes it, sends the enquirer a
private link, and the enquirer accepts or declines it online. Accepting starts
the project and raises the deposit invoice in one step, so nobody has to copy
the scope, the price or the steps across by hand.

The link carries a long random token instead of the id: whoever holds it can
read and answer the proposal without an account, the same way a quote sent by
email works.
"""

import uuid
from datetime import date, datetime
from uuid import UUID

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from kleelab.core.database import Base


class Proposal(Base):
    __tablename__ = "proposals"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # A proposal belongs to its enquiry and goes with it. An accepted one is safe:
    # an enquiry that became a project is never purged on the retention clock.
    lead_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("agency_leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Set when the client accepts.
    project_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )

    reference: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    # draft | sent | accepted | declined | withdrawn. "Expired" is not stored:
    # it is a sent proposal past its valid_until date.
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", server_default="draft")
    # Goes up on every edit. The client's answer names the revision they read, so
    # nobody accepts a price that changed while the page was open.
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    client_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    client_email: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    scope: Mapped[str | None] = mapped_column(Text, nullable=True)
    # [{"description": str, "amount_cents": int}]
    items: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    deposit_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=50, server_default="50")
    duration_weeks: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # [{"name": str, "description": str | None}]; become the project's steps.
    stages: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)
    terms: Mapped[str | None] = mapped_column(Text, nullable=True)
    valid_until: Mapped[date | None] = mapped_column(Date, nullable=True)

    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    viewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # The name the client typed to accept, and where from: the record of who said yes.
    accepted_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    accepted_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # How the client chose to pay when accepting: "deposit" (the deposit now, the
    # rest at hand-over) or "full" (everything now).
    payment_choice: Mapped[str | None] = mapped_column(String(10), nullable=True)
    declined_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    decline_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    lead = relationship("AgencyLead")
    author = relationship("User", foreign_keys=[created_by])
