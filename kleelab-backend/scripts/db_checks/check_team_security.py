import asyncio, os, time, uuid
from _harness import check, finish  # noqa: E402  (sets up the local test database)
from datetime import timedelta
import httpx
from jose import jwt
from sqlalchemy import delete, select, update
from kleelab.main import app
from kleelab.core.config import settings
from kleelab.core.database import AsyncSessionLocal
from kleelab.core.security import create_signed_token, get_password_hash
from kleelab.models.activity import ActivityEvent
from kleelab.models.agency_lead import AgencyLead
from kleelab.models.user import User
from kleelab.models.project import Project, ProjectInvoice
from kleelab.routers import auth as auth_router, projects as projects_router, team as team_router
from kleelab.services import two_step

PW = 'Team-' + uuid.uuid4().hex[:12]
notices, team_notices, staff_invites = [], [], []
auth_router.send_security_notice = lambda email, subject, lines: notices.append((email, subject)) or True
team_router.send_security_notice = lambda email, subject, lines: notices.append((email, subject)) or True
projects_router.send_team_notice = lambda subject, lines, project_id=None, also_to=None: team_notices.append((subject, project_id, also_to)) or True
team_router.send_staff_invite_email = lambda email, name, inviter, token: staff_invites.append((email, token)) or True

def msg(r):
    return r.json().get('error', {}).get('message', '')

async def set_user(user_id, **values):
    async with AsyncSessionLocal() as db:
        await db.execute(update(User).where(User.id == user_id).values(**values))
        await db.commit()

async def events_for(user_id):
    async with AsyncSessionLocal() as db:
        return list(await db.scalars(select(ActivityEvent).where(ActivityEvent.actor_id == user_id).order_by(ActivityEvent.created_at)))

