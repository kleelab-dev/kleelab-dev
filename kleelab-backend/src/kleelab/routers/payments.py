"""Paying invoices online with Paystack.

- `GET  /api/payments/config`: whether the "Pay now" button should show.
- `POST /api/payments/invoices/{id}/paystack`: start paying; answers the Paystack page to open.
- `GET  /api/payments/paystack/verify?reference=`: the return page asks how it went.
- `POST /api/payments/paystack/webhook`: Paystack tells us. Set this URL in the
  Paystack dashboard (Settings, API Keys & Webhooks).
"""

import json
import logging
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.config import settings
from kleelab.core.database import get_db
from kleelab.core.exceptions import PaymentError
from kleelab.core.security import get_current_user
from kleelab.models.project import Project, ProjectInvoice
from kleelab.models.user import User
from kleelab.services import payments, paystack

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/payments", tags=["payments"])


class PaymentsConfig(BaseModel):
    enabled: bool
    provider: str = "paystack"
    currencies: list[str]
    # True with a Paystack test key: no real money moves.
    test_mode: bool


class PaymentStarted(BaseModel):
    authorization_url: str
    reference: str


class PaymentResult(BaseModel):
    # paid: the invoice is paid (by this payment or already). pending: not
    # finished yet. failed: the card was not charged. mismatch: charged, but not
    # what we asked for, so the team will look at it.
    status: Literal["paid", "pending", "failed", "mismatch"]
    reference: str
    invoice_id: UUID
    invoice_number: str
    project_id: UUID
    amount_cents: int
    currency: str


@router.get("/config", response_model=PaymentsConfig)
async def payments_config() -> PaymentsConfig:
    enabled = settings.paystack_enabled
    return PaymentsConfig(
        enabled=enabled,
        currencies=sorted(paystack.SUPPORTED_CURRENCIES) if enabled else [],
        test_mode=enabled and paystack.is_test_key(),
    )


@router.post("/invoices/{invoice_id}/paystack", response_model=PaymentStarted)
async def start_payment(
    invoice_id: UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> PaymentStarted:
    url, reference = await payments.start(db, invoice_id, user)
    return PaymentStarted(authorization_url=url, reference=reference)


@router.get("/paystack/verify", response_model=PaymentResult)
async def verify_payment(
    reference: str = Query(min_length=1, max_length=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PaymentResult:
    """Where the client lands after paying: check with Paystack and say how it went."""

    payments.require_enabled()
    payment = await payments.find(db, reference)
    owner_id = None
    if payment is not None:
        owner_id = await db.scalar(
            select(Project.client_id)
            .join(ProjectInvoice, ProjectInvoice.project_id == Project.id)
            .where(ProjectInvoice.id == payment.invoice_id)
        )
    if payment is None or owner_id != user.id:
        raise PaymentError(404, "not_found", "We could not find that payment.")
    try:
        settled = await payments.settle(db, payment)
    except paystack.PaystackError:
        raise PaymentError(502, "provider_error", "We could not check the payment just now. Please refresh in a moment.")
    return _result(settled)


def _result(settled: payments.Settled) -> PaymentResult:
    payment, invoice = settled.payment, settled.invoice
    if invoice.status == "paid" and payment.status == "success":
        state = "paid"
    elif payment.status in ("failed", "mismatch"):
        state = payment.status
    else:
        state = "pending"
    return PaymentResult(
        status=state,
        reference=payment.reference,
        invoice_id=invoice.id,
        invoice_number=invoice.number,
        project_id=invoice.project_id,
        amount_cents=payment.amount_cents,
        currency=payment.currency,
    )


@router.post("/paystack/webhook", include_in_schema=False)
async def paystack_webhook(request: Request, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    """Paystack's notice that something happened. Signed; checked against Paystack before use."""

    if not settings.paystack_enabled:
        return JSONResponse(
            status_code=503,
            content={"error": {"code": "payments_disabled", "message": "Online payment is not switched on"}},
        )
    raw = await request.body()
    if not paystack.signature_is_valid(raw, request.headers.get("x-paystack-signature")):
        logger.warning("Paystack webhook with a bad or missing signature refused")
        return JSONResponse(status_code=401, content={"error": {"code": "bad_signature", "message": "Invalid signature"}})

    ok = JSONResponse(status_code=200, content={"received": True})
    try:
        event = json.loads(raw)
    except ValueError:
        return ok
    if not isinstance(event, dict) or event.get("event") != "charge.success":
        return ok
    data = event.get("data")
    reference = data.get("reference") if isinstance(data, dict) else None
    if not isinstance(reference, str) or not reference:
        return ok
    payment = await payments.find(db, reference)
    if payment is None:
        # Not one of ours: a payment link made in the Paystack dashboard, say.
        logger.info("Paystack webhook for an unknown reference ignored")
        return ok
    try:
        await payments.settle(db, payment)
    except paystack.PaystackError:
        # Not acknowledged, so Paystack sends it again later.
        return JSONResponse(
            status_code=502, content={"error": {"code": "provider_error", "message": "Could not verify the payment"}}
        )
    return ok
