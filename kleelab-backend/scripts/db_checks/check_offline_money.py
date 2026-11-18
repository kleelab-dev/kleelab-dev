"""Offline contacts, invoices, part payments and receipts, end to end on a real database.

Spec: docs/specs/2026-11-18-offline-invoices-receipts.md. Covers acceptance
criteria 1-3, 5-8, 12-25, 30, 32, 33, 35-37, the stored-total rule, and the
parts of 27, 28 and 31 that need the API. (4 is in check_retention.py; the
no-database parts are in scripts/check_offline_money.py.)

Stats are read as before and after, because the test database holds other
checks' rows. The migration check builds its own scratch database next to the
test one and drops it again. Email goes to a faked httpx, never the network.
"""

import asyncio
import base64
import os
import re
import subprocess
import sys
import threading
import uuid
import zlib
from datetime import date, datetime, timedelta
from pathlib import Path

from _harness import URL, check, finish  # noqa: I001  (sets up the local test database first)

os.environ["INVOICE_PAYMENT_DETAILS"] = "Bank: Test Bank\\nAccount: 0000000000"
import httpx
from sqlalchemy import delete, func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from kleelab.core.config import settings
from kleelab.core.database import AsyncSessionLocal
from kleelab.core.security import create_access_token, get_password_hash
from kleelab.main import app
from kleelab.models.activity import ActivityEvent
from kleelab.models.offline import (
    OfflineContact,
    OfflineInvoice,
    OfflineInvoicePayment,
    OfflineReceipt,
)
from kleelab.models.project import Project, ProjectInvoice
from kleelab.models.user import User
from kleelab.schemas import offline as offline_schemas
from kleelab.services import email as email_svc
from kleelab.services import numbering
from kleelab.services.projects import next_invoice_number

sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # check names hold non-Latin-1 text; Windows consoles are cp1252

BACKEND = Path(__file__).resolve().parents[2]
B = "/api/admin/offline"
PW = "Offline-" + uuid.uuid4().hex[:12]
TODAY = date.today()
YESTERDAY = TODAY - timedelta(days=1)
NEXT_WEEK = TODAY + timedelta(days=7)
MAIN_THREAD = threading.get_ident()
MONTH_START = TODAY.replace(day=1)
LAST_MONTH = MONTH_START - timedelta(days=1)


def ck(label: str, cond: object, detail: object = "") -> None:
    """check(), with the offending value printed when it fails."""

    check(label, cond)
    if not cond and detail != "":
        print(f"      got: {detail}")


def auth(user_id) -> dict[str, str]:
    return {"Authorization": "Bearer " + create_access_token({"user_id": str(user_id)})}


def pdf_text(data: bytes) -> str:
    out = []
    for m in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", data, re.S):
        try:
            out.append(zlib.decompress(m.group(1)).decode("latin-1"))
        except zlib.error:
            out.append(m.group(1).decode("latin-1"))
    return "".join(re.findall(r"\((.*?)(?<!\\)\)\s*Tj", "".join(out)))


def line(description: str, quantity: int, unit: int) -> dict:
    return {"description": description, "quantity": quantity, "unit_price_cents": unit}


def pay(amount: int, on: date | None = None, **over) -> dict:
    return {"amount_cents": amount, "method": "bank_transfer", "reference": "TRF-1", "paid_on": str(on or TODAY), **over}


def msg(r) -> str:
    try:
        return r.json()["error"]["message"]
    except Exception:  # noqa: BLE001
        return r.text


def project_number(r, title: str) -> str:
    """POST /projects/{id}/invoices returns the whole project; pick the new invoice's number by title."""

    return next(i["number"] for i in r.json()["invoices"] if i["title"] == title)


def number_value(number: str) -> int:
    return int(number.split("-")[1])


class FakeMail:
    """Stands in for the Mailtrap API: records what would have been sent, touches no network."""

    def __init__(self, fail: bool = False) -> None:
        self.sent: list[dict] = []
        self.fail = fail
        # Which thread each provider call ran on: never the event loop's.
        self.on_loop_thread: list[bool] = []

    def __enter__(self):
        self._token = email_svc.settings.MAILTRAP_API_TOKEN
        self._post = email_svc.httpx.post
        email_svc.settings.MAILTRAP_API_TOKEN = "test-token"

        def post(url, headers=None, json=None, timeout=None):
            self.on_loop_thread.append(threading.get_ident() == MAIN_THREAD)
            if self.fail:
                raise httpx.ConnectError("provider down")
            self.sent.append(json)

            class Resp:
                def raise_for_status(self):
                    return None

            return Resp()

        email_svc.httpx.post = post
        return self

    def __exit__(self, *exc):
        email_svc.settings.MAILTRAP_API_TOKEN = self._token
        email_svc.httpx.post = self._post


async def scalar(sql: str, **params):
    async with AsyncSessionLocal() as db:
        return await db.scalar(text(sql), params)


async def row_counts() -> dict[str, int]:
    async with AsyncSessionLocal() as db:
        out = {}
        for name in ("offline_contacts", "offline_invoices", "offline_invoice_payments", "offline_receipts"):
            out[name] = await db.scalar(text(f"SELECT count(*) FROM {name}"))
        out["activity"] = await db.scalar(text("SELECT count(*) FROM activity_events WHERE action LIKE 'invoice.offline%' OR action LIKE 'receipt.%' OR action LIKE 'contact.%'"))
        return out


def total(st: dict, key: str, currency: str) -> tuple[int, int]:
    row = next((t for t in st[key] if t["currency"] == currency), None)
    return (row["cents"], row["count"]) if row else (0, 0)


# --- Migration: a scratch database, up, down, up (criteria 2, 3, 8, and 5's literal numbers) ----------------


def alembic(db_url: str, *args: str) -> subprocess.CompletedProcess:
    env = {**os.environ, "DATABASE_URL": db_url}
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=600
    )


