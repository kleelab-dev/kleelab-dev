import asyncio, hashlib, hmac, json, os, secrets, uuid
from _harness import check, finish  # noqa: E402  (sets up the local test database)
# A made-up key, never a real one. Every Paystack call below is a fake.
FAKE_KEY = 'sk_test_' + secrets.token_hex(20)
os.environ['PAYSTACK_SECRET_KEY'] = FAKE_KEY
os.environ['PAYSTACK_CALLBACK_URL'] = 'http://localhost:3000/dashboard/payment'
import httpx
from sqlalchemy import delete, func, select
from kleelab.main import app
from kleelab.core.config import settings
from kleelab.core.database import AsyncSessionLocal
from kleelab.core.security import get_password_hash
from kleelab.models.activity import ActivityEvent
from kleelab.models.user import User
from kleelab.models.project import InvoicePayment, Project, ProjectInvoice
from kleelab.services import email as email_svc, paystack

PW = 'Pay-' + uuid.uuid4().hex[:12]

# --- Fake Paystack --------------------------------------------------------------
started, verified, client_notices, team_notices = [], [], [], []
# What the fake `verify` answers, by reference. Defaults to a clean success for
# exactly what was asked for.
verify_answers: dict[str, dict] = {}


async def fake_initialize(*, email, amount, currency, reference, callback_url, metadata):
    started.append(dict(email=email, amount=amount, currency=currency, reference=reference,
                        callback_url=callback_url, metadata=metadata))
    return f'https://checkout.paystack.com/{reference}'


async def fake_verify(reference):
    verified.append(reference)
    if reference in verify_answers:
        return verify_answers[reference]
    asked = next(s for s in started if s['reference'] == reference)
    return {'status': 'success', 'reference': reference, 'amount': asked['amount'], 'currency': asked['currency'],
            'id': 4242, 'channel': 'card'}


async def no_network(*args, **kwargs):
    raise AssertionError('a check tried to call the real Paystack API')


paystack.initialize_transaction = fake_initialize
paystack.verify_transaction = fake_verify
paystack._call = no_network
email_svc.send_client_project_notice = lambda email, pid, title, headline: client_notices.append((email, headline)) or True
email_svc.send_team_notice = lambda subject, lines, project_id=None, also_to=None: team_notices.append(subject) or True


def sign(body: bytes, key: str = FAKE_KEY) -> str:
    return hmac.new(key.encode(), body, hashlib.sha512).hexdigest()


def event(reference, kind='charge.success', amount=0, currency='NGN'):
    return json.dumps({'event': kind, 'data': {'reference': reference, 'status': 'success', 'amount': amount,
                                                'currency': currency}}).encode()


async def invoice_row(invoice_id):
    async with AsyncSessionLocal() as db:
        return await db.get(ProjectInvoice, invoice_id)


async def count_events(invoice_id, action):
    async with AsyncSessionLocal() as db:
        return await db.scalar(select(func.count()).select_from(ActivityEvent)
                               .where(ActivityEvent.subject_id == invoice_id, ActivityEvent.action == action))


async def payment_row(reference):
    async with AsyncSessionLocal() as db:
        return await db.scalar(select(InvoicePayment).where(InvoicePayment.reference == reference))


def code(r):
    return r.json().get('error', {}).get('code')


