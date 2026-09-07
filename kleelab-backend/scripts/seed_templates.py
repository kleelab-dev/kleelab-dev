"""Insert the initial template catalog. Run with PYTHONPATH=src python scripts/seed_templates.py."""

import asyncio

from sqlalchemy import select

from kleelab.core.database import AsyncSessionLocal
from kleelab.models.template import Template
from kleelab.services.template_seed import TEMPLATE_DEFINITIONS, template_config


async def main() -> None:
    async with AsyncSessionLocal() as db:
        for name, category in TEMPLATE_DEFINITIONS:
            existing = await db.scalar(select(Template).where(Template.name == name))
            if existing is None:
                db.add(Template(name=name, category=category, config=template_config(category)))
        await db.commit()


if __name__ == "__main__":
    asyncio.run(main())