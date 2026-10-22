# Database checks

End-to-end checks that drive the API against a real Postgres database. They
create and delete accounts, projects and invoices, so they refuse to run
against anything but a database on this computer.

CI has no Postgres, so these run by hand before a release that touches the
backend.

## Run

Start a local Postgres, create an empty database and bring it up to date:

```bash
createdb -h 127.0.0.1 -p 6543 -U postgres kleelab_test
DATABASE_URL=postgresql://postgres@127.0.0.1:6543/kleelab_test alembic upgrade head
```

Then, from `kleelab-backend/scripts/db_checks`:

```bash
for f in check_*.py; do PYTHONPATH="../../src:." ../../.venv/bin/python "$f" || echo "FAILED: $f"; done
```

On Windows use `;` instead of `:` in `PYTHONPATH` and `.venv/Scripts/python`.

Each script prints PASS or FAIL per check and exits non-zero if any failed.
Point them at another local database with `TEST_DATABASE_URL`. `DATABASE_URL`
is ignored on purpose, so a production address in `.env` is never used.
No email or Slack messages are sent.

| Script | Covers |
| --- | --- |
| `check_sign_in.py` | Staff and client sign-in kept apart, email case, password reset |
| `check_team_security.py` | Session tokens, two-step sign-in, team invites, activity log, search |
| `check_lead_pipeline.py` | Enquiries pipeline, notes, Today stats |
| `check_money_clients.py` | Invoices, PDF, money summary, client accounts |
| `check_alerts_search.py` | Team alerts bell, Ctrl+K search of teammates and messages |
| `check_paystack.py` | Paying invoices online: webhook signature, verification, replays, mismatches. Paystack is faked; no network calls |
| `check_retention.py` | Invoices kept when an account is deleted; old enquiries and invoices deleted on schedule |
| `check_client_account.py` | A client's Account page: name, password change, signing out other devices |
| `check_proposals.py` | Proposals from an enquiry: drafts, sending, versions, the client's accept or decline, and the project and deposit invoice it creates |
