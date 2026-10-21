import asyncio, tempfile, os, uuid
from _harness import check, finish  # noqa: E402  (sets up the local test database)
from datetime import date, timedelta, datetime
os.environ['INVOICE_PAYMENT_DETAILS'] = 'Bank: Test Bank\\nAccount: 0000000000'
import httpx
from sqlalchemy import delete
from kleelab.main import app
from kleelab.core.database import AsyncSessionLocal
from kleelab.core.security import get_password_hash
from kleelab.models.user import User
from kleelab.models.project import Project, ProjectInvoice
from kleelab.routers import admin as admin_router

PW = 'Money-' + uuid.uuid4().hex[:12]
invites = []
admin_router._send_invite = lambda client, project: invites.append((client.email, project.title)) or True
# Kept for a look by eye, outside the repository.
OUT = os.path.join(tempfile.gettempdir(), 'kleelab_invoice_pdfs')
os.makedirs(OUT, exist_ok=True)

async def main():
    tag = uuid.uuid4().hex[:6]
    emails = [f'staff-{tag}@example.com', f'client-{tag}@example.com', f'other-{tag}@example.com']
    async with AsyncSessionLocal() as db:
        staff = User(email=emails[0], password_hash=get_password_hash(PW), is_verified=True, full_name='Ada Team'); staff.role = 'staff'
        client = User(email=emails[1], password_hash=get_password_hash(PW), is_verified=True, full_name='Ọlá Adé – “Shop”')
        other = User(email=emails[2], password_hash=get_password_hash(PW), is_verified=True)
        db.add_all([staff, client, other]); await db.flush()
        p = Project(client_id=client.id, reference=f'T-{tag}', title='Fabric shop — online', status='active')
        q = Project(client_id=other.id, reference=f'U-{tag}', title='Other', status='active')
        db.add_all([p, q]); await db.flush()
        i1 = ProjectInvoice(project_id=p.id, number=f'A{tag}', title='Deposit, 50% of the build', amount_cents=150_000_00, currency='NGN',
                            due_date=date.today() - timedelta(days=3), status='unpaid', pay_url='https://paystack.com/pay/example')
        i2 = ProjectInvoice(project_id=p.id, number=f'B{tag}', title='Design', amount_cents=500_00, currency='USD', status='paid', paid_at=datetime(2026, 10, 1))
        i3 = ProjectInvoice(project_id=p.id, number=f'C{tag}', title='Old quote', amount_cents=99_00, currency='USD', status='cancelled')
        db.add_all([i1, i2, i3]); await db.commit()
        ids = dict(staff=staff.id, client=client.id, project=p.id, other_project=q.id, i1=i1.id, i2=i2.id, i3=i3.id)
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://t') as c:
            r = await c.post('/api/auth/staff-login', json={'email': emails[0], 'password': PW})
            sh = {'Authorization': f"Bearer {r.json()['access_token']}"}
            r = await c.post('/api/auth/login', json={'email': emails[1], 'password': PW})
            ctok = r.json(); ch = {'Authorization': f"Bearer {ctok['access_token']}"}

            r = await c.get('/api/admin/invoices', headers=sh)
            mine = [i for i in r.json() if i['project_id'] == str(ids['project'])]
            check('admin invoices list', r.status_code == 200 and len(mine) == 3 and all(i['client_email'] == emails[1] for i in mine)
                  and mine[0]['project_reference'] == f'T-{tag}')

            r = await c.get('/api/admin/clients', headers=sh)
            cl = next((x for x in r.json() if x['id'] == str(ids['client'])), None)
            check('client listed', cl is not None and cl['project_count'] == 1 and cl['last_sign_in'] is not None)
            check('client totals skip cancelled', cl and {t['currency']: t['cents'] for t in cl['billed']} == {'NGN': 15_000_000, 'USD': 50_000}
                  and [t['currency'] for t in cl['outstanding']] == ['NGN'] and [t['currency'] for t in cl['paid']] == ['USD'])
            check('staff not listed as client', all(x['id'] != str(ids['staff']) for x in r.json()))

            r = await c.get(f"/api/admin/clients/{ids['client']}", headers=sh)
            d = r.json()
            check('client detail', r.status_code == 200 and len(d['projects']) == 1 and len(d['invoices']) == 3)
            r = await c.get(f"/api/admin/clients/{ids['staff']}", headers=sh)
            check('staff via clients -> 404', r.status_code == 404)
            r = await c.get('/api/admin/clients', headers=ch)
            check('client cannot use admin', r.status_code == 404)

            r = await c.get(f"/api/admin/projects/{ids['project']}", headers=sh) if False else await c.get(f"/api/projects/{ids['project']}", headers=sh)
            check('project detail has client_id for team', r.json().get('client_id') == str(ids['client']))
            r = await c.get(f"/api/projects/{ids['project']}", headers=ch)
            check('client view hides client_id', r.json().get('client_id') is None)

            for key in ('i1', 'i2', 'i3'):
                r = await c.get(f"/api/projects/{ids['project']}/invoices/{ids[key]}/pdf", headers=sh)
                ok = r.status_code == 200 and r.headers['content-type'] == 'application/pdf' and r.content[:4] == b'%PDF'
                check(f'staff pdf {key}', ok and 'KleeLab-' in r.headers['content-disposition'])
                open(os.path.join(OUT, f'{key}.pdf'), 'wb').write(r.content)
            r = await c.get(f"/api/projects/{ids['project']}/invoices/{ids['i1']}/pdf", headers=ch)
            check('client gets own pdf', r.status_code == 200 and r.content[:4] == b'%PDF')
            r = await c.post('/api/auth/login', json={'email': emails[2], 'password': PW})
            oh = {'Authorization': f"Bearer {r.json()['access_token']}"}
            r = await c.get(f"/api/projects/{ids['project']}/invoices/{ids['i1']}/pdf", headers=oh)
            check("other client can't get it", r.status_code == 404)
            r = await c.get(f"/api/projects/{ids['project']}/invoices/{ids['i1']}/pdf")
            check('no auth refused', r.status_code == 401)
            r = await c.get(f"/api/projects/{ids['project']}/invoices/{uuid.uuid4()}/pdf", headers=sh)
            check('unknown invoice 404', r.status_code == 404)

            r = await c.patch(f"/api/admin/clients/{ids['client']}", headers=sh, json={'is_active': False})
            check('deactivate', r.status_code == 200 and r.json()['is_active'] is False)
            r = await c.get('/api/projects', headers=ch)
            check('old access token refused at once', r.status_code == 401)
            r = await c.post('/api/auth/refresh', json={'refresh_token': ctok['refresh_token']})
            check('refresh refused', r.status_code in (401, 403))
            r = await c.post('/api/auth/login', json={'email': emails[1], 'password': PW})
            check('login refused', r.status_code == 403)
            r = await c.post(f"/api/admin/clients/{ids['client']}/invite", headers=sh)
            check('invite blocked while off', r.status_code == 409 and not invites)

            r = await c.patch(f"/api/admin/clients/{ids['client']}", headers=sh, json={'is_active': True, 'full_name': '  Ola Ade  '})
            check('reactivate and rename', r.json()['is_active'] is True and r.json()['name'] == 'Ola Ade')
            r = await c.post(f"/api/admin/clients/{ids['client']}/invite", headers=sh)
            check('invite sent', r.status_code == 200 and invites[-1] == (emails[1], 'Fabric shop — online'))
            r = await c.post('/api/auth/login', json={'email': emails[1], 'password': PW})
            check('login works again', r.status_code == 200)
            r = await c.patch(f"/api/admin/clients/{ids['staff']}", headers=sh, json={'is_active': False})
            check('cannot switch off staff here', r.status_code == 404)
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(Project).where(Project.id.in_([ids['project'], ids['other_project']])))
            await db.execute(delete(User).where(User.email.in_(emails)))
            await db.commit()

asyncio.run(main())
finish()
