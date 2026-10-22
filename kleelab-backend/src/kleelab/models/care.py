"""After hand-over: care plans, and the time the team spends on projects.

A care plan is the monthly (or yearly) arrangement for looking after a site once
it is live: updates, backups, small changes. It bills itself: on each billing
date the daily job raises an invoice and moves the date on (services/care.py).

Time entries are the team's own record of hours spent. The client never sees
them, except as hours used against a care plan that includes some.
"""

import uuid
from datetime import date, datetime
from uuid import UUID

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from kleelab.core.database import Base

CARE_STATUSES = ("active", "paused", "ended")
CARE_INTERVALS = ("month", "year")


class CarePlan(Base):
    __tablename__ = "care_plans"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # What it covers, one thing per line. The client sees it.
    includes: Mapped[str | None] = mapped_column(Text, nullable=True)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    # month | year
    interval: Mapped[str] = mapped_column(String(10), nullable=False, default="month", server_default="month")
    # Hours of work included each period, in minutes. Null when it is not counted.
    minutes_included: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # active | paused (no bills until resumed) | ended
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="active", server_default="active")
    started_on: Mapped[date] = mapped_column(Date, nullable=False)
    # The next time an invoice is raised. The current period runs up to it.
    next_bill_on: Mapped[date] = mapped_column(Date, nullable=False)
    ended_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_by_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    project = relationship("Project")


class TimeEntry(Base):
    __tablename__ = "time_entries"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # The step it was for, when it was for one.
    stage_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("project_stages.id", ondelete="SET NULL"), nullable=True
    )
    worked_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    project = relationship("Project")
    user = relationship("User")
    stage = relationship("ProjectStage")
