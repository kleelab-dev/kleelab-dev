# Simplify the backend, security setup and client dashboard

- **Status:** Shipped
- **Date:** 2026-11-18
- **Apps:** backend / frontend / admin
- **Size:** M. Part A (backend clean-up) and Part B (client dashboard) are independent. Either can ship alone.

## Open questions (owner)
1. **Dashboard panels.** Which panels do clients actually use? The plan below merges 11 panels into 6 and keeps every function. Tell us if any function can go completely. Likely candidates: the "Going live, hosting and care" request form, and the separate "Previews and links" list.
2. **One project, no list.** When a client has exactly one project, should `/dashboard` open it straight away? The default is yes.
3. **Production origins.** Which exact web addresses call the API (public site, admin, `www`)? Are any of them on `*.onrender.com`? The answer decides how far the CORS pattern can shrink (A4).
4. **Account deletion.** `POST /api/users/me/request-deletion` saves a date that no screen or job ever reads. `DELETE /api/users/me` erases at once and is tested, but no screen calls it. Keep both as they are (the default), or surface the request in admin? This spec does not change them.
5. **One API instance?** Will the API stay on a single Render instance? If yes, the unused Redis code is removed (A5). If you plan to scale out, say so and A5 is dropped.
6. **Old builder tables.** These are `sites`, `pages`, `page_versions`, `products`, `orders`, `assets`, `analytics`, `templates`, `ai_generations` and the `users.plan` column. They stay in place in this spec, and nothing is dropped. Do you want a later, separate spec to archive and drop them after a backup?

## Why
The owner wants the system simpler. The self-serve builder was retired on 2026-10-20 and its routers were unmounted in `main.py`, but about 6,000 lines of its code and its CI checks are still there. `/api/auth/me` still counts sites, pages and AI builds on every call. The client project page shows up to 11 panels, and some say the same thing twice.

## What changes
- Nothing visible to staff. The API loses dead code, dead endpoints and dead settings, and every protection stays.
- A client's project page shows 6 clear panels instead of 11, and nothing they can do today is lost.

## Out of scope
- Dropping tables or columns, and any Alembic migration.
- Changing sign-in, token lifetimes, two-step, roles or ownership checks.
- New features, including account deletion UI (see open question 4).
- The admin project screens, apart from removing dead functions in its `services/api.ts`.
- Rewriting `routers/admin.py` (1,433 lines). It is long but live. Splitting it is not simplification for the owner.

## Design

### What must stay (security — do not remove or weaken)
| Protection | Where |
|---|---|
| Password hashing and the 72-byte guard | `core/security.py`, `routers/auth.py` `ensure_password_supported` |
| 15-minute access token, refresh rotation, session revoke | `core/security.py`, `services/sessions.py`, `models/refresh_token.py`, `/refresh`, `/logout`, `/sign-out-others` |
| Separate client and staff sign-in, staff two-step | `/login`, `/staff-login`, `/staff-login/two-step`, `services/two_step.py` |
| Reset tokens tied to the password (`pf`), no account enumeration | `/request-password-reset`, `/reset-password` |
| Staff-only routers | `dependencies=[Depends(require_staff)]` on admin, team, library, care, calls team, proposals team, portfolio admin |
| Client owns the project | `routers/projects.py` (`Project.client_id == user.id` checks) |
| Rate limits: auth bucket, chat bucket, global | `core/rate_limiter.py` `AUTH_PATHS`, `CHAT_PATHS`, `RateLimitMiddleware` |
| Honeypots on public forms | `routers/agency.py`, `routers/calls.py` |
| Security headers and CSP | `core/security_headers.py`, `kleelab-frontend/next.config.mjs` |
| Paystack webhook signature | `routers/payments.py` → `paystack.signature_is_valid` |
| Upload caps | `MAX_FILE_BYTES` in `routers/projects.py`, `MAX_UPLOAD_BYTES` (used by `routers/portfolio.py`) |
| `SECRET_KEY` placeholder guard, Pydantic input schemas | `core/config.py`, `schemas/*` that are still live |
| Retention job, GDPR export and delete | `services/retention.py`, `routers/gdpr.py`, `services/gdpr.py` |
| Safe `?next=` | `lib/auth.ts` `safeNext` in both apps |
| CSRF | Not needed and not added. Auth is a bearer token in `localStorage` (`services/api.ts`), with no auth cookies. Do not move tokens into cookies in this change. |

**One tightening (A6):** the public form endpoints `POST /api/agency/leads` and `POST /api/calls` currently share the 1,000-per-hour global budget. Add both to `AUTH_PATHS` so they get the 20-per-minute bucket. It is a two-line change.

