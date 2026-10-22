"""Getting paid: the balance invoice at hand-over, and reminders for unpaid invoices.

A project that started from an accepted proposal knows its price. When the
client chose to pay the deposit first, the rest is billed when the project is
handed over: when its last step is finished or it is marked completed.

Unpaid invoices with a due date get a reminder 3 days before it, on the day, and
3 and 10 days after. The schedule runs once a day from the app (see main.py).
"""

import asyncio
import logging
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from kleelab.core.database import AsyncSessionLocal
from kleelab.models.project import Project, ProjectInvoice
from kleelab.models.user import User
from kleelab.services import activity
from kleelab.services import email as email_svc
from kleelab.services import projects as project_svc

logger = logging.getLogger(__name__)

DAY = 24 * 60 * 60
# Days the balance invoice gives the client to pay.
BALANCE_DUE_DAYS = 7
# When reminders go out, in days from the due date.
REMINDER_OFFSETS = (-3, 0, 3, 10)


async def raise_balance(db: AsyncSession, project: Project, actor: User | None) -> ProjectInvoice | None:
    """Bill what is left of the proposal's price, once. Needs the project loaded with everything."""

    cents = project_svc.balance_owed(project)
    if not cents:
        return None
    proposal = project.proposal
    invoice = ProjectInvoice(
        project_id=project.id,
        number=await project_svc.next_invoice_number(db),
        title=f"Balance: {proposal.title}"[:150],
        amount_cents=cents,
        currency=proposal.currency,
        due_date=date.today() + timedelta(days=BALANCE_DUE_DAYS),
        status="unpaid",
        kind="balance",
        client_name=project.client.full_name if project.client else None,
        client_email=project.client.email if project.client else None,
        project_reference=project.reference,
        project_title=project.title,
    )
    project.invoices.append(invoice)
    await db.flush()
    activity.record(
        db, actor, "invoice.create",
        f"Billed {invoice.number}: {invoice.title}, {project_svc.money(cents, invoice.currency)}",
        project_id=project.id, subject_type="invoice", subject_id=invoice.id,
        label=None if actor else "KleeLab",
    )
    return invoice


def balance_notice(invoice: ProjectInvoice) -> str:
    return f"Your final invoice {invoice.number} ({project_svc.money(invoice.amount_cents, invoice.currency)}) is ready to pay"


def reminder_step(invoice: ProjectInvoice, today: date) -> int | None:
    """Which reminder is due today, if any.

    Only the latest one that has come round: a reminder missed while the app was
    down is not sent late on top of the next. Nothing on the day the invoice was
    raised (the client was just told about it) or twice in one day.
    """

    if invoice.status != "unpaid" or invoice.due_date is None:
        return None
    step = None
    for index, offset in enumerate(REMINDER_OFFSETS):
        if today >= invoice.due_date + timedelta(days=offset):
            step = index
    if step is None or step < invoice.reminders_sent:
        return None
    if invoice.created_at is not None and invoice.created_at.date() >= today:
        return None
    if invoice.last_reminded_at is not None and invoice.last_reminded_at.date() >= today:
        return None
    return step


def send_reminder(invoice: ProjectInvoice, project: Project, today: date) -> bool:
    client = project.client
    if client is None or invoice.due_date is None:
        return False
    try:
        return email_svc.send_invoice_reminder(
            client.email,
            client.full_name,
            str(project.id),
            project.title,
            invoice.number,
            invoice.title,
            project_svc.money(invoice.amount_cents, invoice.currency),
            f"{invoice.due_date.day} {invoice.due_date:%B %Y}",
            (invoice.due_date - today).days,
        )
    except Exception:  # noqa: BLE001
        logger.exception("Could not send a reminder for %s", invoice.number)
        return False


async def send_due_reminders(db: AsyncSession, today: date | None = None) -> int:
    """Send every reminder due today. Returns how many went out."""

    today = today or date.today()
    invoices = await db.scalars(
        select(ProjectInvoice)
        .options(selectinload(ProjectInvoice.project).selectinload(Project.client))
        .where(
            ProjectInvoice.status == "unpaid",
            ProjectInvoice.project_id.is_not(None),
            ProjectInvoice.due_date.is_not(None),
            ProjectInvoice.due_date <= today - timedelta(days=REMINDER_OFFSETS[0]),
        )
        # Several app instances may run this at once; each invoice is handled by one.
        .with_for_update(skip_locked=True, of=ProjectInvoice)
    )
    sent = 0
    for invoice in invoices:
        project = invoice.project
        if project is None or project.status == "cancelled":
            continue
        step = reminder_step(invoice, today)
        if step is None or not send_reminder(invoice, project, today):
            continue
        invoice.reminders_sent = step + 1
        invoice.last_reminded_at = project_svc.now()
        activity.record(
            db, None, "invoice.reminder",
            f"Reminded the client about {invoice.number} ({project_svc.money(invoice.amount_cents, invoice.currency)})",
            project_id=project.id, subject_type="invoice", subject_id=invoice.id, label="KleeLab",
        )
        sent += 1
    await db.commit()
    return sent


async def run_daily() -> None:
    """Send the day's reminders now and then once a day, for as long as the app runs."""

    while True:
        try:
            async with AsyncSessionLocal() as db:
                sent = await send_due_reminders(db)
            if sent:
                logger.info("Billing: sent %d payment reminders.", sent)
        except Exception:
            logger.exception("Payment reminders failed; trying again tomorrow.")
        await asyncio.sleep(DAY)
