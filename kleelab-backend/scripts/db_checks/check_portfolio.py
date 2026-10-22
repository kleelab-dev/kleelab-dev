import asyncio, base64, uuid
from _harness import check, finish  # noqa: E402  (sets up the local test database)
import httpx
from sqlalchemy import delete, select
from kleelab.main import app
from kleelab.core.database import AsyncSessionLocal
from kleelab.core.security import get_password_hash
from kleelab.models.user import User
from kleelab.models.agency_lead import AgencyLead
from kleelab.models.library import ProjectTemplate
from kleelab.models.portfolio import PortfolioItem
from kleelab.models.project import Project
from kleelab.models.proposal import Proposal
from kleelab.models.activity import ActivityEvent
from kleelab.routers import agency as agency_routes
from kleelab.services import storage
from kleelab.services import portfolio as svc
from kleelab.services import projects as project_svc

PW = 'Folio-' + uuid.uuid4().hex[:12]
PNG = 'data:image/png;base64,' + base64.b64encode(b'\x89PNG\r\n\x1a\n' + b'0' * 64).decode()

# No Cloudinary, no client site and no network: record what would have happened.
uploads: list[str] = []
destroyed: list[str] = []
refreshes: list[int] = []
links: dict[str, str | None] = {}


def fake_upload(data, content_type, folder=None):
    n = len(uploads) + 1
    uploads.append(folder)
    return {'secure_url': f'https://res.cloudinary.com/demo/image/upload/shot-{uuid.uuid4().hex[:6]}-{n}.png',
            'public_id': f'portfolio/shot-{n}', 'width': 1600, 'height': 1000}


async def fake_destroy(ids):
    destroyed.extend(i for i in ids if i)
    return len(destroyed)


async def fake_refresh():
    refreshes.append(1)


async def fake_link(url):
    return links.get(url)


storage.upload_image = fake_upload
storage.destroy_images = fake_destroy
svc.refresh_site = fake_refresh
svc.check_link = fake_link
agency_routes.send_agency_lead_notification = lambda *a, **k: True
project_svc.send_invite = lambda client, project: True


