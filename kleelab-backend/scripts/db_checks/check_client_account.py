"""A client's own Account page: change their name, change their password, and
sign out their other devices, without ever reaching someone else's account."""

import asyncio
import uuid

from _harness import check, finish  # noqa: I001  (sets up the local test database first)
import httpx
from sqlalchemy import delete, select

import kleelab.routers.auth as auth_router
from kleelab.core.database import AsyncSessionLocal
from kleelab.core.security import get_password_hash
from kleelab.main import app
from kleelab.models.activity import ActivityEvent
from kleelab.models.user import User

PW = "Acct-" + uuid.uuid4().hex[:12]
NEW_PW = "Moved-" + uuid.uuid4().hex[:12]
notices: list[tuple[str, str]] = []
# Record security notices instead of sending them.
auth_router.send_security_notice = lambda email, subject, lines: notices.append((email, subject)) or True


def bearer(tokens: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens.get('access_token', '')}"}


async def main() -> None:
    tag = uuid.uuid4().hex[:8]
    me_email, other_email = f"me-{tag}@example.com", f"other-{tag}@example.com"
    async with AsyncSessionLocal() as db:
        me = User(email=me_email, password_hash=get_password_hash(PW), is_verified=True, full_name="Ada Client")
        other = User(email=other_email, password_hash=get_password_hash(PW), is_verified=True, full_name="Other Person")
        db.add_all([me, other])
        await db.commit()
        me_id, other_id = me.id, other.id
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
            async def sign_in(email: str = me_email, password: str = PW) -> dict:
                r = await c.post("/api/auth/login", json={"email": email, "password": password})
                return r.json() if r.status_code == 200 else {}

            async def works(tokens: dict) -> bool:
                return (await c.get("/api/auth/me", headers=bearer(tokens))).status_code == 200

            async def refreshes(tokens: dict) -> dict | None:
                r = await c.post("/api/auth/refresh", json={"refresh_token": tokens.get("refresh_token", "")})
                return r.json() if r.status_code == 200 else None

            # --- name ---------------------------------------------------------------------
            laptop = await sign_in()
            check("client signs in", bool(laptop))
            r = await c.patch("/api/auth/me", headers=bearer(laptop), json={"full_name": "  Ada   Lovelace "})
            check("rename works", r.status_code == 200 and r.json()["full_name"] == "Ada Lovelace")
            r = await c.get("/api/auth/me", headers=bearer(laptop))
            check("new name is kept", r.json()["full_name"] == "Ada Lovelace")
            r = await c.patch("/api/auth/me", headers=bearer(laptop), json={"full_name": "   "})
            check("blank name is refused", r.status_code == 422)
            r = await c.patch("/api/auth/me", headers=bearer(laptop), json={"full_name": "x" * 101})
            check("over-long name is refused", r.status_code == 422)
            r = await c.patch("/api/auth/me", json={"full_name": "Nobody"})
            check("rename needs a session", r.status_code == 401)
            r = await c.patch(
                "/api/auth/me",
                headers=bearer(laptop),
                json={"full_name": "Ada Lovelace", "email": other_email, "role": "staff", "id": str(other_id)},
            )
            check("extra fields are ignored", r.status_code == 200 and r.json()["email"] == me_email and r.json()["role"] == "client")
            async with AsyncSessionLocal() as db:
                untouched = await db.get(User, other_id)
                check("another client's account is untouched", untouched.full_name == "Other Person" and untouched.email == other_email)
                mine = await db.get(User, me_id)
                check("the role cannot be raised from here", mine.role == "client" and mine.email == me_email)

            # --- change password ----------------------------------------------------------------
            phone = await sign_in()
            other_session = await sign_in(other_email)
            check("three sessions open", bool(phone) and bool(other_session) and await works(phone))

            wrong = {"current_password": "wrong-" + PW, "new_password": NEW_PW}
            r = await c.post("/api/auth/change-password", headers=bearer(laptop), json=wrong)
            check("wrong current password is refused with a 400", r.status_code == 400)
            check("refusal keeps the error shape", r.json().get("error", {}).get("message") == "Your current password is not right.")
            check("refusal does not sign anyone out", await works(laptop) and await works(phone))
            r = await c.post("/api/auth/change-password", headers=bearer(laptop), json={"current_password": PW, "new_password": "short"})
            check("too-short new password is refused", r.status_code == 422)
            r = await c.post("/api/auth/change-password", headers=bearer(laptop), json={"current_password": PW, "new_password": PW})
            check("same password is refused", r.status_code == 400)
            r = await c.post("/api/auth/change-password", json={"current_password": PW, "new_password": NEW_PW})
            check("change password needs a session", r.status_code == 401)

            notices.clear()
            r = await c.post("/api/auth/change-password", headers=bearer(laptop), json={"current_password": PW, "new_password": NEW_PW})
            check("change password works", r.status_code == 200)
            body = r.json() if r.status_code == 200 else {}
            check("this device keeps its session (no new tokens needed)", body.get("tokens") is None and body.get("signed_out", 0) >= 1)
            check("this device still works", await works(laptop))
            check("other device's access token stops at once", not await works(phone))
            check("other device cannot refresh", await refreshes(phone) is None)
            check("another user's session is untouched", await works(other_session))
            check("old password no longer signs in", not await sign_in(password=PW))
            check("new password signs in", bool(await sign_in(password=NEW_PW)))
            check("a security notice went to the owner only", notices == [(me_email, "Your KleeLab password was changed")])
            rotated = await refreshes(laptop)
            check("this device can still refresh", rotated is not None and await works(rotated))
            laptop = rotated or laptop
            check("an access token from before the refresh still works", await works(laptop))

            # --- sign out other devices ---------------------------------------------------------
            phone = await sign_in(password=NEW_PW)
            tablet = await sign_in(password=NEW_PW)
            check("more devices signed in", await works(phone) and await works(tablet))
            r = await c.post("/api/auth/sign-out-others", headers=bearer(laptop))
            body = r.json() if r.status_code == 200 else {}
            check("sign-out-others works", r.status_code == 200 and body.get("signed_out", 0) >= 2 and body.get("tokens") is None)
            check("this device still works", await works(laptop))
            check("phone is signed out", not await works(phone) and await refreshes(phone) is None)
            check("tablet is signed out", not await works(tablet) and await refreshes(tablet) is None)
            check("another user is not signed out", await works(other_session))
            check("this device can still refresh", await refreshes(laptop) is not None)
            r = await c.post("/api/auth/sign-out-others")
            check("sign-out-others needs a session", r.status_code == 401)

            # --- plain sign-out ends that session's access token too ------------------------
            spare = await sign_in(password=NEW_PW)
            await c.post("/api/auth/logout", json={"refresh_token": spare["refresh_token"]})
            check("signing out stops that access token", not await works(spare))
            check("signing out leaves the other user alone", await works(other_session))

            # --- reusing a rotated refresh token still looks like theft ---------------------
            first = await sign_in(password=NEW_PW)
            second = await refreshes(first)
            check("a session rotates", second is not None and await works(second))
            check("its old refresh token is refused", await refreshes(first) is None)
            check("and every session of that user is signed out", not await works(second) and not await works(laptop))
            check("other users keep theirs", await works(other_session))

            async with AsyncSessionLocal() as db:
                actions = set(await db.scalars(select(ActivityEvent.action).where(ActivityEvent.actor_id == me_id)))
            expected = {"account.renamed", "auth.password_change_failed", "auth.password_changed", "auth.signed_out_others"}
            check("account changes are in the activity log", expected <= actions)
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(ActivityEvent).where(ActivityEvent.actor_id.in_([me_id, other_id])))
            await db.execute(delete(User).where(User.id.in_([me_id, other_id])))
            await db.commit()


asyncio.run(main())
finish()
