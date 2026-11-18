"""Offline invoices, part payments and receipts: the arithmetic and the state rules.

Every amount is whole minor units. Line amounts and totals are worked out here
from quantity and unit price; whatever a client sends for them is ignored.

`recalculate` is the only place that sets an invoice's `paid_cents`, its status
(apart from cancel and reopen) and `paid_at`. Every write to an invoice, its
payments or its receipts takes `lock_invoice` first, so two payments recorded at
the same moment cannot add up to more than the total.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, datetime, time
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from kleelab.models.offline import OfflineContact, OfflineInvoice, OfflineInvoicePayment, OfflineReceipt

MAX_CENTS = 2_000_000_000
METHOD_WORDS = {"bank_transfer": "bank transfer", "cash": "cash", "other": "other means"}
METHOD_LABELS = {"bank_transfer": "Bank transfer", "cash": "Cash", "other": "Other"}


def money(cents: int, currency: str) -> str:
    """'NGN 50,000.00', with integer arithmetic only."""

    sign = "-" if cents < 0 else ""
    whole, part = divmod(abs(cents), 100)
    return f"{currency} {sign}{whole:,}.{part:02d}"


def line_amounts(lines: Iterable) -> tuple[list[dict], int]:
    """Each line with its amount, and the total. Accepts dicts or objects with the line fields."""

    out: list[dict] = []
    total = 0
    for line in lines:
        get = line.get if isinstance(line, dict) else lambda key, _line=line: getattr(_line, key)
        quantity = int(get("quantity"))
        unit = int(get("unit_price_cents"))
        amount = quantity * unit
        if amount > MAX_CENTS:
            raise ValueError("A line comes to more than 20,000,000.00")
        total += amount
        out.append(
            {"description": str(get("description")), "quantity": quantity, "unit_price_cents": unit, "amount_cents": amount}
        )
    if total > MAX_CENTS:
        raise ValueError("The total must be more than zero and at most 20,000,000.00")
    return out, total


def recalculate(invoice: OfflineInvoice, payments: Iterable[OfflineInvoicePayment]) -> None:
    live = [p for p in payments if p.voided_at is None]
    invoice.paid_cents = sum(p.amount_cents for p in live)
    if invoice.status != "cancelled":
        if invoice.paid_cents == 0:
            invoice.status = "unpaid"
        elif invoice.paid_cents < invoice.amount_cents:
            invoice.status = "part_paid"
        else:
            invoice.status = "paid"
    if invoice.status == "paid":
        invoice.paid_at = datetime.combine(max(p.paid_on for p in live), time())
        invoice.balance_promised_on = None
    else:
        invoice.paid_at = None


def is_editable(invoice: OfflineInvoice) -> bool:
    return invoice.status == "unpaid" and invoice.paid_cents == 0


def balance(invoice: OfflineInvoice) -> int:
    if invoice.status == "cancelled":
        return 0
    return invoice.amount_cents - invoice.paid_cents


def effective_due(invoice: OfflineInvoice) -> date | None:
    return invoice.balance_promised_on or invoice.due_date


def is_overdue(invoice: OfflineInvoice, today: date | None = None) -> bool:
    due = effective_due(invoice)
    return balance(invoice) > 0 and due is not None and due < (today or date.today())


def _not_found(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _with_payments():
    return selectinload(OfflineInvoice.payments).options(
        selectinload(OfflineInvoicePayment.recorded_by), selectinload(OfflineInvoicePayment.receipt)
    )


async def lock_invoice(db: AsyncSession, invoice_id: UUID) -> OfflineInvoice:
    """The invoice, locked until commit, with its payments and their receipts loaded fresh."""

    # The payments are loaded by separate queries that run once the row lock is
    # held, so a payment another request committed while this one waited is counted.
    invoice = await db.scalar(
        select(OfflineInvoice)
        .where(OfflineInvoice.id == invoice_id)
        .with_for_update(of=OfflineInvoice)
        .options(selectinload(OfflineInvoice.contact), _with_payments())
        .execution_options(populate_existing=True)
    )
    if invoice is None:
        raise _not_found("Invoice")
    return invoice


async def load_invoice(db: AsyncSession, invoice_id: UUID) -> OfflineInvoice:
    invoice = await db.scalar(
        select(OfflineInvoice)
        .where(OfflineInvoice.id == invoice_id)
        .options(selectinload(OfflineInvoice.contact), _with_payments())
        .execution_options(populate_existing=True)
    )
    if invoice is None:
        raise _not_found("Invoice")
    return invoice


async def load_receipt(db: AsyncSession, receipt_id: UUID, *, lock: bool = False) -> OfflineReceipt:
    query = select(OfflineReceipt).where(OfflineReceipt.id == receipt_id)
    if lock:
        query = query.with_for_update(of=OfflineReceipt)
    receipt = await db.scalar(
        query.options(selectinload(OfflineReceipt.invoice)).execution_options(populate_existing=True)
    )
    if receipt is None:
        raise _not_found("Receipt")
    return receipt


async def usable_contact(db: AsyncSession, contact_id: UUID) -> OfflineContact:
    """A contact a new document can be raised for: it exists and is not archived."""

    contact = await db.get(OfflineContact, contact_id)
    if contact is None or contact.archived_at is not None:
        raise _not_found("Contact")
    return contact


def copy_bill_to(document: OfflineInvoice | OfflineReceipt, contact: OfflineContact) -> None:
    document.contact_id = contact.id
    document.bill_to_name = contact.name
    document.bill_to_company = contact.company
    document.bill_to_email = contact.email
    document.bill_to_phone = contact.phone
    document.bill_to_address = contact.address
