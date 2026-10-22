"""proposals

Revision ID: add_proposals
Revises: add_invoice_retention
Create Date: 2026-10-22 00:00:00.000000

A proposal is written from an enquiry and sent to the enquirer as a private
link. Accepting it online starts the project and raises the deposit invoice.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "add_proposals"
down_revision = "add_invoice_retention"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB()


def upgrade() -> None:
    op.create_table(
        "proposals",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("lead_id", UUID, sa.ForeignKey("agency_leads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("project_id", UUID, sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reference", sa.String(length=20), nullable=False, unique=True),
        sa.Column("token", sa.String(length=64), nullable=False, unique=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("client_name", sa.String(length=100), nullable=True),
        sa.Column("client_email", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=150), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("scope", sa.Text(), nullable=True),
        sa.Column("items", JSONB, nullable=False, server_default="[]"),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("deposit_percent", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("duration_weeks", sa.Integer(), nullable=True),
        sa.Column("stages", JSONB, nullable=False, server_default="[]"),
        sa.Column("terms", sa.Text(), nullable=True),
        sa.Column("valid_until", sa.Date(), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("viewed_at", sa.DateTime(), nullable=True),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("accepted_name", sa.String(length=100), nullable=True),
        sa.Column("accepted_ip", sa.String(length=64), nullable=True),
        sa.Column("declined_at", sa.DateTime(), nullable=True),
        sa.Column("decline_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_proposals_lead_id", "proposals", ["lead_id"])


def downgrade() -> None:
    op.drop_index("ix_proposals_lead_id", table_name="proposals")
    op.drop_table("proposals")
