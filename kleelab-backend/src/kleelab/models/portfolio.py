"""The portfolio: sites we built for clients, and ready-made sites we sell.

Separate from the Work page, which shows the kinds of project we take on and
stays as it is.
"""

import uuid
from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from kleelab.core.database import Base

# work: a site we built for a client. for_sale: a ready-made site a buyer has changed to suit them.
PORTFOLIO_KINDS = ("work", "for_sale")
# draft: only the team (and anyone with the preview link) sees it. sold: still
# shown, without the button, once an exclusive site has gone.
PORTFOLIO_STATUSES = ("draft", "published", "sold", "archived")
# What visitors can see.
PUBLIC_STATUSES = ("published", "sold")


class PortfolioItem(Base):
    __tablename__ = "portfolio_items"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    # The address of its page: /portfolio/<slug>.
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    # One or two sentences for the card.
    summary: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    # The full write-up; blank lines start new paragraphs.
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    sector: Mapped[str | None] = mapped_column(String(60), nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    demo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # [{"url", "public_id", "alt", "width", "height"}]; the first is the cover.
    images: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")

    # Work only.
    client_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    # Showing a client's site without their say-so is a legal and trust problem,
    # so work cannot be published until someone ticks this.
    client_permission: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    project_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )

    # For sale only. No price means "ask for a price".
    price_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="NGN", server_default="NGN")
    # One per line.
    includes: Mapped[str | None] = mapped_column(Text, nullable=True)
    customisable: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivery_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Sold once (then marked sold) rather than to anyone who asks.
    exclusive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # The steps a proposal for it starts with.
    template_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("project_templates.id", ondelete="SET NULL"), nullable=True
    )

    status: Mapped[str] = mapped_column(String(10), nullable=False, default="draft", server_default="draft")
    featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # Lower comes first.
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    # Lets the team share a draft before it is published.
    preview_token: Mapped[str] = mapped_column(String(48), nullable=False, unique=True)

    view_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    demo_clicks: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    # Checked once a day: ok | broken.
    demo_status: Mapped[str | None] = mapped_column(String(10), nullable=True)
    demo_error: Mapped[str | None] = mapped_column(String(200), nullable=True)
    demo_checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    template = relationship("ProjectTemplate")
    project = relationship("Project")
