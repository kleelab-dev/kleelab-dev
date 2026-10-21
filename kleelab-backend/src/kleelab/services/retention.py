"""Delete what the privacy page says we stop keeping.

- Enquiries that never became a project, after ENQUIRY_RETENTION_DAYS (two years).
- Invoices left behind by a deleted account, after INVOICE_RETENTION_YEARS.

Runs once a day from the app (see main.py) and can be run by hand:

    PYTHONPATH=src python scripts/purge_expired.py
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.core.config import settings
from kleelab.core.database import AsyncSessionLocal
from kleelab.core.time import utcnow
from kleelab.models.agency_lead import AgencyLead
from kleelab.models.project import Project, ProjectInvoice

logger = logging.getLogger(__name__)

DAY = 24 * 60 * 60


@dataclass
class PurgeResult:
    enquiries: int
    invoices: int


async def purge_expired(db: AsyncSession, now: datetime | None = None) -> PurgeResult:
    now = now or utcnow()
    enquiry_cutoff = now - timedelta(days=settings.ENQUIRY_RETENTION_DAYS)
    # Whole years by the calendar would need a date library; 365.25 days is
    # within a day of it, and a day late is the safe side.
    invoice_cutoff = now - timedelta(days=round(settings.INVOICE_RETENTION_YEARS * 365.25))

    # An enquiry that turned into a project is part of that project's history,
    # so it goes when the project does, not on this clock. Lead notes cascade.
    enquiries = await db.execute(
        delete(AgencyLead).where(
            AgencyLead.created_at < enquiry_cutoff,
            ~exists().where(Project.lead_id == AgencyLead.id),
        )
    )
    # Only detached invoices: one still on a live project is current business.
    # Counted from when it was raised, which is when the tax record starts.
    # Payment attempts cascade.
    invoices = await db.execute(
        delete(ProjectInvoice).where(
            ProjectInvoice.project_id.is_(None),
            ProjectInvoice.created_at < invoice_cutoff,
        )
    )
    await db.commit()
    return PurgeResult(enquiries=enquiries.rowcount or 0, invoices=invoices.rowcount or 0)


async def run_daily() -> None:
    """Purge now and then once a day, for as long as the app runs.

    A failed run is logged and retried the next day rather than stopping the loop.
    With several app instances each one runs it; the deletes are idempotent.
    """

    while True:
        try:
            async with AsyncSessionLocal() as db:
                result = await purge_expired(db)
            if result.enquiries or result.invoices:
                logger.info(
                    "Retention: deleted %d expired enquiries and %d expired invoices.",
                    result.enquiries,
                    result.invoices,
                )
        except Exception:
            logger.exception("Retention clean-up failed; trying again tomorrow.")
        await asyncio.sleep(DAY)
