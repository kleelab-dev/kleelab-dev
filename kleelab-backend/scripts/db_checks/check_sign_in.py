"""Sign-in and password reset: staff and clients use separate doors, email
matching ignores case, and the reset answer never reveals who has an account."""

import asyncio
import uuid

from _harness import check, finish  # noqa: I001  (sets up the local test database first)
import httpx
from sqlalchemy import delete

import kleelab.routers.auth as auth_router
from kleelab.core.database import AsyncSessionLocal
from kleelab.core.security import get_password_hash
from kleelab.main import app
from kleelab.models.user import User

PW = "Sep-" + uuid.uuid4().hex[:12]
sent: list[str] = []
# Record reset emails instead of sending them.
auth_router.send_password_reset_email = lambda email, token, staff=False: sent.append(email) or True


async def main() -> None:
    tag = uuid.uuid4().hex[:8]
    staff_email, client_email, off_email = f"staff-{tag}@example.com", f"client-{tag}@example.com", f"off-{tag}@example.com"
    async with AsyncSessionLocal() as db:
        for email, role, active in [(staff_email, "staff", True), (client_email, "client", True), (off_email, "client", False)]:
            user = User(email=email, password_hash=get_password_hash(PW), is_verified=True, is_active=active)
            user.role = role
            db.add(user)
        await db.commit()
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
            async def sign_in(path: str, email: str, password: str = PW) -> int:
                return (await c.post(path, json={"email": email, "password": password})).status_code

            check("client signs in on the client page", await sign_in("/api/auth/login", client_email) == 200)
            check("staff sign in on the team page", await sign_in("/api/auth/staff-login", staff_email) == 200)
            check("staff are turned away from the client page", await sign_in("/api/auth/login", staff_email) != 200)
            check("clients are turned away from the team page", await sign_in("/api/auth/staff-login", client_email) != 200)
            check("wrong password is refused", await sign_in("/api/auth/staff-login", staff_email, "wrong-pass-123") == 401)
            check("client email ignores case", await sign_in("/api/auth/login", client_email.capitalize()) == 200)
            check("staff email ignores case", await sign_in("/api/auth/staff-login", "  " + staff_email.upper()) == 200)
            check("switched-off account cannot sign in", await sign_in("/api/auth/login", off_email) != 200)

            async def reset(**kwargs: object) -> httpx.Response:
                return await c.post("/api/auth/request-password-reset", **kwargs)

            sent.clear()
            r = await reset(json={"email": client_email.upper()})
            check("reset by body is accepted", r.status_code == 200)
            check("reset by body sends one email to the stored address", sent == [client_email])

            sent.clear()
            r = await c.post("/api/auth/forgot-password", params={"email": client_email})
            check("old ?email= form still works", r.status_code == 200 and sent == [client_email])

            answers = []
            sent.clear()
            for email in (client_email, f"nobody-{tag}@example.com", off_email):
                answers.append((await reset(json={"email": email})).json())
            check("same answer for real, unknown and switched-off accounts", answers[0] == answers[1] == answers[2])
            check("only the active account got an email", sent == [client_email])

            r = await reset(json={})
            check("missing address is a 422", r.status_code == 422)
            r = await reset(json={"email": "not-an-email"})
            check("bad address is a 422", r.status_code == 422)
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(User).where(User.email.in_([staff_email, client_email, off_email])))
            await db.commit()


asyncio.run(main())
finish()
