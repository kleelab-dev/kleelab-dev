"""The backend clean-up (docs/specs/2026-11-18-simplify-backend-dashboard.md):
the dead sign-up paths are gone, public forms get the strict rate limit,
production does not trust localhost or lookalike origins, and the database
schema was left alone.

Covers acceptance criteria 3, 4, 5, 7 and 8, and the A6 two-line change.
No email or network calls are made; the checks never need a signed-in staff user.
"""

import asyncio
import os
import re
import subprocess
import uuid
from pathlib import Path

# These must be set before the harness and `kleelab` are imported, because the
# settings are read once on first import.
os.environ["ENVIRONMENT"] = "production"
os.environ["CORS_ORIGINS"] = "https://kleelab.com,https://admin.kleelab.com"
os.environ["AUTH_RATE_LIMIT_PER_MINUTE"] = "20"
os.environ["CHAT_RATE_LIMIT_PER_HOUR"] = "60"
os.environ["SECRET_KEY"] = "local-test-key-not-for-production"

from _harness import check, finish  # noqa: I001  (sets up the local test database first)
import httpx
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import delete, text

import kleelab.routers.auth as auth_router
from kleelab.core import rate_limiter
from kleelab.core.config import Settings
from kleelab.core.database import AsyncSessionLocal, Base, engine
from kleelab.core.security import get_password_hash
from kleelab.main import app
from kleelab.models.user import User

BACKEND = Path(__file__).resolve().parents[2]

# Nobody should receive email from a check.
for _name in ("send_password_reset_email",):
    if hasattr(auth_router, _name):
        setattr(auth_router, _name, lambda *a, **k: True)


def client(ip: str) -> httpx.AsyncClient:
    """A caller from a fixed address, so each check gets its own rate-limit bucket."""

    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app, client=(ip, 1234)), base_url="http://t")


REMOVED_AUTH_PATHS = ["register", "forgot-password", "logout-all", "resend-verification", "verify-email"]
KEPT_AUTH_PATHS = ["login", "staff-login", "request-password-reset", "reset-password", "refresh"]


async def check_removed_endpoints() -> None:
    """AC4: the five self-serve paths answer 404 or 405, whatever the method."""

    async with client("10.1.0.1") as c:
        for name in REMOVED_AUTH_PATHS:
            for method in ("POST", "GET"):
                r = await c.request(method, f"/api/auth/{name}", json={} if method == "POST" else None)
                check(f"{method} /api/auth/{name} is gone ({r.status_code})", r.status_code in (404, 405))
        # With a realistic body, so a path that still existed could not hide behind a 422.
        r = await c.post("/api/auth/register", json={"email": "a@example.com", "password": "Passw0rd!long"})
        check(f"register with a valid body is still not served ({r.status_code})", r.status_code in (404, 405))
        r = await c.post("/api/auth/verify-email", json={"token": "x"})
        check(f"verify-email with a token is not served ({r.status_code})", r.status_code in (404, 405))

        # The paths that must survive are still mounted (anything but 404/405).
        for name in KEPT_AUTH_PATHS:
            r = await c.post(f"/api/auth/{name}", json={})
            check(f"POST /api/auth/{name} is still served ({r.status_code})", r.status_code not in (404, 405))

    paths = app.openapi()["paths"]
    for name in REMOVED_AUTH_PATHS:
        check(f"/api/auth/{name} is not in the OpenAPI document", f"/api/auth/{name}" not in paths)
    check("/api/auth/sign-out-others is still in the OpenAPI document", "/api/auth/sign-out-others" in paths)


