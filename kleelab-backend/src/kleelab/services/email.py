import logging
from urllib.parse import quote

import resend

from kleelab.core.config import settings

logger = logging.getLogger(__name__)


def _send(to: str, subject: str, html: str) -> bool:
    """Deliver an email, returning whether a provider actually accepted it.

    Callers need the real answer: the previous version returned None either way,
    so the API reported "verification email sent" while silently discarding the
    message and stranding the account unverified forever.
    """

    if not settings.RESEND_API_KEY:
        # Locally there is no provider, so print the message rather than lose it.
        # Only in development: the body contains single-use tokens.
        if settings.ENVIRONMENT == "development":
            logger.warning("Email to %s was NOT delivered (no RESEND_API_KEY). Body:\n%s", to, html)
        else:
            logger.error("RESEND_API_KEY is not configured; email to %s was dropped", to)
        return False

    resend.api_key = settings.RESEND_API_KEY
    resend.Emails.send({"from": settings.SENDGRID_FROM_EMAIL, "to": [to], "subject": subject, "html": html})
    return True


def _link(path: str, token: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/{path.lstrip('/')}?token={quote(token)}"


def send_welcome_email(email: str, name: str | None = None) -> bool:
    return _send(email, "Welcome to KleeLab", f"<p>Welcome {name or ''} to KleeLab.</p>")


def send_verification_email(email: str, token: str) -> bool:
    """Send a clickable verification link.

    The token was previously emailed on its own, which left the recipient with no
    way to act on it - there was no page to enter it into either.
    """

    url = _link("verify-email", token)
    return _send(
        email,
        "Verify your KleeLab email",
        f'<p>Confirm your email address to publish your sites:</p><p><a href="{url}">{url}</a></p>'
        "<p>This link expires in 24 hours.</p>",
    )


def send_password_reset_email(email: str, token: str) -> bool:
    url = _link("reset-password", token)
    return _send(
        email,
        "Reset your KleeLab password",
        f'<p>Choose a new password:</p><p><a href="{url}">{url}</a></p>'
        "<p>This link expires in 15 minutes.</p>",
    )


def send_order_confirmation(email: str, order_id: str, items: list[dict], total: float) -> None:
    _send(email, f"Order {order_id} confirmed", f"<p>Total: {total}</p><pre>{items}</pre>")


def send_subscription_confirmation(email: str, plan: str) -> None:
    _send(email, "KleeLab subscription updated", f"<p>Your plan is now {plan}.</p>")


def send_agency_lead_notification(lead_email: str, feature: str) -> None:
    _send(settings.SENDGRID_FROM_EMAIL, "New KleeLab agency lead", f"<p>{lead_email}: {feature}</p>")