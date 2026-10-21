"""the alerts bell in the team dashboard

Revision ID: add_alerts_seen
Revises: add_team_security
Create Date: 2026-10-21 12:00:00.000000

- users: when each teammate last looked at their alerts, kept on the server so
  the unread count is the same on every device they use.
"""

from alembic import op
import sqlalchemy as sa


revision = "add_alerts_seen"
down_revision = "add_team_security"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("alerts_seen_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "alerts_seen_at")