def check_rate_limit_table() -> None:
    """A6 and A3b: the public forms are in the strict bucket; removed paths are not listed."""

    check("/api/agency/leads is in AUTH_PATHS", "/api/agency/leads" in rate_limiter.AUTH_PATHS)
    check("/api/calls is in AUTH_PATHS", "/api/calls" in rate_limiter.AUTH_PATHS)
    stale = sorted(p for p in rate_limiter.AUTH_PATHS if p.rsplit("/", 1)[-1] in REMOVED_AUTH_PATHS)
    check(f"no removed auth path is left in AUTH_PATHS {stale}", not stale)
    check("/api/chat is still in its own bucket", "/api/chat" in rate_limiter.CHAT_PATHS)
    default = Settings.model_fields["AUTH_RATE_LIMIT_PER_MINUTE"].default
    check(f"the default auth budget is 20 a minute ({default})", default == 20)


async def check_rate_limits() -> None:
    """AC5 and AC6: the 21st call in a minute is refused, and each caller has its own budget."""

    for i, path in enumerate(["/api/auth/request-password-reset", "/api/agency/leads", "/api/calls"]):
        # A fresh address per path: all three share one auth bucket per address.
        async with client(f"10.1.1.{i + 1}") as c:
            codes = [(await c.post(path, json={})).status_code for _ in range(21)]
        check(f"{path}: calls 1-20 are not limited", 429 not in codes[:20])
        check(f"{path}: call 21 is 429 (got {codes[20]})", codes[20] == 429)

    # One caller using up the budget does not lock out another address.
    async with client("10.1.2.1") as c:
        for _ in range(21):
            await c.post("/api/calls", json={})
    async with client("10.1.2.2") as c:
        r = await c.post("/api/calls", json={})
    check(f"a second address is unaffected by the first ({r.status_code})", r.status_code != 429)

    # The form budget is shared with sign-in, as the spec says (one auth bucket per address).
    async with client("10.1.2.3") as c:
        for _ in range(20):
            await c.post("/api/agency/leads", json={})
        r = await c.post("/api/auth/request-password-reset", json={})
    check(f"leads and password reset share the one auth bucket ({r.status_code})", r.status_code == 429)

    # AC6: chat keeps its own, hourly bucket.
    async with client("10.1.3.1") as c:
        codes = [(await c.post("/api/chat", json={})).status_code for _ in range(61)]
        other = await c.post("/api/calls", json={})
    check(f"/api/chat: calls 1-60 are not limited", 429 not in codes[:60])
    check(f"/api/chat: call 61 is 429 (got {codes[60]})", codes[60] == 429)
    check(f"chat limit does not use up the auth bucket ({other.status_code})", other.status_code != 429)


async def check_cors() -> None:
    """AC7: in production only the listed origins (and the onrender.com pattern) are allowed."""

    check("this run really is production", os.environ["ENVIRONMENT"] == "production")
    async with client("10.1.4.1") as c:
        cases = [
            ("https://kleelab.com", True),
            ("https://admin.kleelab.com", True),
            ("http://localhost:3000", False),
            ("http://127.0.0.1:3000", False),
            ("http://localhost", False),
            ("https://x.example-sites.com", False),
            ("https://kleelab.com.evil.example", False),
            ("https://evilkleelab.com", False),
            ("http://kleelab.com", False),
        ]
        for origin, allowed in cases:
            r = await c.get("/", headers={"Origin": origin})
            got = r.headers.get("access-control-allow-origin")
            check(f"GET Origin {origin}: allowed={allowed} (header={got!r})", (got == origin) == allowed)
            r = await c.options(
                "/api/auth/login",
                headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
            )
            got = r.headers.get("access-control-allow-origin")
            check(f"preflight Origin {origin}: allowed={allowed} (header={got!r})", (got == origin) == allowed)

    # The setting itself: development keeps localhost, production never has it.
    prod = re.compile(Settings(ENVIRONMENT="production").cors_origin_regex)
    dev = re.compile(Settings(ENVIRONMENT="development").cors_origin_regex)
    for origin in ("http://localhost:3000", "http://127.0.0.1:3001", "http://localhost"):
        check(f"development pattern matches {origin}", dev.fullmatch(origin))
        check(f"production pattern does not match {origin}", not prod.fullmatch(origin))
    for origin in ("https://x.example-sites.com", "https://kleelab.com"):
        check(f"neither pattern matches {origin} on its own", not prod.fullmatch(origin) and not dev.fullmatch(origin))
    check("the old SITES_DOMAIN setting is gone", "SITES_DOMAIN" not in Settings.model_fields)
    check("AUTO_VERIFY_EMAILS is gone", "AUTO_VERIFY_EMAILS" not in Settings.model_fields)


