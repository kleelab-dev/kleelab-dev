"""add user plan

Revision ID: add_user_plan
Revises: add_currency
Create Date: 2026-09-15 00:00:00.000000

Plans are flags on the user, not a billing integration. Payments were deferred
(D6), so an upgrade is currently a manual change to this column; the point of
storing it now is that every quota check has a single place to read from, and
adding a real provider later becomes an integration rather than a rewrite.

Existing rows default to 'free', which is the honest answer: nothing in the
system has ever been paid for.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "add_user_plan"
down_revision = "add_currency"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("plan", sa.String(length=20), nullable=False, server_default="free"),
    )


def downgrade() -> None:
    op.drop_column("users", "plan")
