"""Which web addresses may call the API, and how hard the public forms are limited.

Three promises, all from docs/specs/2026-11-18-simplify-backend-dashboard.md:

* In production only the origins in CORS_ORIGINS (and the onrender.com pattern)
  may call the API from a browser. Localhost and lookalike addresses may not.
  Development keeps localhost.
* The public forms (`/api/agency/leads`, `/api/calls`) get the strict per-minute
  budget that sign-in has, so the 21st call in a minute is refused.
* The self-serve sign-up paths that were removed stay removed (404 or 405).

Run with `python scripts/check_cors_and_limits.py`. No network, no database, no key:
every request here is turned away (or answered 422) before anything is stored.
"""

from __future__ import annotations

import asyncio
import os
import re
import sys
from pathlib import Path

# Set before `kleelab` is imported, because the settings are read once.
os.environ["ENVIRONMENT"] = "production"
os.environ["CORS_ORIGINS"] = "https://kleelab.com,https://admin.kleelab.com"
os.environ["AUTH_RATE_LIMIT_PER_MINUTE"] = "20"
os.environ["SECRET_KEY"] = "ci-placeholder-secret-key-not-for-production"
os.environ.setdefault("DATABASE_URL", "postgresql://ci:ci@localhost:5432/kleelab")
os.environ["MAILTRAP_API_TOKEN"] = ""
os.environ["RESEND_API_KEY"] = ""
os.environ["SLACK_WEBHOOK_URL"] = ""

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import httpx  # noqa: E402

from kleelab.core import rate_limiter  # noqa: E402
from kleelab.core.config import Settings  # noqa: E402
from kleelab.main import app  # noqa: E402

FAILURES = 0


def check(label: str, ok: object) -> None:
    global FAILURES
    if ok:
        print(f"PASS {label}")
    else:
        FAILURES += 1
        print(f"FAIL {label}")


def client(ip: str) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app, client=(ip, 1234)), base_url="http://t")


def pattern_checks() -> None:
    prod = re.compile(Settings(ENVIRONMENT="production").cors_origin_regex)
    dev = re.compile(Settings(ENVIRONMENT="development").cors_origin_regex)
    for origin in ("http://localhost:3000", "http://127.0.0.1:3001", "http://localhost"):
        check(f"development pattern allows {origin}", dev.fullmatch(origin))
        check(f"production pattern refuses {origin}", not prod.fullmatch(origin))
    for origin in ("https://x.example-sites.com", "https://kleelab.com", "https://evil.com"):
        check(f"the pattern alone does not allow {origin}", not prod.fullmatch(origin) and not dev.fullmatch(origin))
    for name in ("SITES_DOMAIN", "AUTO_VERIFY_EMAILS"):
        check(f"the {name} setting is gone", name not in Settings.model_fields)
    check("the default sign-in budget is 20 a minute", Settings.model_fields["AUTH_RATE_LIMIT_PER_MINUTE"].default == 20)


async def request_checks() -> None:
    async with client("10.2.0.1") as c:
        cases = [
            ("https://kleelab.com", True),
            ("https://admin.kleelab.com", True),
            ("http://localhost:3000", False),
            ("http://127.0.0.1:3000", False),
            ("https://x.example-sites.com", False),
            ("https://kleelab.com.evil.example", False),
            ("https://evilkleelab.com", False),
            ("http://kleelab.com", False),
        ]
        for origin, allowed in cases:
            r = await c.get("/", headers={"Origin": origin})
            got = r.headers.get("access-control-allow-origin")
            check(f"production: Origin {origin} allowed={allowed}", (got == origin) == allowed)
            r = await c.options("/api/auth/login", headers={"Origin": origin, "Access-Control-Request-Method": "POST"})
            got = r.headers.get("access-control-allow-origin")
            check(f"production preflight: Origin {origin} allowed={allowed}", (got == origin) == allowed)

        for name in ("register", "forgot-password", "logout-all", "resend-verification", "verify-email"):
            r = await c.post(f"/api/auth/{name}", json={})
            check(f"POST /api/auth/{name} is gone ({r.status_code})", r.status_code in (404, 405))

    check("/api/agency/leads is in AUTH_PATHS", "/api/agency/leads" in rate_limiter.AUTH_PATHS)
    check("/api/calls is in AUTH_PATHS", "/api/calls" in rate_limiter.AUTH_PATHS)
    check("/api/auth/request-password-reset is in AUTH_PATHS", "/api/auth/request-password-reset" in rate_limiter.AUTH_PATHS)
    check(
        "no removed auth path is left in AUTH_PATHS",
        not any(p.rsplit("/", 1)[-1] in {"register", "forgot-password", "logout-all", "resend-verification", "verify-email"} for p in rate_limiter.AUTH_PATHS),
    )

    for i, path in enumerate(["/api/agency/leads", "/api/calls", "/api/auth/request-password-reset"]):
        async with client(f"10.2.1.{i + 1}") as c:
            codes = [(await c.post(path, json={})).status_code for _ in range(21)]
        check(f"{path}: calls 1-20 are not limited", 429 not in codes[:20])
        check(f"{path}: call 21 is 429 (got {codes[20]})", codes[20] == 429)

    async with client("10.2.2.1") as c:
        for _ in range(21):
            await c.post("/api/calls", json={})
    async with client("10.2.2.2") as c:
        r = await c.post("/api/calls", json={})
    check("one address using its budget does not lock out another", r.status_code != 429)


async def main() -> None:
    pattern_checks()
    await request_checks()


asyncio.run(main())
if FAILURES:
    print(f"{FAILURES} check(s) failed")
    sys.exit(1)
print("All checks passed")
