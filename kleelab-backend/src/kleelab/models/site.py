"""Site database model."""

import uuid
from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from kleelab.core.database import Base


class Site(Base):
    """A website owned by a KleeLab user."""

    __tablename__ = "sites"

    id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    subdomain: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)
    custom_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    template_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), nullable=True
    )
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    owner = relationship("User", back_populates="sites")
    pages = relationship("Page", back_populates="site", cascade="all, delete")
    products = relationship("Product", back_populates="site", cascade="all, delete")
    orders = relationship("Order", back_populates="site", cascade="all, delete")