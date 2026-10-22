"""Free first calls a visitor books from the site."""

import uuid
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from kleelab.core.database import Base


class CallBooking(Base):
    """One booked call.

    Every booking belongs to an enquiry (made with it when someone books
    straight from the site), so it shows up with everything else the team knows
    about that person, and goes when the enquiry is deleted.
    """

    __tablename__ = "call_bookings"
    __table_args__ = (
        # One call at a time: two people can never hold the same slot.
        Index("uq_call_bookings_slot", "starts_at", unique=True, postgresql_where=text("status = 'booked'")),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lead_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("agency_leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    company: Mapped[str | None] = mapped_column(String(150), nullable=True)
    # Optional, in international form: +2348031234567.
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # What they want to talk about.
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Naive UTC, like every other timestamp.
    starts_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    # booked | cancelled
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="booked", server_default="booked")
    # The key in the link the booker uses to move or cancel it. No account needed.
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # client | team
    cancelled_by: Mapped[str | None] = mapped_column(String(10), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    lead = relationship("AgencyLead")
