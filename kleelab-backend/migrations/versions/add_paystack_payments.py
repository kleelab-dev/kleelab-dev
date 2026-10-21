"""online invoice payments through Paystack

Revision ID: add_paystack_payments
Revises: add_team_security
Create Date: 2026-10-21 00:00:00.000000

- project_invoices: how a paid invoice was paid, and the provider's reference.
- invoice_payments: one row per attempt to pay online, keyed by the reference
  we send to Paystack, so a webhook or a return visit can find its invoice.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "add_paystack_payments"
down_revision = "add_team_security"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.add_column("project_invoices", sa.Column("paid_via", sa.String(length=20), nullable=True))
    op.add_column("project_invoices", sa.Column("payment_reference", sa.String(length=100), nullable=True))

    op.create_table(
        "invoice_payments",
        sa.Column("id", UUID, primary_key=True),
        sa.Column(
            "invoice_id", UUID, sa.ForeignKey("project_invoices.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("initiated_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("provider", sa.String(length=20), nullable=False, server_default="paystack"),
        sa.Column("reference", sa.String(length=100), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("provider_transaction_id", sa.String(length=50), nullable=True),
        sa.Column("channel", sa.String(length=30), nullable=True),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("reference", name="uq_invoice_payments_reference"),
    )
    op.create_index("ix_invoice_payments_invoice_id", "invoice_payments", ["invoice_id"])


def downgrade() -> None:
    op.drop_index("ix_invoice_payments_invoice_id", table_name="invoice_payments")
    op.drop_table("invoice_payments")
    op.drop_column("project_invoices", "payment_reference")
    op.drop_column("project_invoices", "paid_via")
