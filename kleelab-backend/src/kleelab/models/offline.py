"""Money from people without an account: offline contacts, invoices, part payments and receipts.

Kept apart from `project_invoices` on purpose. services/retention.py deletes
detached project invoices on a schedule, Paystack and the payment reminders
read `project_invoices`, and the client dashboard shows them. None of that may
touch money from someone who never used KleeLab, so it lives in its own tables.

Lines are stored as JSONB on the invoice or receipt: they are always read and
written together with it, an issued document is a snapshot, and the total is
kept in `amount_cents` for SQL. Payments and receipts are voided, never deleted,
because their numbers have already been given to the customer.
"""

import uuid
from datetime import date, datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PostgreSQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from kleelab.core.database import Base

INVOICE_STATUSES = ("unpaid", "part_paid", "paid", "cancelled")
PAYMENT_METHODS = ("bank_transfer", "cash", "other")
RECEIPT_KINDS = ("payment", "standalone")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class OfflineContact(Base):
    """Someone we bill outside the client dashboard. Archived, never deleted."""

    __tablename__ = "offline_contacts"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    company: Mapped[str | None] = mapped_column(String(150), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Hides the contact from the picker.
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


# The picker searches by name without caring about case.
Index("ix_offline_contacts_lower_name", func.lower(OfflineContact.name))


class OfflineInvoice(Base):
    __tablename__ = "offline_invoices"
    __table_args__ = (
        CheckConstraint("amount_cents > 0", name="ck_offline_invoices_amount_positive"),
        CheckConstraint("paid_cents >= 0 AND paid_cents <= amount_cents", name="ck_offline_invoices_paid_range"),
        CheckConstraint(_in("status", INVOICE_STATUSES), name="ck_offline_invoices_status"),
        CheckConstraint("status <> 'cancelled' OR paid_cents = 0", name="ck_offline_invoices_cancelled_unpaid"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # In the INV- sequence shared with project invoices (services/numbering.py).
    number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    contact_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("offline_contacts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Copied from the contact, so editing the contact never changes an issued document.
    bill_to_name: Mapped[str] = mapped_column(String(120), nullable=False)
    bill_to_company: Mapped[str | None] = mapped_column(String(150), nullable=True)
    bill_to_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bill_to_phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    bill_to_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    # [{"description", "quantity", "unit_price_cents", "amount_cents"}]
    lines: Mapped[list[dict]] = mapped_column(JSONB, nullable=False)
    # The sum of the line amounts, worked out by the server.
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="NGN", server_default="NGN")
    # Only ever set by services.offline.recalculate.
    paid_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    balance_promised_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # unpaid | part_paid | paid | cancelled
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="unpaid", server_default="unpaid", index=True
    )
    # Midnight of the latest payment's date once fully paid.
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    contact = relationship("OfflineContact")
    payments = relationship(
        "OfflineInvoicePayment",
        back_populates="invoice",
        order_by="OfflineInvoicePayment.created_at",
        cascade="save-update, merge",
        passive_deletes=True,
    )


class OfflineInvoicePayment(Base):
    __tablename__ = "offline_invoice_payments"
    __table_args__ = (
        CheckConstraint("amount_cents > 0", name="ck_offline_invoice_payments_amount_positive"),
        CheckConstraint(_in("method", PAYMENT_METHODS), name="ck_offline_invoice_payments_method"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("offline_invoices.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    # bank_transfer | cash | other
    method: Mapped[str] = mapped_column(String(20), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    paid_on: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    recorded_by_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    voided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    voided_by_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    void_reason: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    invoice = relationship("OfflineInvoice", back_populates="payments")
    recorded_by = relationship("User", foreign_keys=[recorded_by_id])
    receipt = relationship("OfflineReceipt", uselist=False, viewonly=True)


class OfflineReceipt(Base):
    """A receipt for one payment on an offline invoice, or for money taken with no invoice."""

    __tablename__ = "offline_receipts"
    __table_args__ = (
        CheckConstraint(_in("kind", RECEIPT_KINDS), name="ck_offline_receipts_kind"),
        CheckConstraint(
            "(kind = 'payment') = (payment_id IS NOT NULL AND invoice_id IS NOT NULL)",
            name="ck_offline_receipts_kind_links",
        ),
        CheckConstraint("amount_cents > 0", name="ck_offline_receipts_amount_positive"),
        CheckConstraint(_in("method", PAYMENT_METHODS), name="ck_offline_receipts_method"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # From the RCT- sequence.
    number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    # payment | standalone
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    payment_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("offline_invoice_payments.id", ondelete="RESTRICT"),
        unique=True,
        nullable=True,
    )
    invoice_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("offline_invoices.id", ondelete="RESTRICT"), nullable=True
    )
    contact_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("offline_contacts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    bill_to_name: Mapped[str] = mapped_column(String(120), nullable=False)
    bill_to_company: Mapped[str | None] = mapped_column(String(150), nullable=True)
    bill_to_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bill_to_phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    bill_to_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    # Standalone receipts only.
    lines: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)
    method: Mapped[str] = mapped_column(String(20), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    received_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Payment receipts only: the figures when it was issued, so a re-download matches the original.
    invoice_total_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    paid_to_date_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    balance_after_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    voided_by_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    void_reason: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_by_id: Mapped[UUID | None] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    payment = relationship("OfflineInvoicePayment")
    invoice = relationship("OfflineInvoice")


class DocumentCounter(Base):
    """The last number handed out in a sequence: 'INV' or 'RCT'."""

    __tablename__ = "document_counters"

    name: Mapped[str] = mapped_column(String(10), primary_key=True)
    last_value: Mapped[int] = mapped_column(Integer, nullable=False)
