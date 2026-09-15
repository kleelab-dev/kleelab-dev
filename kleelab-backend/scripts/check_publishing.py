"""Where a published site lives, and who is allowed to talk to the API from one.

Two things go wrong here, and neither is visible in a browser console.

The first is the address. A site has two reachable forms — `{subdomain}.{domain}`
and `{FRONTEND_URL}/s/{subdomain}` — and the owner is told one of them. Advertising
the wrong one is how a customer ends up printing a path on a business card. The
second is CORS. A published site is a *different origin* from the app, so its own
calls to the API are cross-origin; a shop's cart is the obvious one. If the origin
pattern does not cover customer subdomains, the shop page loads and every request it
makes fails, which reads as the shop being broken.

The checks below are mostly about the pattern being *narrow* enough as well as wide
enough: a customer subdomain is allowed, and a host that merely looks like one is not.

Run with `python scripts/check_publishing.py`. No network, no database.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from kleelab.core.config import Settings  # noqa: E402
from kleelab.routers import sites as sites_module  # noqa: E402
from kleelab.routers.sites import public_site_url  # noqa: E402

failures = 0


def fail(message: str) -> None:
    global failures
    failures += 1
    print(f"FAIL  {message}")


def pass_(message: str) -> None:
    print(f"PASS  {message}")


def check(message: str, condition: bool, detail: str = "") -> None:
    if condition:
        pass_(message)
    else:
        fail(f"{message} - {detail}" if detail else message)


def site(**overrides: object) -> SimpleNamespace:
    """The fields `public_site_url` reads, and nothing else."""
    fields = {"custom_domain": None, "subdomain": "fern-and-field"}
    fields.update(overrides)
    return SimpleNamespace(**fields)


def with_sites_domain(domain: str, frontend: str = "http://localhost:3000") -> Settings:
    """Settings for one deployment shape, with nothing read from the environment.

    Every field these checks depend on is passed explicitly. They were not at first,
    and the gate failed on a developer's machine against a `.env` setting
    `FRONTEND_URL` to a real domain — which is a gate that agrees with whoever runs
    it, and therefore not a gate. `Settings` also requires DATABASE_URL and
    SECRET_KEY, so CI can run this with no `.env` and no database.
    """

    return Settings(
        DATABASE_URL="postgresql+asyncpg://unused:unused@localhost/unused",
        SECRET_KEY="x" * 40,
        SITES_DOMAIN=domain,
        FRONTEND_URL=frontend,
    )


# --- The address an owner is given ------------------------------------------------
#
# `public_site_url` reads the application's settings object, so each case swaps that
# object for one built here rather than duplicating the logic to test it.

original = sites_module.settings


def with_settings(configured: Settings, call):
    sites_module.settings = configured
    try:
        return call()
    finally:
        sites_module.settings = original


local = with_sites_domain("")
hosted = with_sites_domain("kleelab.com")

# Local development: no sites domain, so the path form. The frontend's proxy only
# rewrites a subdomain host when the request has one, and `localhost:3000` does not.
check(
    "with no sites domain a published site is advertised on the frontend path",
    with_settings(local, lambda: public_site_url(site()))
    == "http://localhost:3000/s/fern-and-field",
    with_settings(local, lambda: public_site_url(site())),
)
check(
    "with a sites domain a published site is advertised on its own subdomain",
    with_settings(hosted, lambda: public_site_url(site()))
    == "https://fern-and-field.kleelab.com",
    with_settings(hosted, lambda: public_site_url(site())),
)
check(
    "a custom domain wins over any address we would generate",
    with_settings(hosted, lambda: public_site_url(site(custom_domain="fernandfield.co.uk")))
    == "https://fernandfield.co.uk",
    with_settings(hosted, lambda: public_site_url(site(custom_domain="fernandfield.co.uk"))),
)
check(
    "a site with no subdomain falls back to the frontend rather than a broken address",
    with_settings(hosted, lambda: public_site_url(site(subdomain=None)))
    == "http://localhost:3000",
    with_settings(hosted, lambda: public_site_url(site(subdomain=None))),
)
check(
    "a leading dot in the configured domain does not produce a doubled dot",
    with_settings(with_sites_domain(".kleelab.com"), lambda: public_site_url(site()))
    == "https://fern-and-field.kleelab.com",
    with_settings(with_sites_domain(".kleelab.com"), lambda: public_site_url(site())),
)
check(
    "an uppercase configured domain is lowercased rather than emitted as written",
    with_settings(with_sites_domain("KleeLab.com"), lambda: public_site_url(site()))
    == "https://fern-and-field.kleelab.com",
    with_settings(with_sites_domain("KleeLab.com"), lambda: public_site_url(site())),
)

# --- Who may call the API from a published site ------------------------------------

pattern = with_sites_domain("kleelab.com").cors_origin_regex
matcher = re.compile(pattern)

ALLOWED = [
    "https://fern-and-field.kleelab.com",
    "https://a1.kleelab.com",
    "https://kleelab.com",
    "http://localhost:3000",
    "http://127.0.0.1:8000",
    "https://kleelab-api.onrender.com",
]

REFUSED = [
    # A host that merely ends with the domain. The whole point of the pattern being
    # `[a-z0-9-]+` rather than `.*`.
    "https://kleelab.com.evil.test",
    "https://evil.test",
    # A dot inside the subdomain is not a subdomain.
    "https://a.b.kleelab.com",
    # Plain http on a customer site would be a downgrade, and the certificate would
    # not match anyway.
    "http://fern-and-field.kleelab.com",
]

for origin in ALLOWED:
    check(
        f"allowed from: {origin}",
        bool(matcher.fullmatch(origin)),
        f"pattern did not match: {pattern}",
    )

for origin in REFUSED:
    check(
        f"refused from: {origin}",
        not matcher.fullmatch(origin),
        f"pattern wrongly matched: {pattern}",
    )

# With no sites domain configured, nothing about a customer site should be allowed —
# otherwise the pattern is broader than the deployment it describes.
local_pattern = with_sites_domain("").cors_origin_regex
check(
    "with no sites domain no customer subdomain is allowed",
    not re.compile(local_pattern).fullmatch("https://fern-and-field.kleelab.com"),
    local_pattern,
)
check(
    "local development still works with no sites domain",
    bool(re.compile(local_pattern).fullmatch("http://localhost:3000")),
    local_pattern,
)

if failures:
    print(f"\n{failures} failure(s).\n")
    raise SystemExit(1)
print("\nAll publishing checks passed.\n")
