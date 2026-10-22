import logging
import re
from html import escape, unescape
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

    text = _plain_text(html)

    if settings.MAILTRAP_API_TOKEN:
        return _send_mailtrap(to, subject, html, text, reply_to)

    if not settings.RESEND_API_KEY:
        # Locally there is no provider, so print the message rather than lose it.
        # Only in development: the body contains single-use tokens.
        if settings.ENVIRONMENT == "development":
            logger.warning("Email to %s was NOT delivered (no email provider set). Body:\n%s", to, text)
        else:
            logger.error("No email provider is configured; email to %s was dropped", to)
        return False

    resend.api_key = settings.RESEND_API_KEY
    message = {"from": settings.SENDGRID_FROM_EMAIL, "to": [to], "subject": subject, "html": html, "text": text}
    if reply_to:
        message["reply_to"] = reply_to
    resend.Emails.send(message)
    return True


def _send_mailtrap(to: str, subject: str, html: str, text: str, reply_to: str | None = None) -> bool:
    message: dict = {
        "from": {"email": settings.SENDGRID_FROM_EMAIL, "name": "KleeLab"},
        "to": [{"email": to}],
        "subject": subject,
        "html": html,
        "text": text,
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


# --- Layout ------------------------------------------------------------------
# One look for every email, matching the site's Blueprint design: graph paper,
# ink linework, a cobalt pen for labels and the hard offset shadow on the card.
# Email clients ignore stylesheets and most modern CSS, so it is tables and
# inline styles; anything a client drops (the grid, the shadow, web fonts)
# falls back to something plain that still reads well.

PAPER = "#f3f6fc"
GRID = "#dfe6f6"
INK = "#0e1530"
INK_SOFT = "#2b3555"
MUTED = "#55607f"
LINE = "#cfd8ec"
COBALT = "#2340e8"
SUN_SOFT = "#fff3c4"

DISPLAY = "'Bricolage Grotesque','Arial Black',Arial,Helvetica,sans-serif"
SANS = "'Instrument Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif"
MONO = "'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace"

P = f"margin:0 0 16px;font-family:{SANS};font-size:15px;line-height:1.6;color:{INK_SOFT}"
FONTS = (
    "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800"
    "&family=Instrument+Sans:wght@400;600&family=JetBrains+Mono:wght@500&display=swap"
)


def _p(html: str) -> str:
    """One paragraph of body copy. `html` must already be escaped."""

    return f'<p style="{P}">{html}</p>'


def _ps(lines: list[str]) -> str:
    """Plain lines of text, escaped, one paragraph each."""

    return "".join(_p(escape(line)) for line in lines if line)


def _layout(
    *,
    label: str,
    heading: str,
    body: str,
    button: tuple[str, str] | None = None,
    after: str = "",
    preheader: str = "",
    footer: str = "You are getting this because you have a KleeLab account.",
) -> str:
    """Wrap an email's content in the house layout.

    `label`, `heading`, `preheader` and `footer` are plain text and escaped here;
    `body` and `after` are HTML the caller has already escaped.
    """

    action = ""
    if button:
        text, url = button
        href = escape(url, quote=True)
        action = (
            '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px">'
            f'<tr><td style="border-radius:999px;background:{COBALT}">'
            f'<a href="{href}" target="_blank" style="display:inline-block;padding:13px 26px;border-radius:999px;'
            f'font-family:{SANS};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">'
            f"{escape(text)} &rarr;</a></td></tr></table>"
            f'<p style="margin:0 0 16px;font-family:{SANS};font-size:12px;line-height:1.5;color:{MUTED}">'
            "If the button does not work, copy this link into your browser:<br>"
            f'<a href="{href}" style="color:{COBALT};word-break:break-all">{escape(url)}</a></p>'
        )

    site = settings.FRONTEND_URL.rstrip("/")
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>{escape(heading)}</title>
<link href="{FONTS}" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:{PAPER}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:{PAPER}">{escape(preheader or heading)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{PAPER}" style="background-color:{PAPER};background-image:linear-gradient({GRID} 1px,transparent 1px),linear-gradient(90deg,{GRID} 1px,transparent 1px);background-size:24px 24px">
<tr><td align="center" style="padding:32px 16px 40px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px">
<tr><td style="padding:0 4px 18px">
<a href="{escape(site, quote=True)}" style="font-family:{DISPLAY};font-size:24px;font-weight:800;letter-spacing:-0.5px;color:{INK};text-decoration:none">KleeLab</a>
<span style="font-family:{MONO};font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:{MUTED};padding-left:8px">websites &amp; systems</span>
</td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;border:1.5px solid {INK};border-radius:16px;box-shadow:6px 6px 0 0 {INK};padding:32px 32px 16px">
<p style="margin:0 0 10px;font-family:{MONO};font-size:11px;font-weight:500;letter-spacing:1.6px;text-transform:uppercase;color:{COBALT}">&mdash;&mdash; {escape(label)}</p>
<h1 style="margin:0 0 18px;font-family:{DISPLAY};font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.4px;color:{INK}">{escape(heading)}</h1>
{body}
{action}
{after}
</td></tr>
<tr><td style="padding:24px 4px 0;font-family:{SANS};font-size:12px;line-height:1.6;color:{MUTED}">
{escape(footer)}<br>
<a href="{escape(site, quote=True)}" style="color:{MUTED}">kleelab.com</a> &middot; Websites and systems, built where you can see them.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""


def _note(html: str) -> str:
    """A highlighted aside, like a yellow sticky note on the drawing."""

    return (
        f'<p style="margin:0 0 16px;padding:12px 14px;background:{SUN_SOFT};border:1.5px dashed {INK};'
        f'border-radius:10px;font-family:{SANS};font-size:13px;line-height:1.55;color:{INK}">{html}</p>'
    )


def _plain_text(html: str) -> str:
    """A plain-text version for clients that do not show HTML, and for spam filters."""

    body = re.sub(r"(?is)<(head|style|title)\b.*?</\1>", "", html)
    body = re.sub(r'(?is)<div style="display:none[^>]*>.*?</div>', "", body)
    # Keep where a link goes: "Open your project (https://...)".
    body = re.sub(r'(?is)<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>', lambda m: _link_text(m.group(2), m.group(1)), body)
    body = re.sub(r"(?i)<br\s*/?>", "\n", body)
    body = re.sub(r"(?i)</(p|h1|tr|table|div)>", "\n\n", body)
    body = unescape(re.sub(r"<[^>]+>", "", body))
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in body.splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip() + "\n"


def _link_text(inner: str, href: str) -> str:
    words = re.sub(r"<[^>]+>", "", inner).replace("&rarr;", "").strip()
    url = unescape(href)
    return url if not words or unescape(words) == url else f"{words} ({url})"


# --- Accounts ----------------------------------------------------------------


def send_welcome_email(email: str, name: str | None = None) -> bool:
    return _send(
        email,
        "Welcome to KleeLab",
        _layout(
            label="welcome",
            heading=f"Welcome{', ' + name if name else ''}",
            body=_p("Thanks for joining KleeLab. Everything we build with you lives on your dashboard, "
                    "where you can follow each step, approve work and message us."),
            button=("Open your dashboard", f"{settings.FRONTEND_URL.rstrip('/')}/dashboard"),
        ),
    )


def send_verification_email(email: str, token: str) -> bool:
    """Send a clickable verification link.

    The token was previously emailed on its own, which left the recipient with no
    way to act on it - there was no page to enter it into either.
    """

    url = _link("verify-email", token)
    return _send(
        email,
        "Verify your KleeLab email",
        _layout(
            label="confirm your email",
            heading="Is this your email address?",
            body=_p("Confirm it so we know where to send updates about your projects."),
            button=("Confirm my email", url),
            after=_p("This link expires in 24 hours. If you did not sign up, you can ignore this email."),
            footer="You are getting this because someone signed up to KleeLab with this address.",
        ),
    )


def send_password_reset_email(email: str, token: str, staff: bool = False) -> bool:
    # Staff reset on the team dashboard, never on the public site.
    url = _link("reset-password", token, settings.ADMIN_URL if staff else None)
    return _send(
        email,
        "Reset your KleeLab password",
        _layout(
            label="password",
            heading="Choose a new password",
            body=_p("Someone asked to reset the password for this account. If it was you, choose a new one here."),
            button=("Choose a new password", url),
            after=_note("This link expires in 15 minutes and works once. If you did not ask for it, ignore this "
                        "email: your password stays as it is."),
        ),
    )


def send_order_confirmation(email: str, order_id: str, items: list[dict], total: float) -> None:
    _send(
        email,
        f"Order {order_id} confirmed",
        _layout(label="order", heading=f"Order {order_id} confirmed", body=_p(f"Total: {escape(str(total))}")),
    )


def send_subscription_confirmation(email: str, plan: str) -> None:
    _send(
        email,
        "KleeLab subscription updated",
        _layout(label="subscription", heading="Your plan has changed", body=_p(f"Your plan is now {escape(plan)}.")),
    )


def send_agency_lead_notification(lead_email: str, feature: str) -> None:
    # Both values come from a public form, so they are escaped before they reach
    # an inbox that renders HTML.
    _send(
        settings.TEAM_INBOX or settings.SENDGRID_FROM_EMAIL,
        "New KleeLab enquiry",
        _layout(
            label="new enquiry",
            heading="Someone wants to work with us",
            body=_p(f"<strong>{escape(lead_email)}</strong>") + _p(escape(feature)),
            button=("Open the enquiries", _admin_link("leads")),
            footer="Sent to the KleeLab team.",
        ),
    )
    post_to_slack(f"New enquiry from {lead_email}: {feature}", _admin_link("leads"))

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
        _layout(
            label="your project is ready",
            heading=project_title,
            preheader="Your project dashboard is ready. Choose a password to sign in.",
            body=_p(f"Hi {escape(name or 'there')},")
            + _p("We have set up your project on your KleeLab dashboard. You can follow every step there, "
                 "from planning to hand-over, approve work, send us files and pay invoices.")
            + _p("To start, choose a password:"),
            button=("Choose a password", url),
            after=_note("This link works for 7 days. After that, sign in with your email and the password you "
                        "chose. If the link has run out, reply to this email and we will send a new one."),
            footer="You are getting this because KleeLab set up a project for you.",
        ),
    )


