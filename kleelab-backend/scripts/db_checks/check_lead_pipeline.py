import asyncio, os, uuid
from _harness import check, finish  # noqa: E402  (sets up the local test database)
from datetime import date, timedelta
import httpx
from sqlalchemy import delete
from kleelab.main import app
from kleelab.core.database import AsyncSessionLocal
from kleelab.core.security import get_password_hash
from kleelab.models.user import User
from kleelab.models.agency_lead import AgencyLead
from kleelab.routers import admin as admin_router
from kleelab.services import email as email_svc

PW = 'Pipe-' + uuid.uuid4().hex[:12]
sent = []
ok = {'value': True}

def fake_reply(to, subject, body, sender):
    sent.append((to, subject, body, sender))
    return ok['value']

admin_router.send_lead_reply = fake_reply

async def main():
    tag = uuid.uuid4().hex[:8]
    staff_email = f'staff-{tag}@example.com'
    async with AsyncSessionLocal() as db:
        staff = User(email=staff_email, password_hash=get_password_hash(PW), is_verified=True, full_name='Ada Team')
        staff.role = 'staff'
        lead = AgencyLead(email=f'lead-{tag}@example.com', name='Bola', message='Need a shop', status='new', source='marketing')
        db.add_all([staff, lead])
        await db.commit()
        lead_id = str(lead.id)
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://t') as c:
            r = await c.post('/api/auth/staff-login', json={'email': staff_email, 'password': PW})
            h = {'Authorization': f"Bearer {r.json()['access_token']}"}

            r = await c.get(f'/api/admin/leads/{lead_id}', headers=h)
            check('get lead detail', r.status_code == 200 and r.json()['notes'] == [] and r.json()['follow_up_on'] is None)

            r = await c.post(f'/api/admin/leads/{lead_id}/notes', headers=h, json={'body': 'Called, wants a quote'})
            d = r.json()
            check('add note', r.status_code == 201 and len(d['notes']) == 1 and d['notes'][0]['author_name'] == 'Ada Team' and d['notes'][0]['kind'] == 'note')

            ok['value'] = False
            r = await c.post(f'/api/admin/leads/{lead_id}/reply', headers=h, json={'subject': 'Hi', 'body': 'Hello'})
            check('failed send -> 502', r.status_code == 502)
            r = await c.get(f'/api/admin/leads/{lead_id}', headers=h)
            check('failed send records nothing, status stays new', len(r.json()['notes']) == 1 and r.json()['status'] == 'new')

            ok['value'] = True
            r = await c.post(f'/api/admin/leads/{lead_id}/reply', headers=h, json={'subject': 'Your shop', 'body': 'Hello Bola'})
            d = r.json()
            check('reply recorded as email, status -> contacted', r.status_code == 201 and d['notes'][-1]['kind'] == 'email'
                  and d['notes'][-1]['subject'] == 'Your shop' and d['status'] == 'contacted')
            check('reply went to the lead, signed by staff', sent[-1][0] == f'lead-{tag}@example.com' and sent[-1][3] == 'Ada Team')

            past = (date.today() - timedelta(days=1)).isoformat()
            r = await c.patch(f'/api/admin/leads/{lead_id}', headers=h, json={'follow_up_on': past})
            check('set follow-up keeps status', r.status_code == 200 and r.json()['follow_up_on'] == past and r.json()['status'] == 'contacted')

            r = await c.get('/api/admin/overview', headers=h)
            check('overview lists follow-up', any(i['kind'] == 'follow_up' and i['lead_id'] == lead_id for i in r.json()))

            r = await c.get('/api/admin/stats', headers=h)
            s = r.json()
            check('stats ok', r.status_code == 200 and s['follow_ups_due'] >= 1 and isinstance(s['unpaid'], list))
            print('     stats:', {k: v for k, v in s.items()})

            r = await c.patch(f'/api/admin/leads/{lead_id}', headers=h, json={'status': 'won'})
            check('status-only patch keeps follow-up', r.json()['status'] == 'won' and r.json()['follow_up_on'] == past)
            r = await c.patch(f'/api/admin/leads/{lead_id}', headers=h, json={'follow_up_on': None})
            check('null clears follow-up', r.json()['follow_up_on'] is None)

            r = await c.get(f'/api/admin/leads/{uuid.uuid4()}', headers=h)
            check('unknown lead 404', r.status_code == 404)
            r = await c.get(f'/api/admin/leads/{lead_id}')
            check('no auth refused', r.status_code in (401, 404))
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(AgencyLead).where(AgencyLead.id == uuid.UUID(lead_id)))
            await db.execute(delete(User).where(User.email == staff_email))
            await db.commit()

    # The real email body: escaped, line breaks kept, reply-to set.
    captured = {}
    email_svc._send = lambda to, subject, html, reply_to=None: captured.update(html=html, reply_to=reply_to) or True
    email_svc.settings.REPLY_TO_EMAIL = 'info@kleelab.com'
    email_svc.send_lead_reply('x@example.com', 'S', 'Hi <b>you</b>\nline two\n\nPara two', 'Ada')
    check('email escapes html', '&lt;b&gt;' in captured['html'] and '<b>you' not in captured['html'])
    check('email keeps breaks and paragraphs', 'you&lt;/b&gt;<br>line two</p><p>Para two</p>' in captured['html'])
    check('reply-to set', captured['reply_to'] == 'info@kleelab.com')

asyncio.run(main())
finish()
