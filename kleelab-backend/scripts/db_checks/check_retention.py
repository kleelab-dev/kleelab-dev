"""What the privacy page promises about keeping data: invoices survive a deleted
account, and old enquiries and old detached invoices are deleted on schedule."""

import asyncio
import uuid
from datetime import timedelta

from _harness import check, finish  # noqa: I001  (sets up the local test database first)
import httpx
from sqlalchemy import delete, select

from kleelab.core.database import AsyncSessionLocal
from kleelab.core.security import create_access_token, get_password_hash
from kleelab.core.time import utcnow
from kleelab.main import app
from kleelab.models.agency_lead import AgencyLead, LeadNote
from kleelab.models.project import InvoicePayment, Project, ProjectInvoice
from kleelab.models.user import User
from kleelab.services.retention import purge_expired

PW = "Retain-" + uuid.uuid4().hex[:12]


def auth(user_id) -> dict[str, str]:
    return {"Authorization": "Bearer " + create_access_token({"user_id": str(user_id)})}


async def main() -> None:
    tag = uuid.uuid4().hex[:8]
    now = utcnow()
    long_ago = now - timedelta(days=731)
    async with AsyncSessionLocal() as db:
        staff = User(email=f"staff-{tag}@example.com", password_hash=get_password_hash(PW), is_verified=True)
        staff.role = "staff"
        client = User(
            email=f"client-{tag}@example.com", password_hash=get_password_hash(PW), is_verified=True,
            full_name="Ada Client",
        )
        db.add_all([staff, client])
        await db.flush()

        old_lead = AgencyLead(email=f"old-{tag}@example.com", created_at=long_ago)
        new_lead = AgencyLead(email=f"new-{tag}@example.com", created_at=now - timedelta(days=30))
        won_lead = AgencyLead(email=f"won-{tag}@example.com", created_at=long_ago)
        db.add_all([old_lead, new_lead, won_lead])
        await db.flush()
        db.add(LeadNote(lead_id=old_lead.id, body="Called, no answer."))
        project = Project(client_id=client.id, reference=f"R-{tag}", title="Clinic booking", status="active")
        # A different client's project, still running when the clean-up comes.
        live = Project(client_id=staff.id, reference=f"L-{tag}", title="Shop", status="active", lead_id=won_lead.id)
        db.add_all([project, live])
        await db.commit()
        ids = {
            "staff": staff.id, "client": client.id, "project": project.id,
            "old": old_lead.id, "new": new_lead.id, "won": won_lead.id,
        }

    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
            r = await c.post(
                f"/api/admin/projects/{ids['project']}/invoices",
                headers=auth(ids["staff"]),
                json={"title": "Deposit", "amount_cents": 50000, "currency": "NGN"},
            )
            check("staff can raise an invoice", r.status_code == 201)
            async with AsyncSessionLocal() as db:
                invoice = await db.scalar(select(ProjectInvoice).where(ProjectInvoice.project_id == ids["project"]))
                check("invoice copies who was billed", invoice.client_email == f"client-{tag}@example.com")
                check("invoice copies the client's name", invoice.client_name == "Ada Client")
                check("invoice copies the project", invoice.project_reference == f"R-{tag}")
                db.add(InvoicePayment(invoice_id=invoice.id, reference=f"pay-{tag}", amount_cents=50000, currency="NGN"))
                await db.commit()
                ids["invoice"] = invoice.id

            r = await c.delete("/api/users/me", headers=auth(ids["client"]))
            check("client can delete their account", r.status_code == 200)

            async with AsyncSessionLocal() as db:
                check("the project is gone", await db.get(Project, ids["project"]) is None)
                kept = await db.get(ProjectInvoice, ids["invoice"])
                check("the invoice is kept", kept is not None)
                check("the kept invoice is detached", kept is not None and kept.project_id is None)
                check(
                    "its payment record is kept",
                    await db.scalar(select(InvoicePayment).where(InvoicePayment.invoice_id == ids["invoice"])),
                )

            r = await c.get("/api/admin/invoices", headers=auth(ids["staff"]))
            check("the money page still loads", r.status_code == 200)
            check("detached invoices are left off it", all(i["id"] != str(ids["invoice"]) for i in r.json()))
            r = await c.get("/api/admin/stats", headers=auth(ids["staff"]))
            check("the money summary still loads", r.status_code == 200)
            r = await c.get("/api/admin/search", params={"q": "Deposit"}, headers=auth(ids["staff"]))
            check("search still works", r.status_code == 200)
            check(
                "search leaves detached invoices out",
                r.status_code == 200 and all(i["id"] != str(ids["invoice"]) for i in r.json()["invoices"]),
            )

        async with AsyncSessionLocal() as db:
            await purge_expired(db, now)
        async with AsyncSessionLocal() as db:
            check("an enquiry over two years old is deleted", await db.get(AgencyLead, ids["old"]) is None)
            check(
                "its notes go with it",
                not (await db.scalars(select(LeadNote).where(LeadNote.lead_id == ids["old"]))).all(),
            )
            check("a recent enquiry is kept", await db.get(AgencyLead, ids["new"]) is not None)
            check("an old enquiry that became a project is kept", await db.get(AgencyLead, ids["won"]) is not None)
            check("a detached invoice inside six years is kept", await db.get(ProjectInvoice, ids["invoice"]))

        async with AsyncSessionLocal() as db:
            await purge_expired(db, now + timedelta(days=round(6 * 365.25) + 1))
        async with AsyncSessionLocal() as db:
            check("a detached invoice past six years is deleted", await db.get(ProjectInvoice, ids["invoice"]) is None)
            check(
                "its payment record goes with it",
                not await db.scalar(select(InvoicePayment).where(InvoicePayment.reference == f"pay-{tag}")),
            )
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(ProjectInvoice).where(ProjectInvoice.project_reference == f"R-{tag}"))
            await db.execute(delete(Project).where(Project.reference.in_([f"R-{tag}", f"L-{tag}"])))
            await db.execute(delete(AgencyLead).where(AgencyLead.email.like(f"%-{tag}@example.com")))
            await db.execute(delete(User).where(User.email.like(f"%-{tag}@example.com")))
            await db.commit()


asyncio.run(main())
finish()