### Part A — Backend clean-up (`kleelab-backend`)
How deletions were verified: `main.py` mounts only auth, agency, chat, projects, admin, proposals (both), calls (both), team, library, care, portfolio (both), gdpr and payments. For each file below, `grep -rnE "kleelab\.<pkg>\.<mod>|from kleelab\.<pkg> import .*<mod>" src scripts migrations` finds importers only among other files on this list, or in the scripts deleted here. The builder re-runs that grep before deleting each file, and pastes the result.

**A1. Delete the unmounted routers (13).** `routers/{ai,analytics,assets,dashboard,orders,pages,products,public,seo,sites,storefront,templates,versions}.py`. The only importers are `storefront.py` (imports `public`) and `scripts/check_publishing.py`.

**A2. Delete builder-only services, schemas and data.**
- `services/{design_library,site_brief,site_edit,stock_images,template_seed,seo,analytics,dashboard}.py`. Their importers are only the A1 routers and the A3 scripts.
- `services/plans.py`, once A3a below is done. Today its importers are A1 routers plus `routers/auth.py:57`.
- `schemas/{ai,document,storefront,site,page,product,order,template,version,asset}.py`. Their importers are A1 routers and the A2 services.
- `src/kleelab/design/` (`library.json` 640K, `data/` 1.7M). It is read only by `services/design_library.py` (`LIBRARY_PATH`).
- `core/exceptions.py`: `PlanLimitError`, `AIUnavailableError` and their two handlers. They are raised only in `services/plans.py` and `routers/ai.py`.
- `services/email.py`: `send_order_confirmation` and `send_subscription_confirmation`, which have no callers. Also `send_welcome_email` and `send_verification_email`, whose only callers are the endpoints removed in A3b.
- `services/llm.py` `_TASK_PREFERENCES`: drop the builder tasks `brief`, `design`, `compose`, `content` and `edit`, and keep `default` and `chat`. Update `scripts/check_providers.py` lines 123–173 to test `chat` and `default` only.

**A3. Auth: remove dead self-serve paths.**
- a. `_account_out` in `routers/auth.py`: stop calling `plan_state`. In `schemas/auth.py`, remove `plan` from `UserOut`, `plan_label`, `plan_blurb`, `limits` and `usage` from `AccountOut`, and the `PlanLimitsOut` and `PlanUsageOut` classes. Verified with `grep -rnE "\b(plan|plan_label|plan_blurb|limits|usage)\b" kleelab-frontend/src/types kleelab-admin/src/types`, which finds no such field in `User`. Neither app reads them. `two_step_enabled` and `email_topics` stay.
- b. Remove these endpoints. None is called by either app's `services/api.ts` (checked with grep for each path):
  - `POST /api/auth/register`: public, and its only caller `api.register()` is itself never called. The `/register` page already redirects to `/contact`. Clients are created by invite in `services/projects.py`.
  - `POST /api/auth/forgot-password`: an alias of `/request-password-reset`. Both apps call `/request-password-reset`; the `forgot-password` hits in the frontends are page links, not API calls.
  - `POST /api/auth/logout-all`: no caller. `/sign-out-others` is the one in use.
  - `POST /api/auth/resend-verification` and `POST /api/auth/verify-email`: only self-registration issued these tokens, and each token lasts 24 hours, so no valid link exists. Invited clients are verified by `/reset-password`.
  - Remove the matching entries from `AUTH_PATHS`.
- c. `AUTO_VERIFY_EMAILS`: it is read only by `/register`, `routers/sites.py` and the warning in `main.py`. Remove the setting, the warning block in `main.py` and the entry in `render.yaml`.

**A4. Config and CORS (`core/config.py`, `main.py`, `render.yaml`).**
- Remove `SITES_DOMAIN`, `AI_MAX_SECTIONS_PER_REQUEST`, `AI_MAX_PROMPT_CHARS` and `STOCK_IMAGES_ENABLED`/`STOCK_IMAGE_*`. Their only readers are A1 and A2 files; `AI_MAX_PROMPT_CHARS` has no reader at all. Remove `SITES_DOMAIN` from `render.yaml`.
- `cors_origin_regex`: drop the `SITES_DOMAIN` patterns. Allow the localhost pattern only when `ENVIRONMENT == "development"`. Drop `https://[a-z0-9-]+\.onrender\.com` **only if** open question 3 confirms no real origin is on onrender.com; otherwise leave that line. Remove the "published site" comments in `main.py`.

**A5. Rate limiter (only if open question 5 = single instance).** Delete `RedisStore` and the `REDIS_URL` branch in `core/rate_limiter.py`, and `REDIS_URL` in `core/config.py`. The `redis` package is not in `requirements.txt` and `REDIS_URL` is not in `render.yaml`, so this code cannot run in production today. `MemoryStore` and every limit stay.