async def main():
    tag = uuid.uuid4().hex[:8]
    staff_email = f'staff-{tag}@example.com'
    client_email = f'client-{tag}@example.com'
    visitor_email = f'visitor-{tag}@example.com'
    async with AsyncSessionLocal() as db:
        staff = User(email=staff_email, password_hash=get_password_hash(PW), is_verified=True, full_name='Ada Team')
        staff.role = 'staff'
        client = User(email=client_email, password_hash=get_password_hash(PW), is_verified=True, full_name='Bola Client')
        db.add_all([staff, client])
        await db.commit()
        staff_id = str(staff.id)
    item_ids: list[str] = []
    project_ids: list[str] = []
    template_ids: list[str] = []
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://t') as c:
            r = await c.post('/api/auth/staff-login', json={'email': staff_email, 'password': PW})
            h = {'Authorization': f"Bearer {r.json()['access_token']}"}
            r = await c.post('/api/auth/login', json={'email': client_email, 'password': PW})
            ch = {'Authorization': f"Bearer {r.json()['access_token']}"}

            r = await c.post('/api/admin/project-templates', headers=h, json={
                'name': f'Bakery {tag}', 'stages': [{'name': 'Your menu'}, {'name': 'Ordering', 'description': 'Orders by WhatsApp.'}]})
            template_ids.append(r.json().get('id'))

            # --- Creating and editing -----------------------------------------------------
            r = await c.post('/api/admin/portfolio', headers=ch, json={'kind': 'work', 'title': 'Nope'})
            check('clients cannot add to the portfolio', r.status_code in (403, 404))

            sale = {
                'kind': 'for_sale', 'title': f'Bakery site {tag}', 'summary': '  A site for a bakery that takes orders.  ',
                'tags': ['Food', 'food', ' Orders '], 'demo_url': f'demo-{tag}.example.com', 'price_cents': 45000000,
                'includes': '- Menu page\n- Order form\n\n', 'customisable': 'Colours\nPhotos', 'delivery_days': 10,
                'exclusive': True, 'template_id': template_ids[0], 'status': 'published',
                'client_name': 'Should go', 'client_permission': True,
            }
            r = await c.post('/api/admin/portfolio', headers=h, json=sale)
            d = r.json()
            sale_id = d.get('id')
            item_ids.append(sale_id)
            check('item created as a draft whatever was asked', r.status_code == 201 and d['status'] == 'draft')
            check('slug from title, summary trimmed, tags deduped',
                  d['slug'] == f'bakery-site-{tag}' and d['summary'] == 'A site for a bakery that takes orders.'
                  and d['tags'] == ['Food', 'Orders'])
            check('demo address gets https', d['demo_url'] == f'https://demo-{tag}.example.com')
            check('client fields cleared on a site for sale', d['client_name'] is None and d['client_permission'] is False)
            check('template named', d['template_name'] == f'Bakery {tag}')
            check('missing lists screenshots', 'at least one screenshot' in d['missing'])

            r = await c.put(f'/api/admin/portfolio/{sale_id}', headers=h, json=sale)
            check('cannot publish without screenshots', r.status_code == 422 and 'screenshot' in r.json()['error']['message'])

            r = await c.post(f'/api/admin/portfolio/{sale_id}/images', headers=h, json={'data': 'data:image/gif;base64,R0lGOD==', 'alt': ''})
            check('gif refused', r.status_code == 422)
            r = await c.post(f'/api/admin/portfolio/{sale_id}/images', headers=h, json={'data': PNG, 'alt': 'Home page'})
            r = await c.post(f'/api/admin/portfolio/{sale_id}/images', headers=h, json={'data': PNG, 'alt': ''})
            d = r.json()
            check('two screenshots uploaded to the portfolio folder',
                  r.status_code == 201 and len(d['images']) == 2 and all(f.endswith('/portfolio') for f in uploads))
            check('missing asks for every description', d['missing'] == ['a description for every screenshot'])

            images = d['images']
            r = await c.put(f'/api/admin/portfolio/{sale_id}', headers=h, json={
                **sale, 'images': [*images, {'url': 'https://evil.example.com/x.png', 'alt': 'x'}]})
            check('cannot add an image by address', r.status_code == 422)

            refreshes.clear()
            r = await c.put(f'/api/admin/portfolio/{sale_id}', headers=h, json={
                **sale, 'images': [{**images[1], 'alt': 'Order form'}, images[0]]})
            d = r.json()
            check('published once every screenshot is described',
                  r.status_code == 200 and d['status'] == 'published' and d['published_at'] and d['missing'] == [])
            check('screenshots reordered', [i['alt'] for i in d['images']] == ['Order form', 'Home page'])
            check('client site told', refreshes == [1])

            # --- Visitors ------------------------------------------------------------
            slug = d['slug']
            r = await c.get('/api/portfolio')
            mine = [i for i in r.json() if i['slug'] == slug]
            check('on the public list', r.status_code == 200 and len(mine) == 1)
            r = await c.get(f'/api/portfolio/{slug}')
            p = r.json()
            check('public page shows price and lines',
                  p['price_cents'] == 45000000 and p['includes'] == ['Menu page', 'Order form']
                  and p['customisable'] == ['Colours', 'Photos'] and p['delivery_days'] == 10 and p['exclusive'])
            check('public page hides the team fields', 'preview_token' not in p and 'view_count' not in p and 'enquiries' not in p)

            await c.post(f'/api/portfolio/{slug}/events', json={'kind': 'view'})
            await c.post(f'/api/portfolio/{slug}/events', json={'kind': 'view'})
            r = await c.post(f'/api/portfolio/{slug}/events', json={'kind': 'demo'})
            check('event accepted quietly', r.status_code == 204)
            r = await c.post('/api/portfolio/no-such-item/events', json={'kind': 'view'})
            check('unknown item ignored', r.status_code == 204)
            r = await c.post(f'/api/portfolio/{slug}/events', json={'kind': 'like'})
            check('unknown event refused', r.status_code == 422)

            # --- Work items and permission -----------------------------------------
            work = {'kind': 'work', 'title': f'Ade Fabrics {tag}', 'summary': 'A shop for fabrics.', 'client_name': 'Ade Fabrics',
                    'price_cents': 100, 'template_id': template_ids[0]}
            r = await c.post('/api/admin/portfolio', headers=h, json=work)
            d = r.json()
            work_id = d['id']
            item_ids.append(work_id)
            check('work item drops sale fields', d['price_cents'] is None and d['template_id'] is None)
            await c.post(f'/api/admin/portfolio/{work_id}/images', headers=h, json={'data': PNG, 'alt': 'Shop page'})
            r = await c.get(f'/api/admin/portfolio/{work_id}', headers=h)
            d = r.json()
            check("work needs the client's agreement", d['missing'] == ["the client's agreement to show it"])
            r = await c.put(f'/api/admin/portfolio/{work_id}', headers=h, json={**work, 'images': d['images'], 'status': 'published'})
            check('cannot publish work without agreement', r.status_code == 422 and 'agreement' in r.json()['error']['message'])
            r = await c.put(f'/api/admin/portfolio/{work_id}', headers=h, json={**work, 'images': d['images'], 'status': 'sold'})
            check('work cannot be sold', r.status_code == 422)

            work_slug = d['slug']
            r = await c.get(f'/api/portfolio/{work_slug}')
            check('a draft is hidden', r.status_code == 404)
            r = await c.get(f'/api/portfolio/{work_slug}?preview=wrong')
            check('a wrong preview link is hidden', r.status_code == 404)
            r = await c.get(f"/api/portfolio/{work_slug}?preview={d['preview_token']}")
            check('the preview link shows the draft', r.status_code == 200 and r.json()['preview'] is True)
            await c.post(f'/api/portfolio/{work_slug}/events', json={'kind': 'view'})
            r = await c.get('/api/portfolio')
            check('a draft is not listed', all(i['slug'] != work_slug for i in r.json()))

            r = await c.put(f'/api/admin/portfolio/{work_id}', headers=h, json={
                **work, 'images': d['images'], 'status': 'published', 'client_permission': True, 'slug': slug})
            d = r.json()
            check('taken slug gets a number', r.status_code == 200 and d['slug'] == f'{slug}-2' and d['status'] == 'published')
            work_slug = d['slug']
            r = await c.get(f'/api/portfolio/{work_slug}')
            p = r.json()
            check('work shows its client, no price', p['client_name'] == 'Ade Fabrics' and p['price_cents'] is None)

            # --- Enquiries and the proposal ----------------------------------------------
            r = await c.post('/api/agency/leads', json={
                'email': visitor_email, 'name': 'Chi Visitor', 'company': 'Chi Cakes', 'message': 'I want this bakery site please.',
                'portfolio_slug': slug})
            check('enquiry from an item page accepted', r.status_code == 201)
            async with AsyncSessionLocal() as db:
                lead = await db.scalar(select(AgencyLead).where(AgencyLead.email == visitor_email))
            check('enquiry linked to the item', lead is not None and str(lead.portfolio_item_id) == sale_id
                  and lead.feature_requested == f'Ready-made site: Bakery site {tag}')
            r = await c.post('/api/agency/leads', json={
                'email': visitor_email, 'message': 'Something like this one?', 'portfolio_slug': 'not-a-real-one'})
            async with AsyncSessionLocal() as db:
                leads = list(await db.scalars(select(AgencyLead).where(AgencyLead.email == visitor_email)))
            check('unknown item enquiry still stored, unlinked',
                  r.status_code == 201 and len(leads) == 2 and sum(1 for x in leads if x.portfolio_item_id is None) == 1)

            r = await c.post('/api/admin/proposals', headers=h, json={'lead_id': str(lead.id)})
            pr = r.json()
            check('proposal starts from the site', r.status_code == 201 and pr['title'] == f'Bakery site {tag} for Chi Cakes'
                  and pr['items'][0]['amount_cents'] == 45000000 and pr['duration_weeks'] == 2)
            check("proposal takes the template's steps", [s['name'] for s in pr['stages']] == ['Your menu', 'Ordering'])

            r = await c.get('/api/admin/portfolio', headers=h)
            stats = {i['id']: i for i in r.json()}[sale_id]
            check('team sees views, demo clicks and enquiries',
                  stats['view_count'] == 2 and stats['demo_clicks'] == 1 and stats['enquiries'] == 1)
            check('preview view not counted', {i['id']: i for i in r.json()}[work_id]['view_count'] == 0)

            # --- Sold, order, demo checks -----------------------------------------
            r = await c.put(f'/api/admin/portfolio/{sale_id}', headers=h, json={
                **sale, 'images': stats['images'], 'status': 'sold'})
            check('site marked sold', r.status_code == 200 and r.json()['status'] == 'sold')
            r = await c.get(f'/api/portfolio/{slug}')
            check('sold site still shown, price hidden', r.status_code == 200 and r.json()['sold'] and r.json()['price_cents'] is None)

            r = await c.put('/api/admin/portfolio-order', headers=h, json={'ids': [work_id, sale_id]})
            order = [i['id'] for i in r.json()]
            check('reordered', r.status_code == 200 and order.index(work_id) < order.index(sale_id))

            links[f'https://demo-{tag}.example.com'] = 'It answered with error 404.'
            r = await c.post(f'/api/admin/portfolio/{sale_id}/check-demo', headers=h)
            d = r.json()
            check('broken demo flagged', d['demo_status'] == 'broken' and d['demo_error'] == 'It answered with error 404.' and d['demo_checked_at'])
            r = await c.post(f'/api/admin/portfolio/{work_id}/check-demo', headers=h)
            check('no demo link, nothing to check', r.status_code == 422)
            r = await c.put(f'/api/admin/portfolio/{sale_id}', headers=h, json={
                **sale, 'images': stats['images'], 'status': 'sold', 'demo_url': f'https://new-{tag}.example.com'})
            check('changing the link clears its check', r.json()['demo_status'] is None)

            check('private addresses are not probed', svc._private_host('http://127.0.0.1:8001/') and svc._private_host('http://10.0.0.5/'))

            # --- From a finished project ----------------------------------------------
            r = await c.post('/api/admin/projects', headers=h, json={
                'client_email': client_email, 'title': f'Bola Bakes {tag}', 'owner_id': staff_id, 'summary': 'Cakes, ordered online.'})
            pid = r.json()['project']['id']
            project_ids.append(pid)
            async with AsyncSessionLocal() as db:
                project = await db.get(Project, uuid.UUID(pid))
                project.live_url = 'https://bolabakes.example.com'
                await db.commit()
            r = await c.post(f'/api/admin/projects/{pid}/portfolio', headers=h)
            d = r.json()
            item_ids.append(d.get('id'))
            check('draft from a project', r.status_code == 201 and d['kind'] == 'work' and d['status'] == 'draft'
                  and d['client_name'] == 'Bola Client' and d['demo_url'] == 'https://bolabakes.example.com'
                  and d['summary'] == 'Cakes, ordered online.' and d['project_reference'])
            r = await c.post(f'/api/admin/projects/{pid}/portfolio', headers=h)
            check('only once per project', r.status_code == 409)

            # --- Removing ------------------------------------------------------------------
            destroyed.clear()
            r = await c.put(f'/api/admin/portfolio/{work_id}', headers=h, json={**work, 'images': [], 'status': 'draft'})
            check('removed screenshot deleted from storage', r.status_code == 200 and destroyed == ['portfolio/shot-3'])
            r = await c.delete(f'/api/admin/portfolio/{sale_id}', headers=h)
            check('item deleted with its screenshots', r.status_code == 204 and len(destroyed) == 3)
            async with AsyncSessionLocal() as db:
                lead = await db.scalar(select(AgencyLead).where(AgencyLead.email == visitor_email, AgencyLead.company == 'Chi Cakes'))
            check('enquiry kept, link cleared', lead is not None and lead.portfolio_item_id is None)
            r = await c.get(f'/api/portfolio/{slug}')
            check('deleted item gone', r.status_code == 404)
    finally:
        async with AsyncSessionLocal() as db:
            ids = [uuid.UUID(i) for i in item_ids if i]
            pids = [uuid.UUID(i) for i in project_ids if i]
            leads = select(AgencyLead.id).where(AgencyLead.email == visitor_email)
            await db.execute(delete(Proposal).where(Proposal.lead_id.in_(leads)))
            await db.execute(delete(AgencyLead).where(AgencyLead.email == visitor_email))
            await db.execute(delete(ActivityEvent).where(ActivityEvent.subject_id.in_(ids)))
            await db.execute(delete(ActivityEvent).where(ActivityEvent.project_id.in_(pids)))
            await db.execute(delete(PortfolioItem).where(PortfolioItem.id.in_(ids)))
            await db.execute(delete(Project).where(Project.id.in_(pids)))
            await db.execute(delete(ProjectTemplate).where(ProjectTemplate.id.in_([uuid.UUID(i) for i in template_ids if i])))
            await db.execute(delete(User).where(User.email.in_([staff_email, client_email])))
            await db.commit()


asyncio.run(main())
finish()
