"""Page database model."""

import uuid
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, Text, func, JSON
from sqlalchemy.dialects.postgresql import JSONB, UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from kleelab.core.database import Base

JSONType = JSON().with_variant(JSONB, "postgresql")


class Page(Base):
    """A content page belonging to a site."""

    __tablename__ = "pages"

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    site_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    meta_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    meta_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta_keywords: Mapped[str | None] = mapped_column(String(255), nullable=True)
    og_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    og_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    og_image: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    site = relationship("Site", back_populates="pages")
