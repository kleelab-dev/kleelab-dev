import resend

from kleelab.core.config import settings


def _send(to: str, subject: str, html: str) -> None:
    if settings.RESEND_API_KEY:
        resend.api_key = settings.RESEND_API_KEY
        resend.Emails.send({"from": settings.SENDGRID_FROM_EMAIL, "to": [to], "subject": subject, "html": html})


def send_welcome_email(email: str, name: str | None = None) -> None:
    _send(email, "Welcome to KleeLab", f"<p>Welcome {name or ''} to KleeLab.</p>")


def send_verification_email(email: str, token: str) -> None:
    _send(email, "Verify your KleeLab email", f"<p>Verification token: {token}</p>")


def send_password_reset_email(email: str, token: str) -> None:
    _send(email, "Reset your KleeLab password", f"<p>Reset token: {token}</p>")


def send_order_confirmation(email: str, order_id: str, items: list[dict], total: float) -> None:
    _send(email, f"Order {order_id} confirmed", f"<p>Total: {total}</p><pre>{items}</pre>")


def send_subscription_confirmation(email: str, plan: str) -> None:
    _send(email, "KleeLab subscription updated", f"<p>Your plan is now {plan}.</p>")


def send_agency_lead_notification(lead_email: str, feature: str) -> None:
    _send(settings.SENDGRID_FROM_EMAIL, "New KleeLab agency lead", f"<p>{lead_email}: {feature}</p>")