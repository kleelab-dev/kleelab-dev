import logging
from html import escape
from urllib.parse import quote

import httpx
import resend

from kleelab.core.config import settings

logger = logging.getLogger(__name__)

MAILTRAP_SEND_URL = "https://send.api.mailtrap.io/api/send"


def _send(to: str, subject: str, html: str, reply_to: str | None = None) -> bool:
    """Deliver an email, returning whether a provider actually accepted it.

    Callers need the real answer: the previous version returned None either way,
    so the API reported "verification email sent" while silently discarding the
    message and stranding the account unverified forever.
    """

    if settings.MAILTRAP_API_TOKEN:
        return _send_mailtrap(to, subject, html, reply_to)

    if not settings.RESEND_API_KEY:
        # Locally there is no provider, so print the message rather than lose it.
        # Only in development: the body contains single-use tokens.
        if settings.ENVIRONMENT == "development":
            logger.warning("Email to %s was NOT delivered (no email provider set). Body:\n%s", to, html)
        else:
            logger.error("No email provider is configured; email to %s was dropped", to)
        return False

    resend.api_key = settings.RESEND_API_KEY
    message = {"from": settings.SENDGRID_FROM_EMAIL, "to": [to], "subject": subject, "html": html}
    if reply_to:
        message["reply_to"] = reply_to
    resend.Emails.send(message)
    return True


def _send_mailtrap(to: str, subject: str, html: str, reply_to: str | None = None) -> bool:
    message: dict = {
        "from": {"email": settings.SENDGRID_FROM_EMAIL, "name": "KleeLab"},
        "to": [{"email": to}],
        "subject": subject,
        "html": html,
    }
    if reply_to:
        message["headers"] = {"Reply-To": reply_to}
    try:
        response = httpx.post(
            MAILTRAP_SEND_URL,
            headers={"Authorization": f"Bearer {settings.MAILTRAP_API_TOKEN}"},
            json=message,
            timeout=15.0,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        # Never log the body: it can hold single-use tokens.
        logger.error("Mailtrap did not accept email to %s: %s", to, exc)
        return False
    return True


def _link(path: str, token: str, base: str | None = None) -> str:
    return f"{(base or settings.FRONTEND_URL).rstrip('/')}/{path.lstrip('/')}?token={quote(token)}"


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


def send_password_reset_email(email: str, token: str, staff: bool = False) -> bool:
    # Staff reset on the team dashboard, never on the public site.
    url = _link("reset-password", token, settings.ADMIN_URL if staff else None)
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
    # Both values come from a public form, so they are escaped before they reach
    # an inbox that renders HTML.
    _send(
        settings.TEAM_INBOX or settings.SENDGRID_FROM_EMAIL,
        "New KleeLab enquiry",
        f"<p>{escape(lead_email)}: {escape(feature)}</p>",
    )

# --- Client projects ------------------------------------------------------
# Everything interpolated here can come from a client or a visitor, so it is
# escaped: these land in our own inbox and a client's, and an email client
# renders HTML.


def _dashboard_link(project_id: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/dashboard/projects/{project_id}"


def send_project_invite_email(email: str, name: str | None, project_title: str, token: str) -> bool:
    """Invite a client whose account we created when we set up their project."""

    url = _link("reset-password", token)
    return _send(
        email,
        f"Your KleeLab project: {project_title}",
        f"<p>Hi {escape(name or 'there')},</p>"
        f"<p>We have set up <strong>{escape(project_title)}</strong> on your KleeLab dashboard. "
        "You can follow every step there, from planning to hand-over.</p>"
        f'<p>Choose a password to sign in:</p><p><a href="{url}">{url}</a></p>'
        "<p>This link works for 7 days. After that, sign in with your email and the password you chose. "
        "If the link has run out, reply to this email and we will send a new one.</p>",
    )


def send_client_project_notice(email: str, project_id: str, project_title: str, headline: str) -> bool:
    """Tell a client something happened on their project."""

    url = _dashboard_link(project_id)
    return _send(
        email,
        f"{project_title}: {headline}",
        f"<p>{escape(headline)}</p>"
        f'<p><a href="{url}">Open your project dashboard</a></p>',
    )


def send_team_notice(subject: str, lines: list[str]) -> bool:
    """Tell the KleeLab team something happened that needs a person."""

    body = "".join(f"<p>{escape(line)}</p>" for line in lines)
    return _send(settings.TEAM_INBOX or settings.SENDGRID_FROM_EMAIL, subject, body)


def send_lead_reply(email: str, subject: str, body: str, sender_name: str | None) -> bool:
    """A personal reply to an enquiry, written in the team dashboard.

    Plain text from the team, so it is escaped and its line breaks kept. Replies
    to it go to the shared inbox, not the no-reply sending address.
    """

    paragraphs = [p.strip() for p in body.replace("\r\n", "\n").split("\n\n") if p.strip()]
    html = "".join(f"<p>{escape(p).replace(chr(10), '<br>')}</p>" for p in paragraphs)
    signature = f"{escape(sender_name)}<br>KleeLab" if sender_name else "The KleeLab team"
    return _send(
        email,
        subject,
        f'<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#111">{html}<p>{signature}</p></div>',
        reply_to=settings.REPLY_TO_EMAIL or settings.TEAM_INBOX,
    )
