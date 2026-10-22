import asyncio, uuid
from _harness import check, finish  # noqa: E402  (sets up the local test database)
from datetime import date, datetime, timedelta, timezone
import httpx
from sqlalchemy import delete, select
from kleelab.main import app
from kleelab.core.config import settings
from kleelab.core.database import AsyncSessionLocal
from kleelab.core.security import get_password_hash
from kleelab.models.user import User
from kleelab.models.agency_lead import AgencyLead
from kleelab.models.call import CallBooking
from kleelab.models.project import Project
from kleelab.models.activity import ActivityEvent
from kleelab.routers import projects as projects_router
from kleelab.services import calls as call_svc
from kleelab.services import email as email_svc
from kleelab.services import projects as project_svc

PW = 'Call-' + uuid.uuid4().hex[:12]
sent = {'confirm': [], 'cancelled': [], 'team': [], 'client': []}

email_svc.send_call_confirmation = lambda email, name, when, minutes, manage, cal, meet, moved=False: sent['confirm'].append((email, when, moved)) or True
email_svc.send_call_cancelled = lambda email, name, when, book, by_team, reason=None: sent['cancelled'].append((email, by_team, reason)) or True
email_svc.send_team_notice = lambda subject, lines, project_id=None, also_to=None, path=None: sent['team'].append((subject, path)) or True
projects_router.send_team_notice = lambda subject, lines, project_id=None, also_to=None: sent['team'].append((subject, None)) or True
email_svc.send_client_project_notice = lambda email, pid, title, headline: sent['client'].append(headline) or True
project_svc.send_invite = lambda client, project: True


def iso(moment):
    return moment.replace(tzinfo=timezone.utc).isoformat()


def parse(text):
    return datetime.fromisoformat(text.replace('Z', '+00:00')).astimezone(timezone.utc).replace(tzinfo=None)


