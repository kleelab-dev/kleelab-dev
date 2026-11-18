# Definition of done

Every agent and every person works to this list. A change is done only when
each line that applies to it is true **and has been checked**, not assumed.

## All changes
- [ ] It does what the spec's acceptance criteria say, and nothing the spec ruled out.
- [ ] No file outside the change's scope was touched.
- [ ] No secrets, tokens, real customer data or `.env` values in code, logs or commits.
- [ ] No leftover debug output, commented-out code or TODOs without an owner.
- [ ] The report says which commands were run and pastes their real output.

## Frontend (`kleelab-frontend`) and admin (`kleelab-admin`)
- [ ] `npm run typecheck` and `npm run lint` pass in each app that changed.
- [ ] Frontend only: `npm run check:auth` passes if sign-in, redirects or `?next=` were touched.
- [ ] `npm run build` passes for a change to routing, config, metadata or server components.
- [ ] Next.js 16 APIs checked against `node_modules/next/dist/docs/`, not memory (see the app's `AGENTS.md`).
- [ ] Uses the Blueprint tokens in `tailwind.config.js` (paper, ink, cobalt, sun, line, muted). No new hard-coded colours, fonts or shadows.
- [ ] Works at 375px, 768px and 1280px wide, with no sideways scroll.
- [ ] Keyboard reachable, visible focus, labelled controls, text contrast at least 4.5:1.
- [ ] No console errors or failed network requests on the pages touched.
- [ ] Components that exist in both apps (for example `components/project/UpdateFeed.tsx`, `Attachments.tsx`) are changed in both, or the spec says why not.

## Backend (`kleelab-backend`)
- [ ] The app imports: `PYTHONPATH=src python -c "from kleelab.main import app"`.
- [ ] `python -m compileall -q src` passes.
- [ ] Every model change has an Alembic migration with a working `downgrade()`, and both directions were run against the local test database.
- [ ] The CI checks in `scripts/check_*.py` that cover the area pass, and so do the `scripts/db_checks/check_*.py` checks for it.
- [ ] New endpoints check who is calling (staff or client, owner of the record), validate input with Pydantic and are rate limited where they are public.
- [ ] Response shapes the frontend reads are unchanged, or `services/api.ts` and `types/` in each app were updated in the same change.
- [ ] New environment variables are in `core/config.py` with a safe default and listed in `render.yaml`.

## Words and SEO
- [ ] Plain, friendly language, with no location claims (KleeLab is not a London studio).
- [ ] Each page has one `<h1>`, a unique title of about 60 characters or fewer and a description of about 155 characters or fewer.
- [ ] Structured data (FAQ, Organization, Service) matches what the page actually shows.
