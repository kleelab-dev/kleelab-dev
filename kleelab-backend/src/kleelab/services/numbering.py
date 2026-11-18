"""Document numbers: INV-0042 for every invoice, RCT-0007 for every receipt.

One row per sequence in `document_counters`. Taking a number is an UPDATE on
that row, so the row stays locked until the caller commits: two people raising
invoices at once (or a person and the care billing loop) queue up and cannot
get the same number, and a rollback gives the number back.

Because of that lock, a caller must not do anything slow (an email, a call to
a provider) between taking a number and committing.
"""

from __future__ import annotations

from typing import Literal

from sqlalchemy import exists, select, text, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from kleelab.models.offline import OfflineInvoice, OfflineReceipt
from kleelab.models.project import ProjectInvoice

Sequence = Literal["INV", "RCT"]


def format_number(name: Sequence, value: int) -> str:
    return f"{name}-{value:04d}"


async def _taken(db: AsyncSession, name: Sequence, number: str) -> bool:
    if name == "INV":
        query = union_all(
            select(ProjectInvoice.id).where(ProjectInvoice.number == number),
            select(OfflineInvoice.id).where(OfflineInvoice.number == number),
        )
    else:
        query = select(OfflineReceipt.id).where(OfflineReceipt.number == number)
    return bool(await db.scalar(select(exists(query.subquery().select()))))


async def next_number(db: AsyncSession, name: Sequence) -> str:
    value = await db.scalar(
        text("UPDATE document_counters SET last_value = last_value + 1 WHERE name = :name RETURNING last_value"),
        {"name": name},
    )
    if value is None:
        raise RuntimeError(f"The {name} counter is missing. Run the database migrations.")
    # A number someone inserted by hand or by a script is skipped, not reused.
    while await _taken(db, name, format_number(name, value)):
        value += 1
        await db.execute(
            text("UPDATE document_counters SET last_value = :value WHERE name = :name"),
            {"name": name, "value": value},
        )
    return format_number(name, value)