async def main():
    tag = uuid.uuid4().hex[:8]
    staff_email = f'staff-{tag}@example.com'
    client_email = f'client-{tag}@example.com'
    callers = [f'caller{n}-{tag}@example.com' for n in range(4)]
    async with AsyncSessionLocal() as db:
        staff = User(email=staff_email, password_hash=get_password_hash(PW), is_verified=True, full_name='Ada Team')
        staff.role = 'staff'
        client = User(email=client_email, password_hash=get_password_hash(PW), is_verified=True, full_name='Bola Client')
        # An enquiry already being talked about: a call from the same address joins it.
        talking = AgencyLead(email=callers[3], name='Existing', message='Need a shop', status='contacted', source='marketing')
        db.add_all([staff, client, talking])
        await db.commit()
        talking_id = talking.id
    project_id = None
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://t') as c:
            r = await c.post('/api/auth/staff-login', json={'email': staff_email, 'password': PW})
            h = {'Authorization': f"Bearer {r.json()['access_token']}"}
            r = await c.post('/api/auth/login', json={'email': client_email, 'password': PW})
            ch = {'Authorization': f"Bearer {r.json()['access_token']}"}

            # --- Open times ------------------------------------------------------------
            r = await c.get('/api/calls/slots')
            body = r.json()
            slots = [parse(s) for s in body['slots']]
            now = project_svc.now()
            off = timedelta(minutes=settings.CALL_UTC_OFFSET_MINUTES)
            check('slots listed', r.status_code == 200 and len(slots) > 20 and body['duration_minutes'] == settings.CALL_MINUTES)
            check('slots marked as UTC', body['slots'][0].endswith('Z') or body['slots'][0].endswith('+00:00'))
            check('weekdays in opening hours only', all(
                (s + off).weekday() < 5 and settings.CALL_DAY_START_HOUR <= (s + off).hour
                and (s + off + timedelta(minutes=settings.CALL_MINUTES)).hour <= settings.CALL_DAY_END_HOUR
                for s in slots))
            check('enough notice, not too far ahead', all(
                now + timedelta(hours=settings.CALL_MIN_NOTICE_HOURS) <= s <= now + timedelta(days=settings.CALL_BOOKING_DAYS)
                for s in slots))
            check('soonest first', slots == sorted(slots))

            # --- Booking -----------------------------------------------------------------
            first, second, third = slots[0], slots[1], slots[2]
            r = await c.post('/api/calls', json={'name': 'No Phone', 'email': callers[0], 'starts_at': iso(first)})
            check('phone needed', r.status_code == 422)
            r = await c.post('/api/calls', json={'phone': '08031234567', 'name': 'Local Phone', 'email': callers[0], 'starts_at': iso(first)})
            check('phone needs its country code', r.status_code == 422)
            r = await c.post('/api/calls', json={'phone': '+2348031234567', 'name': 'Caller Zero', 'email': callers[0].upper(), 'company': 'Zero Ltd',
                                                 'notes': 'A booking site for my salon', 'starts_at': iso(first)})
            booked = r.json()
            token = booked.get('token')
            check('book a call', r.status_code == 201 and token and parse(booked['starts_at']) == first
                  and booked['status'] == 'booked' and 'calendar.google.com' in booked['calendar_url'])
            check('booker and team told', sent['confirm'][-1][0] == callers[0] and sent['team'][-1][0].startswith('Call booked'))
            async with AsyncSessionLocal() as db:
                saved = await db.scalar(select(CallBooking.phone).where(CallBooking.email == callers[0]))
            check('phone saved', saved == '+2348031234567')
            r = await c.get('/api/calls/slots')
            check('booked time no longer offered', iso(first).replace('+00:00', 'Z') not in r.json()['slots']
                  and first not in [parse(s) for s in r.json()['slots']])
            r = await c.post('/api/calls', json={'phone': '+2348031234567', 'name': 'Caller One', 'email': callers[1], 'starts_at': iso(first)})
            check('same time refused', r.status_code == 409)
            r = await c.post('/api/calls', json={'phone': '+2348031234567', 'name': 'Caller Zero', 'email': callers[0], 'starts_at': iso(second)})
            check('one booked call per person', r.status_code == 409 and 'already have a call' in r.json()['error']['message'])
            r = await c.post('/api/calls', json={'phone': '+2348031234567', 'name': 'Night', 'email': callers[1], 'starts_at': iso(first.replace(hour=2))})
            check('time outside opening hours refused', r.status_code == 409)
            r = await c.post('/api/calls', json={'phone': '+2348031234567', 'name': 'Bot', 'email': callers[2], 'starts_at': iso(third), 'website': 'spam.example'})
            async with AsyncSessionLocal() as db:
                bot = await db.scalar(select(CallBooking).where(CallBooking.email == callers[2]))
                lead = await db.scalar(select(AgencyLead).where(AgencyLead.email == callers[0]))
            check('honeypot looks booked, keeps nothing', r.status_code == 201 and bot is None)
            check('booking makes an enquiry', lead and lead.source == 'call' and lead.status == 'call' and lead.company == 'Zero Ltd'
                  and lead.message == 'A booking site for my salon')

            r = await c.post('/api/calls', json={'phone': '+2348031234567', 'name': 'Existing', 'email': callers[3], 'starts_at': iso(third)})
            third_token = r.json()['token']
            async with AsyncSessionLocal() as db:
                leads = list(await db.scalars(select(AgencyLead).where(AgencyLead.email == callers[3])))
            check('call joins an open enquiry', r.status_code == 201 and len(leads) == 1 and leads[0].id == talking_id)

            # --- Manage page ----------------------------------------------------------------
            r = await c.get(f'/api/calls/{token}')
            check('manage page reads the booking', r.status_code == 200 and r.json()['name'] == 'Caller Zero' and 'token' not in r.json())
            r = await c.get('/api/calls/not-a-token')
            check('unknown link is 404', r.status_code == 404)
            r = await c.post(f'/api/calls/{token}/reschedule', json={'starts_at': iso(third)})
            check('cannot move onto a taken time', r.status_code == 409)
            r = await c.post(f'/api/calls/{token}/reschedule', json={'starts_at': iso(second)})
            check('move the call', r.status_code == 200 and parse(r.json()['starts_at']) == second and sent['confirm'][-1][2] is True)
            r = await c.get('/api/calls/slots')
            free = [parse(s) for s in r.json()['slots']]
            check('old time is free again', first in free and second not in free)
            r = await c.post(f'/api/calls/{token}/cancel', json={'reason': 'Found someone local'})
            check('cancel the call', r.status_code == 200 and r.json()['status'] == 'cancelled' and r.json()['cancelled_by'] == 'client'
                  and r.json()['meeting_url'] is None)
            check('cancellation confirmed', sent['cancelled'][-1] == (callers[0], False, None) and sent['team'][-1][0].startswith('Call cancelled'))
            r = await c.post(f'/api/calls/{token}/cancel', json={})
            check('cannot cancel twice', r.status_code == 409)
            r = await c.post(f'/api/calls/{token}/reschedule', json={'starts_at': iso(first)})
            check('cannot move a cancelled call', r.status_code == 409)
            r = await c.post('/api/calls', json={'phone': '+2348031234567', 'name': 'Caller Zero', 'email': callers[0], 'starts_at': iso(second)})
            check('book again after cancelling', r.status_code == 201)

            # --- The team's side -----------------------------------------------------------
            r = await c.get('/api/admin/calls', headers=h)
            mine = [x for x in r.json() if x['email'] in callers]
            check('team lists calls', r.status_code == 200 and len(mine) == 3)
            r = await c.get('/api/admin/calls', headers={})
            check('call list needs staff', r.status_code in (401, 404))
            r = await c.get('/api/admin/calls', headers=ch)
            check('clients cannot list calls', r.status_code == 404)
            r = await c.get('/api/admin/calls', headers=h)
            existing = next(x for x in r.json() if x['email'] == callers[3])
            r = await c.post(f"/api/admin/calls/{existing['id']}/cancel", headers=h, json={'reason': 'Ada is off sick'})
            check('team cancels a call', r.status_code == 200 and r.json()['cancelled_by'] == 'team'
                  and sent['cancelled'][-1] == (callers[3], True, 'Ada is off sick'))
            r = await c.get(f'/api/calls/{third_token}')
            check('booker sees the team reason', r.json()['cancel_reason'] == 'Ada is off sick')
            r = await c.get(f'/api/admin/leads/{talking_id}', headers=h)
            check('lead page shows its calls', r.status_code == 200 and len(r.json()['calls']) == 1)

            # A call coming up soon shows on the overview; one that already happened cannot be changed.
            async with AsyncSessionLocal() as db:
                soon = CallBooking(lead_id=talking_id, name='Soon', email=callers[3], starts_at=now + timedelta(hours=3),
                                   duration_minutes=30, status='booked', token=call_svc.new_token())
                gone = CallBooking(lead_id=talking_id, name='Gone', email=callers[3], starts_at=now - timedelta(hours=3),
                                   duration_minutes=30, status='booked', token=call_svc.new_token())
                db.add_all([soon, gone])
                await db.commit()
                gone_token = gone.token
            r = await c.get('/api/admin/overview', headers=h)
            check('overview shows the call coming up', any(i['kind'] == 'upcoming_call' and i['lead_id'] == str(talking_id)
                                                           and 'Soon' in i['text'] for i in r.json()))
            r = await c.post(f'/api/calls/{gone_token}/cancel', json={})
            check('past call cannot be cancelled', r.status_code == 409)
            r = await c.get(f'/api/calls/{gone_token}')
            check('past call says so', r.json()['past'] is True)

            # --- Getting started checklist ---------------------------------------------------
            r = await c.post('/api/admin/projects', headers=h, json={'client_email': client_email, 'title': 'Salon site',
                                                                     'start_date': (date.today() - timedelta(days=10)).isoformat()})
            project_id = r.json()['project']['id']
            items = r.json()['project']['checklist']
            check('new project gets the standard list', len(items) == len(project_svc.DEFAULT_CHECKLIST)
                  and [i['position'] for i in items] == list(range(len(items))) and not any(i['done_at'] for i in items))
            r = await c.get('/api/admin/overview', headers=h)
            check('overview flags a list still waiting', any(i['kind'] == 'checklist_waiting' and i['project_id'] == project_id
                                                             for i in r.json()))

            r = await c.post(f"/api/projects/{project_id}/checklist/{items[0]['id']}", headers=ch, json={'done': True, 'note': 'Logo is in Files'})
            done = r.json()['checklist'][0]
            check('client ticks one off with a note', r.status_code == 200 and done['done_at'] and done['note'] == 'Logo is in Files'
                  and done['done_by_name'] == 'Bola Client')
            r = await c.post(f"/api/projects/{project_id}/checklist/{items[0]['id']}", headers=ch, json={'done': False})
            check('and unticks it', r.json()['checklist'][0]['done_at'] is None and r.json()['checklist'][0]['note'] is None)
            r = await c.post(f"/api/projects/{project_id}/checklist/{uuid.uuid4()}", headers=ch, json={'done': True})
            check('unknown item is 404', r.status_code == 404)

            r = await c.post(f'/api/admin/projects/{project_id}/checklist', headers=h, json={'title': 'Your opening hours', 'description': 'For the contact page'})
            extra = r.json()['checklist'][-1]
            check('team adds an item', r.status_code == 201 and extra['title'] == 'Your opening hours' and extra['position'] == len(items))
            r = await c.patch(f"/api/admin/projects/{project_id}/checklist/{extra['id']}", headers=h, json={'title': 'Opening hours'})
            check('team renames it', r.json()['checklist'][-1]['title'] == 'Opening hours')
            r = await c.delete(f"/api/admin/projects/{project_id}/checklist/{items[1]['id']}", headers=h)
            left = r.json()['checklist']
            check('team removes one, positions closed up', len(left) == len(items) and [i['position'] for i in left] == list(range(len(left))))
            r = await c.post(f'/api/admin/projects/{project_id}/checklist/standard', headers=h)
            check('standard list puts back only what is missing', len(r.json()['checklist']) == len(items) + 1)
            r = await c.post(f'/api/admin/projects/{project_id}/checklist', headers=ch, json={'title': 'Sneaky'})
            check('clients cannot add items', r.status_code == 404)

            sent['team'].clear()
            r = await c.get(f'/api/projects/{project_id}', headers=ch)
            ids = [i['id'] for i in r.json()['checklist']]
            # The team ticks the first one (it came by email); the client does the rest.
            await c.post(f"/api/projects/{project_id}/checklist/{ids[0]}", headers=h, json={'done': True, 'note': 'Came by email'})
            for item_id in ids[1:-1]:
                await c.post(f"/api/projects/{project_id}/checklist/{item_id}", headers=ch, json={'done': True})
            check('team not told before the last one', not any('Everything is in' in s for s, _ in sent['team']))
            r = await c.post(f"/api/projects/{project_id}/checklist/{ids[-1]}", headers=ch, json={'done': True})
            check('team told when everything is in', sum('Everything is in' in s for s, _ in sent['team']) == 1)
            check('team tick is credited to the team', r.json()['checklist'][0]['done_by_name'] == 'Ada Team')
            r = await c.get('/api/admin/overview', headers=h)
            check('overview stops flagging it', not any(i['kind'] == 'checklist_waiting' and i['project_id'] == project_id for i in r.json()))
            async with AsyncSessionLocal() as db:
                logged = await db.scalar(select(ActivityEvent.id).where(ActivityEvent.action == 'checklist.done',
                                                                        ActivityEvent.project_id == uuid.UUID(project_id)).limit(1))
            check('ticks are in the activity log', logged)

            # --- Hand-over pack ---------------------------------------------------------------
            r = await c.post(f'/api/admin/projects/{project_id}/handover/publish', headers=h)
            check('cannot publish an empty pack', r.status_code == 422)
            pack = {'notes': 'Update prices from the dashboard.', 'items': [
                {'label': 'Live site', 'url': 'https://salon.example.com'},
                {'label': 'Domain registrar', 'value': 'Whogohost, renews every March'},
            ]}
            r = await c.put(f'/api/admin/projects/{project_id}/handover', headers=h, json=pack)
            check('team writes the pack', r.status_code == 200 and r.json()['handover']['items'][0]['url'].startswith('https://salon.example.com')
                  and r.json()['handover']['published_at'] is None)
            r = await c.get(f'/api/projects/{project_id}', headers=ch)
            check('client cannot see a draft pack', r.json()['handover'] is None)
            r = await c.put(f'/api/admin/projects/{project_id}/handover', headers=h, json={'items': [{'label': 'Bad', 'url': 'javascript:alert(1)'}]})
            check('links must be web addresses', r.status_code == 422)
            r = await c.put(f'/api/admin/projects/{project_id}/handover', headers=ch, json=pack)
            check('clients cannot write the pack', r.status_code == 404)

            r = await c.patch(f'/api/admin/projects/{project_id}', headers=h, json={'status': 'completed'})
            r = await c.get('/api/admin/overview', headers=h)
            check('finished project without a pack is flagged', any(i['kind'] == 'handover_missing' and i['project_id'] == project_id for i in r.json()))

            sent['client'].clear()
            r = await c.post(f'/api/admin/projects/{project_id}/handover/publish', headers=h)
            check('publish the pack', r.status_code == 200 and r.json()['handover']['published_at'])
            check('client emailed', sent['client'] == ['Your hand-over pack is ready'])
            check('posted on the timeline', any(u['title'] == 'Your hand-over pack is ready' for u in r.json()['updates']))
            r = await c.post(f'/api/admin/projects/{project_id}/handover/publish', headers=h)
            check('publishing twice refused', r.status_code == 409)
            r = await c.get(f'/api/projects/{project_id}', headers=ch)
            got = r.json()['handover']
            check('client sees the published pack', got and got['notes'] == pack['notes'] and len(got['items']) == 2)
            r = await c.get('/api/admin/overview', headers=h)
            check('flag cleared once published', not any(i['kind'] == 'handover_missing' and i['project_id'] == project_id for i in r.json()))
            await c.post(f'/api/admin/projects/{project_id}/handover/unpublish', headers=h)
            r = await c.get(f'/api/projects/{project_id}', headers=ch)
            check('unpublish hides it again', r.json()['handover'] is None)
    finally:
        async with AsyncSessionLocal() as db:
            if project_id:
                await db.execute(delete(ActivityEvent).where(ActivityEvent.project_id == uuid.UUID(project_id)))
                await db.execute(delete(Project).where(Project.id == uuid.UUID(project_id)))
            lead_ids = list(await db.scalars(select(AgencyLead.id).where(AgencyLead.email.in_(callers))))
            await db.execute(delete(ActivityEvent).where(ActivityEvent.subject_id.in_(lead_ids)))
            await db.execute(delete(AgencyLead).where(AgencyLead.id.in_(lead_ids)))
            await db.execute(delete(User).where(User.email.in_([staff_email, client_email])))
            await db.commit()


asyncio.run(main())
finish()