def send_client_project_notice(email: str, project_id: str, project_title: str, headline: str) -> bool:
    """Tell a client something happened on their project."""

    return _send(
        email,
        f"{project_title}: {headline}",
        _layout(
            label="project update",
            heading=project_title,
            preheader=headline,
            body=_p(f"<strong style=\"color:{INK}\">{escape(headline)}</strong>")
            + _p("See the details, reply or approve on your project dashboard."),
            button=("Open your project", _dashboard_link(project_id)),
            footer="You are getting this because you have a project with KleeLab.",
        ),
    )


def send_invoice_reminder(
    email: str,
    name: str | None,
    project_id: str,
    project_title: str,
    number: str,
    title: str,
    amount: str,
    due: str,
    days_left: int,
) -> bool:
    """Remind a client about an unpaid invoice: before it is due, on the day, or after."""

    if days_left > 0:
        headline = f"{number} is due on {due}"
        lead = f"A reminder that invoice {escape(number)} is due on {escape(due)}."
    elif days_left == 0:
        headline = f"{number} is due today"
        lead = f"Invoice {escape(number)} is due today."
    else:
        late = -days_left
        headline = f"{number} is {late} day{'s' if late != 1 else ''} overdue"
        lead = f"Invoice {escape(number)} was due on {escape(due)} and has not been paid yet."
    return _send(
        email,
        f"{project_title}: {headline}",
        _layout(
            label="payment reminder",
            heading=f"{amount} for {project_title}",
            preheader=headline,
            body=_p(f"Hi {escape(name or 'there')},")
            + _p(lead)
            + _p(f"<strong style=\"color:{INK}\">{escape(title)}: {escape(amount)}</strong>")
            + _p("You can pay it by card from your project dashboard."),
            button=("Pay on your dashboard", _dashboard_link(project_id)),
            after=_note("Already paid, or paying by bank transfer? Reply to this email and we will mark it paid."),
            footer="You are getting this because you have an unpaid invoice with KleeLab.",
        ),
        reply_to=settings.REPLY_TO_EMAIL or settings.TEAM_INBOX,
    )


