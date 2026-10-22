"""call bookings, onboarding checklist and hand-over pack

Revision ID: add_calls_onboarding_handover
Revises: add_payment_plan
Create Date: 2026-10-22 00:00:00.000000

Visitors book a free first call from the site; each booking hangs off an
enquiry. A project gets a checklist of what we need from the client to start,
and a hand-over pack the team publishes when it is finished.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "add_calls_onboarding_handover"
down_revision = "add_payment_plan"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "call_bookings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("lead_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("agency_leads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("company", sa.String(length=150), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="booked"),
        sa.Column("token", sa.String(length=64), nullable=False, unique=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column("cancelled_by", sa.String(length=10), nullable=True),
        sa.Column("cancel_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_call_bookings_lead_id", "call_bookings", ["lead_id"])
    op.create_index("ix_call_bookings_starts_at", "call_bookings", ["starts_at"])
    op.create_index("uq_call_bookings_slot", "call_bookings", ["starts_at"], unique=True,
                    postgresql_where=sa.text("status = 'booked'"))

    op.create_table(
        "project_checklist_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("done_at", sa.DateTime(), nullable=True),
        sa.Column("done_by_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_project_checklist_items_project_id", "project_checklist_items", ["project_id"])

    op.create_table(
        "project_handovers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("items", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("project_handovers")
    op.drop_index("ix_project_checklist_items_project_id", table_name="project_checklist_items")
    op.drop_table("project_checklist_items")
    op.drop_index("uq_call_bookings_slot", table_name="call_bookings")
    op.drop_index("ix_call_bookings_starts_at", table_name="call_bookings")
    op.drop_index("ix_call_bookings_lead_id", table_name="call_bookings")
    op.drop_table("call_bookings")