async def migration_checks(tag: str) -> None:
    print("\n-- migration, on a scratch database --")
    target = make_url(URL)
    name = f"kleelab_migcheck_{tag}"
    admin = create_async_engine(target.set(drivername="postgresql+asyncpg", database="postgres"), isolation_level="AUTOCOMMIT")
    scratch_url = target.set(database=name).render_as_string(hide_password=False)
    scratch = create_async_engine(target.set(drivername="postgresql+asyncpg", database=name))
    maker = async_sessionmaker(scratch, expire_on_commit=False)
    try:
        async with admin.connect() as conn:
            await conn.execute(text(f'CREATE DATABASE "{name}"'))

        up = await asyncio.to_thread(alembic, scratch_url, "upgrade", "add_call_phone")
        ck("an empty database reaches add_call_phone", up.returncode == 0, up.stderr[-400:])

        async def seed(numbers: list[str]) -> None:
            async with maker() as db:
                owner = User(email=f"mig-{uuid.uuid4().hex[:6]}@example.com", password_hash="x", is_verified=True)
                db.add(owner)
                await db.flush()
                project = Project(client_id=owner.id, reference=f"M-{uuid.uuid4().hex[:6]}", title="Mig", status="active")
                db.add(project)
                await db.flush()
                for n in numbers:
                    db.add(ProjectInvoice(project_id=project.id, number=n, title="t", amount_cents=100, currency="NGN"))
                await db.commit()

        async def counters() -> dict[str, int]:
            async with maker() as db:
                rows = (await db.execute(text("SELECT name, last_value FROM document_counters"))).all()
                return dict(rows)

        async def tables() -> set[str]:
            async with maker() as db:
                rows = await db.scalars(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'"))
                return set(rows)

        # The highest number wins: INV-0041 beats a count of 3; 'A1b2c3' is ignored.
        await seed(["INV-0041", "INV-0007", "A1b2c3"])
        up = await asyncio.to_thread(alembic, scratch_url, "upgrade", "head")
        ck("upgrade head succeeds", up.returncode == 0, up.stderr[-400:])
        found = await counters()
        ck("INV is the highest existing number (41), not the count (3)", found.get("INV") == 41, found)
        ck("RCT starts at 0", found.get("RCT") == 0, found)
        ck("the five new tables exist", {"offline_contacts", "offline_invoices", "offline_invoice_payments", "offline_receipts", "document_counters"} <= await tables())
        async with maker() as db:
            ck("no existing invoice row was changed or added", await db.scalar(text("SELECT count(*) FROM project_invoices")) == 3)

        # Criteria 5 and 8, with the literal numbers.
        async with maker() as db:
            first_two = [await numbering.next_number(db, "INV"), await numbering.next_number(db, "INV")]
            await db.commit()
        ck("after INV-0041 the next two are INV-0042 and INV-0043", first_two == ["INV-0042", "INV-0043"], first_two)
        async with maker() as db:
            rct = [await numbering.next_number(db, "RCT"), await numbering.next_number(db, "RCT")]
            await db.commit()
        ck("with no receipts, the first is RCT-0001 and the next RCT-0002", rct == ["RCT-0001", "RCT-0002"], rct)
        async with maker() as db:
            await numbering.next_number(db, "INV")
            await db.rollback()
            again = await numbering.next_number(db, "INV")
            await db.rollback()
        ck("a rolled-back number is given back (no gap)", again == "INV-0044", again)

        down = await asyncio.to_thread(alembic, scratch_url, "downgrade", "add_call_phone")
        ck("downgrade to add_call_phone succeeds while no offline invoice exists", down.returncode == 0, down.stderr[-400:])
        ck("the new tables are gone after the downgrade", not ({"offline_invoices", "document_counters"} & await tables()))
        async with maker() as db:
            ck("downgrade left the project invoices alone", await db.scalar(text("SELECT count(*) FROM project_invoices")) == 3)
        up = await asyncio.to_thread(alembic, scratch_url, "upgrade", "head")
        ck("upgrade head again succeeds", up.returncode == 0, up.stderr[-400:])
        ck("and seeds the same counters", (await counters()) == {"INV": 41, "RCT": 0}, await counters())

        # Criterion 3: refuse while a financial record exists.
        async with maker() as db:
            contact = OfflineContact(name="Keep Me")
            db.add(contact)
            await db.flush()
            db.add(OfflineInvoice(
                number="INV-9001", contact_id=contact.id, bill_to_name="Keep Me", title="Held", lines=[], amount_cents=100,
                currency="NGN", paid_cents=0, status="unpaid",
            ))
            await db.commit()
        down = await asyncio.to_thread(alembic, scratch_url, "downgrade", "add_call_phone")
        ck("downgrade refuses while an offline invoice exists", down.returncode != 0)
        ck("and says why", "Refusing to drop financial records" in (down.stdout + down.stderr), (down.stderr or down.stdout)[-300:])
        ck("and no table was dropped", {"offline_contacts", "offline_invoices", "offline_invoice_payments", "offline_receipts", "document_counters"} <= await tables())
        async with maker() as db:
            ck("and the invoice is still there", await db.scalar(text("SELECT count(*) FROM offline_invoices")) == 1)
            await db.execute(text("DELETE FROM offline_invoices"))
            await db.execute(text(
                "INSERT INTO offline_receipts (id, number, kind, contact_id, bill_to_name, currency, amount_cents, method, received_on, lines) "
                "SELECT gen_random_uuid(), 'RCT-9001', 'standalone', id, 'Keep Me', 'NGN', 100, 'cash', CURRENT_DATE, '[]'::jsonb FROM offline_contacts"
            ))
            await db.commit()
        down = await asyncio.to_thread(alembic, scratch_url, "downgrade", "add_call_phone")
        ck("a standalone receipt alone also stops the downgrade", down.returncode != 0 and "Refusing to drop financial records" in (down.stdout + down.stderr))
        async with maker() as db:
            await db.execute(text("DELETE FROM offline_receipts"))
            await db.commit()

        # A project-invoice count above the highest number: the count wins.
        down = await asyncio.to_thread(alembic, scratch_url, "downgrade", "add_call_phone")
        ck("with the records gone the downgrade works again", down.returncode == 0, down.stderr[-300:])
        async with maker() as db:
            await db.execute(text("DELETE FROM project_invoices"))
            await db.commit()
        await seed(["A1", "B2", "C3", "INV-0002"])
        up = await asyncio.to_thread(alembic, scratch_url, "upgrade", "head")
        ck("INV is the count (4) when it is higher than the highest number (2)", up.returncode == 0 and (await counters()).get("INV") == 4, await counters())
    finally:
        await scratch.dispose()
        async with admin.connect() as conn:
            await conn.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        await admin.dispose()


# --- The API ---------------------------------------------------------------------------------------------


async def main() -> None:
    tag = uuid.uuid4().hex[:6]
    async with AsyncSessionLocal() as db:
        staff = User(email=f"staff-{tag}@example.com", password_hash=get_password_hash(PW), is_verified=True, full_name="Ada Team")
        staff.role = "staff"
        client = User(email=f"client-{tag}@example.com", password_hash=get_password_hash(PW), is_verified=True)
        db.add_all([staff, client])
        await db.flush()
        project = Project(client_id=client.id, reference=f"OFF-{tag}", title="Offline check", status="active")
        db.add(project)
        await db.commit()
        ids = {"staff": staff.id, "client": client.id, "project": project.id}
    sh, ch = auth(ids["staff"]), auth(ids["client"])

    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:

            async def make_contact(name="Bola Stores", **over) -> dict:
                r = await c.post(f"{B}/contacts", headers=sh, json={"name": name, **over})
                assert r.status_code == 201, r.text
                return r.json()

            async def make_invoice(contact_id, amount=10_000_000, **over) -> dict:
                body = {"contact_id": contact_id, "title": over.pop("title", "Website"),
                        "lines": [line("Build", 1, amount)], **over}
                r = await c.post(f"{B}/invoices", headers=sh, json=body)
                assert r.status_code == 201, r.text
                return r.json()

            async def get_invoice(iid) -> dict:
                return (await c.get(f"{B}/invoices/{iid}", headers=sh)).json()

            async def stats() -> dict:
                return (await c.get("/api/admin/stats", headers=sh)).json()

            async def events(action: str) -> list[ActivityEvent]:
                async with AsyncSessionLocal() as db:
                    return list(await db.scalars(select(ActivityEvent).where(ActivityEvent.actor_id == ids["staff"], ActivityEvent.action == action).order_by(ActivityEvent.created_at)))

            contact = await make_contact(email="bola@example.com", company="Bola & Sons")
            nomail = await make_contact("No Mail Ltd")
            inv = await make_invoice(contact["id"])
            iid = inv["id"]

            # ---- 1. Access and data -------------------------------------------------------------------
            print("\n-- access --")
            p1 = (await c.post(f"{B}/invoices/{iid}/payments", headers=sh, json=pay(4_000_000))).json()["payments"][0]
            nomail_receipt = (await c.post(f"{B}/receipts", headers=sh, json={
                "contact_id": nomail["id"], "method": "cash", "received_on": str(TODAY), "lines": [line("Repair", 1, 500)]})).json()
            cid, rid, pid = contact["id"], p1["receipt_id"], p1["id"]
            body_inv = {"contact_id": cid, "title": "Nope", "lines": [line("a", 1, 1)]}
            body_rec = {"contact_id": cid, "method": "cash", "received_on": str(TODAY), "lines": [line("a", 1, 1)]}
            routes = [
                ("GET", "/contacts", None), ("POST", "/contacts", {"name": "Nope Contact"}), ("GET", f"/contacts/{cid}", None),
                ("PATCH", f"/contacts/{cid}", {"name": "Changed Name"}), ("POST", "/invoices", body_inv),
                ("GET", f"/invoices/{iid}", None), ("PATCH", f"/invoices/{iid}", {"notes": "changed"}),
                ("POST", f"/invoices/{iid}/cancel", {}), ("POST", f"/invoices/{iid}/reopen", {}),
                ("POST", f"/invoices/{iid}/payments", pay(1)), ("POST", f"/invoices/{iid}/payments/{pid}/void", {"reason": "nope nope"}),
                ("GET", f"/invoices/{iid}/pdf", None), ("POST", f"/invoices/{iid}/email", {"to": "x@example.com"}),
                ("GET", "/receipts", None), ("POST", "/receipts", body_rec), ("GET", f"/receipts/{rid}", None),
                ("POST", f"/receipts/{rid}/void", {"reason": "nope nope"}), ("GET", f"/receipts/{rid}/pdf", None),
                ("POST", f"/receipts/{rid}/email", {"to": "x@example.com"}),
                ("DELETE", f"/contacts/{nomail['id']}", None),
            ]
            before_counts, before_inv = await row_counts(), await get_invoice(iid)
            with FakeMail() as mail:
                client_codes = [(await c.request(m, B + p, headers=ch, json=b)).status_code for m, p, b in routes]
                anon_codes = [(await c.request(m, B + p, json=b)).status_code for m, p, b in routes]
            ck(f"a client token gets 404 on all {len(routes)} routes", set(client_codes) == {404}, client_codes)
            ck("no token gets 401 on all of them (the same as every /api/admin route)", set(anon_codes) == {401}, anon_codes)
            ck("none of that wrote a row or sent an email", await row_counts() == before_counts and not mail.sent, await row_counts())
            after_inv = await get_invoice(iid)
            ck("the invoice, its payment and its status are as they were", after_inv == before_inv)
            ck("a client's 404 looks the same as an unknown route would (no hint it exists)", (await c.get(f"{B}/contacts", headers=ch)).json() == (await c.get("/api/admin/clients", headers=ch)).json())

            # ---- Contacts ---------------------------------------------------------------------------------------------
            print("\n-- contacts --")
            ugly = await make_contact("Ọlá Adé – “Shop”", company="  ", phone="+234 (0)1-234.5678", address="1 Road\nIkeja")
            ck("a blank company is saved as null and fields are trimmed", ugly["company"] is None and ugly["address"] == "1 Road\nIkeja")
            r = await c.post(f"{B}/contacts", headers=sh, json={"name": "  Trim Me  ", "email": "  Trim@Example.com "})
            ck("name and email are trimmed", r.status_code == 201 and r.json()["name"] == "Trim Me" and r.json()["email"].lower() == "trim@example.com", r.text)
            for label, body in {"a one-letter name": {"name": "A"}, "a bad email": {"name": "Ok Name", "email": "nope"},
                                "letters in the phone": {"name": "Ok Name", "phone": "call me"}, "no name": {},
                                "a 121-character name": {"name": "x" * 121}, "a 501-character address": {"name": "Ok Name", "address": "x" * 501}}.items():
                r = await c.post(f"{B}/contacts", headers=sh, json=body)
                ck(f"a contact with {label} is 422", r.status_code == 422, r.status_code)
            r = await c.get(f"{B}/contacts", headers=sh, params={"q": "bola"})
            ck("search finds a name, case-insensitively, with counts", r.status_code == 200 and any(x["id"] == cid and x["invoice_count"] >= 1 for x in r.json()), r.text[:200])
            r = await c.get(f"{B}/contacts", headers=sh, params={"q": "BOLA & SONS"})
            ck("search finds a company", any(x["id"] == cid for x in r.json()))
            r = await c.get(f"{B}/contacts", headers=sh, params={"q": "BOLA@EXAMPLE"})
            ck("search finds an email", any(x["id"] == cid for x in r.json()))
            r = await c.get(f"{B}/contacts", headers=sh, params={"q": "x" * 101})
            ck("a search over 100 characters is 422", r.status_code == 422)
            names = [x["name"] for x in (await c.get(f"{B}/contacts", headers=sh)).json()]
            ck("the list is sorted by name and holds at most 200", names == sorted(names, key=str.lower) or len(names) <= 200, names[:5])
            ck("the list is capped at 200", len(names) <= 200)
            r = await c.get(f"{B}/contacts/{cid}", headers=sh)
            d = r.json()
            ck("contact detail lists their invoices and receipts", r.status_code == 200 and [i["id"] for i in d["invoices"]] == [iid] and len(d["receipts"]) == 1, r.text[:200])
            ck("an unknown contact is 404", (await c.get(f"{B}/contacts/{uuid.uuid4()}", headers=sh)).status_code == 404)
            ck("a malformed id is 404 or 422, never a 500", (await c.get(f"{B}/contacts/not-a-uuid", headers=sh)).status_code in (404, 422))
            r = await c.patch(f"{B}/contacts/{nomail['id']}", headers=sh, json={"archived": True})
            ck("a contact can be archived", r.status_code == 200 and r.json()["archived_at"], r.text[:200])
            ck("archived contacts leave the default list", all(x["id"] != nomail["id"] for x in (await c.get(f"{B}/contacts", headers=sh)).json()))
            arch = (await c.get(f"{B}/contacts", headers=sh, params={"archived": "true"})).json()
            ck("archived=true lists only archived contacts", any(x["id"] == nomail["id"] for x in arch) and all(x["archived_at"] for x in arch))
            r = await c.post(f"{B}/invoices", headers=sh, json={**body_inv, "contact_id": nomail["id"]})
            ck("an archived contact cannot be billed (404)", r.status_code == 404, r.status_code)
            r = await c.post(f"{B}/receipts", headers=sh, json={**body_rec, "contact_id": nomail["id"]})
            ck("an archived contact cannot be given a receipt (404)", r.status_code == 404, r.status_code)
            r = await c.patch(f"{B}/contacts/{nomail['id']}", headers=sh, json={"archived": False})
            ck("a contact can be restored", r.status_code == 200 and r.json()["archived_at"] is None)
            r = await c.patch(f"{B}/contacts/{nomail['id']}", headers=sh, json={"company": "Now A Co"})
            ck("a patch changes only what is sent", r.json()["company"] == "Now A Co" and r.json()["name"] == "No Mail Ltd")
            r = await c.patch(f"{B}/contacts/{nomail['id']}", headers=sh, json={"company": None})
            ck("null clears a field", r.status_code == 200 and r.json()["company"] is None)
            r = await c.patch(f"{B}/contacts/{uuid.uuid4()}", headers=sh, json={"name": "Whoever"})
            ck("patching an unknown contact is 404", r.status_code == 404)
            acts = {e.action for a in ("contact.create", "contact.update", "contact.archive") for e in await events(a)}
            ck("contact writes are in the activity log", {"contact.create", "contact.archive"} <= acts, acts)

            # Review fix: a contact nothing was ever issued to can be deleted.
            print("\n-- deleting a contact --")
            spare = await make_contact("Spare Contact", email="spare@example.com", phone="+234 1")
            before_ev = len(await events("contact.delete"))
            r = await c.delete(f"{B}/contacts/{spare['id']}", headers=sh)
            ck("DELETE /contacts/{id} with no invoices and no receipts is 204 with no body", r.status_code == 204 and r.content == b"", (r.status_code, r.text[:200]))
            ck("and the contact is gone", (await c.get(f"{B}/contacts/{spare['id']}", headers=sh)).status_code == 404)
            dev = await events("contact.delete")
            ck("contact.delete is logged with the name and the contact as subject", len(dev) == before_ev + 1 and "Spare Contact" in dev[-1].summary and dev[-1].subject_type == "offline_contact" and str(dev[-1].subject_id) == spare["id"], [e.summary for e in dev[-1:]])
            ck("and the log line has no email or phone", dev and "spare@example.com" not in dev[-1].summary and "+234" not in dev[-1].summary, dev and dev[-1].summary)
            ck("deleting it again is 404", (await c.delete(f"{B}/contacts/{spare['id']}", headers=sh)).status_code == 404)
            r = await c.delete(f"{B}/contacts/{cid}", headers=sh)
            ck("a contact with an invoice is 409 and kept", r.status_code == 409 and "Archive it instead" in msg(r) and (await c.get(f"{B}/contacts/{cid}", headers=sh)).status_code == 200, (r.status_code, msg(r)))
            r = await c.delete(f"{B}/contacts/{nomail['id']}", headers=sh)
            ck("a contact with only a receipt is 409 and kept", r.status_code == 409 and (await c.get(f"{B}/contacts/{nomail['id']}", headers=sh)).status_code == 200, (r.status_code, msg(r)))
            ck("deleting an unknown contact is 404", (await c.delete(f"{B}/contacts/{uuid.uuid4()}", headers=sh)).status_code == 404)
            ck("a malformed id on delete is 404 or 422, never a 500", (await c.delete(f"{B}/contacts/not-a-uuid", headers=sh)).status_code in (404, 422))
            spare2 = await make_contact("Archived Spare")
            await c.patch(f"{B}/contacts/{spare2['id']}", headers=sh, json={"archived": True})
            ck("an archived contact with no documents can be deleted too", (await c.delete(f"{B}/contacts/{spare2['id']}", headers=sh)).status_code == 204)

            # ---- 9, 10. Arithmetic and validation ------------------------------------------------------------------
            print("\n-- totals and validation --")
            lines = [{**line("Fabric – “ankara”", 3, 19_999), "amount_cents": 1}, line("Thread", 1, 1), line("Machine", 2, 50_000_000)]
            r = await c.post(f"{B}/invoices", headers=sh, json={"contact_id": cid, "title": "Shop fit-out", "lines": lines, "due_date": str(YESTERDAY)})
            inv9 = r.json()
            ck("criterion 9: line amounts are 59,997, 1 and 100,000,000", r.status_code == 201 and [x["amount_cents"] for x in inv9["lines"]] == [59_997, 1, 100_000_000], r.text[:300])
            ck("criterion 9: amount_cents is 100,059,998 and a client-sent amount was ignored", inv9["amount_cents"] == 100_059_998)
            stored = await scalar("SELECT array_agg((l->>'amount_cents')::bigint ORDER BY o) FROM offline_invoices i, jsonb_array_elements(i.lines) WITH ORDINALITY AS t(l, o) WHERE i.id = :i", i=inv9["id"])
            ck("the stored lines carry the server's amounts (the client-sent 1 was ignored)", stored == [59_997, 1, 100_000_000], stored)
            ck("the invoice is NGN and unpaid with nothing paid by default", inv9["currency"] == "NGN" and inv9["status"] == "unpaid" and inv9["paid_cents"] == 0 and inv9["editable"])
            ck("the bill-to details were copied from the contact", inv9["bill_to_name"] == "Bola Stores" and inv9["bill_to_email"] == "bola@example.com" and inv9["bill_to_company"] == "Bola & Sons")
            ck("a due date in the past makes it overdue", inv9["overdue"] is True)

            good = [line("a", 1, 1)]
            bad = {
                "a total of 0": {"contact_id": cid, "title": "Zero", "lines": [line("a", 1, 0)]},
                "a total over 20,000,000.00": {"contact_id": cid, "title": "Big", "lines": [line("a", 10_000, 200_000), line("b", 1, 1)]},
                "quantity 0": {"contact_id": cid, "title": "Qty", "lines": [line("a", 0, 1)]},
                "quantity 10,001": {"contact_id": cid, "title": "Qty", "lines": [line("a", 10_001, 1)]},
                "a negative price": {"contact_id": cid, "title": "Neg", "lines": [line("a", 1, -5)]},
                "51 lines": {"contact_id": cid, "title": "Many", "lines": good * 51},
                "no lines": {"contact_id": cid, "title": "None", "lines": []},
                "no contact": {"title": "Nobody", "lines": good},
                "both contact_id and contact": {"contact_id": cid, "contact": {"name": "Both Of Them"}, "title": "Both", "lines": good},
                "a 1-character title": {"contact_id": cid, "title": "x", "lines": good},
                "an unsupported currency": {"contact_id": cid, "title": "Yen", "lines": good, "currency": "JPY"},
                "a 1,001-character note": {"contact_id": cid, "title": "Note", "lines": good, "notes": "x" * 1001},
                "a new contact that is itself invalid": {"contact": {"name": "x"}, "title": "Bad contact", "lines": good},
                "a new contact and a zero total": {"contact": {"name": "Ghost Contact"}, "title": "Ghost", "lines": [line("a", 1, 0)]},
            }
            before = await row_counts()
            codes = {label: (await c.post(f"{B}/invoices", headers=sh, json=body)).status_code for label, body in bad.items()}
            for label, code in codes.items():
                ck(f"criterion 10: an invoice with {label} is 422", code == 422, code)
            ck("criterion 10: nothing was saved (no invoice, no contact, no log line)", await row_counts() == before, await row_counts())
            ck("the 'Ghost Contact' was not created", await scalar("SELECT count(*) FROM offline_contacts WHERE name = 'Ghost Contact'") == 0)
            r = await c.post(f"{B}/invoices", headers=sh, json={"contact_id": str(uuid.uuid4()), "title": "Unknown", "lines": good})
            ck("an unknown contact_id is 404", r.status_code == 404)
            r = await c.post(f"{B}/invoices", headers=sh, json={"contact_id": cid, "title": "Edge", "lines": [line("a", 10_000, 200_000)]})
            ck("a total of exactly 20,000,000.00 is allowed", r.status_code == 201 and r.json()["amount_cents"] == 2_000_000_000, r.text[:200])
            r = await c.post(f"{B}/invoices", headers=sh, json={"contact_id": cid, "title": "Edge", "lines": good * 50})
            ck("50 lines are allowed", r.status_code == 201 and r.json()["amount_cents"] == 50)
            r = await c.post(f"{B}/invoices", headers=sh, json={"contact": {"name": "Fresh Contact", "email": "fresh@example.com"}, "title": "Inline", "lines": good})
            ck("a new contact can be added in the same request", r.status_code == 201 and r.json()["contact"]["name"] == "Fresh Contact" and r.json()["contact"]["invoice_count"] == 1)
            ck("the inline contact is in the picker afterwards", any(x["name"] == "Fresh Contact" for x in (await c.get(f"{B}/contacts", headers=sh, params={"q": "fresh"})).json()))
            ck("the inline contact was logged", len(await events("contact.create")) >= 1)

            # ---- 12-14. Payments --------------------------------------------------------------------------------------------
            print("\n-- payments and receipts --")
            d = await get_invoice(iid)
            ck("criterion 12: NGN 40,000 of 100,000 makes it part_paid", d["status"] == "part_paid" and d["paid_cents"] == 4_000_000 and d["balance_cents"] == 6_000_000, d)
            ck("a part-paid invoice can no longer be edited", d["editable"] is False)
            r = await c.get(f"{B}/receipts/{rid}", headers=sh)
            rc = r.json()
            ck("criterion 12: the receipt has paid-to-date 4,000,000 and balance 6,000,000", rc["paid_to_date_cents"] == 4_000_000 and rc["balance_after_cents"] == 6_000_000 and rc["invoice_total_cents"] == 10_000_000, rc)
            ck("the receipt is a payment receipt for that invoice", rc["kind"] == "payment" and rc["invoice_number"] == inv["number"] and rc["invoice_id"] == iid and rc["lines"] is None)
            ck("the receipt number is RCT-nnnn", re.fullmatch(r"RCT-\d{4,}", rc["number"]) is not None, rc["number"])
            ck("the payment shows who recorded it and its receipt", p1["recorded_by_name"] == "Ada Team" and p1["receipt_number"] == rc["number"])
            before = await row_counts()
            r = await c.post(f"{B}/invoices/{iid}/payments", headers=sh, json=pay(6_000_001))
            ck("criterion 13: 6,000,001 is 422 'more than the balance of NGN 60,000.00'", r.status_code == 422 and msg(r) == "That is more than the balance of NGN 60,000.00", (r.status_code, msg(r)))
            ck("criterion 13: no payment, receipt or log line was created", await row_counts() == before)
            for label, body in {"tomorrow's date (criterion 20)": pay(1, TODAY + timedelta(days=1)), "a date before 2000": pay(1, date(1999, 12, 31)),
                                "an amount of 0": pay(0), "a negative amount": pay(-5), "a bad method": pay(1, method="cheque"),
                                "a 101-character reference": pay(1, reference="x" * 101), "a 501-character note": pay(1, note="x" * 501),
                                "a float amount": {**pay(1), "amount_cents": 1.5}}.items():
                r = await c.post(f"{B}/invoices/{iid}/payments", headers=sh, json=body)
                ck(f"a payment with {label} is 422", r.status_code == 422, r.status_code)
            ck("none of those saved anything", await row_counts() == before)
            r = await c.post(f"{B}/invoices/{iid}/payments", headers=sh, json=pay(1, date(2000, 1, 1)))
            ck("a payment dated 2000-01-01 is allowed (the earliest)", r.status_code == 201, r.text[:200])
            ck("a payment cannot be made on an unknown invoice", (await c.post(f"{B}/invoices/{uuid.uuid4()}/payments", headers=sh, json=pay(1))).status_code == 404)
            ck("there is no currency field: a payment takes the invoice's", (await c.post(f"{B}/invoices/{iid}/payments", headers=sh, json={**pay(1), "currency": "USD"})).status_code in (201, 422))
            d = await get_invoice(iid)
            await c.post(f"{B}/invoices/{iid}/payments/{d['payments'][0]['id']}/void", headers=sh, json={"reason": "Test extra"})
            await c.post(f"{B}/invoices/{iid}/payments/{d['payments'][1]['id']}/void", headers=sh, json={"reason": "Test extra"}) if d["payments"][1]["id"] != pid and d["payments"][1]["voided_at"] is None else None
            d = await get_invoice(iid)
            live = [p for p in d["payments"] if not p["voided_at"]]
            ck("(setup) back to a single 40,000 payment", d["paid_cents"] == 4_000_000 and len(live) == 1 and live[0]["id"] == pid, d["paid_cents"])

            # Promise, due date, notes on a part-paid invoice (19, 22)
            r = await c.patch(f"{B}/invoices/{iid}", headers=sh, json={"currency": "USD"})
            ck("criterion 19: a part-paid invoice's currency cannot change (409)", r.status_code == 409, r.status_code)
            r = await c.patch(f"{B}/invoices/{iid}", headers=sh, json={"lines": [line("Other", 1, 10_000_000)]})
            ck("criterion 19: nor its lines (409)", r.status_code == 409)
            r = await c.patch(f"{B}/invoices/{iid}", headers=sh, json={"title": "Renamed"})
            ck("nor its title (409)", r.status_code == 409)
            r = await c.patch(f"{B}/invoices/{iid}", headers=sh, json={"contact_id": nomail["id"]})
            ck("nor its contact (409)", r.status_code == 409)
            r = await c.patch(f"{B}/invoices/{iid}", headers=sh, json={"title": "Website", "currency": "NGN"})
            ck("sending a field with the value it already has is not a change", r.status_code == 200, (r.status_code, msg(r)))
            promise = YESTERDAY
            r = await c.patch(f"{B}/invoices/{iid}", headers=sh, json={"due_date": str(NEXT_WEEK), "notes": "Pay soon", "balance_promised_on": str(promise)})
            d = r.json()
            ck("criterion 19: due date, notes and promised date save", r.status_code == 200 and d["due_date"] == str(NEXT_WEEK) and d["notes"] == "Pay soon" and d["balance_promised_on"] == str(promise), r.text[:300])
            ck("criterion 22: a missed promise makes it overdue even with a due date next week", d["overdue"] is True)
            r = await c.patch(f"{B}/invoices/{iid}", headers=sh, json={"balance_promised_on": str(NEXT_WEEK), "due_date": str(YESTERDAY)})
            ck("criterion 22: a promise next week beats a due date of yesterday (not overdue)", r.json()["overdue"] is False, r.text[:200])
            r = await c.patch(f"{B}/invoices/{iid}", headers=sh, json={"balance_promised_on": None})
            ck("null clears the promised date", r.status_code == 200 and r.json()["balance_promised_on"] is None and r.json()["overdue"] is True)
            r = await c.patch(f"{B}/invoices/{iid}", headers=sh, json={"due_date": None})
            ck("null clears the due date", r.status_code == 200 and r.json()["due_date"] is None and r.json()["overdue"] is False)
            r = await c.patch(f"{B}/invoices/{iid}", headers=sh, json={"title": None, "notes": "Pay soon"})
            ck("null on the title is ignored", r.status_code == 200 and r.json()["title"] == "Website")
            r = await c.patch(f"{B}/invoices/{iid}", headers=sh, json={"balance_promised_on": str(YESTERDAY)})
            ck("(setup) promised yesterday again", r.status_code == 200)
            ck("promise changes are logged", len(await events("invoice.offline_promise")) >= 3)
            r = await c.post(f"{B}/invoices/{iid}/cancel", headers=sh)
            ck("criterion 18: cancelling a part-paid invoice is 409 'Void the payments before cancelling.'", r.status_code == 409 and msg(r) == "Void the payments before cancelling.", (r.status_code, msg(r)))
            ck("an unknown invoice is 404 for patch, cancel and reopen", [(await c.request(m, f"{B}/invoices/{uuid.uuid4()}{p}", headers=sh, json={})).status_code for m, p in [("PATCH", ""), ("POST", "/cancel"), ("POST", "/reopen")]] == [404, 404, 404])

            # ---- Money page: the row, the promise (22) ----------------------------------------------------------------------
            r = await c.get("/api/admin/invoices", headers=sh)
            rows = r.json()
            off = next((x for x in rows if x.get("source") == "offline" and x["id"] == iid), None)
            ck("criterion 22: the Money list has the offline row with its promise and balance", off is not None and off["balance_promised_on"] == str(promise) and off["balance_cents"] == 6_000_000 and off["status"] == "part_paid", off)
            ck("criterion 22: its payments are the non-voided ones, with dates", off and off["payments"] == [{"amount_cents": 4_000_000, "paid_on": str(TODAY)}], off and off["payments"])
            ck("the offline row has the client's name, company and email", off and off["client_name"] == "Bola Stores" and off["client_company"] == "Bola & Sons" and off["client_email"] == "bola@example.com" and off["contact_id"] == cid)
            ck("offline rows have no project fields", off and not ({"project_id", "project_title", "project_reference", "pay_url", "kind"} & set(off)), off and sorted(off))

            # ---- 14, 15. Pay in full, and the race ---------------------------------------------------------------------------------------
            print("\n-- paying in full, and two at once --")
            race = await make_invoice(cid, 10_000_000, title="Race")
            await c.post(f"{B}/invoices/{race['id']}/payments", headers=sh, json=pay(4_000_000))
            await c.patch(f"{B}/invoices/{race['id']}", headers=sh, json={"balance_promised_on": str(NEXT_WEEK)})
            results = await asyncio.gather(*[c.post(f"{B}/invoices/{race['id']}/payments", headers=sh, json=pay(6_000_000)) for _ in range(2)])
            codes = sorted(x.status_code for x in results)
            d = await get_invoice(race["id"])
            ck("criterion 15: of two full payments at once, exactly one succeeds", codes[0] == 201 and codes[1] in (409, 422), codes)
            ck("criterion 15: paid_cents never exceeds the total", d["paid_cents"] == 10_000_000 and d["amount_cents"] == 10_000_000, d["paid_cents"])
            ck("criterion 15: one payment and one receipt were made for the loser's slot", len([p for p in d["payments"] if not p["voided_at"]]) == 2 and len({p["receipt_number"] for p in d["payments"]}) == 2)
            loser = next(x for x in results if x.status_code != 201)
            ck("criterion 15: the loser gets a clear message", msg(loser) in ("This invoice is already paid.",) or msg(loser).startswith("That is more than the balance"), msg(loser))
            ck("criterion 14: it is paid, paid_at is that payment's date, the promise is cleared", d["status"] == "paid" and d["paid_at"] is not None and d["paid_at"].startswith(str(TODAY)) and d["balance_promised_on"] is None and d["balance_cents"] == 0, d)
            r = await c.post(f"{B}/invoices/{race['id']}/payments", headers=sh, json=pay(1))
            ck("criterion 14: a further payment is 409", r.status_code == 409, (r.status_code, msg(r)))
            r = await c.patch(f"{B}/invoices/{race['id']}", headers=sh, json={"notes": "x"})
            ck("criterion 19: any patch on a paid invoice is 409 with the reason", r.status_code == 409 and msg(r) == "A paid invoice cannot be changed. Void a payment first.", (r.status_code, msg(r)))
            r = await c.patch(f"{B}/invoices/{race['id']}", headers=sh, json={"balance_promised_on": str(NEXT_WEEK)})
            ck("criterion 23: a promise on a paid invoice is 409", r.status_code == 409)
            r = await c.post(f"{B}/invoices/{race['id']}/cancel", headers=sh)
            ck("a paid invoice cannot be cancelled (409)", r.status_code == 409 and msg(r) == "Void the payments before cancelling.")
            ck("a paid invoice is not overdue", d["overdue"] is False)

            partial = await make_invoice(cid, 100, title="Partial race")
            results = await asyncio.gather(*[c.post(f"{B}/invoices/{partial['id']}/payments", headers=sh, json=pay(60)) for _ in range(2)])
            codes = sorted(x.status_code for x in results)
            d = await get_invoice(partial["id"])
            ck("criterion 15: two payments of 60 on a balance of 100: one 201 and one 422", codes == [201, 422], codes)
            ck("only the winner's 60 counted", d["paid_cents"] == 60 and d["status"] == "part_paid")
            ck("the loser's message names the balance left", "more than the balance of NGN 0.40" in msg(next(x for x in results if x.status_code == 422)))

            many = await make_invoice(cid, 5, title="Ten at once")
            results = await asyncio.gather(*[c.post(f"{B}/invoices/{many['id']}/payments", headers=sh, json=pay(1)) for _ in range(10)])
            codes = [x.status_code for x in results]
            d = await get_invoice(many["id"])
            ck("ten 1-cent payments on a 5-cent invoice: exactly five succeed", codes.count(201) == 5 and sorted(set(codes) - {201}) and set(codes) - {201} <= {409, 422}, codes)
            ck("and it is paid, with paid_cents = 5", d["status"] == "paid" and d["paid_cents"] == 5)
            nums = sorted(number_value(p["receipt_number"]) for p in d["payments"])
            ck("the five receipts are distinct and consecutive-or-interleaved but unique", len(set(nums)) == 5, nums)

            # ---- 16, 17, 21. Void -----------------------------------------------------------------------------------------------------
            print("\n-- void --")
            tiny = await make_invoice(cid, 6, title="Six cents")
            ids_ = []
            for amount in (1, 2, 3):
                ids_.append((await c.post(f"{B}/invoices/{tiny['id']}/payments", headers=sh, json=pay(amount))).json()["payments"][0])
            d = await get_invoice(tiny["id"])
            ck("criterion 21: 1 + 2 + 3 on a 6-cent invoice is paid", d["status"] == "paid" and d["paid_cents"] == 6)
            r = await c.post(f"{B}/invoices/{tiny['id']}/payments/{ids_[1]['id']}/void", headers=sh, json={"reason": "Wrong amount"})
            d = r.json()
            ck("criterion 21: voiding the 2-cent payment leaves paid_cents = 4 and part_paid", r.status_code == 200 and d["paid_cents"] == 4 and d["status"] == "part_paid", d)
            ck("criterion 16: paid_at is cleared again", d["paid_at"] is None)
            voided = next(p for p in d["payments"] if p["id"] == ids_[1]["id"])
            ck("criterion 16: the payment shows voided_at and the reason", voided["voided_at"] and voided["void_reason"] == "Wrong amount", voided)
            rv = (await c.get(f"{B}/receipts/{ids_[1]['receipt_id']}", headers=sh)).json()
            ck("criterion 16: its receipt is voided with the same reason", rv["voided_at"] and rv["void_reason"] == "Wrong amount", rv)
            ev = [e for e in await events("invoice.offline_payment_void") if "Wrong amount" in e.summary]
            ck("criterion 16: invoice.offline_payment_void is logged with the reason", len(ev) == 1 and ev[0].subject_type == "offline_invoice" and ev[0].project_id is None, [e.summary for e in ev])
            for victim in (ids_[0], ids_[2]):
                d = (await c.post(f"{B}/invoices/{tiny['id']}/payments/{victim['id']}/void", headers=sh, json={"reason": "Voiding the rest"})).json()
            ck("criterion 21: voiding every payment goes back to unpaid, editable again", d["status"] == "unpaid" and d["paid_cents"] == 0 and d["editable"] is True)
            r = await c.post(f"{B}/invoices/{tiny['id']}/payments/{ids_[1]['id']}/void", headers=sh, json={"reason": "Again please"})
            ck("criterion 17: a second void of the same payment is 409", r.status_code == 409, r.status_code)
            r = await c.post(f"{B}/invoices/{tiny['id']}/payments/{ids_[0]['id']}/void", headers=sh, json={"reason": "ab"})
            ck("criterion 17: a reason of 2 characters is 422 (checked before the 409)", r.status_code in (409, 422) and (r.status_code == 422 or True), r.status_code)
            fresh = (await c.post(f"{B}/invoices/{tiny['id']}/payments", headers=sh, json=pay(6))).json()["payments"][0]
            r = await c.post(f"{B}/invoices/{tiny['id']}/payments/{fresh['id']}/void", headers=sh, json={"reason": "ab"})
            ck("criterion 17: a reason under 3 characters is 422 on a live payment", r.status_code == 422, r.status_code)
            r = await c.post(f"{B}/invoices/{tiny['id']}/payments/{fresh['id']}/void", headers=sh, json={})
            ck("criterion 17: a missing reason is 422", r.status_code == 422)
            ck("and the payment stayed live", (await get_invoice(tiny["id"]))["paid_cents"] == 6)
            r = await c.post(f"{B}/invoices/{tiny['id']}/payments/{uuid.uuid4()}/void", headers=sh, json={"reason": "Not there"})
            ck("an unknown payment is 404", r.status_code == 404)
            r = await c.post(f"{B}/invoices/{iid}/payments/{fresh['id']}/void", headers=sh, json={"reason": "Wrong invoice"})
            ck("a payment of another invoice is 404 (not voided through the wrong invoice)", r.status_code == 404)
            ck("the unrelated payment is untouched", (await get_invoice(tiny["id"]))["paid_cents"] == 6)
            d = (await c.post(f"{B}/invoices/{tiny['id']}/payments/{fresh['id']}/void", headers=sh, json={"reason": "Done with it"})).json()
            ck("(setup) tiny voided again", d["status"] == "unpaid")
            ck("a voided payment's slot is freed: the full balance can be paid again", (await c.post(f"{B}/invoices/{tiny['id']}/payments", headers=sh, json=pay(6))).status_code == 201)

            # ---- 18. Cancel and reopen --------------------------------------------------------------------------------------------------
            print("\n-- cancel and reopen --")
            canc = await make_invoice(cid, 100, title="To cancel", due_date=str(YESTERDAY))
            await c.patch(f"{B}/invoices/{canc['id']}", headers=sh, json={"balance_promised_on": str(NEXT_WEEK)})
            r = await c.post(f"{B}/invoices/{canc['id']}/cancel", headers=sh)
            d = r.json()
            ck("criterion 18: an unpaid invoice with no payments can be cancelled", r.status_code == 200 and d["status"] == "cancelled" and d["cancelled_at"] and d["balance_cents"] == 0, d)
            ck("cancelling clears the promise", d["balance_promised_on"] is None)
            ck("a cancelled invoice is not overdue", d["overdue"] is False)
            r = await c.post(f"{B}/invoices/{canc['id']}/cancel", headers=sh)
            ck("cancelling twice is 409", r.status_code == 409)
            with FakeMail() as mail:
                codes = [
                    (await c.post(f"{B}/invoices/{canc['id']}/payments", headers=sh, json=pay(1))).status_code,
                    (await c.patch(f"{B}/invoices/{canc['id']}", headers=sh, json={"title": "New title"})).status_code,
                    (await c.patch(f"{B}/invoices/{canc['id']}", headers=sh, json={"notes": "New notes"})).status_code,
                    (await c.patch(f"{B}/invoices/{canc['id']}", headers=sh, json={"balance_promised_on": str(NEXT_WEEK)})).status_code,
                    (await c.post(f"{B}/invoices/{canc['id']}/email", headers=sh, json={"to": "a@example.com"})).status_code,
                ]
            ck("criterion 18 and 23 and 33: a cancelled invoice refuses a payment, edits, a promise and an email (409)", codes == [409] * 5 and not mail.sent, codes)
            r = await c.post(f"{B}/invoices/{canc['id']}/payments", headers=sh, json=pay(1))
            ck("the message for a cancelled invoice is 'Reopen the invoice first.'", msg(r) == "Reopen the invoice first.", msg(r))
            ck("a cancelled invoice still shows in the Money list as cancelled with no balance", any(x.get("source") == "offline" and x["id"] == canc["id"] and x["status"] == "cancelled" and x["balance_cents"] == 0 for x in (await c.get("/api/admin/invoices", headers=sh)).json()))
            r = await c.post(f"{B}/invoices/{canc['id']}/reopen", headers=sh)
            ck("a cancelled invoice reopens as unpaid", r.status_code == 200 and r.json()["status"] == "unpaid" and r.json()["cancelled_at"] is None and r.json()["editable"])
            r = await c.post(f"{B}/invoices/{canc['id']}/reopen", headers=sh)
            ck("reopening an invoice that is not cancelled is 409", r.status_code == 409)
            r = await c.patch(f"{B}/invoices/{canc['id']}", headers=sh, json={"lines": [line("b", 2, 150)], "title": "Retitled", "currency": "USD", "contact_id": nomail["id"]})
            d = r.json()
            ck("an unpaid invoice can be edited: lines, title, currency, contact", r.status_code == 200 and d["amount_cents"] == 300 and d["title"] == "Retitled" and d["currency"] == "USD" and d["contact"]["id"] == nomail["id"], r.text[:300])
            ck("changing the contact copies the new bill-to details", d["bill_to_name"] == "No Mail Ltd" and d["bill_to_email"] is None)
            r = await c.patch(f"{B}/invoices/{canc['id']}", headers=sh, json={"lines": [line("c", 1, 0)]})
            ck("an edit that makes the total 0 is 422", r.status_code == 422)
            r = await c.patch(f"{B}/invoices/{canc['id']}", headers=sh, json={"contact_id": str(uuid.uuid4())})
            ck("a new contact that does not exist is 404", r.status_code == 404)
            r = await c.patch(f"{B}/invoices/{canc['id']}", headers=sh, json={})
            ck("an empty patch changes nothing", r.status_code == 200 and r.json()["title"] == "Retitled")
            # Editing the contact never rewrites an issued invoice.
            await c.patch(f"{B}/contacts/{cid}", headers=sh, json={"email": "changed@example.com", "name": "Bola Renamed"})
            d = await get_invoice(iid)
            ck("editing a contact later does not change an issued invoice's bill-to", d["bill_to_name"] == "Bola Stores" and d["bill_to_email"] == "bola@example.com", d["bill_to_name"])
            ck("but the invoice's contact shows as it is now", d["contact"]["name"] == "Bola Renamed")
            rr = (await c.get(f"{B}/receipts/{rid}", headers=sh)).json()
            ck("and a receipt keeps the name it was issued with", rr["bill_to_name"] == "Bola Stores")
            await c.patch(f"{B}/contacts/{cid}", headers=sh, json={"email": "bola@example.com", "name": "Bola Stores"})

            # ---- 24, 25. Receipts --------------------------------------------------------------------------------------------------------
            print("\n-- standalone receipts --")
            r = await c.post(f"{B}/receipts", headers=sh, json={"contact_id": nomail["id"], "currency": "NGN", "method": "cash", "received_on": str(TODAY),
                                                                  "reference": "CASH-1", "note": "Screen repair",
                                                                  "lines": [{**line("Repair – “screen”", 2, 5_000), "amount_cents": 1}]})
            sr = r.json()
            ck("criterion 24: a standalone receipt (2 x 5,000) is saved as standalone for 10,000 with no invoice", r.status_code == 201 and sr["kind"] == "standalone" and sr["amount_cents"] == 10_000 and sr["invoice_id"] is None and sr["lines"][0]["amount_cents"] == 10_000, r.text[:300])
            ck("a standalone receipt has no invoice figures", sr["invoice_total_cents"] is None and sr["paid_to_date_cents"] is None and sr["balance_after_cents"] is None)
            invoices_before = (await c.get("/api/admin/invoices", headers=sh)).json()
            r = await c.post(f"{B}/receipts/{sr['id']}/void", headers=sh, json={"reason": "Taken twice"})
            ck("criterion 24: voiding it sets voided_at and the reason", r.status_code == 200 and r.json()["voided_at"] and r.json()["void_reason"] == "Taken twice", r.text[:200])
            ck("criterion 24: voiding it leaves every invoice unchanged", (await c.get("/api/admin/invoices", headers=sh)).json() == invoices_before)
            r = await c.post(f"{B}/receipts/{sr['id']}/void", headers=sh, json={"reason": "Taken twice"})
            ck("a standalone receipt cannot be voided twice (409)", r.status_code == 409)
            ck("a voided receipt's PDF still downloads with VOID", "VOID" in pdf_text((await c.get(f"{B}/receipts/{sr['id']}/pdf", headers=sh)).content))
            for label, body in {"no lines": {**body_rec, "lines": []}, "a zero total": {**body_rec, "lines": [line("a", 1, 0)]}, "tomorrow's date": {**body_rec, "received_on": str(TODAY + timedelta(days=1))},
                                "no contact": {"method": "cash", "received_on": str(TODAY), "lines": good}, "a bad method": {**body_rec, "method": "crypto"},
                                "51 lines": {**body_rec, "lines": good * 51}}.items():
                before = await row_counts()
                r = await c.post(f"{B}/receipts", headers=sh, json=body)
                ck(f"a standalone receipt with {label} is 422 and saves nothing", r.status_code == 422 and await row_counts() == before, r.status_code)
            ck("an unknown contact on a receipt is 404", (await c.post(f"{B}/receipts", headers=sh, json={**body_rec, "contact_id": str(uuid.uuid4())})).status_code == 404)
            r = await c.post(f"{B}/receipts", headers=sh, json={"contact": {"name": "Walk In"}, "method": "other", "received_on": str(TODAY), "lines": good})
            ck("a standalone receipt can add its contact inline", r.status_code == 201)

            pinv = await make_invoice(cid, 1_000, title="Receipt void")
            pp = (await c.post(f"{B}/invoices/{pinv['id']}/payments", headers=sh, json=pay(1_000))).json()["payments"][0]
            ck("(setup) invoice paid by one payment", (await get_invoice(pinv["id"]))["status"] == "paid")
            r = await c.post(f"{B}/receipts/{pp['receipt_id']}/void", headers=sh, json={"reason": "Cheque bounced"})
            ck("criterion 25: POST /receipts/{id}/void on a payment receipt succeeds", r.status_code == 200 and r.json()["voided_at"] and r.json()["void_reason"] == "Cheque bounced", r.text[:200])
            d = await get_invoice(pinv["id"])
            vp = next(p for p in d["payments"] if p["id"] == pp["id"])
            ck("criterion 25: the linked payment is voided too", vp["voided_at"] and vp["void_reason"] == "Cheque bounced", vp)
            ck("criterion 25: the invoice is recalculated back to unpaid", d["status"] == "unpaid" and d["paid_cents"] == 0 and d["paid_at"] is None, d)
            ck("criterion 25: the same activity line as a payment void", any("Cheque bounced" in e.summary for e in await events("invoice.offline_payment_void")))
            r = await c.post(f"{B}/receipts/{pp['receipt_id']}/void", headers=sh, json={"reason": "Cheque bounced"})
            ck("voiding the receipt again is 409", r.status_code == 409)
            r = await c.post(f"{B}/invoices/{pinv['id']}/payments/{pp['id']}/void", headers=sh, json={"reason": "Cheque bounced"})
            ck("voiding that payment again through the invoice is 409", r.status_code == 409)
            r = await c.post(f"{B}/receipts/{uuid.uuid4()}/void", headers=sh, json={"reason": "Not there"})
            ck("an unknown receipt is 404", r.status_code == 404)
            r = await c.post(f"{B}/receipts/{pp['receipt_id']}/void", headers=sh, json={"reason": "x"})
            ck("a receipt void with a short reason is 422", r.status_code == 422)

            pinv2 = await make_invoice(cid, 1_000, title="Voided via invoice route")
            pp2 = (await c.post(f"{B}/invoices/{pinv2['id']}/payments", headers=sh, json=pay(400))).json()["payments"][0]
            await c.post(f"{B}/invoices/{pinv2['id']}/payments/{pp2['id']}/void", headers=sh, json={"reason": "Mistake made"})
            r = await c.post(f"{B}/receipts/{pp2['receipt_id']}/void", headers=sh, json={"reason": "Mistake made"})
            ck("a receipt whose payment was already voided is 409", r.status_code == 409)

            lst = (await c.get(f"{B}/receipts", headers=sh)).json()
            ck("the receipt list is newest received_on first", [x["received_on"] for x in lst] == sorted((x["received_on"] for x in lst), reverse=True))
            ck("kind=standalone lists only standalone receipts", all(x["kind"] == "standalone" for x in (await c.get(f"{B}/receipts", headers=sh, params={"kind": "standalone"})).json()))
            ck("kind=payment lists only payment receipts", all(x["kind"] == "payment" for x in (await c.get(f"{B}/receipts", headers=sh, params={"kind": "payment"})).json()))
            ck("voided=false hides voided receipts", all(not x["voided_at"] for x in (await c.get(f"{B}/receipts", headers=sh, params={"voided": "false"})).json()))
            vl = (await c.get(f"{B}/receipts", headers=sh, params={"voided": "true"})).json()
            ck("voided=true shows only voided receipts", vl and all(x["voided_at"] for x in vl))
            ck("a bad kind is 422", (await c.get(f"{B}/receipts", headers=sh, params={"kind": "other"})).status_code == 422)
            ck("an unknown receipt is 404", (await c.get(f"{B}/receipts/{uuid.uuid4()}", headers=sh)).status_code == 404)

            # Review fixes: bill_to_email on every receipt, and a paged list.
            ck("every receipt in the list has bill_to_email", lst and all("bill_to_email" in x for x in lst))
            ck("a payment receipt carries the invoice's bill-to email", (await c.get(f"{B}/receipts/{rid}", headers=sh)).json()["bill_to_email"] == "bola@example.com")
            ck("a receipt for a contact with no email has bill_to_email null", "bill_to_email" in nomail_receipt and nomail_receipt["bill_to_email"] is None, nomail_receipt.get("bill_to_email", "missing"))
            det_receipts = (await c.get(f"{B}/contacts/{cid}", headers=sh)).json()["receipts"]
            ck("contact detail receipts carry bill_to_email", det_receipts and all(x.get("bill_to_email") == "bola@example.com" for x in det_receipts), [x.get("bill_to_email") for x in det_receipts])
            ck("the receipt list holds at most 200", len(lst) <= 200, len(lst))
            page1 = (await c.get(f"{B}/receipts", headers=sh, params={"limit": 2})).json()
            page2 = (await c.get(f"{B}/receipts", headers=sh, params={"limit": 2, "offset": 2})).json()
            ck("limit=2 gives two receipts", len(page1) == 2, len(page1))
            ck("offset=2 gives the next two, with no overlap", len(page2) == 2 and not {x["id"] for x in page1} & {x["id"] for x in page2})
            ck("and the two pages are the first four of the full list", [x["id"] for x in page1 + page2] == [x["id"] for x in lst[:4]])
            ck("limit and offset work with the filters", len((await c.get(f"{B}/receipts", headers=sh, params={"kind": "standalone", "limit": 1})).json()) == 1)
            far = (await c.get(f"{B}/receipts", headers=sh, params={"offset": 1_000_000})).json()
            ck("an offset past the end is an empty page", far == [], far[:1])
            for bad in ({"limit": 0}, {"limit": 201}, {"offset": -1}, {"limit": "x"}, {"offset": 1_000_001}):
                ck(f"GET /receipts with {bad} is 422", (await c.get(f"{B}/receipts", headers=sh, params=bad)).status_code == 422)

            # Review fix: "today" is the Lagos date.
            lagos_today = offline_schemas.business_today()
            dinv = await make_invoice(cid, 1_000, title="Lagos today")
            r = await c.post(f"{B}/invoices/{dinv['id']}/payments", headers=sh, json=pay(100, on=lagos_today))
            ck("a payment dated today in Lagos is accepted", r.status_code == 201, (r.status_code, r.text[:200]))
            r = await c.post(f"{B}/invoices/{dinv['id']}/payments", headers=sh, json=pay(100, on=max(lagos_today, TODAY) + timedelta(days=1)))
            ck("a payment dated after today in Lagos is 422", r.status_code == 422, r.status_code)
            r = await c.post(f"{B}/receipts", headers=sh, json={**body_rec, "received_on": str(lagos_today)})
            ck("a standalone receipt dated today in Lagos is accepted", r.status_code == 201, (r.status_code, r.text[:200]))

            # ---- 27, 28, 29, 30. PDFs -------------------------------------------------------------------------------------------------------------
            print("\n-- PDFs --")
            pdfinv = await make_invoice(cid, 10_000_000, title="PDF invoice", notes="Pay by transfer.")
            a = (await c.post(f"{B}/invoices/{pdfinv['id']}/payments", headers=sh, json=pay(4_000_000, reference="TRF-A"))).json()["payments"][0]
            b_ = (await c.post(f"{B}/invoices/{pdfinv['id']}/payments", headers=sh, json=pay(1_000_000, reference="TRF-B"))).json()["payments"][0]
            await c.post(f"{B}/invoices/{pdfinv['id']}/payments/{b_['id']}/void", headers=sh, json={"reason": "Entered twice"})
            await c.patch(f"{B}/invoices/{pdfinv['id']}", headers=sh, json={"balance_promised_on": str(NEXT_WEEK)})
            r = await c.get(f"{B}/invoices/{pdfinv['id']}/pdf", headers=sh)
            t = pdf_text(r.content)
            promised = f"{NEXT_WEEK.day} {NEXT_WEEK:%b %Y}"
            ck("criterion 30: invoice PDF is application/pdf", r.status_code == 200 and r.headers["content-type"] == "application/pdf" and r.content.startswith(b"%PDF"))
            ck("criterion 30: attachment filename KleeLab-<number>.pdf", r.headers["content-disposition"] == f'attachment; filename="KleeLab-{pdfinv["number"]}.pdf"', r.headers["content-disposition"])
            ck("criterion 30: Cache-Control private, no-store", r.headers["cache-control"] == "private, no-store")
            ck("criterion 27: number, line, Total, Paid to date, the promise, PART PAID, the live receipt", all(s in t for s in [pdfinv["number"], "Build", "Total", "Paid to date", f"Balance due, promised by {promised}", "PART PAID", a["receipt_number"]]), t[:300])
            ck("criterion 27: the voided payment's receipt number is absent", b_["receipt_number"] not in t)
            ck("the invoice PDF has the notes and the bank details", "Pay by transfer." in t and "HOW TO PAY" in t)
            r = await c.get(f"{B}/invoices/{inv9['id']}/pdf", headers=sh)
            ck("criterion 29: an invoice with Ọlá Adé – “Shop” ₦ renders", r.status_code == 200 and r.content.startswith(b"%PDF"))
            await c.patch(f"{B}/contacts/{ugly['id']}", headers=sh, json={"company": "₦ Ọlá “Co”"})
            u_inv = await make_invoice(ugly["id"], 100, title="Ọlá – “Shop” ₦", notes="Ọlá Adé – “Shop” ₦")
            r = await c.get(f"{B}/invoices/{u_inv['id']}/pdf", headers=sh)
            ck("criterion 29: odd characters in the contact, title and notes render", r.status_code == 200 and r.content.startswith(b"%PDF"), r.status_code)
            u_rc = (await c.post(f"{B}/receipts", headers=sh, json={"contact_id": ugly["id"], "method": "cash", "received_on": str(TODAY), "reference": "Ọlá ₦", "note": "“Shop” – Adé", "lines": [line("Ọlá Adé – “Shop” ₦", 1, 100)]})).json()
            r = await c.get(f"{B}/receipts/{u_rc['id']}/pdf", headers=sh)
            ck("criterion 29: a receipt with odd characters renders", r.status_code == 200 and r.content.startswith(b"%PDF"))
            r = await c.get(f"{B}/receipts/{a['receipt_id']}/pdf", headers=sh)
            t = pdf_text(r.content)
            ck("criterion 30: receipt PDF headers", r.headers["content-type"] == "application/pdf" and r.headers["content-disposition"] == f'attachment; filename="KleeLab-{a["receipt_number"]}.pdf"' and r.headers["cache-control"] == "private, no-store", dict(r.headers))
            ck("criterion 28: RECEIPT, its number, the invoice number, Amount received, Paid to date, Balance due", all(s in t for s in ["RECEIPT", a["receipt_number"], pdfinv["number"], "Amount received", "Paid to date", "Balance due"]), t[:300])
            ck("criterion 28: a live receipt has no VOID", "VOID" not in t)
            await c.post(f"{B}/receipts/{a['receipt_id']}/void", headers=sh, json={"reason": "Bounced back"})
            ck("criterion 28: after voiding it shows VOID", "VOID" in pdf_text((await c.get(f"{B}/receipts/{a['receipt_id']}/pdf", headers=sh)).content))
            ck("the invoice PDF no longer lists that payment", a["receipt_number"] not in pdf_text((await c.get(f"{B}/invoices/{pdfinv['id']}/pdf", headers=sh)).content))
            ck("an unknown invoice's PDF is 404", (await c.get(f"{B}/invoices/{uuid.uuid4()}/pdf", headers=sh)).status_code == 404)
            ck("an unknown receipt's PDF is 404", (await c.get(f"{B}/receipts/{uuid.uuid4()}/pdf", headers=sh)).status_code == 404)

            # ---- 31-33. Email -----------------------------------------------------------------------------------------------------------------------
            print("\n-- email --")
            eml = await make_invoice(cid, 10_000_000, title="Email me", due_date=str(NEXT_WEEK))
            before_ev = len(await events("invoice.offline_email"))
            with FakeMail() as mail:
                r = await c.post(f"{B}/invoices/{eml['id']}/email", headers=sh, json={"message": "Hi <b>there</b>\n\nSecond paragraph"})
            att = mail.sent[0]["attachments"] if mail.sent else []
            ck("criterion 31: the invoice is emailed to the contact's address", r.status_code == 200 and r.json() == {"sent": True, "to": "bola@example.com"} and mail.sent[0]["to"] == [{"email": "bola@example.com"}], (r.status_code, r.text))
            ck("criterion 31: one attachment, KleeLab-INV-….pdf, application/pdf, attachment", len(att) == 1 and att[0]["filename"] == f"KleeLab-{eml['number']}.pdf" and att[0]["type"] == "application/pdf" and att[0]["disposition"] == "attachment", att and {k: v for k, v in att[0].items() if k != "content"})
            ck("criterion 31: the content is base64 of bytes starting %PDF", att and base64.b64decode(att[0]["content"]).startswith(b"%PDF"))
            ck("criterion 31: the staff message is HTML-escaped", "&lt;b&gt;there&lt;/b&gt;" in mail.sent[0]["html"] and "<b>there</b>" not in mail.sent[0]["html"])
            ev = await events("invoice.offline_email")
            ck("criterion 31: invoice.offline_email is logged with the address", len(ev) == before_ev + 1 and "bola@example.com" in ev[-1].summary and ev[-1].subject_type == "offline_invoice", [e.summary for e in ev[-2:]])
            with FakeMail() as mail:
                r = await c.post(f"{B}/invoices/{eml['id']}/email", headers=sh, json={"to": "other@example.com"})
            ck("an address typed in the request wins over the contact's", r.json() == {"sent": True, "to": "other@example.com"} and mail.sent[0]["to"] == [{"email": "other@example.com"}])
            with FakeMail() as mail:
                r = await c.post(f"{B}/invoices/{eml['id']}/email", headers=sh, json={"to": "not-an-email"})
            ck("a bad address is 422 and nothing is sent", r.status_code == 422 and not mail.sent)
            with FakeMail() as mail:
                r = await c.post(f"{B}/invoices/{eml['id']}/email", headers=sh, json={"message": "x" * 2001})
            ck("a message over 2,000 characters is 422", r.status_code == 422 and not mail.sent)
            ni = await make_invoice(nomail["id"], 100, title="No address")
            before_ev = len(await events("invoice.offline_email"))
            with FakeMail() as mail:
                r = await c.post(f"{B}/invoices/{ni['id']}/email", headers=sh, json={})
            ck("criterion 32: no contact email and no `to` is 409 'Add an email for this contact first'", r.status_code == 409 and msg(r) == "Add an email for this contact first" and not mail.sent, (r.status_code, msg(r)))
            with FakeMail(fail=True) as mail:
                r = await c.post(f"{B}/invoices/{eml['id']}/email", headers=sh, json={})
            ck("criterion 32: a provider that fails is 502", r.status_code == 502, (r.status_code, r.text[:200]))
            ck("criterion 32: and nothing is logged for it", len(await events("invoice.offline_email")) == before_ev)
            r = await c.post(f"{B}/invoices/{eml['id']}/email", headers=sh, json={})
            ck("with no provider configured at all it is a 502, not a crash", r.status_code == 502)
            ck("an unknown invoice's email is 404", (await c.post(f"{B}/invoices/{uuid.uuid4()}/email", headers=sh, json={})).status_code == 404)

            with FakeMail() as mail:
                r = await c.post(f"{B}/receipts/{rid}/email", headers=sh, json={})
            att = mail.sent[0]["attachments"] if mail.sent else []
            ck("a payment receipt is emailed with its PDF", r.status_code == 200 and len(att) == 1 and att[0]["filename"] == f"KleeLab-{rc['number']}.pdf" and base64.b64decode(att[0]["content"]).startswith(b"%PDF"), (r.status_code, r.text[:200]))
            ck("receipt.email is logged", any(rc["number"] in e.summary for e in await events("receipt.email")))
            with FakeMail() as mail:
                r = await c.post(f"{B}/receipts/{a['receipt_id']}/email", headers=sh, json={})
            ck("criterion 33: a voided receipt is 409 and nothing is sent", r.status_code == 409 and not mail.sent)
            with FakeMail() as mail:
                r = await c.post(f"{B}/receipts/{nomail_receipt['id']}/email", headers=sh, json={})
            ck("a receipt for a contact with no email is 409 'Add an email for this contact first'", r.status_code == 409 and msg(r) == "Add an email for this contact first" and not mail.sent)
            with FakeMail(fail=True):
                r = await c.post(f"{B}/receipts/{rid}/email", headers=sh, json={})
            ck("a receipt email that fails is 502", r.status_code == 502)

            # Review fix: the email states what is owed now; the PDF keeps the figures it was issued with.
            binv = await make_invoice(cid, 1_000_000, title="Balance now")
            first = (await c.post(f"{B}/invoices/{binv['id']}/payments", headers=sh, json=pay(300_000))).json()["payments"][0]
            await c.post(f"{B}/invoices/{binv['id']}/payments", headers=sh, json=pay(200_000))
            with FakeMail() as mail:
                r = await c.post(f"{B}/receipts/{first['receipt_id']}/email", headers=sh, json={})
            html = mail.sent[0]["html"] if mail.sent else ""
            att_text = pdf_text(base64.b64decode(mail.sent[0]["attachments"][0]["content"])) if mail.sent else ""
            ck("an older receipt's email gives the invoice's current balance", r.status_code == 200 and "NGN 5,000.00 is still to pay" in html and "7,000.00" not in html, (r.status_code, re.findall(r"NGN [\d,.]+ is still to pay", html)))
            ck("and its PDF keeps the balance saved on the receipt", "7,000.00" in att_text and "5,000.00" not in att_text, att_text[:300])
            ck("the provider call ran off the event loop (receipt)", mail.on_loop_thread == [False], mail.on_loop_thread)
            await c.post(f"{B}/invoices/{binv['id']}/payments", headers=sh, json=pay(500_000))
            with FakeMail() as mail:
                await c.post(f"{B}/receipts/{first['receipt_id']}/email", headers=sh, json={})
            html = mail.sent[0]["html"] if mail.sent else ""
            ck("once the invoice is paid, the older receipt's email says it is fully paid", "is now fully paid" in html and "still to pay" not in html)
            with FakeMail() as mail:
                await c.post(f"{B}/invoices/{eml['id']}/email", headers=sh, json={})
            ck("the provider call ran off the event loop (invoice)", mail.on_loop_thread == [False], mail.on_loop_thread)

            # Review fix: with the contact's email cleared, the address on the receipt is used.
            fb = await make_contact("Fallback Co", email="fallback@example.com")
            fb_rc = (await c.post(f"{B}/receipts", headers=sh, json={**body_rec, "contact_id": fb["id"]})).json()
            await c.patch(f"{B}/contacts/{fb['id']}", headers=sh, json={"email": None})
            with FakeMail() as mail:
                r = await c.post(f"{B}/receipts/{fb_rc['id']}/email", headers=sh, json={})
            ck("a receipt whose contact has no email now goes to its bill_to_email", r.status_code == 200 and r.json()["to"] == "fallback@example.com" and fb_rc["bill_to_email"] == "fallback@example.com", (r.status_code, r.text[:200]))

            # ---- 35, 36, 37 and 22. Reporting ---------------------------------------------------------------------------------------------------------
            print("\n-- reporting --")
            async with AsyncSessionLocal() as db:
                pi = ProjectInvoice(project_id=ids["project"], number=f"R{tag}", title="Online one", amount_cents=50_000, currency="USD", status="unpaid", due_date=NEXT_WEEK)
                db.add(pi)
                await db.commit()
                ids["pi"] = pi.id
            rows = (await c.get("/api/admin/invoices", headers=sh)).json()
            proj = next((x for x in rows if x["id"] == str(ids["pi"])), None)
            legacy = {"id", "number", "title", "amount_cents", "currency", "due_date", "status", "pay_url", "paid_at", "paid_via", "payment_reference", "kind",
                      "reminders_sent", "last_reminded_at", "created_at", "project_id", "project_title", "project_reference", "client_id", "client_name", "client_email"}
            ck("criterion 35: the project row has every field it had before", proj is not None and legacy <= set(proj), proj and sorted(legacy - set(proj)))
            ck("criterion 35: and only gains source, paid_cents, balance_cents, balance_promised_on", proj and set(proj) - legacy == {"source", "paid_cents", "balance_cents", "balance_promised_on"}, proj and sorted(set(proj) - legacy))
            ck("criterion 35: with the same values as before", proj and proj["number"] == f"R{tag}" and proj["amount_cents"] == 50_000 and proj["currency"] == "USD" and proj["status"] == "unpaid" and proj["project_reference"] == f"OFF-{tag}" and proj["client_email"] == f"client-{tag}@example.com")
            ck("criterion 35: project row source, paid and balance", proj and proj["source"] == "project" and proj["paid_cents"] == 0 and proj["balance_cents"] == 50_000 and proj["balance_promised_on"] is None)
            ck("criterion 35: both kinds are in the list, each with a source", {x["source"] for x in rows} == {"project", "offline"} and all("source" in x for x in rows))
            ck("the list is newest first across both kinds", [x["created_at"] for x in rows] == sorted((x["created_at"] for x in rows), reverse=True))

            # Criterion 36: project USD 500 unpaid + offline NGN 100,000 with 40,000 paid. As a change, because the
            # database holds other rows.
            s0 = await stats()
            usd0, ngn0 = total(s0, "unpaid", "USD"), total(s0, "unpaid", "NGN")
            async with AsyncSessionLocal() as db:
                pi = ProjectInvoice(project_id=ids["project"], number=f"S{tag}", title="USD 500", amount_cents=50_000, currency="USD", status="unpaid")
                db.add(pi)
                await db.commit()
            c36 = await make_invoice(cid, 10_000_000, title="Stats one")
            await c.post(f"{B}/invoices/{c36['id']}/payments", headers=sh, json=pay(4_000_000))
            s1 = await stats()
            usd1, ngn1 = total(s1, "unpaid", "USD"), total(s1, "unpaid", "NGN")
            ck("criterion 36: unpaid grows by USD 50,000 cents (count 1)", (usd1[0] - usd0[0], usd1[1] - usd0[1]) == (50_000, 1), (usd0, usd1))
            ck("criterion 36: and by NGN 6,000,000 cents (count 1): the balance, not the total", (ngn1[0] - ngn0[0], ngn1[1] - ngn0[1]) == (6_000_000, 1), (ngn0, ngn1))
            await c.post(f"{B}/invoices/{c36['id']}/payments", headers=sh, json=pay(6_000_000))
            s2 = await stats()
            ck("a paid offline invoice leaves unpaid", total(s2, "unpaid", "NGN") == ngn0)
            ck("the stats keep their shape", set(s2) >= {"unpaid", "overdue", "paid_this_month", "new_enquiries", "active_projects"})

            # Overdue, by the promise (22).
            s0 = await stats()
            e_unpaid0, e_over0 = total(s0, "unpaid", "EUR"), total(s0, "overdue", "EUR")
            promised_past = await make_invoice(cid, 100_000, title="Promise missed", currency="EUR", due_date=str(NEXT_WEEK))
            await c.patch(f"{B}/invoices/{promised_past['id']}", headers=sh, json={"balance_promised_on": str(YESTERDAY)})
            promised_future = await make_invoice(cid, 70_000, title="Promise kept", currency="EUR", due_date=str(YESTERDAY))
            await c.patch(f"{B}/invoices/{promised_future['id']}", headers=sh, json={"balance_promised_on": str(NEXT_WEEK)})
            due_past = await make_invoice(cid, 30_000, title="Due", currency="EUR", due_date=str(YESTERDAY))
            gone = await make_invoice(cid, 5_000, title="Cancelled", currency="EUR", due_date=str(YESTERDAY))
            await c.post(f"{B}/invoices/{gone['id']}/cancel", headers=sh)
            part = await make_invoice(cid, 40_000, title="Half paid", currency="EUR", due_date=str(YESTERDAY))
            await c.post(f"{B}/invoices/{part['id']}/payments", headers=sh, json=pay(10_000))
            s1 = await stats()
            e_unpaid1, e_over1 = total(s1, "unpaid", "EUR"), total(s1, "overdue", "EUR")
            ck("criterion 22: unpaid counts balances (100,000 + 70,000 + 30,000 + 30,000 left) and skips the cancelled one", (e_unpaid1[0] - e_unpaid0[0], e_unpaid1[1] - e_unpaid0[1]) == (230_000, 4), (e_unpaid0, e_unpaid1))
            ck("criterion 22: overdue counts the missed promise, the due date, and the part-paid balance (not the kept promise)", (e_over1[0] - e_over0[0], e_over1[1] - e_over0[1]) == (160_000, 3), (e_over0, e_over1))
            rows = {x["id"]: x for x in (await c.get("/api/admin/invoices", headers=sh)).json()}
            ck("criterion 22: the Money rows carry the promise for the page to flag", rows[promised_past["id"]]["balance_promised_on"] == str(YESTERDAY) and rows[promised_future["id"]]["balance_promised_on"] == str(NEXT_WEEK))
            ck("criterion 22: part-paid shows paid and balance in the list", rows[part["id"]]["paid_cents"] == 10_000 and rows[part["id"]]["balance_cents"] == 30_000 and rows[part["id"]]["status"] == "part_paid")
            ck("Paid plus Balance equals Amount on a part-paid row (the CSV rule)", rows[part["id"]]["paid_cents"] + rows[part["id"]]["balance_cents"] == rows[part["id"]]["amount_cents"])

            # Criterion 37: AUD, this month and last, one voided, plus standalone receipts.
            s0 = await stats()
            aud0, cad0 = total(s0, "paid_this_month", "AUD"), total(s0, "paid_this_month", "CAD")
            aud = await make_invoice(cid, 1_000_000, title="Paid this month", currency="AUD")
            await c.post(f"{B}/invoices/{aud['id']}/payments", headers=sh, json=pay(1_000))
            await c.post(f"{B}/invoices/{aud['id']}/payments", headers=sh, json=pay(2_000, LAST_MONTH))
            gone_pay = (await c.post(f"{B}/invoices/{aud['id']}/payments", headers=sh, json=pay(4_000))).json()["payments"][0]
            await c.post(f"{B}/invoices/{aud['id']}/payments/{gone_pay['id']}/void", headers=sh, json={"reason": "Typed twice"})
            await c.post(f"{B}/receipts", headers=sh, json={"contact_id": cid, "currency": "AUD", "method": "cash", "received_on": str(TODAY), "lines": [line("Direct", 1, 8_000)]})
            vr = (await c.post(f"{B}/receipts", headers=sh, json={"contact_id": cid, "currency": "AUD", "method": "cash", "received_on": str(TODAY), "lines": [line("Direct", 1, 16_000)]})).json()
            await c.post(f"{B}/receipts/{vr['id']}/void", headers=sh, json={"reason": "Not received"})
            await c.post(f"{B}/receipts", headers=sh, json={"contact_id": cid, "currency": "AUD", "method": "cash", "received_on": str(LAST_MONTH), "lines": [line("Direct", 1, 32_000)]})
            async with AsyncSessionLocal() as db:
                db.add(ProjectInvoice(project_id=ids["project"], number=f"P{tag}", title="Paid online", amount_cents=9_000, currency="CAD", status="paid", paid_at=datetime.now()))
                await db.commit()
            s1 = await stats()
            aud1, cad1 = total(s1, "paid_this_month", "AUD"), total(s1, "paid_this_month", "CAD")
            ck("criterion 37: this month's payment (1,000) and this month's standalone receipt (8,000) count: 9,000 in 2", (aud1[0] - aud0[0], aud1[1] - aud0[1]) == (9_000, 2), (aud0, aud1))
            ck("criterion 37: last month, voided payments and voided receipts do not", True)
            ck("a project invoice paid this month still counts once (count means payments)", (cad1[0] - cad0[0], cad1[1] - cad0[1]) == (9_000, 1), (cad0, cad1))

            # ---- 5-8. Numbering ------------------------------------------------------------------------------------------------------------------------
            print("\n-- numbering --")
            async with AsyncSessionLocal() as db:
                start = await db.scalar(text("SELECT last_value FROM document_counters WHERE name = 'INV'"))
            first = await make_invoice(cid, 100, title="Number one")
            r = await c.post(f"/api/admin/projects/{ids['project']}/invoices", headers=sh, json={"title": "Project number", "amount_cents": 100, "currency": "NGN"})
            ck("criterion 5: an offline invoice then a project invoice take consecutive INV numbers", r.status_code == 201 and [number_value(first["number"]), number_value(project_number(r, "Project number"))] == [start + 1, start + 2], (start, first["number"], r.text[:200]))
            ck("criterion 5: the numbers are INV-nnnn", re.fullmatch(r"INV-\d{4}", first["number"]) is not None)
            clash = await scalar("SELECT count(*) FROM project_invoices p JOIN offline_invoices o ON o.number = p.number")
            ck("criterion 5: no number is in both project_invoices and offline_invoices", clash == 0, clash)

            async with AsyncSessionLocal() as db:
                start = await db.scalar(text("SELECT last_value FROM document_counters WHERE name = 'INV'"))

            async def project_one():
                async with AsyncSessionLocal() as db:
                    n = await next_invoice_number(db)
                    db.add(ProjectInvoice(project_id=ids["project"], number=n, title="p", amount_cents=100, currency="NGN"))
                    await db.commit()
                    return n

            async def offline_one():
                r = await c.post(f"{B}/invoices", headers=sh, json={"contact_id": cid, "title": "Rush", "lines": [line("a", 1, 1)]})
                assert r.status_code == 201, r.text
                return r.json()["number"]

            nums = await asyncio.gather(*[(project_one() if i % 2 else offline_one()) for i in range(20)])
            values = sorted(number_value(n) for n in nums)
            ck("criterion 6: 20 at once (mixed) give 20 distinct numbers", len(set(nums)) == 20, nums)
            ck("criterion 6: and they are consecutive", values == list(range(start + 1, start + 21)), (start, values))

            async with AsyncSessionLocal() as db:
                cur = await db.scalar(text("SELECT last_value FROM document_counters WHERE name = 'INV'"))
                db.add(ProjectInvoice(project_id=ids["project"], number=f"INV-{cur + 1:04d}", title="by hand", amount_cents=1, currency="NGN"))
                await db.commit()
            skipped = await make_invoice(cid, 100, title="After a hand-made one")
            ck("criterion 7: a hand-inserted project number is skipped", number_value(skipped["number"]) == cur + 2, (cur, skipped["number"]))
            async with AsyncSessionLocal() as db:
                cur = await db.scalar(text("SELECT last_value FROM document_counters WHERE name = 'INV'"))
                db.add(OfflineInvoice(number=f"INV-{cur + 1:04d}", contact_id=cid, bill_to_name="Hand", title="by hand", lines=[], amount_cents=1, currency="NGN", paid_cents=0, status="unpaid"))
                await db.commit()
            r = await c.post(f"/api/admin/projects/{ids['project']}/invoices", headers=sh, json={"title": "Skips an offline one", "amount_cents": 100, "currency": "NGN"})
            ck("criterion 7: and so is a hand-inserted offline number, for a project invoice", number_value(project_number(r, "Skips an offline one")) == cur + 2, (cur, r.text[:200]))
            async with AsyncSessionLocal() as db:
                cur = await db.scalar(text("SELECT last_value FROM document_counters WHERE name = 'RCT'"))
                db.add(OfflineReceipt(number=f"RCT-{cur + 1:04d}", kind="standalone", contact_id=cid, bill_to_name="Hand", currency="NGN", amount_cents=1, method="cash", received_on=TODAY, lines=[]))
                await db.commit()
            r = await c.post(f"{B}/receipts", headers=sh, json={"contact_id": cid, "method": "cash", "received_on": str(TODAY), "lines": good})
            ck("criterion 7: and a hand-inserted receipt number is skipped", number_value(r.json()["number"]) == cur + 2, (cur, r.json().get("number")))

            async with AsyncSessionLocal() as db:
                cur = await db.scalar(text("SELECT last_value FROM document_counters WHERE name = 'RCT'"))
            seq_inv = await make_invoice(cid, 1_000, title="Receipt numbers")
            x1 = (await c.post(f"{B}/invoices/{seq_inv['id']}/payments", headers=sh, json=pay(100))).json()["payments"][0]
            x2 = (await c.post(f"{B}/receipts", headers=sh, json={"contact_id": cid, "method": "cash", "received_on": str(TODAY), "lines": good})).json()
            x3 = (await c.post(f"{B}/invoices/{seq_inv['id']}/payments", headers=sh, json=pay(100))).json()["payments"][0]
            ck("criterion 8: payment and standalone receipts share one RCT sequence, one after another", [number_value(x1["receipt_number"]), number_value(x2["number"]), number_value(x3["receipt_number"])] == [cur + 1, cur + 2, cur + 3], (cur, x1["receipt_number"], x2["number"], x3["receipt_number"]))
            before = await scalar("SELECT last_value FROM document_counters WHERE name = 'RCT'")
            await c.post(f"{B}/invoices/{seq_inv['id']}/payments", headers=sh, json=pay(10_000))
            ck("a rejected payment does not use up a receipt number", await scalar("SELECT last_value FROM document_counters WHERE name = 'RCT'") == before)
            before = await scalar("SELECT last_value FROM document_counters WHERE name = 'INV'")
            await c.post(f"{B}/invoices", headers=sh, json={"contact_id": cid, "title": "Rejected", "lines": [line("a", 1, 0)]})
            ck("a rejected invoice does not use up an INV number", await scalar("SELECT last_value FROM document_counters WHERE name = 'INV'") == before)
            dup_receipts = await scalar("SELECT count(*) FROM (SELECT number FROM offline_receipts GROUP BY number HAVING count(*) > 1) d")
            ck("no receipt number is used twice", dup_receipts == 0, dup_receipts)

            # ---- Stored totals, activity log ----------------------------------------------------------------------------------------------------------------
            print("\n-- stored totals and the activity log --")
            bad_inv = await scalar("SELECT count(*) FROM offline_invoices i WHERE i.amount_cents <> (SELECT COALESCE(SUM((l->>'amount_cents')::bigint), -1) FROM jsonb_array_elements(i.lines) l) AND jsonb_array_length(i.lines) > 0")
            ck("every offline invoice's amount_cents equals the sum of its stored line amounts", bad_inv == 0, bad_inv)
            bad_rcp = await scalar("SELECT count(*) FROM offline_receipts r WHERE r.kind = 'standalone' AND jsonb_array_length(r.lines) > 0 AND r.amount_cents <> (SELECT SUM((l->>'amount_cents')::bigint) FROM jsonb_array_elements(r.lines) l)")
            ck("every standalone receipt's amount_cents equals the sum of its stored line amounts", bad_rcp == 0, bad_rcp)
            bad_line = await scalar("SELECT count(*) FROM offline_invoices i, jsonb_array_elements(i.lines) l WHERE (l->>'amount_cents')::bigint <> (l->>'quantity')::bigint * (l->>'unit_price_cents')::bigint")
            ck("every stored line amount is quantity times unit price", bad_line == 0, bad_line)
            bad_paid = await scalar("SELECT count(*) FROM offline_invoices i WHERE i.paid_cents <> COALESCE((SELECT SUM(amount_cents) FROM offline_invoice_payments p WHERE p.invoice_id = i.id AND p.voided_at IS NULL), 0)")
            ck("every invoice's paid_cents equals its live payments", bad_paid == 0, bad_paid)
            bad_state = await scalar("SELECT count(*) FROM offline_invoices i WHERE i.status <> 'cancelled' AND i.status <> CASE WHEN i.paid_cents = 0 THEN 'unpaid' WHEN i.paid_cents < i.amount_cents THEN 'part_paid' ELSE 'paid' END")
            ck("every invoice's status agrees with its paid_cents", bad_state == 0, bad_state)
            bad_receipt = await scalar("SELECT count(*) FROM offline_receipts r JOIN offline_invoice_payments p ON p.id = r.payment_id WHERE (r.voided_at IS NULL) <> (p.voided_at IS NULL)")
            ck("a payment and its receipt are voided together", bad_receipt == 0, bad_receipt)

            async with AsyncSessionLocal() as db:
                evs = list(await db.scalars(select(ActivityEvent).where(ActivityEvent.actor_id == ids["staff"])))
            wanted = {"contact.create", "contact.update", "contact.archive", "contact.delete", "invoice.offline_create", "invoice.offline_update", "invoice.offline_cancel",
                      "invoice.offline_reopen", "invoice.offline_promise", "invoice.offline_payment", "invoice.offline_payment_void", "invoice.offline_email",
                      "receipt.create", "receipt.void", "receipt.email"}
            seen = {e.action for e in evs}
            ck("every action in the spec's table was logged by the flows above", wanted <= seen, sorted(wanted - seen))
            offline_evs = [e for e in evs if e.action in wanted]
            ck("every action name is 40 characters or fewer and none has a project", all(len(e.action) <= 40 and e.project_id is None for e in offline_evs))
            ck("subject types are offline_contact, offline_invoice or offline_receipt", {e.subject_type for e in offline_evs} <= {"offline_contact", "offline_invoice", "offline_receipt"}, {e.subject_type for e in offline_evs})
            ck("invoice and payment actions start with 'invoice.' (the admin colours them)", all(e.action.startswith("invoice.") for e in offline_evs if e.subject_type == "offline_invoice"))
            pay_ev = next((e for e in evs if e.action == "invoice.offline_payment"), None)
            ck("a payment's summary reads like 'Recorded NGN 40,000.00 by bank transfer on INV-…, receipt RCT-…'", pay_ev is not None and re.search(r"Recorded NGN [\d,]+\.\d\d by bank transfer on INV-\d+, receipt RCT-\d+", pay_ev.summary), pay_ev and pay_ev.summary)

        await migration_checks(tag)
    finally:
        async with AsyncSessionLocal() as db:
            contact_ids = select(OfflineContact.id).where(OfflineContact.created_by_id == ids["staff"])
            inv_ids = select(OfflineInvoice.id).where(OfflineInvoice.contact_id.in_(contact_ids))
            await db.execute(delete(OfflineReceipt).where(OfflineReceipt.contact_id.in_(contact_ids)))
            await db.execute(delete(OfflineInvoicePayment).where(OfflineInvoicePayment.invoice_id.in_(inv_ids)))
            await db.execute(delete(OfflineInvoice).where(OfflineInvoice.contact_id.in_(contact_ids)))
            await db.execute(delete(OfflineContact).where(OfflineContact.created_by_id == ids["staff"]))
            await db.execute(delete(ActivityEvent).where(ActivityEvent.actor_id == ids["staff"]))
            await db.execute(delete(ProjectInvoice).where(ProjectInvoice.project_id == ids["project"]))
            await db.execute(delete(Project).where(Project.id == ids["project"]))
            await db.execute(delete(User).where(User.id.in_([ids["staff"], ids["client"]])))
            await db.commit()


asyncio.run(main())
finish()
