"""Checks for the team dashboard's alerts bell and the wider Ctrl+K search.

Drives the app in-process against a local test database (DATABASE_URL, by
default the local kleelab_test). It creates its own people, project and
enquiry, and removes them again at the end.

    PYTHONPATH=src python scripts/check_alerts_search.py
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from urllib.parse import urlparse

DEFAULT_URL = "postgresql://postgres@127.0.0.1:6543/kleelab_test"
os.environ.setdefault("DATABASE_URL", DEFAULT_URL)
# Never against a real database: this script writes and deletes rows.
if urlparse(os.environ["DATABASE_URL"]).hostname not in ("127.0.0.1", "localhost"):
    sys.exit("Refusing to run: DATABASE_URL must point at a local test database (127.0.0.1 or localhost).")
os.environ.setdefault("SECRET_KEY", "local-test-key")
os.environ["MAILTRAP_API_TOKEN"] = ""
os.environ["RESEND_API_KEY"] = ""
os.environ["SLACK_WEBHOOK_URL"] = ""
os.environ["AUTH_RATE_LIMIT_PER_MINUTE"] = "1000"

import httpx  # noqa: E402
from sqlalchemy import delete, or_, select  # noqa: E402

from kleelab.core.database import AsyncSessionLocal  # noqa: E402
from kleelab.core.security import create_access_token, get_password_hash  # noqa: E402
from kleelab.main import app  # noqa: E402
from kleelab.models.activity import ActivityEvent  # noqa: E402
from kleelab.models.agency_lead import AgencyLead  # noqa: E402
from kleelab.models.project import Project, ProjectStage  # noqa: E402
from kleelab.models.user import User  # noqa: E402
from kleelab.routers import admin as admin_router  # noqa: E402
from kleelab.routers import agency as agency_router  # noqa: E402
from kleelab.routers import projects as projects_router  # noqa: E402
from kleelab.routers.team import _alerts_query  # noqa: E402

# No email leaves the building.
admin_router.send_client_project_notice = lambda *args, **kwargs: True
projects_router.send_team_notice = lambda *args, **kwargs: True
projects_router.send_client_project_notice = lambda *args, **kwargs: True
agency_router.send_agency_lead_notification = lambda *args, **kwargs: True

results: list[bool] = []


def check(label: str, cond: object) -> None:
    results.append(bool(cond))
    print(("PASS  " if cond else "FAIL  ") + label)


def bearer(user_id: uuid.UUID) -> dict[str, str]:
    return {"Authorization": "Bearer " + create_access_token({"user_id": str(user_id)})}


async def main() -> None:
    tag = uuid.uuid4().hex[:6]
    emails = [f"ada-{tag}@example.com", f"bo-{tag}@example.com", f"client-{tag}@example.com", f"enq-{tag}@example.com"]
    async with AsyncSessionLocal() as db:
        ada = User(email=emails[0], password_hash=get_password_hash(tag), is_verified=True,
                   full_name=f"Ada Teammate {tag}", role="staff")
        bo = User(email=emails[1], password_hash=get_password_hash(tag), is_verified=True,
                  full_name=f"Bo Helper {tag}", role="staff")
        client = User(email=emails[2], password_hash=get_password_hash(tag), is_verified=True,
                      full_name=f"Cy Client {tag}")
        db.add_all([ada, bo, client])
        await db.flush()
        project = Project(client_id=client.id, owner_id=ada.id, reference=f"A-{tag}", title=f"Shop {tag}", status="active")
        db.add(project)
        await db.flush()
        db.add(ProjectStage(project_id=project.id, name="Design", position=0, status="in_progress"))
        await db.commit()
        ids = {"ada": ada.id, "bo": bo.id, "client": client.id}
        pid = project.id
    ah, bh, ch = bearer(ids["ada"]), bearer(ids["bo"]), bearer(ids["client"])
    lead_ids: list[uuid.UUID] = []

    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:

            async def alerts(headers: dict[str, str]) -> dict:
                """Alerts, plus `ours`: this run's only, as the database may hold other runs' events."""

                r = await c.get("/api/admin/alerts", headers=headers)
                body = r.json()
                body["status"] = r.status_code
                body["ours"] = [
                    a for a in body.get("items", [])
                    if a["project_id"] == str(pid) or tag in (a["actor_name"] or "")
                ]
                return body

            # Start both teammates from a clean slate.
            for headers in (ah, bh):
                r = await c.post("/api/admin/alerts/seen", headers=headers)
                check("mark seen answers", r.status_code == 200 and r.json()["status"] == "seen")
            a = await alerts(ah)
            check("nothing unread after marking seen", a["status"] == 200 and a["unread"] == 0 and a["seen_at"])

            # --- what clients do turns into alerts ------------------------------------------------
            r = await c.post(f"/api/projects/{pid}/messages", headers=ch, json={"body": f"Can we use the zebra-{tag} logo please?"})
            check("client message ok", r.status_code == 201)
            r = await c.post(f"/api/projects/{pid}/requests", headers=ch, json={"kind": "hosting", "message": "Please host it"})
            check("client request ok", r.status_code == 201)
            r = await c.post(f"/api/projects/{pid}/files", headers={**ch, "X-File-Name": "brief.txt", "Content-Type": "text/plain"},
                             content=b"the brief")
            check("client file ok", r.status_code == 201)

            # The team's own posts are not alerts, for the poster or anyone else.
            r = await c.post(f"/api/admin/projects/{pid}/updates", headers=ah,
                             json={"kind": "approval", "title": f"Homepage {tag}", "body": "Is this right?"})
            check("staff asks for approval", r.status_code == 201)
            approval = next(u for u in r.json()["updates"] if u["kind"] == "approval")
            r = await c.post(f"/api/projects/{pid}/messages", headers=ah, json={"body": "We are on it."})
            check("staff message ok", r.status_code == 201)
            r = await c.post(f"/api/projects/{pid}/approvals/{approval['id']}", headers=ch, json={"decision": "approved"})
            check("client approves", r.status_code == 200)

            # A new enquiry from someone with no account is logged and alerts the team.
            r = await c.post("/api/agency/leads", json={"email": emails[3], "name": f"Enquirer {tag}", "company": "Acme",
                                                       "message": "We would like a new website please."})
            check("enquiry received", r.status_code == 201)
            async with AsyncSessionLocal() as db:
                lead_ids = list(await db.scalars(select(AgencyLead.id).where(AgencyLead.email == emails[3])))
                logged = await db.scalar(select(ActivityEvent).where(ActivityEvent.subject_id == lead_ids[0]))
            check("enquiry logged with the name given", logged is not None and logged.action == "lead.create"
                  and logged.actor_id is None and logged.actor_label == f"Enquirer {tag}" and "Acme" in logged.summary)

            a = await alerts(ah)
            actions = [x["action"] for x in a["ours"]]
            check("unread counts the five client things", a["unread"] == 5 and len(a["ours"]) == 5)
            check("newest first", actions == ["lead.create", "approval.approved", "file.add", "request.create", "update.message"])
            check("all marked unread", all(x["unread"] for x in a["ours"]))
            check("team posts left out", not any("We are on it" in x["summary"] or "Asked for approval" in x["summary"]
                                                  for x in a["items"]))
            msg = next(x for x in a["ours"] if x["action"] == "update.message")
            check("alert says who, what and where", msg["actor_name"] == f"Cy Client {tag}" and f"zebra-{tag}" in msg["summary"]
                  and msg["project_reference"] == f"A-{tag}" and msg["project_title"] == f"Shop {tag}")
            lead_alert = next(x for x in a["ours"] if x["action"] == "lead.create")
            check("enquiry alert links the enquiry", lead_alert["subject_type"] == "lead"
                  and lead_alert["subject_id"] == str(lead_ids[0]) and lead_alert["actor_name"] == f"Enquirer {tag}")
            check("at most 20 items", len(a["items"]) <= 20)

            # --- seen is per person and kept on the server -------------------------------------------
            await c.post("/api/admin/alerts/seen", headers=ah)
            a = await alerts(ah)
            check("nothing unread after marking seen", a["unread"] == 0 and not any(x["unread"] for x in a["ours"]))
            check("alerts still listed once read", len(a["ours"]) == 5)
            async with AsyncSessionLocal() as db:
                check("seen time stored on the user", (await db.get(User, ids["ada"])).alerts_seen_at is not None)
            b = await alerts(bh)
            check("another teammate still has five unread", b["unread"] == 5)

            await c.post(f"/api/projects/{pid}/messages", headers=ch, json={"body": "One more thing"})
            a = await alerts(ah)
            check("a later message is unread again", a["unread"] == 1 and a["ours"][0]["unread"] and not a["ours"][1]["unread"])

            # A teammate's own upload never alerts them (or anyone).
            r = await c.post(f"/api/projects/{pid}/files", headers={**bh, "X-File-Name": "mock.png", "Content-Type": "image/png"},
                             content=b"png")
            check("staff file ok", r.status_code == 201)
            b = await alerts(bh)
            check("own upload not counted", b["unread"] == 6 and not any("mock.png" in x["summary"] for x in b["items"]))
            # And the viewer's own events are left out even when the role rule would let them in.
            async with AsyncSessionLocal() as db:
                viewer = await db.get(User, ids["client"])
                rows = (await db.execute(_alerts_query(viewer).where(ActivityEvent.project_id == pid))).all()
                others = (await db.execute(_alerts_query(await db.get(User, ids["ada"])).where(ActivityEvent.project_id == pid))).all()
            check("viewer's own actions excluded", rows == [] and len(others) == 5)

            # --- staff only ------------------------------------------------------------------------------
            r = await c.get("/api/admin/alerts", headers=ch)
            check("client cannot read alerts", r.status_code in (401, 403, 404))
            r = await c.post("/api/admin/alerts/seen", headers=ch)
            check("client cannot mark alerts seen", r.status_code in (401, 403, 404))
            r = await c.get("/api/admin/alerts")
            check("signed out cannot read alerts", r.status_code == 401)
            async with AsyncSessionLocal() as db:
                check("client row untouched", (await db.get(User, ids["client"])).alerts_seen_at is None)

            # --- search: teammates and message text ---------------------------------------------------
            r = await c.get("/api/admin/search", headers=ah, params={"q": f"helper {tag}"})
            s = r.json()
            check("search finds a teammate by name", r.status_code == 200 and any(x["id"] == str(ids["bo"]) for x in s["team"]))
            check("teammate has email and state", any(x["email"] == emails[1] and x["is_active"] is True for x in s["team"]))
            r = await c.get("/api/admin/search", headers=ah, params={"q": f"cy client {tag}"})
            check("clients are not teammates", r.json()["team"] == [] and r.json()["clients"])
            r = await c.get("/api/admin/search", headers=ah, params={"q": f"zebra-{tag}"})
            m = r.json()["messages"]
            check("search finds message text", len(m) == 1 and m[0]["project_id"] == str(pid)
                  and m[0]["project_reference"] == f"A-{tag}" and m[0]["project_title"] == f"Shop {tag}"
                  and m[0]["author_name"] == f"Cy Client {tag}" and m[0]["kind"] == "message" and m[0]["created_at"])
            check("snippet holds the match", f"zebra-{tag}" in m[0]["snippet"])
            long_body = ("lorem ipsum " * 30) + f"needle{tag} " + ("dolor sit " * 30)
            await c.post(f"/api/admin/projects/{pid}/updates", headers=ah, json={"kind": "note", "body": long_body})
            r = await c.get("/api/admin/search", headers=ah, params={"q": f"NEEDLE{tag}"})
            snip = r.json()["messages"][0]["snippet"]
            check("long post gives a short snippet around the match", f"needle{tag}" in snip and len(snip) <= 125
                  and snip.startswith("\u2026") and snip.endswith("\u2026"))
            r = await c.get("/api/admin/search", headers=ah, params={"q": f"homepage {tag}"})
            m = r.json()["messages"]
            check("a match in the title is found too", m and m[0]["snippet"] == f"Homepage {tag}")
            for i in range(7):
                await c.post(f"/api/projects/{pid}/messages", headers=ch, json={"body": f"bulk-{tag} number {i}"})
            r = await c.get("/api/admin/search", headers=ah, params={"q": f"bulk-{tag}"})
            m = r.json()["messages"]
            check("messages capped at five, newest first", len(m) == 5 and m[0]["snippet"].endswith("number 6")
                  and m[4]["snippet"].endswith("number 2"))

            # --- wildcards stay literal ------------------------------------------------------------------
            r = await c.get("/api/admin/search", headers=ah, params={"q": "%%"})
            s = r.json()
            check("percent is not a wildcard", r.status_code == 200 and not any(x["id"] == str(ids["bo"]) for x in s["team"])
                  and not any(x["project_id"] == str(pid) for x in s["messages"]))
            r = await c.get("/api/admin/search", headers=ah, params={"q": "__"})
            s = r.json()
            check("underscore is not a wildcard", r.status_code == 200
                  and not any(x["project_id"] == str(pid) for x in s["messages"])
                  and not any(x["id"] == str(ids["ada"]) for x in s["team"]))
            await c.post(f"/api/projects/{pid}/messages", headers=ch, json={"body": f"we are 100%{tag} sure"})
            r = await c.get("/api/admin/search", headers=ah, params={"q": f"100%{tag}"})
            check("literal percent matches message text", len(r.json()["messages"]) == 1)
            r = await c.get("/api/admin/search", headers=ch, params={"q": tag})
            check("client cannot search", r.status_code in (401, 403, 404))
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(ActivityEvent).where(or_(
                ActivityEvent.project_id == pid, ActivityEvent.subject_id.in_(lead_ids or [uuid.uuid4()])
            )))
            await db.execute(delete(Project).where(Project.id == pid))
            await db.execute(delete(AgencyLead).where(AgencyLead.email == emails[3]))
            users = list(await db.scalars(select(User.id).where(User.email.in_(emails))))
            await db.execute(delete(ActivityEvent).where(ActivityEvent.actor_id.in_(users)))
            await db.execute(delete(User).where(User.email.in_(emails)))
            await db.commit()
    print(f"{sum(results)}/{len(results)} passed")
    if not all(results):
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())