**A6. Public form limits:** see "What must stay".

**A7. Scripts, CI, dependencies and notices.**
- Delete `scripts/{check_ai,check_design_library,check_publishing,compile_design_library,seed_templates}.py`. They test or seed only A1/A2 code.
- `.github/workflows/ci.yml`: remove the steps "Design library data", "Design library behaviour" and "Publishing addresses and origins". Keep the import smoke test, "Enquiry chat" and "Provider routing and fallback".
- `requirements.txt`: list `segno==1.6.6` once instead of three times, and remove `jinja2` (`grep -rn jinja2 src scripts` finds nothing).
- Delete `THIRD-PARTY-NOTICES.md` at the repo root. Both of its sections describe the design dataset and the generation prompts removed in A2.

**A8. Models and data — no migration.**
- Keep every model file and table. `services/gdpr.py` still exports and erases a user's legacy `Site`/`Page`/`Product`/`Order`/`Asset` rows, `User.sites` needs `Site`, and keeping them in `Base.metadata` stops `alembic revision --autogenerate` from proposing `drop_table`.
- Add `ai_generation` to the model import list in `core/database.py`. After A2 nothing else imports it, so it would drop out of `Base.metadata`.
- Give each legacy model file (`site`, `page`, `page_version`, `product`, `order`, `asset`, `analytics`, `template`, `ai_generation`) a one-line docstring: "Legacy self-serve builder table. Kept for existing data; no API reads or writes it."
- Rollback means reverting the commit. No data or schema changes, so nothing else is needed.

### Part B — Client dashboard (`kleelab-frontend`)
**B1. `components/project/ClientProjectView.tsx`: 11 panels → 6.** All existing components are reused; only their grouping changes.

| New panel | Made from (today) |
|---|---|
| 1. **Over to you** (shown only when something is waiting) | the "waiting for you" box, plus the `Checklist` from "Getting started" moved inside it while items are outstanding |
| 2. **Where we are** | the "Steps" `StageTimeline` panel plus the "Happening now" text, shown under the current stage |
| 3. **Messages and updates** | unchanged (`MessageComposer`, `UpdateFeed`) |
| 4. **Files and links** | the "Files" `FilesPanel` panel plus the "Previews and links" list, merged into one list with links first |
| 5. **Invoices** (shown only when there are any) | unchanged (`InvoiceList`, `BalanceDue`) |
| 6. **After launch** | the hand-over `HandoverPack`, `CarePlanCard` and the "Going live, hosting and care" requests (`RequestList`, `RequestForm`). Before hand-over and with no care plan, it shows only the requests, collapsed behind a "Need hosting or care?" button. |

The two "Looking after your site" titles become one panel title. The completed checklist ("Everything is in") is no longer a separate panel; when everything is in, panel 1 is hidden.

**B2. `app/dashboard/page.tsx`:** if open question 2 = yes and `projects.length === 1`, call `router.replace('/dashboard/projects/{id}')`. Keep the list for 0 or 2+ projects. The `AppShell` "Projects" link still opens the list. When there is exactly one project the page redirects again, which is what the owner wants.

**B3. Dead frontend code.**
- `services/api.ts`: remove `register()`, the `'/api/auth/register'` entry in `NO_REFRESH_PATHS`, and `verifyEmail()`.
- `app/verify-email/page.tsx`: replace with a `redirect('/login')`, the same way `app/register/page.tsx` redirects to `/contact`, so old links land somewhere useful.
- `lib/auth.ts`: drop the `'register'` mode from `loginHref` and the comment about the AI builder. Update `scripts/check-auth.ts:55`, which tests that mode.
- `next.config.mjs`: remove the `images.unsplash.com` remote pattern, which no file in `src` uses, and the "Published sites show images…" comment. Keep `res.cloudinary.com` and the CSP `img-src`.

**B4. Dead admin code (`kleelab-admin`).** No feature is removed. These functions in `src/services/api.ts` have zero references outside that file (grep counts above): `register`, `verifyEmail`, `chat`, `submitLead`, `getProjects`, `sendMessage`, `answerApproval` and `requestService`. Also remove `'/api/auth/register'` from its `NO_REFRESH_PATHS` and the `'register'` mode in `src/lib/auth.ts`. Admin has no screens for the builder, storefront or `/s`.

### States (Part B)
Loading, error and stale states keep their existing components (`ProjectSkeleton`, `ErrorState`, `StaleNote`); update the skeleton to 6 blocks. Empty states: panel 1 and panel 5 are hidden when empty. Panel 4 with nothing shows "No files or links yet. Add one, or we will share previews here." Panel 6 with nothing shows only the collapsed request button.

