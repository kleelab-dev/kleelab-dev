"""User database model."""

import uuid
from datetime import datetime
from uuid import UUID

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from kleelab.core.database import Base


class User(Base):
    """Registered KleeLab user."""

    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The users table has carried is_active since initial_schema, but the model
    # never mapped it, so a disabled account could never be detected.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    provider: Mapped[str] = mapped_column(String(50), default="email", nullable=False)
    # Commercial tier. Deliberately a string rather than an enum: the limits a
    # plan implies live in `services/plans.py`, so adding a tier is a code change
    # in one dict, not a database migration.
    plan: Mapped[str] = mapped_column(
        String(20), nullable=False, default="free", server_default="free"
    )
    # 'client' | 'staff'. Staff run projects from the admin view; everyone else
    # only ever sees projects they are the client on.
    role: Mapped[str] = mapped_column(
        String(20), nullable=False, default="client", server_default="client"
    )
    deletion_requested_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Two-step sign-in (staff). See services/two_step.py. The secret is
    # encrypted; it is set during set-up and only counts once enabled_at is.
    totp_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)
    two_step_enabled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # The last code's time step, so a code cannot be used twice.
    two_step_last_step: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    two_step_failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    two_step_locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # JSON list of keyed hashes of the unused recovery codes.
    recovery_codes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Staff: alerts newer than this count as unread. None until they first look.
    alerts_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
    sites = relationship("Site", back_populates="owner", cascade="all, delete")
