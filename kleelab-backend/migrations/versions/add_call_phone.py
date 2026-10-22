"""call phone

Revision ID: add_call_phone
Revises: add_portfolio
Create Date: 2026-10-22 00:00:00.000000

Someone booking a call can leave a phone number, with its country code.
"""

from alembic import op
import sqlalchemy as sa


revision = "add_call_phone"
down_revision = "add_portfolio"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("call_bookings", sa.Column("phone", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("call_bookings", "phone")