## Acceptance criteria
1. Given the backend, when `PYTHONPATH=src python -c "from kleelab.main import app; print(len(app.openapi()['paths']))"` runs, then it succeeds and the path count is the old count minus the 5 removed auth paths.
2. Given the repo after A1/A2, when `grep -rnE "routers\.(ai|sites|pages|storefront|products|orders)|design_library|site_brief|site_edit|stock_images|services\.plans|PlanLimitError" kleelab-backend .github` runs, then there are no matches.
3. Given a signed-in client, when `GET /api/auth/me` is called, then the response has `id`, `email`, `full_name`, `role`, `is_verified`, `two_step_enabled` and `email_topics`, and no `plan`, `limits` or `usage`. Both apps' `npm run typecheck` pass.
4. Given anyone, when `POST /api/auth/register`, `/forgot-password`, `/logout-all`, `/resend-verification` or `/verify-email` is called, then the API answers 404 or 405.
5. Given a password reset, when `POST /api/auth/request-password-reset` is called 21 times in a minute from one IP, then the 21st call gets 429. Likewise for `POST /api/agency/leads` and `POST /api/calls` (A6).
6. Given the same app, when `POST /api/chat` passes its hourly limit, then it gets 429 (unchanged).
7. Given `ENVIRONMENT=production`, when a request comes from `Origin: http://localhost:3000` or `https://x.example-sites.com`, then the response has no `access-control-allow-origin`. Origins listed in `CORS_ORIGINS` still get it.
8. Given a database at the current head, when the change is deployed, then `alembic current` is unchanged, and `alembic revision --autogenerate` (run locally, then discarded) proposes no `drop_table`.
9. Given a client with legacy builder rows, when `GET /api/users/me/export` is called, then their sites and pages are still in the export. `scripts/db_checks/check_retention.py` passes.
10. Given every `scripts/db_checks/check_*.py`, plus `scripts/check_chat.py` and `scripts/check_providers.py`, when run against the local test database, then all pass.
11. Given a client project with a pending approval, an outstanding checklist item, an unpaid invoice, files, links, a hand-over and a care plan, when the project page opens, then it shows exactly the 6 panels in the table, in that order, and each action (approve, tick, message, upload, pay, request a service) still works.
12. Given a client project with none of those, when it opens, then panels 1 and 5 are hidden and nothing reads "Everything is in".
13. Given a client with one project and open question 2 = yes, when they open `/dashboard`, then they land on `/dashboard/projects/{id}`. With two projects they see the list.
14. Given `/verify-email?token=x`, when opened, then the browser ends on `/login`.
15. `npm run typecheck`, `npm run lint` and `npm run check:auth` pass in `kleelab-frontend`. `npm run typecheck` and `npm run lint` pass in `kleelab-admin`. `python -m compileall -q src` passes.

## Risks
- **A route is still in use somewhere unexpected.** The routers are already unmounted, so production cannot be calling them. The 5 auth paths were checked against both apps. Check Render logs for 30 days for `/api/auth/register` and `/api/auth/logout-all` before release; if either has real traffic, keep that one.
- **CORS breaks production.** If `CORS_ORIGINS` on Render is missing a real origin, the site breaks. The release-manager checks the Render value against open question 3 before deploying. Revert by restoring the regex line.
- **Lost data.** None: no table, column or row is touched (A8). The GDPR export and delete still cover legacy rows.
- **Clients lose a function in the merge.** Acceptance criterion 11 covers every action. The qa-engineer checks at 375px and 1280px.

## Build order
1. In parallel, as separate worktrees with no shared files:
   - backend-engineer — A1 → A2 → A3 → A4 → A5 (if approved) → A6 → A7 → A8. Commit-sized steps; run the import smoke test after each.
   - frontend-engineer — B1, B2 (if approved), then B3. B3's `api.ts` edits do not depend on the backend, because nothing calls the removed functions.
   - admin-engineer — B4.
2. test-engineer — acceptance criteria 4, 5, 7 and 8 as a new `scripts/db_checks/check_simplify.py` using `_harness.py`; acceptance criteria 11–13 as frontend checks.
3. security-reviewer — confirms every row of "What must stay" is untouched and A6 is in place.

## Release notes
- Render: remove `SITES_DOMAIN` and `AUTO_VERIFY_EMAILS` (and `REDIS_URL` if set) from the API service. Confirm that `CORS_ORIGINS` lists every real frontend and admin origin **before** deploying.
- No migrations.
- `graphify-out/` was built on 2026-10-07 from commit `4cb2b29d`, before the rebrand. Run `graphify update .` after this ships.
