"""Care plans: looking after a site once it is live, billed every month or year.

A plan bills in advance. On its billing date an invoice is raised for the
period starting that day, and the date moves on by one month or year. The daily
job (services/billing.py) raises at most one invoice per plan per run, so a plan
that fell behind while the app was down catches up a period a day instead of
landing several invoices on the client at once.

When a plan includes hours, the time the team logs on the project during the
current period counts against them.
"""

import calendar
import logging
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from kleelab.models.care import CarePlan
from kleelab.models.project import Project, ProjectInvoice
from kleelab.models.user import User
from kleelab.schemas.project import CarePlanOut
from kleelab.services import activity
from kleelab.services import projects as project_svc

logger = logging.getLogger(__name__)

# Days a care plan invoice gives the client to pay.
CARE_DUE_DAYS = 7
INTERVAL_WORDS = {"month": "a month", "year": "a year"}


def add_interval(day: date, interval: str, times: int = 1) -> date:
    """The same day one month or year on, or the month's last day when it is shorter."""

    months = times * (12 if interval == "year" else 1)
    year, month = divmod(day.month - 1 + months, 12)
    year += day.year
    month += 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def period_words(start: date, end: date) -> str:
    """'November 2026' for a calendar month, otherwise '22 Oct 2026 to 21 Nov 2026'."""

    last = end - timedelta(days=1)
    if start.day == 1 and last == date(start.year, start.month, calendar.monthrange(start.year, start.month)[1]):
        return f"{start:%B %Y}"
    return f"{start.day} {start:%b %Y} to {last.day} {last:%b %Y}"


def current_period(plan: CarePlan) -> tuple[date, date]:
    """The period the last invoice paid for: up to, not including, the next billing date."""

    return add_interval(plan.next_bill_on, plan.interval, -1), plan.next_bill_on


def minutes_used(project: Project, plan: CarePlan) -> int:
    """Time logged on the project in the current period. Needs `Project.time_entries` loaded."""

    start, end = current_period(plan)
    return sum(e.minutes for e in project.__dict__.get("time_entries") or [] if start <= e.worked_on < end)


def plan_out(project: Project) -> CarePlanOut | None:
    plan = project.__dict__.get("care_plan")
    if plan is None:
        return None
    start, _ = current_period(plan)
    out = CarePlanOut.model_validate(plan)
    out.period_start = start
    out.minutes_used = minutes_used(project, plan) if plan.minutes_included else None
    return out


async def bill(db: AsyncSession, plan: CarePlan, project: Project, actor: User | None) -> ProjectInvoice:
    """Raise the invoice for the period starting on the billing date, and move the date on."""

    start = plan.next_bill_on
    end = add_interval(start, plan.interval)
    invoice = ProjectInvoice(
        project_id=project.id,
        number=await project_svc.next_invoice_number(db),
        title=f"{plan.name}: {period_words(start, end)}"[:150],
        amount_cents=plan.amount_cents,
        currency=plan.currency,
        due_date=max(start, date.today()) + timedelta(days=CARE_DUE_DAYS),
        status="unpaid",
        kind="care",
        client_name=project.client.full_name if project.client else None,
        client_email=project.client.email if project.client else None,
        project_reference=project.reference,
        project_title=project.title,
    )
    db.add(invoice)
    plan.next_bill_on = end
    await db.flush()
    activity.record(
        db, actor, "invoice.create",
        f"Billed {invoice.number}: {invoice.title}, {project_svc.money(invoice.amount_cents, invoice.currency)}",
        project_id=project.id, subject_type="invoice", subject_id=invoice.id,
        label=None if actor else "KleeLab",
    )
    return invoice


def invoice_notice(invoice: ProjectInvoice) -> str:
    return f"New invoice {invoice.number}: {invoice.title}, {project_svc.money(invoice.amount_cents, invoice.currency)}"


async def bill_due(db: AsyncSession, today: date | None = None) -> int:
    """Bill every active plan whose date has come. Returns how many invoices were raised."""

    today = today or date.today()
    plans = await db.scalars(
        select(CarePlan)
        .options(selectinload(CarePlan.project).selectinload(Project.client))
        .where(CarePlan.status == "active", CarePlan.next_bill_on <= today)
        # Several app instances may run this at once; each plan is billed by one.
        .with_for_update(skip_locked=True, of=CarePlan)
    )
    raised = []
    for plan in plans:
        project = plan.project
        if project is None or project.status == "cancelled":
            continue
        raised.append((project, await bill(db, plan, project, None)))
    await db.commit()
    for project, invoice in raised:
        project_svc.notify_client(project, invoice_notice(invoice))
    return len(raised)
