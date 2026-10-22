import asyncio, uuid
from _harness import check, finish  # noqa: E402  (sets up the local test database)
from datetime import date, timedelta
import httpx
from sqlalchemy import delete, select, text
from kleelab.main import app
from kleelab.core.database import AsyncSessionLocal
from kleelab.core.security import get_password_hash
from kleelab.models.user import User
from kleelab.models.agency_lead import AgencyLead
from kleelab.models.project import Project, ProjectInvoice
from kleelab.models.activity import ActivityEvent
from kleelab.services import billing
from kleelab.services import email as email_svc
from kleelab.services import projects as project_svc

PW = 'Pay-' + uuid.uuid4().hex[:12]
notices, reminders = [], []
ok = {'value': True}

email_svc.send_proposal_email = lambda *a, **k: True
email_svc.send_team_notice = lambda *a, **k: True
email_svc.send_client_project_notice = lambda email, pid, title, headline: notices.append(headline) or True
project_svc.send_invite = lambda client, project: True


def fake_reminder(email, name, project_id, project_title, number, title, amount, due, days_left):
    reminders.append(dict(number=number, days_left=days_left, amount=amount))
    return ok['value']


email_svc.send_invoice_reminder = fake_reminder

ITEMS = [{'description': 'Design and build', 'amount_cents': 80_000_000}, {'description': 'Content', 'amount_cents': 20_000_000}]


async def token_of(pid):
    async with AsyncSessionLocal() as db:
        return (await db.execute(text('select token from proposals where id = :i'), {'i': pid})).scalar()


async def proposal(c, h, lead_id, percent=40):
    r = await c.post('/api/admin/proposals', headers=h, json={'lead_id': lead_id})
    pid = r.json()['id']
    await c.patch(f'/api/admin/proposals/{pid}', headers=h, json={
        'items': ITEMS, 'currency': 'NGN', 'deposit_percent': percent,
        'stages': [{'name': 'Design'}, {'name': 'Build'}],
    })
    r = await c.post(f'/api/admin/proposals/{pid}/send', headers=h)
    return pid, await token_of(pid), r.json()['revision']


def mine(number):
    return [r for r in reminders if r['number'] == number]