async def main():
    tag = uuid.uuid4().hex[:6]
    emails = [f'lead-{tag}@example.com', f'client-{tag}@example.com', f'new-{tag}@example.com']
    async with AsyncSessionLocal() as db:
        staff = User(email=emails[0], password_hash=get_password_hash(PW), is_verified=True, full_name='Ada Lead'); staff.role = 'staff'
        client = User(email=emails[1], password_hash=get_password_hash(PW), is_verified=True, full_name=f'Zed Client {tag}')
        db.add_all([staff, client]); await db.flush()
        p = Project(client_id=client.id, owner_id=staff.id, reference=f'S-{tag}', title=f'Search me {tag}', status='active')
        db.add(p); await db.flush()
        inv = ProjectInvoice(project_id=p.id, number=f'Q{tag}', title='Deposit', amount_cents=1000, currency='USD', status='unpaid')
        lead = AgencyLead(email=f'enq-{tag}@example.com', name=f'Enquirer {tag}', company='100% Real Ltd', source='contact', status='new')
        db.add_all([inv, lead]); await db.commit()
        ids = dict(staff=staff.id, client=client.id, project=p.id, invoice=inv.id, lead=lead.id)
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://t') as c:
            # --- tokens: only access tokens open a session -----------------------------------
            reset = create_signed_token({'user_id': str(ids['staff']), 'purpose': 'password_reset'}, timedelta(minutes=15))
            r = await c.get('/api/auth/me', headers={'Authorization': f'Bearer {reset}'})
            check('reset token is not a session', r.status_code == 401)
            old_style = jwt.encode({'user_id': str(ids['staff']), 'exp': int(time.time()) + 600}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
            r = await c.get('/api/admin/team', headers={'Authorization': f'Bearer {old_style}'})
            check('untyped token refused', r.status_code == 401)

            # --- staff sign-in without two-step --------------------------------------------------
            r = await c.post('/api/auth/staff-login', json={'email': emails[0], 'password': 'wrong-' + PW})
            check('wrong password 401', r.status_code == 401)
            r = await c.post('/api/auth/staff-login', json={'email': emails[0], 'password': PW})
            sh = {'Authorization': f"Bearer {r.json()['access_token']}"}
            check('sign in issues tokens', r.status_code == 200 and 'refresh_token' in r.json())
            ev = [e.action for e in await events_for(ids['staff'])]
            check('sign-in and failure logged', ev[-2:] == ['auth.sign_in_failed', 'auth.sign_in'])
            check('sign-in has ip', (await events_for(ids['staff']))[-1].ip is not None)
            r = await c.get('/api/auth/me', headers=sh)
            check('me says two-step off', r.json()['two_step_enabled'] is False)

            r = await c.post('/api/admin/team', headers=sh, json={'email': emails[2], 'full_name': 'New Person'})
            check('adding a teammate needs two-step', r.status_code == 403)

            # --- set up two-step -------------------------------------------------------------------
            r = await c.post('/api/auth/two-step/setup', headers=sh, json={'password': 'nope-' + PW})
            check('setup wrong password 400', r.status_code == 400)
            r = await c.post('/api/auth/two-step/setup', headers=sh, json={'password': PW})
            setup = r.json()
            secret = setup['secret']
            check('setup returns secret, uri, qr', r.status_code == 200 and setup['otpauth_uri'].startswith('otpauth://totp/KleeLab')
                  and setup['qr_svg'].startswith('data:image/svg+xml'))
            async with AsyncSessionLocal() as db:
                stored = (await db.get(User, ids['staff'])).totp_secret
            check('secret encrypted at rest', stored and secret not in stored and two_step.decrypt_secret(stored) == secret)
            r = await c.post('/api/auth/two-step/enable', headers=sh, json={'code': '000000' if two_step.code_for(secret) != '000000' else '111111'})
            check('enable wrong code 400', r.status_code == 400)
            r = await c.post('/api/auth/two-step/enable', headers=sh, json={'code': two_step.code_for(secret)})
            codes = r.json().get('codes', [])
            check('enable returns 10 codes', r.status_code == 200 and len(codes) == 10 and all(len(x) == 9 and x[4] == '-' for x in codes))
            r = await c.get('/api/auth/two-step', headers=sh)
            check('status on, 10 left', r.json()['enabled'] is True and r.json()['recovery_codes_left'] == 10)
            check('session still works after enabling', (await c.get('/api/auth/me', headers=sh)).json()['two_step_enabled'] is True)

            # --- sign in with two-step -----------------------------------------------------------
            r = await c.post('/api/auth/staff-login', json={'email': emails[0], 'password': PW})
            body = r.json()
            check('password alone gives a challenge, no tokens', body.get('two_step_required') is True and 'access_token' not in body)
            challenge = body['challenge']
            r = await c.get('/api/auth/me', headers={'Authorization': f'Bearer {challenge}'})
            check('challenge is not a session', r.status_code == 401)
            r = await c.post('/api/auth/staff-login/two-step', json={'challenge': challenge, 'code': '12345'})
            check('wrong code 401', r.status_code == 401 and 'not right' in msg(r))
            r = await c.post('/api/auth/staff-login/two-step', json={'challenge': challenge, 'code': two_step.code_for(secret)})
            check('same code as enable refused (replay)', r.status_code == 401)
            next_code = two_step.code_for(secret, time.time() + 30)
            r = await c.post('/api/auth/staff-login/two-step', json={'challenge': challenge, 'code': next_code})
            check('next code signs in', r.status_code == 200 and 'access_token' in r.json())
            sh = {'Authorization': f"Bearer {r.json()['access_token']}"}
            r = await c.post('/api/auth/staff-login/two-step', json={'challenge': challenge, 'code': next_code})
            check('code cannot be reused', r.status_code == 401)
            r = await c.post('/api/auth/staff-login/two-step', json={'challenge': challenge, 'code': codes[0].upper().replace('-', ' ')})
            check('recovery code signs in (any case/spacing)', r.status_code == 200)
            r = await c.post('/api/auth/staff-login/two-step', json={'challenge': challenge, 'code': codes[0]})
            check('recovery code works once', r.status_code == 401)
            check('recovery use emailed', any('recovery code' in s for _, s in notices))
            check('9 left', (await c.get('/api/auth/two-step', headers=sh)).json()['recovery_codes_left'] == 9)
            r = await c.post('/api/auth/staff-login/two-step', json={'challenge': 'garbage', 'code': '123456'})
            check('bad challenge 401', r.status_code == 401 and 'expired' in msg(r))

            # lockout: failures were 3 so far (wrong, replay, reused) + 1 reused recovery = 4
            await set_user(ids['staff'], two_step_failures=0)
            for i in range(5):
                r = await c.post('/api/auth/staff-login/two-step', json={'challenge': challenge, 'code': '00000' + str(i)})
            check('5th wrong code locks', r.status_code == 429)
            r = await c.post('/api/auth/staff-login/two-step', json={'challenge': challenge, 'code': two_step.code_for(secret, time.time() + 30)})
            check('locked even with a right code', r.status_code == 429)
            check('lock emailed', any('Wrong two-step codes' in s for _, s in notices))
            await set_user(ids['staff'], two_step_failures=0, two_step_locked_until=None, two_step_last_step=None)

            # --- team -------------------------------------------------------------------------------
            r = await c.post('/api/admin/team', headers=sh, json={'email': emails[1], 'full_name': 'Client As Staff'})
            check('existing account cannot be made staff', r.status_code == 409)
            r = await c.post('/api/admin/team', headers=sh, json={'email': emails[2].upper(), 'full_name': ' New Person '})
            new = r.json()
            check('teammate added and invited', r.status_code == 201 and new['invite_sent'] is True and new['member']['email'] == emails[2]
                  and new['member']['name'] == 'New Person' and staff_invites[-1][0] == emails[2])
            new_id = new['member']['id']
            r = await c.get('/api/admin/team', headers=sh)
            me = next(m for m in r.json() if m['id'] == str(ids['staff']))
            check('team list', me['is_you'] and me['two_step_enabled'] and me['projects_in_charge'] == 1 and me['last_sign_in'])
            r = await c.patch(f"/api/admin/team/{ids['staff']}", headers=sh, json={'is_active': False})
            check('cannot switch self off', r.status_code == 409)
            r = await c.patch(f'/api/admin/team/{new_id}', headers=sh, json={'is_active': False})
            check('switch teammate off', r.status_code == 200 and r.json()['is_active'] is False)
            r = await c.get('/api/admin/staff', headers=sh)
            check('switched-off teammate not assignable', all(s['id'] != new_id for s in r.json()))
            r = await c.patch(f"/api/admin/projects/{ids['project']}", headers=sh, json={'owner_id': new_id})
            check('cannot put switched-off teammate in charge', r.status_code == 422)
            r = await c.post(f'/api/admin/team/{new_id}/invite', headers=sh)
            check('no invite while off', r.status_code == 409)
            r = await c.patch(f'/api/admin/team/{new_id}', headers=sh, json={'is_active': True, 'full_name': 'Newer Person'})
            check('switch on and rename', r.json()['is_active'] is True and r.json()['name'] == 'Newer Person')
            r = await c.post(f'/api/admin/team/{new_id}/reset-two-step', headers=sh)
            check('reset two-step when off 409', r.status_code == 409)
            r = await c.post(f'/api/admin/clients/{new_id}/invite', headers=sh)
            check('team member not reachable as client', r.status_code == 404)

            # invite link: works once, and lands a staff session at the staff door
            token = staff_invites[-1][1]
            r = await c.post('/api/auth/reset-password', json={'token': token, 'new_password': PW})
            check('invite link sets password', r.status_code == 200)
            r = await c.post('/api/auth/reset-password', json={'token': token, 'new_password': PW + 'x'})
            check('invite link works once', r.status_code == 400 and 'already been used' in msg(r))
            r = await c.post('/api/auth/reset-password', json={'token': 'not-a-token', 'new_password': PW})
            check('garbage reset token 400 not 500', r.status_code == 400)
            r = await c.post('/api/auth/staff-login', json={'email': emails[2], 'password': PW})
            check('new teammate signs in', r.status_code == 200 and 'access_token' in r.json())
            nh = {'Authorization': f"Bearer {r.json()['access_token']}"}
            r = await c.post(f'/api/admin/team/{new_id}/invite', headers=sh)
            check('no re-invite after first sign-in', r.status_code == 409)
            r = await c.patch(f"/api/admin/team/{ids['staff']}", headers=nh, json={'is_active': False})
            check('teammate without two-step cannot switch others off', r.status_code == 403)
            r = await c.patch(f'/api/admin/team/{new_id}', headers=sh, json={'is_active': False})
            r2 = await c.get('/api/admin/team', headers=nh)
            check('switched off: session dies at once', r2.status_code == 401)
            await c.patch(f'/api/admin/team/{new_id}', headers=sh, json={'is_active': True})

            # --- client side ------------------------------------------------------------------------
            r = await c.post('/api/auth/login', json={'email': emails[1], 'password': PW})
            ch = {'Authorization': f"Bearer {r.json()['access_token']}"}
            r = await c.get('/api/auth/two-step', headers=ch)
            check('clients have no two-step endpoints', r.status_code == 404)
            r = await c.post(f"/api/projects/{ids['project']}/messages", headers=ch, json={'body': 'Hello there, any news on the shop?'})
            check('client message ok', r.status_code == 201)
            check('alert links project and goes to the owner', team_notices and team_notices[-1][1] == str(ids['project'])
                  and team_notices[-1][2] == [emails[0]])

            # --- activity ----------------------------------------------------------------------------
            r = await c.get('/api/admin/activity', headers=sh, params={'project_id': str(ids['project'])})
            acts = r.json()['events']
            check('client message in project activity', acts and acts[0]['action'] == 'update.message' and acts[0]['by_client'] is True
                  and acts[0]['project_reference'] == f'S-{tag}' and 'Hello there' in acts[0]['summary'])
            r = await c.get('/api/admin/activity', headers=sh, params={'actor_id': str(ids['staff']), 'limit': 3})
            page1 = r.json()
            r = await c.get('/api/admin/activity', headers=sh, params={'actor_id': str(ids['staff']), 'limit': 3, 'before': page1['next_before']})
            page2 = r.json()
            seen = [e['id'] for e in page1['events'] + page2['events']]
            check('activity pages without overlap', len(page1['events']) == 3 and page1['next_before'] and len(set(seen)) == len(seen) == 6)
            mine = [e['action'] for e in (await c.get('/api/admin/activity', headers=sh, params={'actor_id': str(ids['staff']), 'limit': 100})).json()['events']]
            for action in ('two_step.on', 'team.add', 'team.off', 'team.on', 'team.rename', 'project.update' if False else 'auth.locked'):
                check(f'logged {action}', action in mine)
            newbie = [e['action'] for e in (await c.get('/api/admin/activity', headers=sh, params={'actor_id': new_id})).json()['events']]
            check('teammate joining logged', 'auth.password_set' in newbie and 'auth.sign_in' in newbie)
            r = await c.get('/api/admin/activity', headers=ch)
            check('client cannot read activity', r.status_code == 404)

            # --- search -------------------------------------------------------------------------------
            r = await c.get('/api/admin/search', headers=sh, params={'q': tag})
            s = r.json()
            check('search finds project, client, lead, invoice', any(x['id'] == str(ids['project']) for x in s['projects'])
                  and any(x['id'] == str(ids['client']) for x in s['clients'])
                  and any(x['id'] == str(ids['lead']) for x in s['leads'])
                  and any(x['id'] == str(ids['invoice']) for x in s['invoices']))
            check('staff not in client results', all(x['id'] != str(ids['staff']) for x in s['clients']))
            r = await c.get('/api/admin/search', headers=sh, params={'q': '%%'})
            check('wildcards are literal', r.status_code == 200 and all(len(v) == 0 or v for v in r.json().values())
                  and not any(x['id'] == str(ids['project']) for x in r.json()['projects']))
            r = await c.get('/api/admin/search', headers=sh, params={'q': '100%'})
            check('literal percent matches', any(x['id'] == str(ids['lead']) for x in r.json()['leads']))
            r = await c.get('/api/admin/search', headers=sh, params={'q': 'a'})
            check('one letter is too short', r.status_code == 422)

            # --- turning off -------------------------------------------------------------------------------
            r = await c.post('/api/auth/two-step/recovery-codes', headers=sh, json={'code': codes[1]})
            check('new codes need an app code, not a recovery code', r.status_code == 400)
            r = await c.post('/api/auth/two-step/recovery-codes', headers=sh, json={'code': two_step.code_for(secret)})
            fresh = r.json().get('codes', [])
            check('new recovery codes', r.status_code == 200 and len(fresh) == 10)
            r = await c.post('/api/auth/two-step/disable', headers=sh, json={'password': PW, 'code': codes[2]})
            check('old recovery codes dead after renewal', r.status_code == 400)
            r = await c.post('/api/auth/two-step/disable', headers=sh, json={'password': PW, 'code': fresh[0]})
            check('turn off with a recovery code', r.status_code == 200 and r.json()['enabled'] is False)
            r = await c.post('/api/auth/staff-login', json={'email': emails[0], 'password': PW})
            check('password alone signs in again', 'access_token' in r.json())
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(Project).where(Project.id == ids['project']))
            await db.execute(delete(AgencyLead).where(AgencyLead.id == ids['lead']))
            users = list(await db.scalars(select(User.id).where(User.email.in_(emails))))
            await db.execute(delete(ActivityEvent).where(ActivityEvent.actor_id.in_(users)))
            await db.execute(delete(User).where(User.email.in_(emails)))
            await db.commit()

asyncio.run(main())
finish()