def sync_schema_checks(connection) -> None:
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "migrations"))
    heads = ScriptDirectory.from_config(config).get_heads()
    current = MigrationContext.configure(connection).get_current_revision()
    check(f"there is one migration head ({heads})", len(heads) == 1)
    check(f"the database is at that head ({current})", current == heads[0])

    ctx = MigrationContext.configure(connection, opts={"compare_type": True})
    diff = compare_metadata(ctx, Base.metadata)
    flat = []
    for item in diff:
        flat.extend(item if isinstance(item, list) else [item])
    dropped = [op[1].name for op in flat if op[0] == "remove_table"]
    check(f"autogenerate would not drop any table {dropped}", not dropped)
    dropped_cols = [(op[2], op[3].name) for op in flat if op[0] == "remove_column"]
    # Not part of the spec: columns that the models never declared (users.is_superuser)
    # already show up here before this change, so it is shown but is not a failure.
    print(f"NOTE autogenerate also reports dropped columns {dropped_cols} (already so before this change)")


async def check_schema() -> None:
    """AC8: no migration was added, and the legacy builder tables are still known to the models."""

    async with engine.connect() as conn:
        await conn.run_sync(sync_schema_checks)

    legacy = ["sites", "pages", "page_versions", "products", "orders", "assets", "analytics_events", "templates", "ai_generations"]
    known = set(Base.metadata.tables)
    missing = [t for t in legacy if t not in known]
    check(f"every legacy builder table is still in Base.metadata {missing}", not missing)
    async with engine.connect() as conn:
        for t in legacy:
            exists = (await conn.execute(text("select to_regclass(:n)"), {"n": f"public.{t}"})).scalar()
            check(f"legacy table {t} still exists in the database", exists is not None)

    try:
        out = subprocess.run(
            ["git", "status", "--porcelain", "--", "migrations"],
            cwd=BACKEND, capture_output=True, text=True, timeout=30,
        )
        if out.returncode == 0:
            check(f"no migration file was added or changed {out.stdout.strip()!r}", out.stdout.strip() == "")
        else:
            print("SKIP migrations folder git status: git could not read the repository")
    except (OSError, subprocess.SubprocessError):
        print("SKIP migrations folder git status: git is not available")


async def check_me_shape() -> None:
    """AC3: /me carries the kept fields and none of the plan fields."""

    email = f"simplify-{uuid.uuid4().hex[:8]}@example.com"
    password = "Simplify-" + uuid.uuid4().hex[:10]
    async with AsyncSessionLocal() as db:
        db.add(User(email=email, password_hash=get_password_hash(password), is_verified=True))
        await db.commit()
    try:
        async with client("10.1.5.1") as c:
            login = await c.post("/api/auth/login", json={"email": email, "password": password})
            check(f"a client can sign in ({login.status_code})", login.status_code == 200)
            token = login.json().get("access_token", "")
            me = (await c.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})).json()
            want = {"id", "email", "full_name", "role", "is_verified", "two_step_enabled", "email_topics"}
            check(f"/me has {sorted(want - set(me))} missing", want <= set(me))
            extra = {"plan", "plan_label", "plan_blurb", "limits", "usage"} & set(me)
            check(f"/me has none of the plan fields {sorted(extra)}", not extra)
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(User).where(User.email == email))
            await db.commit()


async def main() -> None:
    try:
        await check_removed_endpoints()
        check_rate_limit_table()
        await check_rate_limits()
        await check_cors()
        await check_schema()
        await check_me_shape()
    finally:
        await engine.dispose()


asyncio.run(main())
finish()
