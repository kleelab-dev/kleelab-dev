"""portfolio

Revision ID: add_portfolio
Revises: add_care_time_email_prefs
Create Date: 2026-10-22 00:00:00.000000

A Portfolio page the team runs from the admin: sites we built and ready-made
sites for sale, each with screenshots and a demo link. Enquiries remember which
item they came from.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "add_portfolio"
down_revision = "add_care_time_email_prefs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "portfolio_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False, unique=True),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("summary", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("sector", sa.String(length=60), nullable=True),
        sa.Column("tags", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("demo_url", sa.String(length=500), nullable=True),
        sa.Column("images", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("client_name", sa.String(length=150), nullable=True),
        sa.Column("client_permission", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("price_cents", sa.Integer(), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="NGN"),
        sa.Column("includes", sa.Text(), nullable=True),
        sa.Column("customisable", sa.Text(), nullable=True),
        sa.Column("delivery_days", sa.Integer(), nullable=True),
        sa.Column("exclusive", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("project_templates.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(length=10), nullable=False, server_default="draft"),
        sa.Column("featured", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("preview_token", sa.String(length=48), nullable=False, unique=True),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("demo_clicks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("demo_status", sa.String(length=10), nullable=True),
        sa.Column("demo_error", sa.String(length=200), nullable=True),
        sa.Column("demo_checked_at", sa.DateTime(), nullable=True),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_portfolio_items_status", "portfolio_items", ["status"])

    op.add_column(
        "agency_leads",
        sa.Column(
            "portfolio_item_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("portfolio_items.id", ondelete="SET NULL"), nullable=True,
        ),
    )
    op.create_index("ix_agency_leads_portfolio_item_id", "agency_leads", ["portfolio_item_id"])


def downgrade() -> None:
    op.drop_index("ix_agency_leads_portfolio_item_id", table_name="agency_leads")
    op.drop_column("agency_leads", "portfolio_item_id")
    op.drop_index("ix_portfolio_items_status", table_name="portfolio_items")
    op.drop_table("portfolio_items")