def _admin_link(path: str) -> str:
    return f"{(settings.ADMIN_URL or settings.FRONTEND_URL).rstrip('/')}/{path.lstrip('/')}"


def post_to_slack(text: str, link: str | None = None) -> bool:
    """Post a line to the team's Slack channel, when SLACK_WEBHOOK_URL is set."""

    if not settings.SLACK_WEBHOOK_URL:
        return False
    # Slack reads <...> as links and mentions, so a client's words are escaped.
    message = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    if link:
        message += f"\n<{link}|Open it in the team dashboard>"
    try:
        httpx.post(settings.SLACK_WEBHOOK_URL, json={"text": message}, timeout=5).raise_for_status()
    except httpx.HTTPError as exc:
        logger.error("Slack did not accept a team notice: %s", exc)
        return False
    return True


def send_team_notice(
    subject: str, lines: list[str], project_id: str | None = None, also_to: list[str] | None = None
) -> bool:
    """Tell the KleeLab team something happened that needs a person.

    Goes to the team inbox, to `also_to` (the person in charge of the project),
    and to Slack when it is set up, with a link straight to the project.
    """

    link = _admin_link(f"projects/{project_id}") if project_id else None
    body = _layout(
        label="for the team",
        heading=subject,
        body=_ps(lines),
        button=("Open it in the team dashboard", link) if link else None,
        footer="Sent to the KleeLab team.",
    )
    inbox = settings.TEAM_INBOX or settings.SENDGRID_FROM_EMAIL
    sent = _send(inbox, subject, body)
    for email in sorted({e.lower() for e in also_to or []} - {inbox.lower()}):
        _send(email, subject, body)
    post_to_slack(subject, link)
    return sent


