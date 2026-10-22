"""payment plan and invoice reminders

Revision ID: add_payment_plan
Revises: add_proposals
Create Date: 2026-10-22 00:00:00.000000

When accepting a proposal the client chooses to pay the deposit now and the
rest at hand-over, or everything now. Invoices say which part of the price they
are, so the balance is raised once and only once, and they count the payment
reminders sent so none goes out twice.
"""

from alembic import op
import sqlalchemy as sa


revision = "add_payment_plan"
down_revision = "add_proposals"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("proposals", sa.Column("payment_choice", sa.String(length=10), nullable=True))
    op.add_column("project_invoices", sa.Column("kind", sa.String(length=20), nullable=True))
    op.add_column(
        "project_invoices", sa.Column("reminders_sent", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column("project_invoices", sa.Column("last_reminded_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("project_invoices", "last_reminded_at")
    op.drop_column("project_invoices", "reminders_sent")
    op.drop_column("project_invoices", "kind")
    op.drop_column("proposals", "payment_choice")
