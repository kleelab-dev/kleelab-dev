"""Agency upsell leads."""

import uuid
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column

from kleelab.core.database import Base


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