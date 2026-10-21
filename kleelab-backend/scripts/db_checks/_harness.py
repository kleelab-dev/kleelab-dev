"""Shared setup for the checks that need a real Postgres database.

These checks create and delete accounts, projects and invoices, so they only
ever run against a database on this computer. The address comes from
TEST_DATABASE_URL, never DATABASE_URL, so a production address sitting in a
.env file cannot be picked up by mistake.

Import this before anything from `kleelab`, because the settings are read on
first import.
"""

import os
import sys
from urllib.parse import urlparse

URL = os.environ.get("TEST_DATABASE_URL", "postgresql://postgres@127.0.0.1:6543/kleelab_test")
_host = urlparse(URL).hostname
if _host not in {"127.0.0.1", "localhost", "::1"}:
    sys.exit(f"Refusing to run: {_host} is not a database on this computer. Set TEST_DATABASE_URL to a local one.")

os.environ["DATABASE_URL"] = URL
os.environ.setdefault("SECRET_KEY", "local-test-key")
# No real email or Slack messages from a check.
os.environ["MAILTRAP_API_TOKEN"] = ""
os.environ["RESEND_API_KEY"] = ""
os.environ["SLACK_WEBHOOK_URL"] = ""
os.environ.setdefault("AUTH_RATE_LIMIT_PER_MINUTE", "1000")

results: list[bool] = []


def check(label: str, cond: object) -> None:
    ok = bool(cond)
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + label)


def finish() -> None:
    """Print the tally and exit non-zero if anything failed."""

    passed = sum(results)
    print(f"{passed}/{len(results)} passed")
    sys.exit(0 if results and passed == len(results) else 1)
