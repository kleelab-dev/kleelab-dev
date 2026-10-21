"""Files and pictures sent with a project message: hidden until the message goes,
only ever attached by the person who uploaded them, and never seen by another client."""

import asyncio
import uuid
from datetime import timedelta

from _harness import check, finish  # noqa: I001  (sets up the local test database first)
import httpx
from sqlalchemy import delete, select, update

import kleelab.routers.projects as projects_router
from kleelab.core.database import AsyncSessionLocal
from kleelab.core.security import create_access_token, get_password_hash
from kleelab.main import app
from kleelab.models.activity import ActivityEvent
from kleelab.models.project import Project, ProjectFile
from kleelab.models.user import User
from kleelab.services import projects as svc

PW = "Attach-" + uuid.uuid4().hex[:12]
team_notices: list[tuple[str, list[str]]] = []
# Record the team emails instead of sending them.
projects_router.send_team_notice = lambda subject, lines, project_id=None, also_to=None: team_notices.append((subject, lines)) or True

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def auth(user_id) -> dict[str, str]:
    return {"Authorization": "Bearer " + create_access_token({"user_id": str(user_id)})}


async def main() -> None:
    tag = uuid.uuid4().hex[:8]
    emails = [f"staff-{tag}@example.com", f"client-{tag}@example.com", f"other-{tag}@example.com"]
    async with AsyncSessionLocal() as db:
        staff = User(email=emails[0], password_hash=get_password_hash(PW), is_verified=True, full_name="Sam Staff")
        staff.role = "staff"
        client = User(email=emails[1], password_hash=get_password_hash(PW), is_verified=True, full_name="Ada Client")
        other = User(email=emails[2], password_hash=get_password_hash(PW), is_verified=True)
        db.add_all([staff, client, other])
        await db.flush()
        p = Project(client_id=client.id, reference=f"P-{tag}", title="Bakery site", status="active")
        q = Project(client_id=other.id, reference=f"Q-{tag}", title="Other site", status="active")
        db.add_all([p, q])
        await db.commit()
        ids = {"staff": staff.id, "client": client.id, "other": other.id, "p": p.id, "q": q.id}

    me, them, team = auth(ids["client"]), auth(ids["other"]), auth(ids["staff"])
    base = f"/api/projects/{ids['p']}"

    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
            async def attach(headers, name="logo.png", data=PNG, kind="image/png", project=base):
                return await c.post(
                    f"{project}/attachments",
                    headers={**headers, "Content-Type": kind, "X-File-Name": name},
                    content=data,
                )

            # --- uploading ahead of the message -----------------------------------------------
            r = await attach(me)
            check("client can attach a picture", r.status_code == 201)
            pic = r.json()
            check("the reply describes the file", pic["filename"] == "logo.png" and pic["content_type"] == "image/png" and pic["size"] == len(PNG))
            check("it is not on a message yet", pic["update_id"] is None)
            r = await attach(me, "brief.pdf", b"%PDF-1.4 test", "application/pdf")
            pdf = r.json()
            check("client can attach a document", r.status_code == 201)

            r = await c.get(base, headers=me)
            check("unsent files stay out of the file list", all(f["id"] not in (pic["id"], pdf["id"]) for f in r.json()["files"]))
            r = await c.get(base, headers=team)
            check("the team cannot see unsent files either", all(f["id"] not in (pic["id"], pdf["id"]) for f in r.json()["files"]))
            r = await c.get(f"{base}/files/{pic['id']}", headers=team)
            check("the team cannot download an unsent file", r.status_code == 404)
            r = await c.get(f"{base}/files/{pic['id']}", headers=me)
            check("the uploader can open their own unsent file", r.status_code == 200 and r.content == PNG)

            r = await attach(them, project=base)
            check("another client cannot attach to this project", r.status_code == 404)
            r = await attach({}, project=base)
            check("attaching needs a session", r.status_code == 401)
            r = await attach(me, data=b"")
            check("an empty file is refused", r.status_code == 422)
            r = await c.post(
                f"{base}/attachments",
                headers={**me, "Content-Type": "image/png", "X-File-Name": "big.png"},
                content=b"x" * (projects_router.MAX_FILE_BYTES + 1),
            )
            check("a file over 10 MB is refused", r.status_code == 413)
            r = await attach(me, "../../etc/passwd")
            check("a path in the name is stripped", r.status_code == 201 and r.json()["filename"] == "passwd")
            stray = r.json()["id"]

            # --- removing one before sending -----------------------------------------------------
            r = await c.delete(f"{base}/files/{stray}", headers=team)
            check("nobody else can remove an unsent file", r.status_code == 404)
            events_before = None
            async with AsyncSessionLocal() as db:
                events_before = len(list(await db.scalars(select(ActivityEvent.id).where(ActivityEvent.project_id == ids["p"]))))
            r = await c.delete(f"{base}/files/{stray}", headers=me)
            check("the uploader can take one off before sending", r.status_code == 200)
            async with AsyncSessionLocal() as db:
                check("that file is gone", await db.get(ProjectFile, uuid.UUID(stray)) is None)
                events_after = len(list(await db.scalars(select(ActivityEvent.id).where(ActivityEvent.project_id == ids["p"]))))
                check("taking it off is not logged as activity", events_after == events_before)

            # --- sending ------------------------------------------------------------------------
            r = await c.post(f"{base}/messages", headers=me, json={"body": ""})
            check("an empty message with no files is refused", r.status_code == 422)
            r = await c.post(f"{base}/messages", headers=me, json={"body": "x", "attachment_ids": [pic["id"], pic["id"]]})
            check("the same file twice is refused", r.status_code == 422)
            r = await c.post(f"{base}/messages", headers=me, json={"body": "x", "attachment_ids": [str(uuid.uuid4()) for _ in range(7)]})
            check("more than six files is refused", r.status_code == 422)
            r = await c.post(f"{base}/messages", headers=me, json={"body": "x", "attachment_ids": [str(uuid.uuid4())]})
            check("an unknown file is refused", r.status_code == 422)

            # Another client uploads on their own project; this client cannot claim it.
            r = await attach(them, project=f"/api/projects/{ids['q']}")
            theirs = r.json()["id"]
            r = await c.post(f"{base}/messages", headers=me, json={"body": "x", "attachment_ids": [theirs]})
            check("a file from another project is refused", r.status_code == 422)
            r = await c.post(f"{base}/messages", headers=team, json={"body": "x", "attachment_ids": [pic["id"]]})
            check("the team cannot send the client's unsent file", r.status_code == 422)

            team_notices.clear()
            r = await c.post(
                f"{base}/messages", headers=me,
                json={"body": "Here is our logo and the brief", "attachment_ids": [pic["id"], pdf["id"]]},
            )
            check("a message with two files is sent", r.status_code == 201)
            detail = r.json()
            sent = next((u for u in detail["updates"] if u["body"] == "Here is our logo and the brief"), None)
            check("the message carries both files", sent is not None and {a["id"] for a in sent["attachments"]} == {pic["id"], pdf["id"]})
            check("each file points at its message", sent is not None and all(a["update_id"] == sent["id"] for a in sent["attachments"]))
            check("the files now show in the file list", {pic["id"], pdf["id"]} <= {f["id"] for f in detail["files"]})
            check("the team is told, with the file names", len(team_notices) == 1 and "Attached: logo.png, brief.pdf" in team_notices[0][1])

            r = await c.get(base, headers=team)
            check("the team sees the files on the message", any(len(u["attachments"]) == 2 for u in r.json()["updates"]))
            r = await c.get(f"{base}/files/{pic['id']}", headers=team)
            check("the team can download a sent file", r.status_code == 200 and r.content == PNG)
            r = await c.get(f"{base}/files/{pic['id']}", headers=them)
            check("another client still cannot", r.status_code == 404)

            r = await c.post(f"{base}/messages", headers=me, json={"body": "again", "attachment_ids": [pic["id"]]})
            check("a sent file cannot be attached again", r.status_code == 422)

            # Files only, no words.
            r = await attach(me, "moodboard.jpg", b"\xff\xd8\xff" + b"0" * 32, "image/jpeg")
            mood = r.json()["id"]
            r = await c.post(f"{base}/messages", headers=me, json={"attachment_ids": [mood]})
            check("a message can be just a file", r.status_code == 201 and any(
                u["body"] == "" and [a["id"] for a in u["attachments"]] == [mood] for u in r.json()["updates"]
            ))

            # The team replies with a file too.
            r = await attach(team, "homepage-v2.png")
            check("the team can attach a file", r.status_code == 201)
            r = await c.post(f"{base}/messages", headers=team, json={"body": "New homepage", "attachment_ids": [r.json()["id"]]})
            reply = next((u for u in r.json()["updates"] if u["body"] == "New homepage"), None)
            check("the team's file is on its message", reply is not None and reply["from_team"] and reply["attachments"][0]["from_team"])

            # The team asks for approval with the design attached; a team note cannot carry files.
            admin_updates = f"/api/admin/projects/{ids['p']}/updates"
            r = await attach(team, "homepage-v3.png")
            design = r.json()["id"]
            r = await c.post(admin_updates, headers=team, json={"kind": "note", "body": "internal", "attachment_ids": [design]})
            check("a team note cannot carry files", r.status_code == 422)
            r = await c.post(admin_updates, headers=me, json={"kind": "approval", "title": "x", "body": "x", "attachment_ids": [design]})
            check("a client cannot use the team route", r.status_code == 404)
            r = await c.post(
                admin_updates, headers=team,
                json={"kind": "approval", "title": "Homepage v3", "body": "Please approve", "attachment_ids": [design]},
            )
            ask = next((u for u in r.json()["updates"] if u["title"] == "Homepage v3"), None) if r.status_code == 201 else None
            check("an approval request carries the design", ask is not None and [a["id"] for a in ask["attachments"]] == [design])
            r = await c.get(base, headers=me)
            check("the client sees the design on the approval", any(
                u["title"] == "Homepage v3" and u["attachments"] for u in r.json()["updates"]
            ))
            r = await c.post(admin_updates, headers=team, json={"kind": "progress", "body": "again", "attachment_ids": [design]})
            check("the same design cannot be sent twice", r.status_code == 422)

            # Plain messages still work as before.
            r = await c.post(f"{base}/messages", headers=me, json={"body": "Thanks!"})
            check("a plain message still works", r.status_code == 201 and next(u for u in r.json()["updates"] if u["body"] == "Thanks!")["attachments"] == [])

            # --- limits and clean-up -------------------------------------------------------------
            for n in range(projects_router.MAX_HELD):
                await attach(me, f"f{n}.png")
            r = await attach(me, "one-too-many.png")
            check("too many unsent files is refused", r.status_code == 429)

            async with AsyncSessionLocal() as db:
                await db.execute(
                    update(ProjectFile)
                    .where(ProjectFile.project_id == ids["p"], ProjectFile.held.is_(True))
                    .values(created_at=svc.now() - timedelta(days=2))
                )
                await db.commit()
            r = await attach(me, "fresh.png")
            check("files left unsent for a day are cleared away", r.status_code == 201)
            async with AsyncSessionLocal() as db:
                held = list(await db.scalars(
                    select(ProjectFile).where(ProjectFile.project_id == ids["p"], ProjectFile.held.is_(True))
                ))
                check("only the new one is left waiting", [f.filename for f in held] == ["fresh.png"])
                kept = await db.get(ProjectFile, uuid.UUID(pic["id"]))
                check("sent files are never cleared", kept is not None and not kept.held)

            # --- old route still fine ------------------------------------------------------------
            r = await c.post(
                f"{base}/files",
                headers={**me, "Content-Type": "text/plain", "X-File-Name": "notes.txt"},
                content=b"hello",
            )
            check("sharing a file the old way still works", r.status_code == 201 and any(
                f["filename"] == "notes.txt" and f["update_id"] is None for f in r.json()["files"]
            ))
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(ActivityEvent).where(ActivityEvent.project_id.in_([ids["p"], ids["q"]])))
            await db.execute(delete(Project).where(Project.id.in_([ids["p"], ids["q"]])))
            await db.execute(delete(ActivityEvent).where(ActivityEvent.actor_id.in_([ids["staff"], ids["client"], ids["other"]])))
            await db.execute(delete(User).where(User.email.in_(emails)))
            await db.commit()


asyncio.run(main())
finish()
