"""Paying an invoice online: start a Paystack payment, and settle it when it lands.

A payment is only ever believed after asking Paystack about it directly. The
webhook body and the client's return to our site are both just prompts to go
and check; neither is trusted on its own. Settling is idempotent, so the
webhook, its retries and the return page can all arrive in any order.
"""

from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from kleelab.core.config import settings
from kleelab.core.exceptions import PaymentError
from kleelab.models.project import InvoicePayment, Project, ProjectInvoice
from kleelab.models.user import User
from kleelab.services import activity, paystack
from kleelab.services import email as email_svc
from kleelab.services import projects as svc

logger = logging.getLogger(__name__)

FINAL = {"success", "mismatch"}
# Paystack's word for a charge that will not complete.
GAVE_UP = {"failed", "abandoned", "reversed"}


def require_enabled() -> None:
    if not settings.paystack_enabled:
        raise PaymentError(503, "payments_disabled", "Online payment is not switched on. Please pay by bank transfer.")


def can_pay_online(invoice: ProjectInvoice) -> bool:
    return invoice.status == "unpaid" and invoice.currency in paystack.SUPPORTED_CURRENCIES


def new_reference(invoice: ProjectInvoice) -> str:
    # Unique per attempt; Paystack refuses a reference it has seen before.
    return f"KL-{invoice.number}-{secrets.token_hex(6)}"


async def start(db: AsyncSession, invoice_id: UUID, client: User) -> tuple[str, str]:
    """Begin paying an invoice the client owns. Returns (Paystack page, reference)."""

    require_enabled()
    invoice = await db.scalar(
        select(ProjectInvoice)
        .join(Project, Project.id == ProjectInvoice.project_id)
        .where(ProjectInvoice.id == invoice_id, Project.client_id == client.id)
    )
    if invoice is None:
        # Someone else's invoice looks exactly like one that does not exist.
        raise PaymentError(404, "not_found", "Invoice not found")
    if invoice.status != "unpaid":
        word = "already paid" if invoice.status == "paid" else "cancelled"
        raise PaymentError(409, "not_payable", f"This invoice is {word}.")
    if invoice.currency not in paystack.SUPPORTED_CURRENCIES:
        raise PaymentError(
            422, "currency_not_supported",
            f"Invoices in {invoice.currency} cannot be paid online yet. Please pay by bank transfer.",
        )

    payment = InvoicePayment(
        invoice_id=invoice.id,
        initiated_by=client.id,
        provider="paystack",
        reference=new_reference(invoice),
        amount_cents=invoice.amount_cents,
        currency=invoice.currency,
        status="pending",
    )
    db.add(payment)
    # Saved before Paystack hears of it, so a webhook can never arrive for a
    # reference we do not know.
    await db.commit()

    try:
        url = await paystack.initialize_transaction(
            email=client.email,
            amount=payment.amount_cents,
            currency=payment.currency,
            reference=payment.reference,
            callback_url=settings.paystack_callback_url,
            metadata={
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.number,
                "project_id": str(invoice.project_id),
            },
        )
    except paystack.PaystackError:
        payment.status = "failed"
        await db.commit()
        raise PaymentError(502, "provider_error", "We could not start the payment. Please try again in a moment.")
    return url, payment.reference


@dataclass
class Settled:
    payment: InvoicePayment
    invoice: ProjectInvoice


async def find(db: AsyncSession, reference: str) -> InvoicePayment | None:
    return await db.scalar(select(InvoicePayment).where(InvoicePayment.reference == reference))


def _matches(data: dict[str, Any], payment: InvoicePayment, invoice: ProjectInvoice) -> bool:
    try:
        amount = int(data.get("amount"))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return False
    return (
        data.get("reference") == payment.reference
        and amount == payment.amount_cents == invoice.amount_cents
        and str(data.get("currency") or "").upper() == payment.currency == invoice.currency
    )


