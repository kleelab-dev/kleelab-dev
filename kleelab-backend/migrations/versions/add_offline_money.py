"""offline invoices, part payments and receipts

Revision ID: add_offline_money
Revises: add_call_phone
Create Date: 2026-11-18 00:00:00.000000

Money from people without an account (docs/specs/2026-11-18-offline-invoices-receipts.md):

- offline_contacts, offline_invoices, offline_invoice_payments, offline_receipts.
- document_counters: the last INV and RCT numbers handed out, one locked row
  each, so invoice and receipt numbers never clash and never skip.

The INV counter starts at the highest INV- number already issued (or the count
of project invoices if that is higher), so the next number follows on. No
existing row is changed.

Downgrade refuses to drop the tables while they hold any invoice or receipt:
they are financial records.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "add_offline_money"
down_revision = "add_call_phone"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB()
METHODS = "method IN ('bank_transfer', 'cash', 'other')"


def _user_fk(name: str) -> sa.Column:
    return sa.Column(name, UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


def _bill_to() -> list[sa.Column]:
    return [
        sa.Column("bill_to_name", sa.String(length=120), nullable=False),
        sa.Column("bill_to_company", sa.String(length=150), nullable=True),
        sa.Column("bill_to_email", sa.String(length=255), nullable=True),
        sa.Column("bill_to_phone", sa.String(length=40), nullable=True),
        sa.Column("bill_to_address", sa.Text(), nullable=True),
    ]


def upgrade() -> None:
    op.create_table(
        "offline_contacts",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("company", sa.String(length=150), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("archived_at", sa.DateTime(), nullable=True),
        _user_fk("created_by_id"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_offline_contacts_lower_name", "offline_contacts", [sa.text("lower(name)")])

    op.create_table(
        "offline_invoices",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("number", sa.String(length=20), nullable=False),
        sa.Column(
            "contact_id", UUID, sa.ForeignKey("offline_contacts.id", ondelete="RESTRICT"), nullable=False
        ),
        *_bill_to(),
        sa.Column("title", sa.String(length=150), nullable=False),
        sa.Column("lines", JSONB, nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="NGN"),
        sa.Column("paid_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("balance_promised_on", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="unpaid"),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        _user_fk("created_by_id"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("number", name="uq_offline_invoices_number"),
        sa.CheckConstraint("amount_cents > 0", name="ck_offline_invoices_amount_positive"),
        sa.CheckConstraint("paid_cents >= 0 AND paid_cents <= amount_cents", name="ck_offline_invoices_paid_range"),
        sa.CheckConstraint(
            "status IN ('unpaid', 'part_paid', 'paid', 'cancelled')", name="ck_offline_invoices_status"
        ),
        sa.CheckConstraint("status <> 'cancelled' OR paid_cents = 0", name="ck_offline_invoices_cancelled_unpaid"),
    )
    op.create_index("ix_offline_invoices_contact_id", "offline_invoices", ["contact_id"])
    op.create_index("ix_offline_invoices_status", "offline_invoices", ["status"])
    op.create_index("ix_offline_invoices_created_at", "offline_invoices", ["created_at"])

    op.create_table(
        "offline_invoice_payments",
        sa.Column("id", UUID, primary_key=True),
        sa.Column(
            "invoice_id", UUID, sa.ForeignKey("offline_invoices.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("method", sa.String(length=20), nullable=False),
        sa.Column("reference", sa.String(length=100), nullable=True),
        sa.Column("paid_on", sa.Date(), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        _user_fk("recorded_by_id"),
        sa.Column("voided_at", sa.DateTime(), nullable=True),
        _user_fk("voided_by_id"),
        sa.Column("void_reason", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.CheckConstraint("amount_cents > 0", name="ck_offline_invoice_payments_amount_positive"),
        sa.CheckConstraint(METHODS, name="ck_offline_invoice_payments_method"),
    )
    op.create_index("ix_offline_invoice_payments_invoice_id", "offline_invoice_payments", ["invoice_id"])

    op.create_table(
        "offline_receipts",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("number", sa.String(length=20), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column(
            "payment_id", UUID, sa.ForeignKey("offline_invoice_payments.id", ondelete="RESTRICT"), nullable=True
        ),
        sa.Column("invoice_id", UUID, sa.ForeignKey("offline_invoices.id", ondelete="RESTRICT"), nullable=True),
        sa.Column(
            "contact_id", UUID, sa.ForeignKey("offline_contacts.id", ondelete="RESTRICT"), nullable=False
        ),
        *_bill_to(),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("lines", JSONB, nullable=True),
        sa.Column("method", sa.String(length=20), nullable=False),
        sa.Column("reference", sa.String(length=100), nullable=True),
        sa.Column("received_on", sa.Date(), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("invoice_total_cents", sa.Integer(), nullable=True),
        sa.Column("paid_to_date_cents", sa.Integer(), nullable=True),
        sa.Column("balance_after_cents", sa.Integer(), nullable=True),
        sa.Column("voided_at", sa.DateTime(), nullable=True),
        _user_fk("voided_by_id"),
        sa.Column("void_reason", sa.String(length=300), nullable=True),
        _user_fk("created_by_id"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("number", name="uq_offline_receipts_number"),
        sa.UniqueConstraint("payment_id", name="uq_offline_receipts_payment_id"),
        sa.CheckConstraint("kind IN ('payment', 'standalone')", name="ck_offline_receipts_kind"),
        sa.CheckConstraint(
            "(kind = 'payment') = (payment_id IS NOT NULL AND invoice_id IS NOT NULL)",
            name="ck_offline_receipts_kind_links",
        ),
        sa.CheckConstraint("amount_cents > 0", name="ck_offline_receipts_amount_positive"),
        sa.CheckConstraint(METHODS, name="ck_offline_receipts_method"),
    )
    op.create_index("ix_offline_receipts_received_on", "offline_receipts", ["received_on"])
    op.create_index("ix_offline_receipts_contact_id", "offline_receipts", ["contact_id"])

    op.create_table(
        "document_counters",
        sa.Column("name", sa.String(length=10), primary_key=True),
        sa.Column("last_value", sa.Integer(), nullable=False),
    )
    # Numbers that are not INV-<digits> (hand-made or test rows) are ignored.
    op.execute(
        """
        INSERT INTO document_counters (name, last_value)
        SELECT 'INV', GREATEST(
            COUNT(*),
            COALESCE(MAX(CASE WHEN number ~ '^INV-[0-9]+$' THEN substring(number FROM 5)::bigint END), 0)
        )::integer
        FROM project_invoices
        """
    )
    op.execute("INSERT INTO document_counters (name, last_value) VALUES ('RCT', 0)")


def downgrade() -> None:
    bind = op.get_bind()
    held = bind.execute(
        sa.text("SELECT (SELECT COUNT(*) FROM offline_invoices) + (SELECT COUNT(*) FROM offline_receipts)")
    ).scalar()
    if held:
        raise RuntimeError("Offline invoices or receipts exist; export them first. Refusing to drop financial records.")

    op.drop_table("document_counters")
    op.drop_index("ix_offline_receipts_contact_id", table_name="offline_receipts")
    op.drop_index("ix_offline_receipts_received_on", table_name="offline_receipts")
    op.drop_table("offline_receipts")
    op.drop_index("ix_offline_invoice_payments_invoice_id", table_name="offline_invoice_payments")
    op.drop_table("offline_invoice_payments")
    op.drop_index("ix_offline_invoices_created_at", table_name="offline_invoices")
    op.drop_index("ix_offline_invoices_status", table_name="offline_invoices")
    op.drop_index("ix_offline_invoices_contact_id", table_name="offline_invoices")
    op.drop_table("offline_invoices")
    op.drop_index("ix_offline_contacts_lower_name", table_name="offline_contacts")
    op.drop_table("offline_contacts")