async def main():
    tag = uuid.uuid4().hex[:8]
    staff_email = f'staff-{tag}@example.com'
    emails = [f'pay{n}-{tag}@example.com' for n in range(3)]
    async with AsyncSessionLocal() as db:
        staff = User(email=staff_email, password_hash=get_password_hash(PW), is_verified=True, full_name='Ada Team')
        staff.role = 'staff'
        leads = [AgencyLead(email=e, name=f'Client {n}', message='Need a site', status='new', source='marketing')
                 for n, e in enumerate(emails)]
        db.add_all([staff, *leads])
        await db.commit()
        lead_ids = [str(lead.id) for lead in leads]
    today = date.today()
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://t') as c:
            r = await c.post('/api/auth/staff-login', json={'email': staff_email, 'password': PW})
            h = {'Authorization': f"Bearer {r.json()['access_token']}"}

            # --- Deposit now, the rest at hand-over -------------------------------
            pid, token, rev = await proposal(c, h, lead_ids[0])
            r = await c.post(f'/api/proposals/{token}/accept', json={'name': 'Client Zero', 'agree': True, 'revision': rev, 'payment': 'nope'})
            check('unknown payment choice refused', r.status_code == 422)
            r = await c.post(f'/api/proposals/{token}/accept', json={'name': 'Client Zero', 'agree': True, 'revision': rev})
            check('accept defaults to deposit', r.status_code == 200 and r.json()['proposal']['payment_choice'] == 'deposit')
            r = await c.get(f'/api/admin/proposals/{pid}', headers=h)
            project_id = r.json()['project_id']
            check('team sees the choice', r.json()['payment_choice'] == 'deposit')

            r = await c.get(f'/api/projects/{project_id}', headers=h)
            p = r.json()
            deposit = p['invoices'][0] if p['invoices'] else {}
            check('one deposit invoice', len(p['invoices']) == 1 and deposit['kind'] == 'deposit' and deposit['amount_cents'] == 40_000_000)
            check('balance still to bill', p['balance_due_cents'] == 60_000_000 and p['balance_currency'] == 'NGN')

            stages = sorted(p['stages'], key=lambda s: s['position'])
            await c.patch(f"/api/admin/projects/{project_id}/stages/{stages[0]['id']}", headers=h, json={'status': 'done'})
            r = await c.get(f'/api/projects/{project_id}', headers=h)
            check('no balance before the last step', len(r.json()['invoices']) == 1)

            notices.clear()
            r = await c.patch(f"/api/admin/projects/{project_id}/stages/{stages[1]['id']}", headers=h, json={'status': 'done'})
            p = r.json()
            balance = next((i for i in p['invoices'] if i['kind'] == 'balance'), None)
            check('last step raises the balance', r.status_code == 200 and balance and balance['amount_cents'] == 60_000_000
                  and balance['currency'] == 'NGN' and balance['due_date'] == (today + timedelta(days=7)).isoformat()
                  and balance['title'].startswith('Balance:'))
            check('nothing left to bill', p['balance_due_cents'] is None)
            check('client told about the final invoice', notices and balance and balance['number'] in notices[-1])

            await c.patch(f"/api/admin/projects/{project_id}/stages/{stages[1]['id']}", headers=h, json={'status': 'in_progress'})
            await c.patch(f"/api/admin/projects/{project_id}/stages/{stages[1]['id']}", headers=h, json={'status': 'done'})
            r = await c.patch(f'/api/admin/projects/{project_id}', headers=h, json={'status': 'completed'})
            check('balance raised only once', len([i for i in r.json()['invoices'] if i['kind'] == 'balance']) == 1)

            # Cancelling the balance waives it: it is not billed again.
            await c.patch(f"/api/admin/projects/{project_id}/invoices/{balance['id']}", headers=h, json={'status': 'cancelled'})
            r = await c.get(f'/api/projects/{project_id}', headers=h)
            check('cancelled balance is waived', r.json()['balance_due_cents'] is None)

            # Paying the deposit first does not change what the balance is.
            await c.patch(f"/api/admin/projects/{project_id}/invoices/{deposit['id']}", headers=h, json={'status': 'paid'})

            # --- Everything now ------------------------------------------------------
            pid2, token2, rev2 = await proposal(c, h, lead_ids[1])
            r = await c.post(f'/api/proposals/{token2}/accept', json={'name': 'Client One', 'agree': True, 'revision': rev2, 'payment': 'full'})
            check('accept paying in full', r.status_code == 200 and r.json()['proposal']['payment_choice'] == 'full')
            r = await c.get(f'/api/admin/proposals/{pid2}', headers=h)
            project2 = r.json()['project_id']
            r = await c.get(f'/api/projects/{project2}', headers=h)
            p2 = r.json()
            check('one invoice for the whole price', len(p2['invoices']) == 1 and p2['invoices'][0]['kind'] == 'full'
                  and p2['invoices'][0]['amount_cents'] == 100_000_000 and p2['invoices'][0]['title'].startswith('Full payment:'))
            check('nothing owed at hand-over', p2['balance_due_cents'] is None)
            r = await c.patch(f'/api/admin/projects/{project2}', headers=h, json={'status': 'completed'})
            check('completing a paid-in-full project bills nothing', len(r.json()['invoices']) == 1)

            # --- 100% deposit is the whole price ----------------------------------------
            pid3, token3, rev3 = await proposal(c, h, lead_ids[2], percent=100)
            r = await c.post(f'/api/proposals/{token3}/accept', json={'name': 'Client Two', 'agree': True, 'revision': rev3})
            check('100% deposit counts as full', r.json()['proposal']['payment_choice'] == 'full')
            r = await c.get(f'/api/admin/proposals/{pid3}', headers=h)
            r = await c.get(f"/api/projects/{r.json()['project_id']}", headers=h)
            check('one full invoice, nothing owed', [i['kind'] for i in r.json()['invoices']] == ['full'] and r.json()['balance_due_cents'] is None)

            # --- Reminders ---------------------------------------------------------------
            full = p2['invoices'][0]
            due = date.fromisoformat(full['due_date'])

            async def run(day):
                async with AsyncSessionLocal() as db:
                    return await billing.send_due_reminders(db, today=day)

            await run(due - timedelta(days=4))
            check('nothing four days ahead', not mine(full['number']))
            await run(due - timedelta(days=3))
            check('reminder three days ahead', [x['days_left'] for x in mine(full['number'])] == [3])
            await run(due - timedelta(days=3))
            check('not twice in a day', len(mine(full['number'])) == 1)
            await run(due)
            check('reminder on the day', [x['days_left'] for x in mine(full['number'])] == [3, 0])
            await run(due + timedelta(days=13))
            check('late: only the latest reminder', [x['days_left'] for x in mine(full['number'])] == [3, 0, -13])
            await run(due + timedelta(days=30))
            check('no more after the last', len(mine(full['number'])) == 3)
            r = await c.get(f'/api/projects/{project2}', headers=h)
            inv = r.json()['invoices'][0]
            check('reminders counted', inv['reminders_sent'] == 4 and inv['last_reminded_at'])
            async with AsyncSessionLocal() as db:
                logged = await db.scalar(select(ActivityEvent.id).where(ActivityEvent.action == 'invoice.reminder',
                                                                        ActivityEvent.project_id == uuid.UUID(project2)).limit(1))
            check('reminder in the activity log', logged)

            await run(date.fromisoformat(deposit['due_date']))
            check('paid invoice not chased', not mine(deposit['number']))

            # Email down: the reminder is tried again the next day.
            ok['value'] = False
            dep2 = (await c.get(f'/api/projects/{project_id}', headers=h)).json()
            # Re-open the deposit for this.
            await c.patch(f"/api/admin/projects/{project_id}/invoices/{deposit['id']}", headers=h, json={'status': 'unpaid'})
            ddue = date.fromisoformat(deposit['due_date'])
            await run(ddue)
            ok['value'] = True
            await run(ddue + timedelta(days=1))
            check('failed email retried next day', [x['days_left'] for x in mine(deposit['number'])] == [0, -1])
            del dep2

            # --- Reminder by hand ------------------------------------------------------
            reminders.clear()
            r = await c.post(f"/api/admin/projects/{project2}/invoices/{full['id']}/remind", headers=h)
            check('send a reminder now', r.status_code == 200 and len(mine(full['number'])) == 1)
            ok['value'] = False
            r = await c.post(f"/api/admin/projects/{project2}/invoices/{full['id']}/remind", headers=h)
            check('email failure is 502', r.status_code == 502)
            ok['value'] = True
            await c.patch(f"/api/admin/projects/{project2}/invoices/{full['id']}", headers=h, json={'status': 'paid'})
            r = await c.post(f"/api/admin/projects/{project2}/invoices/{full['id']}/remind", headers=h)
            check('paid invoice cannot be chased', r.status_code == 409)
            r = await c.post(f"/api/admin/projects/{project2}/invoices/{full['id']}/remind")
            check('remind needs staff', r.status_code in (401, 404))

            # --- The client sees what is still to pay -----------------------------------
            r = await c.get(f'/api/proposals/{token}')
            check('public proposal shows the choice', r.json()['payment_choice'] == 'deposit')
    finally:
        async with AsyncSessionLocal() as db:
            ids = [uuid.UUID(i) for i in lead_ids]
            projects = list(await db.scalars(select(Project.id).where(Project.lead_id.in_(ids))))
            await db.execute(delete(ProjectInvoice).where(ProjectInvoice.project_id.in_(projects)))
            await db.execute(delete(ActivityEvent).where(ActivityEvent.project_id.in_(projects)))
            await db.execute(delete(Project).where(Project.id.in_(projects)))
            await db.execute(delete(AgencyLead).where(AgencyLead.id.in_(ids)))
            await db.execute(delete(User).where(User.email.in_([staff_email, *emails])))
            await db.commit()


asyncio.run(main())
finish()