async def settle(db: AsyncSession, payment: InvoicePayment) -> Settled:
    """Ask Paystack how this payment went and record the answer. Safe to repeat.

    Raises `paystack.PaystackError` if Paystack cannot be asked; nothing changes then.
    """

    reference = payment.reference
    if payment.status not in FINAL:
        data = await paystack.verify_transaction(reference)
        await _apply(db, payment.id, data)
    # A fresh read, whatever happened above.
    payment = await db.scalar(
        select(InvoicePayment)
        .where(InvoicePayment.reference == reference)
        .options(selectinload(InvoicePayment.invoice))
        .execution_options(populate_existing=True)
    )
    assert payment is not None
    return Settled(payment=payment, invoice=payment.invoice)


async def _apply(db: AsyncSession, payment_id: UUID, data: dict[str, Any]) -> None:
    # Row locks, so a webhook and the return page settling the same payment at
    # once take turns, and the second sees what the first did.
    payment = await db.scalar(
        select(InvoicePayment)
        .where(InvoicePayment.id == payment_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if payment is None or payment.status in FINAL:
        await db.commit()  # nothing changed; this just lets go of the lock
        return
    outcome = str(data.get("status") or "")
    if outcome != "success":
        if outcome in GAVE_UP and payment.status != "failed":
            payment.status = "failed"
        await db.commit()
        return

    invoice = await db.scalar(
        select(ProjectInvoice)
        .where(ProjectInvoice.id == payment.invoice_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    assert invoice is not None
    project = await db.scalar(
        select(Project)
        .where(Project.id == invoice.project_id)
        .options(selectinload(Project.client), selectinload(Project.owner))
    )
    assert project is not None
    paid_money = svc.money(payment.amount_cents, payment.currency)

    if not _matches(data, payment, invoice):
        payment.status = "mismatch"
        logger.warning(
            "Paystack payment %s does not match invoice %s; not marked paid", payment.reference, invoice.number
        )
        activity.record(
            db, None, "invoice.payment_mismatch",
            f"An online payment for {invoice.number} did not match the invoice, so it was not marked paid. "
            f"Check Paystack reference {payment.reference}.",
            project_id=project.id, subject_type="invoice", subject_id=invoice.id,
        )
        await db.commit()
        _notify_team(project, f"Check an online payment for {invoice.number}", [
            "Paystack reported a payment that does not match the invoice amount or currency.",
            f"Reference: {payment.reference}",
        ])
        return

    payment.status = "success"
    payment.paid_at = svc.now()
    if data.get("id") is not None:
        payment.provider_transaction_id = str(data["id"])[:50]
    if data.get("channel"):
        payment.channel = str(data["channel"])[:30]

    if invoice.status != "unpaid":
        # Paid twice, or paid after being cancelled. The money is real; a
        # person has to decide whether to refund it.
        activity.record(
            db, project.client, "invoice.payment_extra",
            f"Received {paid_money} online for {invoice.number}, which was already {invoice.status}. "
            f"Check whether to refund Paystack reference {payment.reference}.",
            project_id=project.id, subject_type="invoice", subject_id=invoice.id,
        )
        await db.commit()
        _notify_team(project, f"Extra online payment for {invoice.number}", [
            f"{paid_money} was paid online for {invoice.number}, which was already {invoice.status}.",
            f"Reference: {payment.reference}",
        ])
        return

    svc.set_invoice_status(invoice, "paid")
    invoice.paid_via = "paystack"
    invoice.payment_reference = payment.reference
    activity.record(
        db, project.client, "invoice.paid",
        f"{invoice.number} paid online ({paid_money}), Paystack reference {payment.reference}",
        project_id=project.id, subject_type="invoice", subject_id=invoice.id,
    )
    await svc.touch(db, project)
    await db.commit()
    svc.notify_client(project, svc.paid_notice(invoice))
    _notify_team(project, f"{invoice.number} paid online", [
        f"{project.reference} {project.title}: {paid_money} received by card through Paystack.",
        f"Reference: {payment.reference}",
    ])


def _notify_team(project: Project, subject: str, lines: list[str]) -> None:
    owner = project.owner
    also = [owner.email] if owner is not None and owner.is_active else []
    try:
        email_svc.send_team_notice(subject, lines, project_id=str(project.id), also_to=also)
    except Exception:  # noqa: BLE001 - the payment is already recorded
        logger.exception("Could not send team notice %r", subject)
