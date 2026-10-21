"""two-step sign-in and the activity log

Revision ID: add_team_security
Revises: add_lead_notes
Create Date: 2026-10-21 00:00:00.000000

- users: two-step sign-in (an encrypted authenticator secret, recovery code
  hashes, the last code used, and a lockout after repeated wrong codes).
- activity_events: who changed what, and when.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "add_team_security"
down_revision = "add_lead_notes"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.add_column("users", sa.Column("totp_secret", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("two_step_enabled_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("two_step_last_step", sa.BigInteger(), nullable=True))
    op.add_column(
        "users", sa.Column("two_step_failures", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column("users", sa.Column("two_step_locked_until", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("recovery_codes", sa.Text(), nullable=True))

    op.create_table(
        "activity_events",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("actor_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("actor_label", sa.String(length=255), nullable=True),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("summary", sa.String(length=300), nullable=False),
        sa.Column("project_id", UUID, sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("subject_type", sa.String(length=20), nullable=True),
        sa.Column("subject_id", UUID, nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_activity_events_created_at", "activity_events", ["created_at"])
    op.create_index("ix_activity_events_actor_id", "activity_events", ["actor_id"])
    op.create_index("ix_activity_events_project_id", "activity_events", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_activity_events_project_id", table_name="activity_events")
    op.drop_index("ix_activity_events_actor_id", table_name="activity_events")
    op.drop_index("ix_activity_events_created_at", table_name="activity_events")
    op.drop_table("activity_events")
    for column in (
        "recovery_codes",
        "two_step_locked_until",
        "two_step_failures",
        "two_step_last_step",
        "two_step_enabled_at",
        "totp_secret",
    ):
        op.drop_column("users", column)
