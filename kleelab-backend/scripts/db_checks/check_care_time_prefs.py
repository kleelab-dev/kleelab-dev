import asyncio, uuid
from _harness import check, finish  # noqa: E402  (sets up the local test database)
from datetime import date, timedelta
import httpx
from sqlalchemy import delete, select
from kleelab.main import app
from kleelab.core.database import AsyncSessionLocal
from kleelab.core.security import get_password_hash
from kleelab.models.user import User
from kleelab.models.care import CarePlan, TimeEntry
from kleelab.models.project import Project, ProjectInvoice
from kleelab.models.activity import ActivityEvent
from kleelab.routers import projects as client_routes
from kleelab.services import care
from kleelab.services import email as email_svc
from kleelab.services import projects as project_svc

PW = 'Care-' + uuid.uuid4().hex[:12]

client_mail: list[str] = []
team_copies: list[list[str]] = []
email_svc.send_client_project_notice = lambda email, pid, title, headline: client_mail.append(headline) or True
email_svc.send_team_notice = lambda *a, **k: True
client_routes.send_team_notice = lambda subject, lines, project_id=None, also_to=None: team_copies.append(also_to or []) or True
project_svc.send_invite = lambda client, project: True

today = date.today()


async def main():
    tag = uuid.uuid4().hex[:8]
    staff_email = f'staff-{tag}@example.com'
    staff2_email = f'staff2-{tag}@example.com'
    client_email = f'client-{tag}@example.com'
    async with AsyncSessionLocal() as db:
        staff = User(email=staff_email, password_hash=get_password_hash(PW), is_verified=True, full_name='Ada Team')
        staff.role = 'staff'
        staff2 = User(email=staff2_email, password_hash=get_password_hash(PW), is_verified=True, full_name='Kemi Team')
        staff2.role = 'staff'
        client = User(email=client_email, password_hash=get_password_hash(PW), is_verified=True, full_name='Bola Client')
        db.add_all([staff, staff2, client])
        await db.commit()
        staff_id = str(staff.id)
    project_ids = []
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://t') as c:
            r = await c.post('/api/auth/staff-login', json={'email': staff_email, 'password': PW})
            h = {'Authorization': f"Bearer {r.json()['access_token']}"}
            r = await c.post('/api/auth/staff-login', json={'email': staff2_email, 'password': PW})
            h2 = {'Authorization': f"Bearer {r.json()['access_token']}"}
            r = await c.post('/api/auth/login', json={'email': client_email, 'password': PW})
            ch = {'Authorization': f"Bearer {r.json()['access_token']}"}

            r = await c.post('/api/admin/projects', headers=h, json={
                'client_email': client_email, 'title': 'Bola site', 'owner_id': staff_id})
            p = r.json()['project']
            pid = p['id']
            project_ids.append(pid)
            stage_id = p['stages'][0]['id']

            # --- Email choices ---------------------------------------------------------
            r = await c.get('/api/auth/me', headers=ch)
            topics = {t['key']: t['on'] for t in r.json()['email_topics']}
            check('client sees client topics, all on', topics == {'updates': True, 'messages': True, 'approvals': True})
            r = await c.get('/api/auth/me', headers=h)
            check('team sees team topics', {t['key'] for t in r.json()['email_topics']} == {'messages', 'approvals', 'payments'})
            r = await c.put('/api/auth/me/email-prefs', headers=ch, json={'prefs': {'payments': False}})
            check('topic from the other side refused', r.status_code == 422)
            r = await c.put('/api/auth/me/email-prefs', headers=ch, json={'prefs': {'messages': False}})
            topics = {t['key']: t['on'] for t in r.json()['email_topics']}
            check('client turns messages off', r.status_code == 200 and topics['messages'] is False and topics['updates'])

            client_mail.clear()
            await c.post(f'/api/admin/projects/{pid}/updates', headers=h, json={'kind': 'message', 'body': 'Hello'})
            check('no message email once turned off', client_mail == [])
            await c.post(f'/api/admin/projects/{pid}/updates', headers=h, json={'kind': 'progress', 'title': 'Designs', 'body': 'Ready'})
            check('progress email still sent', client_mail == ['Designs'])
            r = await c.put('/api/auth/me/email-prefs', headers=ch, json={'prefs': {'messages': True}})
            async with AsyncSessionLocal() as db:
                prefs = (await db.scalar(select(User).where(User.email == client_email))).email_prefs
            check('turning back on stores nothing', r.status_code == 200 and prefs == {})
            client_mail.clear()
            await c.post(f'/api/admin/projects/{pid}/updates', headers=h, json={'kind': 'message', 'body': 'Hello again'})
            check('message email back on', len(client_mail) == 1)

            team_copies.clear()
            await c.post(f'/api/projects/{pid}/messages', headers=ch, json={'body': 'Hi team'})
            check('owner copied on client message', team_copies == [[staff_email]])
            await c.put('/api/auth/me/email-prefs', headers=h, json={'prefs': {'messages': False}})
            team_copies.clear()
            await c.post(f'/api/projects/{pid}/messages', headers=ch, json={'body': 'Hi again'})
            check('owner not copied once turned off; team inbox still told', team_copies == [[]])

            # --- Time ------------------------------------------------------------------
            r = await c.post(f'/api/admin/projects/{pid}/time', headers=h,
                             json={'worked_on': str(today), 'minutes': 90, 'stage_id': stage_id, 'note': '  Homepage  '})
            t = r.json()
            check('time logged, note trimmed, mine',
                  r.status_code == 201 and t['total_minutes'] == 90 and t['entries'][0]['note'] == 'Homepage'
                  and t['entries'][0]['mine'] and t['by_stage'][0]['id'] == stage_id)
            entry_id = t['entries'][0]['id']
            r = await c.post(f'/api/admin/projects/{pid}/time', headers=h2, json={'worked_on': str(today - timedelta(days=40)), 'minutes': 30})
            t = r.json()
            check('teammate logs time; totals by person',
                  t['total_minutes'] == 120 and {x['name']: x['minutes'] for x in t['by_person']} == {'Ada Team': 90, 'Kemi Team': 30})
            other_id = next(e['id'] for e in t['entries'] if e['mine'])
            r = await c.post(f'/api/admin/projects/{pid}/time', headers=h, json={'worked_on': str(today + timedelta(days=5)), 'minutes': 30})
            check('time ahead refused', r.status_code == 422)
            r = await c.post(f'/api/admin/projects/{pid}/time', headers=h, json={'worked_on': str(today), 'minutes': 0})
            check('zero minutes refused', r.status_code == 422)
            r = await c.post(f'/api/admin/projects/{pid}/time', headers=h, json={'worked_on': str(today), 'minutes': 10, 'stage_id': str(uuid.uuid4())})
            check('a step from elsewhere refused', r.status_code == 422)
            r = await c.patch(f'/api/admin/time/{other_id}', headers=h, json={'worked_on': str(today), 'minutes': 5})
            check("cannot change someone else's time", r.status_code == 403)
            r = await c.delete(f'/api/admin/time/{other_id}', headers=h)
            check("cannot delete someone else's time", r.status_code == 403)
            r = await c.patch(f'/api/admin/time/{entry_id}', headers=h, json={'worked_on': str(today), 'minutes': 120})
            check('own time changed', r.status_code == 200 and r.json()['total_minutes'] == 150)
            r = await c.get(f'/api/admin/projects/{pid}/time', headers=ch)
            check('clients cannot see time', r.status_code == 404)
            r = await c.get('/api/admin/time', headers=h, params={'start': str(today - timedelta(days=6)), 'end': str(today)})
            s = r.json()
            check('timesheet covers the week only',
                  r.status_code == 200 and [e['id'] for e in s['entries'] if e['project_id'] == pid] == [entry_id]
                  and s['entries'][-1]['project_reference'] is not None)
            r = await c.get('/api/admin/time', headers=h, params={'start': str(today - timedelta(days=60)), 'end': str(today), 'user_id': staff_id})
            check('timesheet for one person', r.status_code == 200 and all(e['user_id'] == staff_id for e in r.json()['entries']))
            r = await c.get('/api/admin/time', headers=h, params={'start': str(today - timedelta(days=100)), 'end': str(today)})
            check('timesheet range capped', r.status_code == 422)

            # --- Care plans ------------------------------------------------------------
            client_mail.clear()
            plan = {'name': 'Care Basic', 'includes': 'Updates\nBackups', 'amount_cents': 5_000_000,
                    'currency': 'NGN', 'interval': 'month', 'minutes_included': 180, 'first_bill_on': str(today)}
            r = await c.post(f'/api/admin/projects/{pid}/care-plan', headers=h, json=plan)
            d = r.json()
            cp = d.get('care_plan') or {}
            care_invoices = [i for i in d.get('invoices', []) if i['kind'] == 'care']
            check('plan started, billed today, next date a period on',
                  r.status_code == 201 and len(care_invoices) == 1
                  and cp['next_bill_on'] == str(care.add_interval(today, 'month')) and cp['period_start'] == str(today))
            check('hours used count this period only', cp['minutes_used'] == 120)
            check('client told about the plan and the invoice', len(client_mail) == 2 and 'care plan' in client_mail[0])
            r = await c.post(f'/api/admin/projects/{pid}/care-plan', headers=h, json=plan)
            check('only one live plan', r.status_code == 409)
            r = await c.get(f'/api/projects/{pid}', headers=ch)
            check('client sees the plan', r.json()['care_plan']['name'] == 'Care Basic')
            r = await c.get('/api/admin/care-plans', headers=h)
            check('plan listed for the team', any(x['id'] == cp['id'] and x['minutes_used'] == 120 for x in r.json()))

            r = await c.patch(f"/api/admin/care-plans/{cp['id']}", headers=h, json={'minutes_included': None, 'amount_cents': 6_000_000})
            cp2 = r.json()['care_plan']
            check('hours cleared, price changed', cp2['minutes_included'] is None and cp2['minutes_used'] is None
                  and cp2['amount_cents'] == 6_000_000)
            r = await c.patch(f"/api/admin/care-plans/{cp['id']}", headers=h, json={'status': 'paused', 'next_bill_on': str(today)})
            invoices = [i for i in r.json()['invoices'] if i['kind'] == 'care']
            check('paused plan does not bill', r.json()['care_plan']['status'] == 'paused' and len(invoices) == 1)
            async with AsyncSessionLocal() as db:
                billed = await care.bill_due(db)
            async with AsyncSessionLocal() as db:
                count = len((await db.scalars(select(ProjectInvoice).where(ProjectInvoice.project_id == uuid.UUID(pid), ProjectInvoice.kind == 'care'))).all())
            check('daily run skips a paused plan', count == 1)
            r = await c.patch(f"/api/admin/care-plans/{cp['id']}", headers=h, json={'status': 'active'})
            invoices = [i for i in r.json()['invoices'] if i['kind'] == 'care']
            check('resuming bills a date already due', len(invoices) == 2 and invoices[0]['amount_cents'] == 6_000_000)

            # The daily run bills each plan once even when it is far behind.
            async with AsyncSessionLocal() as db:
                row = await db.get(CarePlan, uuid.UUID(cp['id']))
                row.next_bill_on = today - timedelta(days=70)
                await db.commit()
            async with AsyncSessionLocal() as db:
                billed = await care.bill_due(db)
            async with AsyncSessionLocal() as db:
                row = await db.get(CarePlan, uuid.UUID(cp['id']))
                count = len((await db.scalars(select(ProjectInvoice).where(ProjectInvoice.project_id == uuid.UUID(pid), ProjectInvoice.kind == 'care'))).all())
            check('daily run bills one period per plan', billed >= 1 and count == 3
                  and row.next_bill_on == care.add_interval(today - timedelta(days=70), 'month'))
            async with AsyncSessionLocal() as db:
                await care.bill_due(db, today=today)
            async with AsyncSessionLocal() as db:
                count = len((await db.scalars(select(ProjectInvoice).where(ProjectInvoice.project_id == uuid.UUID(pid), ProjectInvoice.kind == 'care'))).all())
            check('next run catches up the next period', count == 4)

            r = await c.patch(f"/api/admin/care-plans/{cp['id']}", headers=h, json={'status': 'ended'})
            check('plan ended, no longer on the project', r.status_code == 200 and r.json()['care_plan'] is None)
            r = await c.patch(f"/api/admin/care-plans/{cp['id']}", headers=h, json={'status': 'active'})
            check('an ended plan stays ended', r.status_code == 409)
            r = await c.post(f'/api/admin/projects/{pid}/care-plan', headers=h,
                             json={**plan, 'first_bill_on': str(today + timedelta(days=10))})
            d = r.json()
            check('a new plan can start later, no bill yet',
                  r.status_code == 201 and len([i for i in d['invoices'] if i['kind'] == 'care']) == 4)

            # Calendar wording and month ends.
            check('period words for a calendar month', care.period_words(date(2026, 11, 1), date(2026, 12, 1)) == 'November 2026')
            check('period words otherwise', care.period_words(date(2026, 10, 22), date(2026, 11, 22)) == '22 Oct 2026 to 21 Nov 2026')
            check('31 Jan plus a month is end of Feb', care.add_interval(date(2027, 1, 31), 'month') == date(2027, 2, 28))
            check('back a month from 31 Mar', care.add_interval(date(2027, 3, 31), 'month', -1) == date(2027, 2, 28))

            r = await c.get('/api/admin/projects', headers=h)
            check('project list still loads', r.status_code == 200)
    finally:
        async with AsyncSessionLocal() as db:
            ids = [uuid.UUID(i) for i in project_ids if i]
            await db.execute(delete(ActivityEvent).where(ActivityEvent.project_id.in_(ids)))
            await db.execute(delete(Project).where(Project.id.in_(ids)))
            await db.execute(delete(User).where(User.email.in_([staff_email, staff2_email, client_email])))
            await db.commit()


asyncio.run(main())
finish()
