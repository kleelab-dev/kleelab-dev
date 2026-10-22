"""Agency upsell leads."""

import uuid
from datetime import date, datetime
from uuid import UUID

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from kleelab.core.database import Base


# Where an enquiry is in the pipeline, in order. The board on the Enquiries page
# has one column for each.
LEAD_STATUSES = ("new", "contacted", "call", "proposal", "won", "lost")
# Still being talked about: follow-ups are due on these, and a call or a
# proposal joins one of these rather than starting a new enquiry.
OPEN_LEAD_STATUSES = ("new", "contacted", "call", "proposal")
LEAD_STATUS_WORDS = {
    "new": "new",
    "contacted": "replied to",
    "call": "call booked",
    "proposal": "proposal sent",
    "won": "became a client",
    "lost": "not going ahead",
}


class AgencyLead(Base):
    __tablename__ = "agency_leads"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[UUID | None] = mapped_column(PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    feature_requested: Mapped[str | None] = mapped_column(String(255), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Qualification fields, collected only by the in-app upgrade flow. The
    # marketing contact form asks for none of these, so they stay null there.
    company: Mapped[str | None] = mapped_column(String(150), nullable=True)
    interest: Mapped[str | None] = mapped_column(String(50), nullable=True)
    budget: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # 'marketing' | 'app'. Same table because both are the same thing to whoever
    # picks them up; the difference is only how much is already known.
    source: Mapped[str] = mapped_column(
        String(20), nullable=False, default="marketing", server_default="marketing"
    )
    status: Mapped[str] = mapped_column(String(50), default="new", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    # The day someone on the team means to chase this enquiry next.
    follow_up_on: Mapped[date | None] = mapped_column(Date, nullable=True)

    notes = relationship(
        "LeadNote", back_populates="lead", cascade="all, delete-orphan", order_by="LeadNote.created_at"
    )


class LeadNote(Base):
    """The team's history with an enquiry: private notes, and emails sent to the enquirer."""

    __tablename__ = "lead_notes"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lead_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("agency_leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # note | email
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="note", server_default="note")
    # Only for emails.
    subject: Mapped[str | None] = mapped_column(String(200), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    lead = relationship("AgencyLead", back_populates="notes")
    author = relationship("User")