def send_staff_invite_email(email: str, name: str | None, inviter: str | None, token: str) -> bool:
    """Welcome a new teammate: choose a password on the team dashboard."""

    url = _link("reset-password", token, settings.ADMIN_URL)
    who = escape(inviter) if inviter else "The KleeLab team"
    return _send(
        email,
        "You have been added to the KleeLab team",
        _layout(
            label="welcome to the team",
            heading="You are on the KleeLab team",
            body=_p(f"Hi {escape(name or 'there')},")
            + _p(f"{who} gave you an account on the KleeLab team dashboard, where we run client projects.")
            + _p("Choose a password to sign in:"),
            button=("Choose a password", url),
            after=_note("This link works for 7 days, once. When you are in, turn on two-step sign-in from your "
                        "Account page: the dashboard holds client data and payments."),
            footer="You are getting this because someone added you to the KleeLab team.",
        ),
    )


def send_security_notice(email: str, subject: str, lines: list[str]) -> bool:
    """A heads-up about a change to someone's own sign-in."""

    return _send(
        email,
        subject,
        _layout(
            label="security",
            heading=subject,
            body=_ps(lines),
            footer="We send this whenever the sign-in details on your KleeLab account change.",
        ),
    )


def send_lead_reply(email: str, subject: str, body: str, sender_name: str | None) -> bool:
    """A personal reply to an enquiry, written in the team dashboard.

    Plain text from the team, so it is escaped and its line breaks kept. Replies
    to it go to the shared inbox, not the no-reply sending address.
    """

    paragraphs = [p.strip() for p in body.replace("\r\n", "\n").split("\n\n") if p.strip()]
    html = "".join(_p(escape(p).replace(chr(10), "<br>")) for p in paragraphs)
    signature = f"{escape(sender_name)}<br>KleeLab" if sender_name else "The KleeLab team"
    return _send(
        email,
        subject,
        _layout(
            label="a reply from kleelab",
            heading=subject,
            body=html + _p(f'<span style="color:{INK};font-weight:600">{signature}</span>'),
            after=_p(f'<span style="font-size:13px;color:{MUTED}">Reply to this email to answer us directly.</span>'),
            footer="You are getting this because you got in touch with KleeLab.",
        ),
        reply_to=settings.REPLY_TO_EMAIL or settings.TEAM_INBOX,
    )


def send_proposal_email(
    email: str,
    name: str | None,
    title: str,
    reference: str,
    url: str,
    total: str,
    valid_until: str | None,
    sender_name: str | None,
) -> bool:
    """Send an enquirer the private link to their proposal."""

    who = escape(sender_name) if sender_name else "The KleeLab team"
    return _send(
        email,
        f"Your proposal from KleeLab: {title}",
        _layout(
            label=f"proposal {reference}",
            heading=title,
            preheader=f"Your proposal is ready: {total}. Read it and accept online.",
            body=_p(f"Hi {escape(name or 'there')},")
            + _p(f"{who} has written up what we would build for you, how long it takes and what it costs "
                 f"(<strong style=\"color:{INK}\">{escape(total)}</strong> in total).")
            + _p("Read it, and if it is right, accept it on the page. That starts your project straight away: "
                 "your dashboard opens and the deposit invoice is ready to pay."),
            button=("Read your proposal", url),
            after=_note(
                (f"This proposal is open until {escape(valid_until)}. " if valid_until else "")
                + "Questions or changes? Reply to this email and we will update it."
            ),
            footer="You are getting this because you asked KleeLab for a proposal.",
        ),
        reply_to=settings.REPLY_TO_EMAIL or settings.TEAM_INBOX,
    )
