"""Team routes for money from people without an account.

Offline contacts, invoices with lines, part payments and their receipts, and
receipts for money taken with no invoice. Staff only: anyone else gets a 404.
See docs/specs/2026-11-18-offline-invoices-receipts.md for the state rules.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from kleelab.core.database import get_db
from kleelab.core.time import utcnow
from kleelab.models.offline import OfflineContact, OfflineInvoice, OfflineInvoicePayment, OfflineReceipt
from kleelab.models.user import User
from kleelab.routers.admin import require_staff
from kleelab.schemas.offline import (
    ContactDetail,
    ContactIn,
    ContactOut,
    ContactPatch,
    EmailIn,
    EmailSent,
    LineOut,
    OfflineInvoiceCreate,
    OfflineInvoiceDetail,
    OfflineInvoicePatch,
    OfflineInvoiceSummary,
    PaymentIn,
    PaymentOut,
    ReceiptOut,
    StandaloneReceiptIn,
    VoidIn,
)
from kleelab.services import activity, numbering
from kleelab.services import email as email_svc
from kleelab.services import offline as svc
from kleelab.services.activity import quoted
from kleelab.services.invoice_pdf import offline_pdf_filename, render_offline_invoice_pdf, render_receipt_pdf
from kleelab.services.projects import display_name

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/offline", tags=["admin"], dependencies=[Depends(require_staff)])

CONTACT_LIST_LIMIT = 200
REOPEN_FIRST = "Reopen the invoice first."
PAID_LOCKED = "A paid invoice cannot be changed. Void a payment first."
NO_ADDRESS = "Add an email for this contact first"
SEND_FAILED = "The email could not be sent. Please try again."
# Fields that can only change while nothing has been paid.
LOCKED_FIELDS = ("contact_id", "title", "lines", "currency")


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def _day(value: date | None) -> str:
    return f"{value.day} {value:%b %Y}" if value else ""


# --- Shaping responses ------------------------------------------------------------


async def _counts(db: AsyncSession, contact_ids: list[UUID]) -> tuple[dict[UUID, int], dict[UUID, int]]:
    if not contact_ids:
        return {}, {}
    invoices = dict(
        (await db.execute(
            select(OfflineInvoice.contact_id, func.count())
            .where(OfflineInvoice.contact_id.in_(contact_ids))
            .group_by(OfflineInvoice.contact_id)
        )).all()
    )
    receipts = dict(
        (await db.execute(
            select(OfflineReceipt.contact_id, func.count())
            .where(OfflineReceipt.contact_id.in_(contact_ids))
            .group_by(OfflineReceipt.contact_id)
        )).all()
    )
    return invoices, receipts


async def _contact_out(db: AsyncSession, contact: OfflineContact) -> ContactOut:
    invoices, receipts = await _counts(db, [contact.id])
    out = ContactOut.model_validate(contact)
    out.invoice_count = invoices.get(contact.id, 0)
    out.receipt_count = receipts.get(contact.id, 0)
    return out


def _summary(invoice: OfflineInvoice) -> OfflineInvoiceSummary:
    return OfflineInvoiceSummary(
        id=invoice.id,
        number=invoice.number,
        title=invoice.title,
        amount_cents=invoice.amount_cents,
        paid_cents=invoice.paid_cents,
        balance_cents=svc.balance(invoice),
        currency=invoice.currency,
        status=invoice.status,
        due_date=invoice.due_date,
        balance_promised_on=invoice.balance_promised_on,
        created_at=invoice.created_at,
    )


def _payment_out(payment: OfflineInvoicePayment) -> PaymentOut:
    receipt = payment.receipt
    return PaymentOut(
        id=payment.id,
        amount_cents=payment.amount_cents,
        method=payment.method,
        reference=payment.reference,
        paid_on=payment.paid_on,
        note=payment.note,
        recorded_by_name=display_name(payment.recorded_by),
        created_at=payment.created_at,
        voided_at=payment.voided_at,
        void_reason=payment.void_reason,
        receipt_id=receipt.id if receipt else None,
        receipt_number=receipt.number if receipt else None,
    )


async def _detail(db: AsyncSession, invoice: OfflineInvoice) -> OfflineInvoiceDetail:
    payments = sorted(invoice.payments, key=lambda p: (p.created_at, p.paid_on), reverse=True)
    return OfflineInvoiceDetail(
        **_summary(invoice).model_dump(),
        contact=await _contact_out(db, invoice.contact),
        bill_to_name=invoice.bill_to_name,
        bill_to_company=invoice.bill_to_company,
        bill_to_email=invoice.bill_to_email,
        bill_to_phone=invoice.bill_to_phone,
        bill_to_address=invoice.bill_to_address,
        lines=[LineOut(**line) for line in invoice.lines],
        notes=invoice.notes,
        paid_at=invoice.paid_at,
        cancelled_at=invoice.cancelled_at,
        payments=[_payment_out(p) for p in payments],
        editable=svc.is_editable(invoice),
        overdue=svc.is_overdue(invoice),
    )


async def _reload(db: AsyncSession, invoice_id: UUID) -> OfflineInvoiceDetail:
    return await _detail(db, await svc.load_invoice(db, invoice_id))


def _receipt_out(receipt: OfflineReceipt) -> ReceiptOut:
    return ReceiptOut(
        id=receipt.id,
        number=receipt.number,
        kind=receipt.kind,
        contact_id=receipt.contact_id,
        bill_to_name=receipt.bill_to_name,
        currency=receipt.currency,
        amount_cents=receipt.amount_cents,
        method=receipt.method,
        reference=receipt.reference,
        received_on=receipt.received_on,
        note=receipt.note,
        voided_at=receipt.voided_at,
        void_reason=receipt.void_reason,
        created_at=receipt.created_at,
        invoice_id=receipt.invoice_id,
        invoice_number=receipt.invoice.number if receipt.invoice else None,
        invoice_total_cents=receipt.invoice_total_cents,
        paid_to_date_cents=receipt.paid_to_date_cents,
        balance_after_cents=receipt.balance_after_cents,
        lines=[LineOut(**line) for line in receipt.lines] if receipt.lines is not None else None,
    )


def _pdf(content: bytes, number: str) -> Response:
    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{offline_pdf_filename(number)}"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


async def _contact_for(
    db: AsyncSession, contact_id: UUID | None, new: ContactIn | None, staff: User
) -> OfflineContact:
    """The saved contact, or a new one added in the same commit as the document."""

    if contact_id is not None:
        return await svc.usable_contact(db, contact_id)
    contact = OfflineContact(**new.model_dump(), created_by_id=staff.id)
    db.add(contact)
    await db.flush()
    activity.record(db, staff, "contact.create", f"Added the contact {contact.name}",
                    subject_type="offline_contact", subject_id=contact.id)
    return contact


# --- Contacts ---------------------------------------------------------------------


@router.get("/contacts", response_model=list[ContactOut])
async def list_contacts(
    q: str | None = Query(default=None, max_length=100),
    archived: bool = False,
    db: AsyncSession = Depends(get_db),
) -> list[ContactOut]:
    """Contacts by name, at most 200. `archived=true` lists the archived ones instead."""

    query = select(OfflineContact).where(
        OfflineContact.archived_at.is_not(None) if archived else OfflineContact.archived_at.is_(None)
    )
    words = (q or "").strip()
    if words:
        pattern = "%" + words.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        query = query.where(
            or_(
                OfflineContact.name.ilike(pattern, escape="\\"),
                OfflineContact.company.ilike(pattern, escape="\\"),
                OfflineContact.email.ilike(pattern, escape="\\"),
            )
        )
    contacts = list(
        await db.scalars(query.order_by(func.lower(OfflineContact.name), OfflineContact.id).limit(CONTACT_LIST_LIMIT))
    )
    invoices, receipts = await _counts(db, [c.id for c in contacts])
    out = []
    for contact in contacts:
        item = ContactOut.model_validate(contact)
        item.invoice_count = invoices.get(contact.id, 0)
        item.receipt_count = receipts.get(contact.id, 0)
        out.append(item)
    return out


@router.post("/contacts", response_model=ContactOut, status_code=status.HTTP_201_CREATED)
async def create_contact(
    payload: ContactIn, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> ContactOut:
    contact = await _contact_for(db, None, payload, staff)
    await db.commit()
    await db.refresh(contact)
    return await _contact_out(db, contact)


async def _get_contact(db: AsyncSession, contact_id: UUID) -> OfflineContact:
    contact = await db.get(OfflineContact, contact_id, populate_existing=True)
    if contact is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")
    return contact


@router.get("/contacts/{contact_id}", response_model=ContactDetail)
async def get_contact(contact_id: UUID, db: AsyncSession = Depends(get_db)) -> ContactDetail:
    """The contact with their invoices (newest first) and receipts (newest first)."""

    contact = await _get_contact(db, contact_id)
    invoices = await db.scalars(
        select(OfflineInvoice).where(OfflineInvoice.contact_id == contact.id).order_by(OfflineInvoice.created_at.desc())
    )
    receipts = await db.scalars(
        select(OfflineReceipt)
        .where(OfflineReceipt.contact_id == contact.id)
        .options(selectinload(OfflineReceipt.invoice))
        .order_by(OfflineReceipt.received_on.desc(), OfflineReceipt.created_at.desc())
    )
    base = await _contact_out(db, contact)
    return ContactDetail(
        **base.model_dump(),
        invoices=[_summary(i) for i in invoices],
        receipts=[_receipt_out(r) for r in receipts],
    )


@router.patch("/contacts/{contact_id}", response_model=ContactOut)
async def patch_contact(
    contact_id: UUID,
    payload: ContactPatch,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ContactOut:
    """Edit or archive a contact. Documents already issued keep the details they were issued with."""

    contact = await _get_contact(db, contact_id)
    changes = payload.model_dump(exclude_unset=True)
    archived = changes.pop("archived", None)
    if changes.get("name", "") is None:
        changes.pop("name")
    edited = False
    for field, value in changes.items():
        if getattr(contact, field) != value:
            setattr(contact, field, value)
            edited = True
    if edited:
        activity.record(db, staff, "contact.update", f"Edited the contact {contact.name}",
                        subject_type="offline_contact", subject_id=contact.id)
    if archived is True and contact.archived_at is None:
        contact.archived_at = utcnow()
        activity.record(db, staff, "contact.archive", f"Archived the contact {contact.name}",
                        subject_type="offline_contact", subject_id=contact.id)
    elif archived is False and contact.archived_at is not None:
        contact.archived_at = None
        activity.record(db, staff, "contact.archive", f"Restored the contact {contact.name}",
                        subject_type="offline_contact", subject_id=contact.id)
    await db.commit()
    return await _contact_out(db, await _get_contact(db, contact_id))


# --- Invoices ---------------------------------------------------------------------


@router.post("/invoices", response_model=OfflineInvoiceDetail, status_code=status.HTTP_201_CREATED)
async def create_invoice(
    payload: OfflineInvoiceCreate, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> OfflineInvoiceDetail:
    contact = await _contact_for(db, payload.contact_id, payload.contact, staff)
    lines, total = svc.line_amounts(payload.lines)
    invoice = OfflineInvoice(
        title=payload.title,
        lines=lines,
        amount_cents=total,
        currency=payload.currency,
        paid_cents=0,
        status="unpaid",
        due_date=payload.due_date,
        notes=payload.notes,
        created_by_id=staff.id,
    )
    svc.copy_bill_to(invoice, contact)
    # Taken last: the counter stays locked until the commit below.
    invoice.number = await numbering.next_number(db, "INV")
    db.add(invoice)
    await db.flush()
    activity.record(
        db, staff, "invoice.offline_create",
        f"Billed {invoice.number} to {contact.name}: {invoice.title}, {svc.money(total, invoice.currency)}",
        subject_type="offline_invoice", subject_id=invoice.id,
    )
    await db.commit()
    return await _reload(db, invoice.id)


@router.get("/invoices/{invoice_id}", response_model=OfflineInvoiceDetail)
async def get_invoice(invoice_id: UUID, db: AsyncSession = Depends(get_db)) -> OfflineInvoiceDetail:
    return await _reload(db, invoice_id)


@router.patch("/invoices/{invoice_id}", response_model=OfflineInvoiceDetail)
async def patch_invoice(
    invoice_id: UUID,
    payload: OfflineInvoicePatch,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> OfflineInvoiceDetail:
    """Only what is sent changes.

    Lines, title, currency and contact change only while nothing is paid. The
    due date, notes and promised date change while there is a balance. A field
    sent with the value it already has is not a change.
    """

    invoice = await svc.lock_invoice(db, invoice_id)
    if invoice.status == "cancelled":
        raise _conflict(REOPEN_FIRST)
    if invoice.status == "paid":
        raise _conflict(PAID_LOCKED)

    changes = payload.model_dump(exclude_unset=True)
    # The title, lines, currency and contact cannot be cleared: null leaves them as they are.
    for field in LOCKED_FIELDS:
        if field in changes and changes[field] is None:
            changes.pop(field)
    if "lines" in changes:
        lines, total = svc.line_amounts(changes["lines"])
        if lines == invoice.lines:
            changes.pop("lines")
        else:
            changes["lines"] = lines
    for field in ("contact_id", "title", "currency"):
        if field in changes and changes[field] == getattr(invoice, field):
            changes.pop(field)
    if any(field in changes for field in LOCKED_FIELDS) and not svc.is_editable(invoice):
        raise _conflict("Payments have been recorded, so only the due date, notes and promised date can change.")

    edited = []
    if "contact_id" in changes:
        contact = await svc.usable_contact(db, changes.pop("contact_id"))
        svc.copy_bill_to(invoice, contact)
        invoice.contact = contact
        edited.append("the contact")
    if "lines" in changes:
        invoice.lines = changes.pop("lines")
        invoice.amount_cents = total
        edited.append("the lines")
    for field, words in (("title", "the title"), ("currency", "the currency"),
                         ("due_date", "the due date"), ("notes", "the notes")):
        if field in changes and getattr(invoice, field) != changes[field]:
            setattr(invoice, field, changes[field])
            edited.append(words)
    if edited:
        activity.record(
            db, staff, "invoice.offline_update", f"Changed {', '.join(edited)} on {invoice.number}",
            subject_type="offline_invoice", subject_id=invoice.id,
        )
    if "balance_promised_on" in changes and changes["balance_promised_on"] != invoice.balance_promised_on:
        promised = changes["balance_promised_on"]
        invoice.balance_promised_on = promised
        activity.record(
            db, staff, "invoice.offline_promise",
            f"Balance on {invoice.number} promised by {_day(promised)}" if promised
            else f"Cleared the promised date on {invoice.number}",
            subject_type="offline_invoice", subject_id=invoice.id,
        )
    await db.commit()
    return await _reload(db, invoice_id)


@router.post("/invoices/{invoice_id}/cancel", response_model=OfflineInvoiceDetail)
async def cancel_invoice(
    invoice_id: UUID, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> OfflineInvoiceDetail:
    invoice = await svc.lock_invoice(db, invoice_id)
    if invoice.status == "cancelled":
        raise _conflict("This invoice is already cancelled.")
    if invoice.paid_cents > 0:
        raise _conflict("Void the payments before cancelling.")
    invoice.status = "cancelled"
    invoice.cancelled_at = utcnow()
    invoice.balance_promised_on = None
    activity.record(
        db, staff, "invoice.offline_cancel",
        f"Cancelled {invoice.number} ({svc.money(invoice.amount_cents, invoice.currency)})",
        subject_type="offline_invoice", subject_id=invoice.id,
    )
    await db.commit()
    return await _reload(db, invoice_id)


@router.post("/invoices/{invoice_id}/reopen", response_model=OfflineInvoiceDetail)
async def reopen_invoice(
    invoice_id: UUID, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> OfflineInvoiceDetail:
    invoice = await svc.lock_invoice(db, invoice_id)
    if invoice.status != "cancelled":
        raise _conflict("Only a cancelled invoice can be reopened.")
    invoice.status = "unpaid"
    invoice.cancelled_at = None
    svc.recalculate(invoice, invoice.payments)
    activity.record(db, staff, "invoice.offline_reopen", f"Reopened {invoice.number}",
                    subject_type="offline_invoice", subject_id=invoice.id)
    await db.commit()
    return await _reload(db, invoice_id)


@router.post(
    "/invoices/{invoice_id}/payments", response_model=OfflineInvoiceDetail, status_code=status.HTTP_201_CREATED
)
async def record_payment(
    invoice_id: UUID,
    payload: PaymentIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> OfflineInvoiceDetail:
    """Record money received against the invoice and issue its receipt, in one transaction."""

    invoice = await svc.lock_invoice(db, invoice_id)
    if invoice.status == "cancelled":
        raise _conflict(REOPEN_FIRST)
    if invoice.status == "paid":
        raise _conflict("This invoice is already paid.")
    left = svc.balance(invoice)
    if payload.amount_cents > left:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"That is more than the balance of {svc.money(left, invoice.currency)}",
        )

    payment = OfflineInvoicePayment(
        amount_cents=payload.amount_cents,
        method=payload.method,
        reference=payload.reference,
        paid_on=payload.paid_on,
        note=payload.note,
        recorded_by_id=staff.id,
    )
    invoice.payments.append(payment)
    await db.flush()
    paid_to_date = invoice.paid_cents + payload.amount_cents
    receipt = OfflineReceipt(
        kind="payment",
        payment_id=payment.id,
        invoice_id=invoice.id,
        currency=invoice.currency,
        amount_cents=payload.amount_cents,
        method=payload.method,
        reference=payload.reference,
        received_on=payload.paid_on,
        note=payload.note,
        invoice_total_cents=invoice.amount_cents,
        paid_to_date_cents=paid_to_date,
        balance_after_cents=invoice.amount_cents - paid_to_date,
        created_by_id=staff.id,
        # Who it was billed to on the invoice, not the contact as edited since.
        contact_id=invoice.contact_id,
        bill_to_name=invoice.bill_to_name,
        bill_to_company=invoice.bill_to_company,
        bill_to_email=invoice.bill_to_email,
        bill_to_phone=invoice.bill_to_phone,
        bill_to_address=invoice.bill_to_address,
    )
    receipt.number = await numbering.next_number(db, "RCT")
    db.add(receipt)
    svc.recalculate(invoice, invoice.payments)
    activity.record(
        db, staff, "invoice.offline_payment",
        f"Recorded {svc.money(payment.amount_cents, invoice.currency)} by {svc.METHOD_WORDS[payment.method]} "
        f"on {invoice.number}, receipt {receipt.number}",
        subject_type="offline_invoice", subject_id=invoice.id,
    )
    await db.commit()
    return await _reload(db, invoice_id)


async def _void_payment(
    db: AsyncSession, invoice: OfflineInvoice, payment: OfflineInvoicePayment, reason: str, staff: User
) -> None:
    """Void a payment and its receipt. The invoice must be locked."""

    if payment.voided_at is not None:
        raise _conflict("This payment is already voided.")
    if invoice.status == "cancelled":
        raise _conflict(REOPEN_FIRST)
    now = utcnow()
    payment.voided_at, payment.voided_by_id, payment.void_reason = now, staff.id, reason
    receipt = payment.receipt
    if receipt is not None:
        receipt.voided_at, receipt.voided_by_id, receipt.void_reason = now, staff.id, reason
    svc.recalculate(invoice, invoice.payments)
    activity.record(
        db, staff, "invoice.offline_payment_void",
        f"Voided {svc.money(payment.amount_cents, invoice.currency)} on {invoice.number}"
        + (f" (receipt {receipt.number})" if receipt else "") + f": {quoted(reason)}",
        subject_type="offline_invoice", subject_id=invoice.id,
    )


@router.post("/invoices/{invoice_id}/payments/{payment_id}/void", response_model=OfflineInvoiceDetail)
async def void_payment(
    invoice_id: UUID,
    payment_id: UUID,
    payload: VoidIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> OfflineInvoiceDetail:
    invoice = await svc.lock_invoice(db, invoice_id)
    payment = next((p for p in invoice.payments if p.id == payment_id), None)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    await _void_payment(db, invoice, payment, payload.reason, staff)
    await db.commit()
    return await _reload(db, invoice_id)


@router.get("/invoices/{invoice_id}/pdf")
async def download_invoice(invoice_id: UUID, db: AsyncSession = Depends(get_db)) -> Response:
    invoice = await svc.load_invoice(db, invoice_id)
    return _pdf(render_offline_invoice_pdf(invoice, list(invoice.payments)), invoice.number)


@router.post("/invoices/{invoice_id}/email", response_model=EmailSent)
async def email_invoice(
    invoice_id: UUID,
    payload: EmailIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> EmailSent:
    """Email the invoice PDF. Sent before anything is written, so no lock is held while it goes."""

    invoice = await svc.load_invoice(db, invoice_id)
    if invoice.status == "cancelled":
        raise _conflict("A cancelled invoice cannot be emailed.")
    to = payload.to or invoice.contact.email
    if not to:
        raise _conflict(NO_ADDRESS)
    left = svc.balance(invoice)
    pdf = render_offline_invoice_pdf(invoice, list(invoice.payments))
    due = svc.effective_due(invoice)
    sent = email_svc.send_offline_invoice_email(
        to,
        invoice.bill_to_name,
        invoice.number,
        svc.money(invoice.amount_cents, invoice.currency),
        svc.money(left, invoice.currency) if left else None,
        _day(due) if due and left else None,
        payload.message,
        pdf,
    )
    if not sent:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=SEND_FAILED)
    activity.record(db, staff, "invoice.offline_email", f"Emailed {invoice.number} to {to}",
                    subject_type="offline_invoice", subject_id=invoice.id)
    await db.commit()
    return EmailSent(sent=True, to=to)


# --- Receipts ---------------------------------------------------------------------


@router.get("/receipts", response_model=list[ReceiptOut])
async def list_receipts(
    kind: Literal["payment", "standalone"] | None = None,
    voided: bool | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[ReceiptOut]:
    """Receipts, newest first. `voided=false` hides voided ones, `voided=true` shows only them."""

    query = select(OfflineReceipt).options(selectinload(OfflineReceipt.invoice))
    if kind:
        query = query.where(OfflineReceipt.kind == kind)
    if voided is True:
        query = query.where(OfflineReceipt.voided_at.is_not(None))
    elif voided is False:
        query = query.where(OfflineReceipt.voided_at.is_(None))
    receipts = await db.scalars(
        query.order_by(OfflineReceipt.received_on.desc(), OfflineReceipt.created_at.desc())
    )
    return [_receipt_out(r) for r in receipts]


@router.post("/receipts", response_model=ReceiptOut, status_code=status.HTTP_201_CREATED)
async def create_receipt(
    payload: StandaloneReceiptIn, db: AsyncSession = Depends(get_db), staff: User = Depends(require_staff)
) -> ReceiptOut:
    """A receipt for money taken directly, with no invoice."""

    contact = await _contact_for(db, payload.contact_id, payload.contact, staff)
    lines, total = svc.line_amounts(payload.lines)
    receipt = OfflineReceipt(
        kind="standalone",
        currency=payload.currency,
        amount_cents=total,
        lines=lines,
        method=payload.method,
        reference=payload.reference,
        received_on=payload.received_on,
        note=payload.note,
        created_by_id=staff.id,
    )
    svc.copy_bill_to(receipt, contact)
    receipt.number = await numbering.next_number(db, "RCT")
    db.add(receipt)
    await db.flush()
    activity.record(
        db, staff, "receipt.create",
        f"Issued {receipt.number} to {contact.name}: {svc.money(total, receipt.currency)} "
        f"by {svc.METHOD_WORDS[receipt.method]}",
        subject_type="offline_receipt", subject_id=receipt.id,
    )
    await db.commit()
    return _receipt_out(await svc.load_receipt(db, receipt.id))


@router.get("/receipts/{receipt_id}", response_model=ReceiptOut)
async def get_receipt(receipt_id: UUID, db: AsyncSession = Depends(get_db)) -> ReceiptOut:
    return _receipt_out(await svc.load_receipt(db, receipt_id))


@router.post("/receipts/{receipt_id}/void", response_model=ReceiptOut)
async def void_receipt(
    receipt_id: UUID,
    payload: VoidIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> ReceiptOut:
    """Void a receipt. On a payment receipt this voids the payment too and recalculates the invoice."""

    receipt = await svc.load_receipt(db, receipt_id)
    if receipt.kind == "payment":
        # The invoice is locked first, the same order as the payment void route.
        invoice = await svc.lock_invoice(db, receipt.invoice_id)
        payment = next(p for p in invoice.payments if p.id == receipt.payment_id)
        if payment.voided_at is not None or payment.receipt.voided_at is not None:
            raise _conflict("This receipt is already voided.")
        await _void_payment(db, invoice, payment, payload.reason, staff)
    else:
        receipt = await svc.load_receipt(db, receipt_id, lock=True)
        if receipt.voided_at is not None:
            raise _conflict("This receipt is already voided.")
        receipt.voided_at, receipt.voided_by_id, receipt.void_reason = utcnow(), staff.id, payload.reason
        activity.record(
            db, staff, "receipt.void",
            f"Voided {receipt.number} ({svc.money(receipt.amount_cents, receipt.currency)}): {quoted(payload.reason)}",
            subject_type="offline_receipt", subject_id=receipt.id,
        )
    await db.commit()
    return _receipt_out(await svc.load_receipt(db, receipt_id))


@router.get("/receipts/{receipt_id}/pdf")
async def download_receipt(receipt_id: UUID, db: AsyncSession = Depends(get_db)) -> Response:
    receipt = await svc.load_receipt(db, receipt_id)
    return _pdf(render_receipt_pdf(receipt), receipt.number)


@router.post("/receipts/{receipt_id}/email", response_model=EmailSent)
async def email_receipt(
    receipt_id: UUID,
    payload: EmailIn,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_staff),
) -> EmailSent:
    receipt = await svc.load_receipt(db, receipt_id)
    if receipt.voided_at is not None:
        raise _conflict("A voided receipt cannot be emailed.")
    contact = await db.get(OfflineContact, receipt.contact_id)
    to = payload.to or (contact.email if contact else None)
    if not to:
        raise _conflict(NO_ADDRESS)
    sent = email_svc.send_offline_receipt_email(
        to,
        receipt.bill_to_name,
        receipt.number,
        svc.money(receipt.amount_cents, receipt.currency),
        receipt.invoice.number if receipt.invoice else None,
        svc.money(receipt.balance_after_cents, receipt.currency) if receipt.balance_after_cents else None,
        payload.message,
        render_receipt_pdf(receipt),
    )
    if not sent:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=SEND_FAILED)
    activity.record(db, staff, "receipt.email", f"Emailed {receipt.number} to {to}",
                    subject_type="offline_receipt", subject_id=receipt.id)
    await db.commit()
    return EmailSent(sent=True, to=to)
