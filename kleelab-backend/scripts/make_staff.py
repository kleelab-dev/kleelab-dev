"""Give an existing account access to the KleeLab admin view.

    PYTHONPATH=src python scripts/make_staff.py person@example.com
    PYTHONPATH=src python scripts/make_staff.py person@example.com --revoke

A script rather than an endpoint on purpose: nothing reachable over HTTP can make
someone staff, so a bug in the API cannot either.
"""

import asyncio
import sys

from sqlalchemy import select

from kleelab.core.database import AsyncSessionLocal
from kleelab.models.user import User


async def main(email: str, revoke: bool) -> int:
    async with AsyncSessionLocal() as db:
        user = await db.scalar(select(User).where(User.email == email.lower()))
        if user is None:
            print(f"No account for {email}. Ask them to register first.")
            return 1
        user.role = "client" if revoke else "staff"
        await db.commit()
        print(f"{user.email} is now {user.role}.")
        return 0


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        print(__doc__)
        sys.exit(2)
    sys.exit(asyncio.run(main(args[0], "--revoke" in sys.argv)))