async def main():
    tag = uuid.uuid4().hex[:6]
    emails = [f'staff-{tag}@example.com', f'client-{tag}@example.com', f'other-{tag}@example.com']
    async with AsyncSessionLocal() as db:
        staff = User(email=emails[0], password_hash=get_password_hash(PW), is_verified=True); staff.role = 'staff'
        client = User(email=emails[1], password_hash=get_password_hash(PW), is_verified=True, full_name='Ada Client')
        other = User(email=emails[2], password_hash=get_password_hash(PW), is_verified=True)
        db.add_all([staff, client, other]); await db.flush()
        p = Project(client_id=client.id, reference=f'P-{tag}', title='Shop', status='active')
        q = Project(client_id=other.id, reference=f'Q-{tag}', title='Other', status='active')
        db.add_all([p, q]); await db.flush()

        def inv(project, n, cents, cur='NGN', status='unpaid'):
            return ProjectInvoice(project_id=project.id, number=f'{n}{tag}', title=f'Invoice {n}', amount_cents=cents,
                                  currency=cur, status=status)
        rows = dict(
            main=inv(p, 'A', 250_000_00), mismatch=inv(p, 'B', 100_000_00), back=inv(p, 'C', 5_000, 'USD'),
            body_lies=inv(p, 'D', 7_500_00), paid=inv(p, 'E', 1_000, status='paid'),
            cancelled=inv(p, 'F', 1_000, status='cancelled'), gbp=inv(p, 'G', 1_000, 'GBP'), others=inv(q, 'H', 9_900),
        )
        db.add_all(rows.values()); await db.commit()
        ids = {k: v.id for k, v in rows.items()}
        ids.update(project=p.id, other_project=q.id)
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://t') as c:
            async def login(path, email):
                r = await c.post(path, json={'email': email, 'password': PW})
                return {'Authorization': f"Bearer {r.json()['access_token']}"}
            sh = await login('/api/auth/staff-login', emails[0])
            ch = await login('/api/auth/login', emails[1])
            oh = await login('/api/auth/login', emails[2])

            async def start(key, headers=ch):
                return await c.post(f"/api/payments/invoices/{ids[key]}/paystack", headers=headers)

            async def hook(body, signature):
                headers = {'Content-Type': 'application/json'}
                if signature is not None:
                    headers['x-paystack-signature'] = signature
                return await c.post('/api/payments/paystack/webhook', content=body, headers=headers)

            r = await c.get('/api/payments/config')
            check('config: enabled in test mode', r.json() == {'enabled': True, 'provider': 'paystack',
                                                                'currencies': ['GHS', 'KES', 'NGN', 'USD', 'ZAR'], 'test_mode': True})

            # --- Who can pay what ---------------------------------------------------
            r = await start('main')
            ref = r.json().get('reference', '')
            s = started[-1] if started else {}
            check('client starts paying own invoice', r.status_code == 200
                  and r.json()['authorization_url'] == f'https://checkout.paystack.com/{ref}')
            check('amount sent in minor units with currency', s.get('amount') == 250_000_00 and s.get('currency') == 'NGN')
            check('reference, email, callback and metadata sent', s.get('reference') == ref and s.get('email') == emails[1]
                  and s.get('callback_url') == 'http://localhost:3000/dashboard/payment'
                  and s.get('metadata', {}).get('invoice_id') == str(ids['main']))
            p_row = await payment_row(ref)
            check('pending payment row saved', p_row is not None and p_row.status == 'pending' and p_row.amount_cents == 250_000_00)

            before = len(started)
            r = await start('others')
            check("other client's invoice cannot be paid (404)", r.status_code == 404)
            r = await start('main', oh)
            check("another client cannot pay this invoice (404)", r.status_code == 404)
            r = await start('main', sh)
            check('staff cannot start a payment (404)', r.status_code == 404)
            r = await start('paid')
            check('paid invoice cannot be paid', r.status_code == 409 and code(r) == 'not_payable')
            r = await start('cancelled')
            check('cancelled (void) invoice cannot be paid', r.status_code == 409 and code(r) == 'not_payable')
            r = await start('gbp')
            check('currency Paystack cannot take is refused', r.status_code == 422 and code(r) == 'currency_not_supported')
            r = await c.post(f"/api/payments/invoices/{ids['main']}/paystack")
            check('no sign-in refused', r.status_code == 401)
            check('Paystack never asked for refused invoices', len(started) == before)

            # --- Webhook signature ----------------------------------------------------
            body = event(ref, amount=250_000_00)
            r = await hook(body, sign(body, 'sk_test_' + 'x' * 40))
            check('bad signature rejected (401)', r.status_code == 401)
            r = await hook(body, None)
            check('missing signature rejected (401)', r.status_code == 401)
            r = await hook(body + b' ', sign(body))
            check('signature over a different body rejected', r.status_code == 401)
            check('nothing verified or paid after bad signatures', not verified and (await invoice_row(ids['main'])).status == 'unpaid')

            # --- Good webhook ---------------------------------------------------------
            r = await hook(body, sign(body))
            i = await invoice_row(ids['main'])
            check('good signature + verified charge marks paid', r.status_code == 200 and i.status == 'paid'
                  and i.paid_at is not None and i.paid_via == 'paystack' and i.payment_reference == ref)
            check('verified with Paystack, not trusted from the body', verified == [ref])
            check('activity log records the payment', await count_events(ids['main'], 'invoice.paid') == 1)
            check('client thanked, team told', client_notices[-1:] == [(emails[1], f'Thank you. We have received your payment for A{tag}')]
                  and any(f'A{tag} paid online' in t for t in team_notices))
            p_row = await payment_row(ref)
            check('payment row settled', p_row.status == 'success' and p_row.channel == 'card' and p_row.provider_transaction_id == '4242')

            # --- Replay ---------------------------------------------------------------
            notices_before, paid_at = len(client_notices), i.paid_at
            r1 = await hook(body, sign(body))
            r2 = await hook(body, sign(body))
            i = await invoice_row(ids['main'])
            check('replayed webhook answered 200', r1.status_code == 200 and r2.status_code == 200)
            check('replay is idempotent', i.status == 'paid' and i.paid_at == paid_at
                  and await count_events(ids['main'], 'invoice.paid') == 1 and len(client_notices) == notices_before)
            check('replay does not ask Paystack again', verified == [ref])

            r = await c.get('/api/payments/paystack/verify', params={'reference': ref}, headers=ch)
            check('return page sees paid', r.status_code == 200 and r.json()['status'] == 'paid'
                  and r.json()['invoice_id'] == str(ids['main']) and r.json()['project_id'] == str(ids['project']))
            r = await c.get('/api/payments/paystack/verify', params={'reference': ref}, headers=oh)
            check("other client cannot look up the payment", r.status_code == 404)
            r = await start('main')
            check('cannot start paying it again', r.status_code == 409)

            # --- Amount mismatch ------------------------------------------------------
            r = await start('mismatch')
            mref = r.json()['reference']
            verify_answers[mref] = {'status': 'success', 'reference': mref, 'amount': 100_00, 'currency': 'NGN', 'id': 1}
            body = event(mref, amount=100_000_00)  # the body claims the full amount
            r = await hook(body, sign(body))
            i = await invoice_row(ids['mismatch'])
            check('amount mismatch does not mark paid', r.status_code == 200 and i.status == 'unpaid' and i.paid_at is None)
            check('mismatch recorded for the team', (await payment_row(mref)).status == 'mismatch'
                  and await count_events(ids['mismatch'], 'invoice.payment_mismatch') == 1)
            r = await c.get('/api/payments/paystack/verify', params={'reference': mref}, headers=ch)
            check('return page sees mismatch', r.json().get('status') == 'mismatch')

            r = await start('body_lies')
            cref = r.json()['reference']
            verify_answers[cref] = {'status': 'success', 'reference': cref, 'amount': 7_500_00, 'currency': 'USD'}
            r = await hook(event(cref, amount=7_500_00), sign(event(cref, amount=7_500_00)))
            check('currency mismatch does not mark paid', (await invoice_row(ids['body_lies'])).status == 'unpaid')

            # --- Body says success, Paystack says otherwise ---------------------------
            r = await c.post(f"/api/payments/invoices/{ids['mismatch']}/paystack", headers=ch)
            aref = r.json()['reference']
            verify_answers[aref] = {'status': 'abandoned', 'reference': aref, 'amount': 100_000_00, 'currency': 'NGN'}
            body = event(aref, amount=100_000_00)
            r = await hook(body, sign(body))
            check('webhook body alone never marks paid', r.status_code == 200 and (await invoice_row(ids['mismatch'])).status == 'unpaid'
                  and (await payment_row(aref)).status == 'failed')

            # --- Return page before the webhook ---------------------------------------
            r = await start('back')
            bref = r.json()['reference']
            r = await c.get('/api/payments/paystack/verify', params={'reference': bref}, headers=ch)
            i = await invoice_row(ids['back'])
            check('return page settles before the webhook', r.json().get('status') == 'paid' and i.status == 'paid' and i.paid_via == 'paystack')
            body = event(bref, amount=5_000, currency='USD')
            r = await hook(body, sign(body))
            check('late webhook changes nothing', r.status_code == 200 and await count_events(ids['back'], 'invoice.paid') == 1)
            r = await c.get('/api/payments/paystack/verify', params={'reference': bref}, headers=ch)
            check('return page again is idempotent', r.json().get('status') == 'paid' and await count_events(ids['back'], 'invoice.paid') == 1)

            # --- Events we ignore -----------------------------------------------------
            body = event('KL-not-ours-123', amount=100)
            r = await hook(body, sign(body))
            check('unknown reference ignored with 200', r.status_code == 200)
            body = event(ref, kind='transfer.success')
            r = await hook(body, sign(body))
            check('other event types ignored with 200', r.status_code == 200)
            r = await hook(b'not json', sign(b'not json'))
            check('signed junk ignored with 200', r.status_code == 200)

            # --- Team dashboard -------------------------------------------------------
            r = await c.get('/api/admin/invoices', headers=sh)
            row = next((x for x in r.json() if x['id'] == str(ids['main'])), {})
            check('admin sees paid online with reference', row.get('paid_via') == 'paystack' and row.get('payment_reference') == ref)
            r = await c.patch(f"/api/admin/projects/{ids['project']}/invoices/{ids['main']}", headers=sh, json={'status': 'unpaid'})
            i = await invoice_row(ids['main'])
            check('marking unpaid by hand clears the online details', r.status_code == 200 and i.status == 'unpaid'
                  and i.paid_via is None and i.payment_reference is None and i.paid_at is None)

            # --- Switched off ---------------------------------------------------------
            settings.PAYSTACK_SECRET_KEY = None
            try:
                r = await c.get('/api/payments/config')
                check('config says disabled without a key', r.json()['enabled'] is False)
                r = await start('mismatch')
                check('start refused when off (503)', r.status_code == 503 and code(r) == 'payments_disabled')
                body = event(ref)
                r = await hook(body, sign(body))
                check('webhook refused when off (503)', r.status_code == 503)
            finally:
                settings.PAYSTACK_SECRET_KEY = FAKE_KEY
    finally:
        async with AsyncSessionLocal() as db:
            invoice_ids = [v for k, v in ids.items() if k not in ('project', 'other_project')]
            await db.execute(delete(ActivityEvent).where(ActivityEvent.subject_id.in_(invoice_ids)))
            await db.execute(delete(Project).where(Project.id.in_([ids['project'], ids['other_project']])))
            users = list(await db.scalars(select(User.id).where(User.email.in_(emails))))
            await db.execute(delete(ActivityEvent).where(ActivityEvent.actor_id.in_(users)))
            await db.execute(delete(User).where(User.email.in_(emails)))
            await db.commit()

asyncio.run(main())
finish()
