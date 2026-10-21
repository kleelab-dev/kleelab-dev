"""Run the retention clean-up once, now.

    PYTHONPATH=src python scripts/purge_expired.py

The app already does this daily (services/retention.py). This is for running it
by hand, or from a cron job if the app ever runs where background tasks cannot.
"""

import asyncio

from kleelab.core.database import AsyncSessionLocal
from kleelab.services.retention import purge_expired


async def main() -> None:
    async with AsyncSessionLocal() as db:
        result = await purge_expired(db)
    print(f"Deleted {result.enquiries} expired enquiries and {result.invoices} expired invoices.")


if __name__ == "__main__":
    asyncio.run(main())
