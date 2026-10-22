import asyncio, uuid
from _harness import check, finish  # noqa: E402  (sets up the local test database)
from datetime import date, timedelta, timezone
import httpx
from sqlalchemy import delete, select
from kleelab.main import app
from kleelab.core.database import AsyncSessionLocal
from kleelab.core.security import get_password_hash
from kleelab.models.user import User
from kleelab.models.agency_lead import AgencyLead
from kleelab.models.call import CallBooking
from kleelab.models.library import ProjectTemplate, SavedReply
from kleelab.models.project import Project
from kleelab.models.proposal import Proposal
from kleelab.models.activity import ActivityEvent
from kleelab.services import email as email_svc
from kleelab.services import projects as project_svc

PW = 'Tmpl-' + uuid.uuid4().hex[:12]

email_svc.send_proposal_email = lambda *a, **k: True
email_svc.send_call_confirmation = lambda *a, **k: True
email_svc.send_team_notice = lambda *a, **k: True
email_svc.send_client_project_notice = lambda *a, **k: True
project_svc.send_invite = lambda client, project: True

ITEMS = [{'description': 'Design and build', 'amount_cents': 50_000_000}]


async def main():
    tag = uuid.uuid4().hex[:8]
    staff_email = f'staff-{tag}@example.com'
    client_email = f'client-{tag}@example.com'
    emails = [f'lead{n}-{tag}@example.com' for n in range(4)]
    async with AsyncSessionLocal() as db:
        staff = User(email=staff_email, password_hash=get_password_hash(PW), is_verified=True, full_name='Ada Team')
        staff.role = 'staff'
        client = User(email=client_email, password_hash=get_password_hash(PW), is_verified=True, full_name='Bola Client')
        leads = [AgencyLead(email=e, name=f'Lead {n}', message='A site please', status='new', source='marketing')
                 for n, e in enumerate(emails)]
        db.add_all([staff, client, *leads])
        await db.commit()
        lead_ids = [str(lead.id) for lead in leads]
    template_ids, reply_ids, project_ids = [], [], []
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://t') as c:
            r = await c.post('/api/auth/staff-login', json={'email': staff_email, 'password': PW})
            h = {'Authorization': f"Bearer {r.json()['access_token']}"}
            r = await c.post('/api/auth/login', json={'email': client_email, 'password': PW})
            ch = {'Authorization': f"Bearer {r.json()['access_token']}"}

            # --- Project templates ------------------------------------------------------
            shop = {
                'name': f'Online shop {tag}', 'description': '  For anyone selling products  ',
                'stages': [{'name': 'Planning', 'description': 'We agree the products.'},
                           {'name': 'Shop build'}, {'name': 'Payments', 'description': 'Paystack goes live.'}],
                'checklist': [{'title': 'Product photos', 'description': 'One per product.'}, {'title': 'Prices'}],
            }
            r = await c.post('/api/admin/project-templates', headers=h, json=shop)
            t = r.json()
            template_ids.append(t.get('id'))
            check('template created, description trimmed, author named',
                  r.status_code == 201 and t['description'] == 'For anyone selling products'
                  and len(t['stages']) == 3 and t['checklist'][1]['description'] is None and t['created_by_name'] == 'Ada Team')
            r = await c.post('/api/admin/project-templates', headers=h, json={**shop, 'stages': []})
            check('template needs at least one step', r.status_code == 422)
            r = await c.get('/api/admin/project-templates', headers=ch)
            check('clients cannot see templates', r.status_code == 404)
            r = await c.get('/api/admin/project-templates', headers=h)
            check('templates listed', r.status_code == 200 and any(x['id'] == t['id'] for x in r.json()))
            r = await c.put(f"/api/admin/project-templates/{t['id']}", headers=h,
                            json={**shop, 'stages': shop['stages'] + [{'name': 'Hand-over'}]})
            check('template updated', r.status_code == 200 and [s['name'] for s in r.json()['stages']][-1] == 'Hand-over')

            # A project started from it gets its steps and list.
            r = await c.post('/api/admin/projects', headers=h, json={
                'client_email': client_email, 'title': 'Bola shop', 'template_id': t['id'], 'lead_id': lead_ids[3]})
            p = r.json().get('project', {})
            project_ids.append(p.get('id'))
            check('project from template has its steps, first started',
                  r.status_code == 201 and [s['name'] for s in p['stages']] == ['Planning', 'Shop build', 'Payments', 'Hand-over']
                  and p['stages'][0]['status'] == 'in_progress' and p['stages'][0]['description'] == 'We agree the products.')
            check('project from template has its checklist',
                  [i['title'] for i in p['checklist']] == ['Product photos', 'Prices'])
            r = await c.post('/api/admin/projects', headers=h, json={
                'client_email': client_email, 'title': 'Bola shop two', 'template_id': t['id'], 'stages': ['One', 'Two']})
            p2 = r.json().get('project', {})
            project_ids.append(p2.get('id'))
            check('steps sent with a template win, checklist still from it',
                  r.status_code == 201 and [s['name'] for s in p2['stages']] == ['One', 'Two'] and len(p2['checklist']) == 2)
            r = await c.post('/api/admin/projects', headers=h, json={
                'client_email': client_email, 'title': 'Missing template', 'template_id': str(uuid.uuid4())})
            check('unknown template refused', r.status_code == 404)
            r = await c.post('/api/admin/projects', headers=h, json={'client_email': client_email, 'title': 'Plain one'})
            p3 = r.json().get('project', {})
            project_ids.append(p3.get('id'))
            check('no template keeps the usual steps and list', len(p3['stages']) == 6 and len(p3['checklist']) == 5)

            # Save a project's steps as a new template.
            r = await c.post(f"/api/admin/projects/{p2['id']}/save-as-template", headers=h, json={'name': f'Two step {tag}'})
            saved = r.json()
            template_ids.append(saved.get('id'))
            check('project saved as a template', r.status_code == 201 and [s['name'] for s in saved['stages']] == ['One', 'Two']
                  and [i['title'] for i in saved['checklist']] == ['Product photos', 'Prices'])
            r = await c.post(f"/api/admin/projects/{p2['id']}/save-as-template", headers=ch, json={'name': 'Nope'})
            check('clients cannot save templates', r.status_code == 404)

            r = await c.delete(f"/api/admin/project-templates/{saved['id']}", headers=h)
            r2 = await c.get('/api/admin/project-templates', headers=h)
            check('template removed', r.status_code == 204 and all(x['id'] != saved['id'] for x in r2.json()))
            r = await c.get(f"/api/projects/{p2['id']}", headers=h)
            check('removing a template leaves projects alone', r.status_code == 200 and len(r.json()['stages']) == 2)

            # --- Saved replies ---------------------------------------------------------------
            r = await c.post('/api/admin/saved-replies', headers=h, json={
                'title': f'Thanks {tag}', 'body': '  Hi {first_name},\n\nThanks for getting in touch.\n\n{my_name}  '})
            reply = r.json()
            reply_ids.append(reply.get('id'))
            check('saved reply created and trimmed', r.status_code == 201 and reply['body'].startswith('Hi {first_name}')
                  and reply['body'].endswith('{my_name}'))
            r = await c.post('/api/admin/saved-replies', headers=h, json={'title': 'x', 'body': 'short title'})
            check('saved reply needs a real title', r.status_code == 422)
            r = await c.put(f"/api/admin/saved-replies/{reply['id']}", headers=h, json={'title': f'Thank you {tag}', 'body': 'Hello'})
            check('saved reply updated', r.status_code == 200 and r.json()['body'] == 'Hello')
            r = await c.get('/api/admin/saved-replies', headers=ch)
            check('clients cannot see saved replies', r.status_code == 404)
            r = await c.delete(f"/api/admin/saved-replies/{reply['id']}", headers=h)
            r2 = await c.get('/api/admin/saved-replies', headers=h)
            check('saved reply removed', r.status_code == 204 and all(x['id'] != reply['id'] for x in r2.json()))

            # --- Pipeline ----------------------------------------------------------------------
            r = await c.patch(f'/api/admin/leads/{lead_ids[0]}', headers=h, json={'status': 'proposal'})
            check('lead moved to a new column', r.status_code == 200 and r.json()['status'] == 'proposal')
            r = await c.patch(f'/api/admin/leads/{lead_ids[0]}', headers=h, json={'status': 'maybe'})
            check('unknown status refused', r.status_code == 422)
            async with AsyncSessionLocal() as db:
                event = await db.scalar(select(ActivityEvent).where(
                    ActivityEvent.subject_id == uuid.UUID(lead_ids[0]), ActivityEvent.action == 'lead.status'))
            check('move logged in words', event is not None and 'proposal sent' in event.summary)

            # A follow-up on a lead with a call booked is still due.
            past = (date.today() - timedelta(days=1)).isoformat()
            await c.patch(f'/api/admin/leads/{lead_ids[1]}', headers=h, json={'status': 'call', 'follow_up_on': past})
            r = await c.get('/api/admin/overview', headers=h)
            check('follow-up due on a lead with a call booked',
                  any(i.get('lead_id') == lead_ids[1] and i['kind'] != 'new_enquiry' for i in r.json()))

            # Booking a call moves an open enquiry to "call booked".
            r = await c.get('/api/calls/slots')
            slot = r.json()['slots'][-1]
            r = await c.post('/api/calls', json={'phone': '+2348031234567', 'name': 'Lead Two', 'email': emails[2], 'starts_at': slot})
            async with AsyncSessionLocal() as db:
                lead2 = await db.get(AgencyLead, uuid.UUID(lead_ids[2]))
                calls_for = list(await db.scalars(select(CallBooking).where(CallBooking.lead_id == lead2.id)))
            check('booking a call moves the enquiry to call booked', r.status_code == 201 and lead2.status == 'call' and len(calls_for) == 1)

            # Sending a proposal moves it on to "proposal sent".
            r = await c.post('/api/admin/proposals', headers=h, json={'lead_id': lead_ids[2], 'items': ITEMS})
            pid = r.json()['id']
            r = await c.post(f'/api/admin/proposals/{pid}/send', headers=h)
            r2 = await c.get(f'/api/admin/leads/{lead_ids[2]}', headers=h)
            check('sending a proposal moves the enquiry to proposal sent', r.status_code == 200 and r2.json()['status'] == 'proposal')

            # A new call from someone with a proposal out joins it and leaves it there.
            # (Clear the first call: one booked call per person at a time.)
            async with AsyncSessionLocal() as db:
                await db.execute(delete(CallBooking).where(CallBooking.lead_id == uuid.UUID(lead_ids[2])))
                await db.commit()
            slot2 = (await c.get('/api/calls/slots')).json()['slots'][-2]
            r = await c.post('/api/calls', json={'phone': '+2348031234567', 'name': 'Lead Two', 'email': emails[2], 'starts_at': slot2})
            r2 = await c.get(f'/api/admin/leads/{lead_ids[2]}', headers=h)
            check('a call from someone with a proposal out keeps it at proposal sent',
                  r.status_code == 201 and r2.json()['status'] == 'proposal')

            r = await c.get(f'/api/admin/leads/{lead_ids[3]}', headers=h)
            check('starting a project still marks the enquiry won', r.json()['status'] == 'won')
    finally:
        async with AsyncSessionLocal() as db:
            ids = [uuid.UUID(i) for i in project_ids if i]
            await db.execute(delete(ActivityEvent).where(ActivityEvent.project_id.in_(ids)))
            await db.execute(delete(Project).where(Project.id.in_(ids)))
            await db.execute(delete(Proposal).where(Proposal.lead_id.in_([uuid.UUID(i) for i in lead_ids])))
            await db.execute(delete(ProjectTemplate).where(ProjectTemplate.id.in_([uuid.UUID(i) for i in template_ids if i])))
            await db.execute(delete(SavedReply).where(SavedReply.id.in_([uuid.UUID(i) for i in reply_ids if i])))
            subjects = [uuid.UUID(i) for i in lead_ids + template_ids + reply_ids if i]
            await db.execute(delete(ActivityEvent).where(ActivityEvent.subject_id.in_(subjects)))
            await db.execute(delete(AgencyLead).where(AgencyLead.email.in_(emails)))
            await db.execute(delete(User).where(User.email.in_([staff_email, client_email])))
            await db.commit()


asyncio.run(main())
finish()
