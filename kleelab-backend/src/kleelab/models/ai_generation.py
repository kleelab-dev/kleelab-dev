"""AI generation ledger.

Every outbound model call writes one row here. It exists for two reasons that
have nothing to do with each other, which is why it is a table and not a counter
column somewhere:

1. **Quota.** A plan's monthly build allowance is counted from these rows, so the
   allowance cannot drift out of step with what was actually generated.
2. **Cost forensics.** Token counts and the model name make it possible to answer
   "which account cost us money last month, and for what" without asking the
   provider. A billed API with no local ledger is unbudgetable.

The brief payload is stored here too rather than in its own table: it is
diagnostic data belonging to one generation, and there is no query that needs it
independently.
"""

import uuid
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column

from kleelab.core.database import Base


class AIGeneration(Base):
    """One recorded call to the language model."""

    __tablename__ = "ai_generations"

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # SET NULL rather than CASCADE: deleting a site should not erase the record
    # that the call happened, because the spend still did.
    site_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("sites.id", ondelete="SET NULL"),
        nullable=True,
    )
    # 'brief' opens a build, 'content' fills one, 'edit' mutates an existing page.
    # Only 'brief' rows count against the monthly build allowance - one build is
    # one brief, whereas an edit is bounded by the daily call cap instead.
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    model: Mapped[str] = mapped_column(String(50), nullable=False)
    prompt_chars: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tokens_in: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 'ok' | 'error' | 'rejected'. 'rejected' means the model answered but the
    # answer failed validation, which is a different problem from a network error.
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ok")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The parsed brief or op list, when there was one. Diagnostic only.
    payload: Mapped[Any | None] = mapped_column(JSON, nullable=True)

    __table_args__ = (
        # Serves both the monthly build count and the daily call cap.
        Index("ix_ai_generations_user_kind_created", "user_id", "kind", "created_at"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
