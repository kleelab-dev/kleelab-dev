"""care plans, time tracking and email preferences

Revision ID: add_care_time_email_prefs
Revises: add_templates_saved_replies
Create Date: 2026-10-22 00:00:00.000000

Projects can have a care plan that bills itself each month or year, the team
logs the time it spends on projects, and everyone chooses which emails they get.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "add_care_time_email_prefs"
down_revision = "add_templates_saved_replies"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "care_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("includes", sa.Text(), nullable=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("interval", sa.String(length=10), nullable=False, server_default="month"),
        sa.Column("minutes_included", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=10), nullable=False, server_default="active"),
        sa.Column("started_on", sa.Date(), nullable=False),
        sa.Column("next_bill_on", sa.Date(), nullable=False),
        sa.Column("ended_on", sa.Date(), nullable=True),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_care_plans_project_id", "care_plans", ["project_id"])
    # At most one plan per project that is not ended.
    op.create_index(
        "uq_care_plans_live", "care_plans", ["project_id"], unique=True,
        postgresql_where=sa.text("status <> 'ended'"),
    )

    op.create_table(
        "time_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("stage_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("project_stages.id", ondelete="SET NULL"), nullable=True),
        sa.Column("worked_on", sa.Date(), nullable=False),
        sa.Column("minutes", sa.Integer(), nullable=False),
        sa.Column("note", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_time_entries_project_id", "time_entries", ["project_id"])
    op.create_index("ix_time_entries_user_id", "time_entries", ["user_id"])
    op.create_index("ix_time_entries_worked_on", "time_entries", ["worked_on"])

    op.add_column(
        "users",
        sa.Column("email_prefs", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )


def downgrade() -> None:
    op.drop_column("users", "email_prefs")
    op.drop_table("time_entries")
    op.drop_index("uq_care_plans_live", table_name="care_plans")
    op.drop_table("care_plans")
