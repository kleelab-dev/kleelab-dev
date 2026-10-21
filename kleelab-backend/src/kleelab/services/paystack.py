"""The Paystack API, and nothing else.

Two calls (start a transaction, look one up) and the webhook signature check.
Kept apart from the payment rules in `services/payments.py` so the checks can
swap these functions for fakes without touching the network.

The secret key never appears in a log line or an error message: errors carry
the HTTP status and Paystack's own message, which never includes it.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from typing import Any
from urllib.parse import quote

import httpx

from kleelab.core.config import settings

logger = logging.getLogger(__name__)

# Currencies Paystack can charge in, each counted in hundredths (kobo, cents,
# pesewas). Our invoices already store whole minor units, so the amount we send
# is `amount_cents` unchanged.
SUPPORTED_CURRENCIES = frozenset({"NGN", "USD", "GHS", "ZAR", "KES"})


class PaystackError(Exception):
    """Paystack could not be reached, or refused the call."""


def _secret() -> str:
    key = (settings.PAYSTACK_SECRET_KEY or "").strip()
    if not key:
        raise PaystackError("Paystack is not configured")
    return key


def is_test_key() -> bool:
    return (settings.PAYSTACK_SECRET_KEY or "").strip().startswith("sk_test_")


def signature_is_valid(raw_body: bytes, signature: str | None) -> bool:
    """Whether `x-paystack-signature` is the HMAC-SHA512 of the raw body under our key."""

    key = (settings.PAYSTACK_SECRET_KEY or "").strip()
    if not key or not signature:
        return False
    expected = hmac.new(key.encode("utf-8"), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature.strip().lower())


async def _call(method: str, path: str, json: dict[str, Any] | None = None) -> dict[str, Any]:
    headers = {"Authorization": f"Bearer {_secret()}", "Accept": "application/json"}
    try:
        async with httpx.AsyncClient(
            base_url=settings.PAYSTACK_BASE_URL, timeout=settings.PAYSTACK_TIMEOUT_SECONDS
        ) as client:
            response = await client.request(method, path, json=json, headers=headers)
    except httpx.HTTPError as exc:
        # The exception type only: its text can include the request, headers and all.
        logger.warning("Paystack %s %s failed: %s", method, path.split("/")[1], type(exc).__name__)
        raise PaystackError("Could not reach Paystack") from None
    try:
        body = response.json()
    except ValueError:
        body = {}
    if response.status_code >= 400 or not body.get("status"):
        message = str(body.get("message") or f"HTTP {response.status_code}")[:200]
        logger.warning("Paystack %s refused: %s (%s)", path.split("/")[1], message, response.status_code)
        raise PaystackError(message)
    data = body.get("data")
    if not isinstance(data, dict):
        raise PaystackError("Paystack sent an unexpected answer")
    return data


async def initialize_transaction(
    *,
    email: str,
    amount: int,
    currency: str,
    reference: str,
    callback_url: str,
    metadata: dict[str, Any],
) -> str:
    """Start a payment and return the Paystack page to send the client to."""

    data = await _call(
        "POST",
        "/transaction/initialize",
        json={
            "email": email,
            "amount": amount,
            "currency": currency,
            "reference": reference,
            "callback_url": callback_url,
            "metadata": metadata,
        },
    )
    url = data.get("authorization_url")
    if not isinstance(url, str) or not url.startswith("https://"):
        raise PaystackError("Paystack did not return a payment page")
    return url


async def verify_transaction(reference: str) -> dict[str, Any]:
    """Paystack's own record of a transaction: status, amount, currency and so on."""

    return await _call("GET", f"/transaction/verify/{quote(reference, safe='')}")
