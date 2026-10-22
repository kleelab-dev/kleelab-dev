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
from kleelab.services import email as email_svc
from kleelab.services import projects as project_svc

PW = 'Prop-' + uuid.uuid4().hex[:12]
proposal_emails, invites, notices, team = [], [], [], []
ok = {'value': True}


def fake_proposal(email, name, title, reference, url, total, valid_until, sender):
    proposal_emails.append(dict(email=email, url=url, total=total, sender=sender))
    return ok['value']


email_svc.send_proposal_email = fake_proposal
email_svc.send_team_notice = lambda subject, lines, project_id=None, also_to=None: team.append((subject, also_to)) or True
email_svc.send_client_project_notice = lambda email, pid, title, headline: notices.append((email, headline)) or True
project_svc.send_invite = lambda client, project: invites.append((client.email, project.title)) or True

async def token_of(pid):
    async with AsyncSessionLocal() as db:
        return (await db.execute(text('select token from proposals where id = :i'), {'i': pid})).scalar()


ITEMS = [{'description': 'Design and build', 'amount_cents': 90_000_000}, {'description': 'Content set-up', 'amount_cents': 10_000_050}]


async def main():
    tag = uuid.uuid4().hex[:8]
    staff_email = f'staff-{tag}@example.com'
    lead_email = f'Lead-{tag}@Example.com'
    known_email = f'known-{tag}@example.com'
    async with AsyncSessionLocal() as db:
        staff = User(email=staff_email, password_hash=get_password_hash(PW), is_verified=True, full_name='Ada Team')
        staff.role = 'staff'
        known = User(email=known_email, password_hash=get_password_hash(PW), is_verified=True, full_name='Known Client')
        lead = AgencyLead(email=lead_email.lower(), name='Bola Ade', company='Bola Fabrics', message='Need a shop', status='new', source='marketing')
        lead2 = AgencyLead(email=known_email, name='Known', message='Another one', status='contacted', source='marketing')
        db.add_all([staff, known, lead, lead2])
        await db.commit()
        lead_id, lead2_id = str(lead.id), str(lead2.id)
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://t') as c:
            r = await c.post('/api/auth/staff-login', json={'email': staff_email, 'password': PW})
            h = {'Authorization': f"Bearer {r.json()['access_token']}"}

            # --- Draft -------------------------------------------------------------
            r = await c.post('/api/admin/proposals', headers=h, json={'lead_id': lead_id})
            d = r.json()
            pid = d.get('id')
            check('create draft from lead', r.status_code == 201 and d['status'] == 'draft' and d['client_email'] == lead_email.lower()
                  and d['client_name'] == 'Bola Ade' and 'Bola Fabrics' in d['title'] and d['reference'].startswith('PRP-'))
            check('draft has default steps, terms, 50% and a date', len(d['stages']) == 6 and d['terms'] and d['deposit_percent'] == 50
                  and d['valid_until'] == (date.today() + timedelta(days=30)).isoformat())
            check('draft has no public link', d['public_url'] is None and d['author_name'] == 'Ada Team')

            r = await c.post(f'/api/admin/proposals/{pid}/send', headers=h)
            check('cannot send without prices', r.status_code == 422 and not proposal_emails)

            r = await c.patch(f'/api/admin/proposals/{pid}', headers=h, json={
                'items': ITEMS, 'currency': 'NGN', 'deposit_percent': 30, 'duration_weeks': 6,
                'summary': '  A shop for your fabrics.  ', 'scope': '', 'stages': [{'name': 'Design'}, {'name': 'Build', 'description': 'We build it'}],
            })
            d = r.json()
            check('patch draft', r.status_code == 200 and d['total_cents'] == 100_000_050 and d['revision'] == 2
                  and d['summary'] == 'A shop for your fabrics.' and d['scope'] is None and len(d['stages']) == 2)
            check('deposit is 30% rounded down to the unit', d['deposit_cents'] == 30_000_000)

            r = await c.patch(f'/api/admin/proposals/{pid}', headers=h, json={'client_email': staff_email})
            check('staff email refused as client', r.status_code == 422)

            token = await token_of(pid)
            r = await c.get(f'/api/proposals/{token}')
            check('draft is not public', r.status_code == 404)

            # --- Send ------------------------------------------------------------------
            ok['value'] = False
            r = await c.post(f'/api/admin/proposals/{pid}/send', headers=h)
            check('failed email -> 502, still draft', r.status_code == 502)
            r = await c.get(f'/api/admin/proposals/{pid}', headers=h)
            check('...status unchanged', r.json()['status'] == 'draft')
            ok['value'] = True
            r = await c.post(f'/api/admin/proposals/{pid}/send', headers=h)
            d = r.json()
            check('send', r.status_code == 200 and d['status'] == 'sent' and d['sent_at'] and d['public_url'].endswith(f'/proposal/{token}'))
            check('email carries link, total and sender', proposal_emails[-1]['url'] == d['public_url']
                  and proposal_emails[-1]['total'] == 'NGN 1,000,000.50' and proposal_emails[-1]['sender'] == 'Ada Team')
            r = await c.get(f'/api/admin/leads/{lead_id}', headers=h)
            ld = r.json()
            check('lead shows proposal and moved to contacted', ld['status'] == 'contacted' and ld['proposals'][0]['id'] == pid
                  and ld['proposals'][0]['status'] == 'sent')

            r = await c.delete(f'/api/admin/proposals/{pid}', headers=h)
            check('sent proposal cannot be deleted', r.status_code == 409)

            # --- Client reads -----------------------------------------------------------
            r = await c.get(f'/api/proposals/{token}')
            p = r.json()
            check('public read', r.status_code == 200 and p['title'] == d['title'] and p['total_cents'] == 100_000_050
                  and p['prepared_by'] == 'Ada Team' and p['revision'] == 2)
            check('public view leaks no ids or emails', 'id' not in p and 'lead_id' not in p and 'client_email' not in p and 'token' not in p)
            r = await c.get(f'/api/admin/proposals/{pid}', headers=h)
            check('viewed time recorded', r.json()['viewed_at'] is not None)
            r = await c.get('/api/admin/alerts', headers=h)
            check('opening shows on the alerts bell', any(a['action'] == 'proposal.viewed' for a in r.json()['items']))

            # Team edits while the client has it open.
            r = await c.patch(f'/api/admin/proposals/{pid}', headers=h, json={'title': 'Bola Fabrics online shop'})
            check('edit a sent proposal bumps revision', r.status_code == 200 and r.json()['revision'] == 3)
            r = await c.post(f'/api/proposals/{token}/accept', json={'name': 'Bola Ade', 'agree': True, 'revision': 2})
            check('stale revision refused', r.status_code == 409 and 'Reload' in r.text)
            r = await c.post(f'/api/proposals/{token}/accept', json={'name': 'Bola Ade', 'agree': False, 'revision': 3})
            check('must tick agree', r.status_code == 422)

            # --- Accept -----------------------------------------------------------------
            r = await c.post(f'/api/proposals/{token}/accept', json={'name': '  Bola Ade ', 'agree': True, 'revision': 3})
            a = r.json()
            check('accept', r.status_code == 200 and a['invited'] is True and a['invite_sent'] is True and a['email'] == lead_email.lower()
                  and a['proposal']['status'] == 'accepted' and a['proposal']['accepted_name'] == 'Bola Ade')
            check('invite sent to new client', invites[-1] == (lead_email.lower(), 'Bola Fabrics online shop'))
            check('team told, owner copied', team and team[-1][0].startswith('Proposal accepted') and team[-1][1] == [staff_email])

            r = await c.post(f'/api/proposals/{token}/accept', json={'name': 'Bola Ade', 'agree': True, 'revision': 3})
            check('second accept refused', r.status_code == 409)

            r = await c.get(f'/api/admin/proposals/{pid}', headers=h)
            d = r.json()
            project_id = d['project_id']
            check('proposal linked to project', d['status'] == 'accepted' and project_id)
            r = await c.get(f'/api/projects/{project_id}', headers=h)
            pd = r.json()
            check('project has proposal steps, first started', [s['name'] for s in pd['stages']] == ['Design', 'Build']
                  and pd['stages'][0]['status'] == 'in_progress' and pd['stages'][1]['description'] == 'We build it')
            check('project owner, lead and dates', pd['owner_name'] == 'Ada Team' and pd['lead_id'] == lead_id
                  and pd['target_date'] == (date.today() + timedelta(weeks=6)).isoformat())
            inv = pd['invoices']
            check('deposit invoice raised', len(inv) == 1 and inv[0]['amount_cents'] == 30_000_000 and inv[0]['currency'] == 'NGN'
                  and inv[0]['status'] == 'unpaid' and inv[0]['due_date'] == (date.today() + timedelta(days=7)).isoformat()
                  and inv[0]['title'].startswith('Deposit (30%)'))
            r = await c.get(f'/api/admin/leads/{lead_id}', headers=h)
            check('lead marked won and linked', r.json()['status'] == 'won' and r.json()['project_id'] == project_id)
            r = await c.patch(f'/api/admin/proposals/{pid}', headers=h, json={'title': 'Changed'})
            check('accepted proposal locked', r.status_code == 409)

            # --- Existing client, decline, withdraw, copy, expiry --------------------------
            r = await c.post('/api/admin/proposals', headers=h, json={'lead_id': lead2_id, 'items': ITEMS[:1], 'deposit_percent': 0, 'currency': 'USD'})
            p2 = r.json()['id']
            await c.post(f'/api/admin/proposals/{p2}/send', headers=h)
            t2 = await token_of(p2)
            r = await c.post(f'/api/proposals/{t2}/accept', json={'name': 'Known Client', 'agree': True, 'revision': 1})
            a2 = r.json()
            check('existing client accepts without invite', r.status_code == 200 and a2['invited'] is False and notices and notices[-1][0] == known_email)
            async with AsyncSessionLocal() as db:
                pr2 = await db.scalar(select(Project).where(Project.lead_id == uuid.UUID(lead2_id)))
                n_inv = len(list(await db.scalars(select(ProjectInvoice).where(ProjectInvoice.project_id == pr2.id))))
            check('0% deposit raises no invoice', n_inv == 0)

            r = await c.post('/api/admin/proposals', headers=h, json={'lead_id': lead_id, 'items': ITEMS})
            p3 = r.json()['id']
            await c.post(f'/api/admin/proposals/{p3}/send', headers=h)
            t3 = await token_of(p3)
            r = await c.post(f'/api/proposals/{t3}/decline', json={'reason': 'Too dear for now', 'revision': 1})
            check('decline', r.status_code == 200 and r.json()['status'] == 'declined' and team[-1][0].startswith('Proposal declined'))
            r = await c.post(f'/api/proposals/{t3}/accept', json={'name': 'X Y', 'agree': True, 'revision': 1})
            check('cannot accept after declining', r.status_code == 409)
            r = await c.post(f'/api/admin/proposals/{p3}/copy', headers=h)
            cp = r.json()
            check('copy makes a new draft', r.status_code == 201 and cp['status'] == 'draft' and cp['total_cents'] == 100_000_050 and cp['id'] != p3)
            r = await c.delete(f"/api/admin/proposals/{cp['id']}", headers=h)
            check('delete draft', r.status_code == 204)

            r = await c.post('/api/admin/proposals', headers=h, json={'lead_id': lead_id, 'items': ITEMS})
            p4 = r.json()['id']
            await c.post(f'/api/admin/proposals/{p4}/send', headers=h)
            t4 = await token_of(p4)
            async with AsyncSessionLocal() as db:
                await db.execute(text('update proposals set valid_until = :d where id = :i'),
                                 {'d': date.today() - timedelta(days=1), 'i': p4})
                await db.commit()
            r = await c.get(f'/api/proposals/{t4}')
            check('past date shows expired', r.json()['status'] == 'expired')
            r = await c.post(f'/api/proposals/{t4}/accept', json={'name': 'X Y', 'agree': True, 'revision': 1})
            check('expired cannot be accepted', r.status_code == 410)
            r = await c.post(f'/api/admin/proposals/{p4}/withdraw', headers=h)
            check('withdraw', r.status_code == 200 and r.json()['status'] == 'withdrawn')
            r = await c.get(f'/api/proposals/{t4}')
            check('withdrawn link still opens, says so', r.status_code == 200 and r.json()['status'] == 'withdrawn')

            r = await c.get(f'/api/proposals/{uuid.uuid4().hex}')
            check('unknown token 404', r.status_code == 404)
            r = await c.post('/api/admin/proposals', json={'lead_id': lead_id})
            check('team routes need staff', r.status_code in (401, 404))
            r = await c.post('/api/admin/proposals', headers=h, json={'lead_id': str(uuid.uuid4())})
            check('unknown lead 404', r.status_code == 404)
    finally:
        async with AsyncSessionLocal() as db:
            projects = list(await db.scalars(select(Project.id).where(Project.lead_id.in_([uuid.UUID(lead_id), uuid.UUID(lead2_id)]))))
            await db.execute(delete(ProjectInvoice).where(ProjectInvoice.project_id.in_(projects)))
            await db.execute(delete(ActivityEvent).where(ActivityEvent.project_id.in_(projects)))
            await db.execute(delete(Project).where(Project.id.in_(projects)))
            await db.execute(delete(AgencyLead).where(AgencyLead.id.in_([uuid.UUID(lead_id), uuid.UUID(lead2_id)])))
            await db.execute(delete(User).where(User.email.in_([staff_email, known_email, lead_email.lower()])))
            await db.commit()


asyncio.run(main())
finish()
