# KleeLab — Full Audit & Remediation Plan

**Date:** 2026-09-12
**Scope audited:** `kleelab-frontend` (Next.js 14), `kleelab-backend` (FastAPI), `render.yaml`, migrations.
**Decisions locked:**
- Target: **full freeform visual builder** (nested elements, drag anything anywhere, per-element styling).
- **D1 Builder engine:** `@dnd-kit` + a custom Zustand tree store.
- **D2 Publish model:** Next.js renders from the schema via a shared component registry.
- **D3 Brand:** the light editorial theme (`#f6f7f2` / `#17231c` / `#e25d3f`, serif headings) becomes the single design system.
- **D4 Backend:** keep and repair (targeted fixes, no rewrite).
- **D5:** templates become full canonical documents.

Audit-first was completed before any code changes.

> This document is a planning artifact only. It is not coupled code; the two projects remain independent.

---

## 1. Executive Summary

The repository contains **two disconnected half-products** rather than the single roadmap in the master plan:

1. A **backend that is genuinely good** — FastAPI, async SQLAlchemy, JWT/bcrypt auth, rate limiting, structured errors, 11 routers, 10 models, services for email/SEO/GDPR/analytics. It is *ahead* of the plan in places (products, orders, analytics exist → Phase 4 data layer) and *behind* in others (no Stripe/subscriptions, no asset upload, no real publishing).
2. A **frontend that is one page** — `/` renders a single `BuilderWorkspace` component. There is **no marketing site (Phase 2)**, no builder routing, and **no drag-and-drop at all**.

The specific complaint — *"all the drag and drop for users to create simple sites didn't work"* — is accurate and has **three independent causes**, none of which is a bug in the editor code itself:

| # | Cause | Evidence |
|---|-------|----------|
| **C1** | **No drag-and-drop engine exists.** Reordering is up/down arrow buttons; adding appends to the end. | `package.json` has no DnD lib; `BuilderWorkspace.moveBlock(±1)`; `EditorCanvas` "Add section" |
| **C2** | **The content model cannot represent layout.** Blocks are a *flat array of fixed typed sections* with hardcoded fields — no nesting, no columns, no per-element styling. | `types/api.ts` `BuilderBlock`; `EditorCanvas.BlockPreview` |
| **C3** | **The editor and the renderer speak different schemas, and publishing discards its output.** The editor saves `content.blocks`; the renderer reads `content.sections`. Publish writes to a temp dir that is deleted, with upload explicitly a stub. | `api.savePage`; `services/renderer.py`; `routers/sites.py` |

So even a perfect drag-and-drop editor would today produce sites that **render blank and publish nowhere**.

**Recommendation:** keep the backend (targeted repair, not rewrite), and **rebuild the editor front end around a canonical, versioned document schema** that is consumed by *both* the editor canvas and the published site. This is the single change that makes drag-and-drop meaningful and makes the publish pipeline disappear as a class of bug.

---

## 2. Repository & Deployment Map

```
kleelab-dev/
├── KLEELAB-AUDIT-AND-REMEDIATION.md   ← this document
├── render.yaml                        ← deploys BACKEND + Postgres only
├── graphify-out/                      ← code knowledge-graph cache (tooling)
├── kleelab-backend/                   ← FastAPI (Python 3.12)
└── kleelab-frontend/                  ← Next.js 14 App Router (TS)
```

**Findings**

| ID | Severity | Finding |
|----|----------|---------|
| **F0.1** | P2 | `render.yaml` deploys **only** `kleelab-api` + `kleelab-db`. There is **no frontend deployment target**. The site has no home in production. |
| **F0.2** | P2 | No CI workflow, no test suite anywhere (backend or frontend). `npm run build` / `pytest` are never gated. |
| **F0.3** | P2 | `graphify-out/` is committed cache (AST hashes). Harmless but should be git-ignored if not intentionally versioned. |
| **F0.4** | ✅ Resolved | `next@14.2.35` carried a critical vulnerability cluster (unauthenticated RCE, Image Optimizer RCE, SSRF, cache poisoning, DoS) plus a high `glob` advisory. **Upgraded to `next@16.3.5` / `react@19.3.0`; `npm audit` now reports 0 vulnerabilities.** See the R0.6 log entry. |
| **F0.5** | ✅ Resolved | `.env` and `.env.local` **are** correctly listed in the root `.gitignore`, so they are not committed. No action needed. |

---

## 3. Frontend Audit

### 3.1 Routing — almost nothing is reachable

`src/app/` contains only `layout.tsx`, `page.tsx`, `globals.css`.

| Planned route | Exists? |
|---------------|---------|
| `/` (agency home per plan) | ❌ — `/` is the builder, not the marketing site |
| `/services`, `/work`, `/work/[slug]`, `/about`, `/contact`, `/blog`, `/blog/[slug]` | ❌ |
| `/privacy`, `/terms`, `/cookies` | ❌ |
| `/builder/dashboard`, `/builder/new`, `/builder/[siteId]/edit`, `/preview`, `/settings`, `/analytics` | ❌ |
| Auth pages (`/login`, `/register`) | ❌ (auth is a modal inside the builder) |

| ID | Severity | Finding |
|----|----------|---------|
| **F1.1** | **P0** | Phase 2 (agency site) is **entirely absent**. The production app is a blank editor with no nav, no footer, no home. |
| **F1.2** | P1 | No builder routes — the whole experience is a 3-step wizard (`welcome → templates → editor`) in one component. There are no deep links, no shareable URLs, no way to resume editing a specific site by URL. |
| **F1.3** | P2 | `Sidebar.tsx` and `components/tabs/{Overview,Pages,Sites,Products,Analytics,Templates}Tab.tsx` are **dead code** — imported nowhere. They belong to a dashboard that was never routed. |

### 3.2 The builder implementation

| ID | Severity | Finding |
|----|----------|---------|
| **F2.1** | **P0** | **No drag-and-drop library.** `moveBlock(direction: -1 \| 1)` swaps array positions; `addBlock` appends. Users cannot drag a block, cannot drop between blocks, cannot reorder by pointer, cannot nest. This is the headline failure. |
| **F2.2** | **P0** | **Flat, fixed block model.** `BuilderBlock` = `{id, type, eyebrow?, title?, body?, cta?, image_url?, items?}` with 6 types. No children, no containers/columns, no style object, no spacing, no alignment, no per-element typography. Freeform layout is impossible on this model. |
| **F2.3** | **P0** | **No image upload.** `image_url` exists on the type but there is **no input control** for it, and the backend has **no upload endpoint** (see F4.4). Images cannot be added at all. |
| **F2.4** | P1 | **Preview is fake.** `openPreview()` builds a hand-written HTML string for a 3-type subset inside `window.open` (and requires pop-ups). It does not use the real renderer, so it cannot be trusted as WYSIWYG. |
| **F2.5** | P1 | **Templates don't change design.** Picking a template only seeds the initial block list (`blocksFromTemplate`). The canvas chrome is a hardcoded `north / studio` nav. Every published site would look the same regardless of template. |
| **F2.6** | P2 | Undo/redo is capped at 20 steps (`slice(-19)`) and lives in local component state (lost on reload/site switch). Plan asked for 50. |
| **F2.7** | P2 | Autosave (700 ms debounce + signature compare in `lastSavedRef`) is actually **reasonable** — keep this pattern. But there is no conflict detection across tabs (plan asked for it). |
| **F2.8** | P2 | `api.ts` exposes only 10 methods (auth, templates, sites, pages). Backend routers for **products, orders, analytics, dashboard, versions, seo, gdpr, assets** are **unreachable from the UI**. |

### 3.3 Brand & design system — three conflicting identities

This is a significant, under-reported problem.

| Source | Identity |
|--------|----------|
| **Master plan** | 🍀 Clover Green `#4CAF50`, Lucky Gold `#FFD700`, Soft Mint `#E8F5E9`, Charcoal `#1a1a1a`; **Poppins** headings, **Inter** body; "cute, secure digital products" |
| `layout.tsx` + `globals.css` + `tailwind.config.js` | **Dark slate-950** "Control Center", blue `brand` palette, dark gradient body, Inter only |
| `BuilderWorkspace.tsx` + `EditorCanvas.tsx` | **Light editorial** `#f6f7f2` / `#17231c` / orange `#e25d3f`, `font-serif` headings, all colors **hardcoded hex** |

| ID | Severity | Finding |
|----|----------|---------|
| **F3.1** | **P1** | The plan's brand (clover green / Poppins) appears **nowhere** in code. |
| **F3.2** | P1 | The Tailwind theme is **largely bypassed** — the builder uses raw hex literals (and `font-serif`), so `tailwind.config.js` tokens have almost no effect. No single source of truth for color/spacing/typography. |
| **F3.3** | P2 | Root `metadata` says *"KleeLab Control Center / Enterprise Digital Site Builder & E-Commerce Management Platform"* — contradicts the agency positioning *"We build cute, secure digital products."* |
| **F3.4** | P2 | `<html className="dark">` is hard-set globally, so dark mode is not actually toggleable despite `darkMode: 'class'`. |

---

## 4. Backend Audit

### 4.1 What's good (keep it)

- Clean layering: `core/` (config, database, security, logging, exceptions, rate limiter), `models/`, `schemas/`, `routers/`, `services/`.
- Async SQLAlchemy 2.0 + asyncpg; Alembic migrations present (`initial_schema`, `add_user_account_fields`).
- Auth: bcrypt with a correct 72-byte guard (`security.py`), JWT via python-jose, `get_current_user` ownership checks, email-verify + password-reset signed tokens.
- Ownership verification helpers (`get_owned_site/page/order/product`) are applied consistently — **good IDOR posture**.
- Page versioning with 50-version trim (`routers/pages.py update_page`).
- Sentry hook, request logging, structured error envelope.

### 4.2 Findings

| ID | Severity | Finding |
|----|----------|---------|
| **F4.1** | **P0** | **Duplicate, conflicting render service.** `services/renderer.py` and `services/static_generator.py` both define `generate_static_site`. `routers/sites.py` imports the **renderer** one; `static_generator.py` is **dead code**. Two implementations of the same contract invite silent divergence. |
| **F4.2** | **P0** | **Publishing produces no artifact.** `renderer.generate_static_site` writes files into `TemporaryDirectory(...)` which is **destroyed on exit**; the upload step is an explicit stub. `static_generator` repeats the same pattern. `publish` returns a `*.kleelab.com` URL that **resolves to nothing**. |
| **F4.3** | **P0** | **No publishing infrastructure.** No object storage (S3/R2), no CDN, no reverse-proxy/wildcard-DNS config, no SSL automation. "Subdomain hosting / custom domain / SSL" from the plan are **pure stubs** (`set_custom_domain` just stores a string). |
| **F4.4** | **P1** | **No assets/upload router** although the `Asset` model + `assets` table exist. Combined with F2.3, images are impossible end-to-end. |
| **F4.5** | **P1** | **No subscriptions/Stripe.** No router, no model, no webhook. `Subscription` exists only as a fictional frontend type. Phase 3/4 billing is absent. |
| **F4.6** | **P1** | **Rate limiter is in-memory per-process** (`core/rate_limiter.py`). On Render with >1 worker/instance it is trivially bypassed and inconsistent; the cleanup loop only removes *empty* deques. Needs Redis (or a managed limiter). |
| **F4.7** | **P1** | **Token model does not match the plan.** `ACCESS_TOKEN_EXPIRE_MINUTES = 1440` (24 h) with **no refresh token** and **no refresh endpoint**; no `logout` endpoint (client just deletes the token); no Google OAuth; no `/forgot-password` alias. Plan specified 15 min + refresh rotation. |
| **F4.8** | P1 | **Publish is gated on `is_verified`, but `AUTO_VERIFY_EMAILS` defaults to `False`.** In the live environment publishing succeeded for a freshly registered account, so the flag is evidently enabled there — which means the gate is currently masked by configuration. A deployment that forgets it would silently block all publishing. Keep, but make the state visible to the user. |
| **F4.9** | P2 | **`tally.py` router missing.** Phase 1 waitlist integration is not present in the backend. |
| **F4.10** | P2 | `bcrypt==5.0.0` pinned in `requirements.txt`, but `bcrypt` 4.x/5.x had breaking API churn around `gensalt`/pure-python behaviour across environments — verify the pin builds on the Render Python 3.12.8 image. (`sentry-sdk==2.0.0` is also old.) |
| **F4.11** | P2 | `templates` uses `sa.JSON` (not JSONB) and `config` is an unvalidated `dict`; there is no schema for `config`. Combined with F5.x this is where template/section drift hides. |
| **F4.12** | P2 | No security headers (CSP, HSTS, X-Frame-Options). Plan listed these. |
| **F4.13** | P2 | `analytics_events` has no repository layer / retention policy and the table has no index on `(site_id, created_at)` — fine now, but plan called for Redis caching + query optimisation. |

---

## 5. The Critical Contract Break (root cause deep-dive)

The editor and the renderer describe content in **two incompatible languages**, and templates describe it in a **third**.

```mermaid
flowchart LR
  T["Template.config.sections<br/>['hero','text','gallery','form']"] -->|blocksFromTemplate| E["Editor blocks<br/>{id,type,title,body,cta,items}"]
  E -->|api.savePage| DB[("pages.content<br/>{version:1, blocks:[...]}")]
  DB -->|renderer reads| R["renderer expects<br/>content.sections[].data.*"]
  R -->|mismatch| EMPTY["Published body = EMPTY"]
  EMPTY -.->|no storage| NOWHERE["URL resolves to nothing"]
```

| Layer | Field it reads/writes | Shape |
|-------|----------------------|-------|
| Frontend save (`api.savePage`) | `page.content_json` → backend `content` | `{ version: 1, blocks: [{id,type,eyebrow,title,body,cta,items}] }` |
| Backend renderer (`services/renderer.py`) | `page.content` | `{"sections": [{type, data: {title, subtitle, text, html, images}}]}` |
| Template seed (`services/template_seed.py`) | `template.config` | `{sections: [...], colors, fonts, layout, category}` |

**Consequences**
- `render_section` is only ever reached if `content["sections"]` exists — it never does → **empty `<body>`**.
- `renderer.render_page` also passes `page.og_title / meta_title / meta_description`, which exist, so the `<head>` is fine — masking the fact the body is empty.
- `template_config.get("styles")` is always `""` because the seed has no `styles` key → **no template CSS**.

| ID | Severity |
|----|----------|
| **F5.1** | **P0** — Editor→DB→renderer schema mismatch; published sites render empty. |
| **F5.2** | **P0** — Publish output is discarded (temp dir) and never uploaded. |
| **F5.3** | P1 — Template `config` has no schema; `styles` referenced but never provided; template design is not applied. |

---

## 6. Schema Drift — DB/Model vs Frontend Types

The frontend `types/api.ts` describes a **different backend** than the one that exists. These fictional types are used only by the dead tab components.

| Entity | DB / Model / Schema (truth) | Frontend type (fiction) | Drift |
|--------|----------------------------|-------------------------|-------|
| Asset | `filename`, `file_type`, `url`, `file_size` | `file_name`, `file_url`, `mime_type` | ❌ names differ |
| Product | `price`, `stock`, `images`, `category`, `variants` (no currency) | `price`, `currency`, `inventory_count` | ❌ `stock`→`inventory_count`, phantom `currency` |
| Order | `total`, `items`, `customer_name` (no currency/count) | `total_amount`, `currency`, `items_count` | ❌ all three differ |
| Template | `name`, `preview_image`, `thumbnail`, `config` | `title`, `description`, `thumbnail_url` | ⚠️ patched by `normalizeTemplate` at runtime |
| Subscription | **does not exist** | fully typed | ❌ phantom |
| `DashboardStats`, `ActivityItem`, `TabType` | partial backends | fully typed | ❌ phantom |

| ID | Severity | Finding |
|----|----------|---------|
| **F6.1** | P1 | Frontend types are hand-maintained and **already wrong**. No generation from OpenAPI → drift will keep recurring. |
| **F6.2** | P2 | `normalizePage`/`normalizeTemplate` in `api.ts` are runtime patches masking contract mismatches rather than fixing them. |

---

## 7. Plan vs Reality Scorecard

| Plan item | Status | Note |
|-----------|--------|------|
| Phase 1 Foundation (waitlist, Tally, coming-soon) | ⚠️ unknown | No Tally router; no marketing page; no video assets found in the tree |
| Phase 2 Agency site (11 routes, 12 components) | ❌ **0%** | Nothing built |
| Phase 3 Backend | 🟡 ~70% | Strong base; publishing broken; no Stripe; token model short of spec |
| Phase 3 Builder frontend | 🔴 ~15% | One page, no routes, **no DnD**, no images, no template design |
| Phase 4 E-commerce | 🟡 backend-only | Models+routers exist; zero UI; type drift (F6.1); no checkout |
| Phase 5 Polish & Launch | ❌ | No tests, no CI, no perf/security work, no frontend deploy |
| **Extra (unplanned)** | ✅ | products/orders/analytics/versions/gdpr/dashboard backends; 6 dead dashboard tabs |

---

## 8. Remediation Plan

**Guiding principle:** *one canonical document schema, consumed by both the editor and the published renderer.* This is the keystone; without it the editor is rebuilt twice.

### R0 — Foundations & Cleanup  *(no user-facing features)*
- **R0.1** Delete dead code: `services/static_generator.py`; decide fate of `Sidebar.tsx` + `components/tabs/*`.
- **R0.2** Encode the **light editorial theme** (decided, D3) as the single source of truth: Tailwind theme + CSS variables + a font decision (serif headings). Remove hardcoded hex from components. Align `layout.tsx`, `globals.css`, `tailwind.config.js` to it and drop the dark "Control Center" remnants.
- **R0.3** Add frontend tooling: `zustand`, `@dnd-kit/core` + `@dnd-kit/sortable`, `zod` for schema validation.
- **R0.4** Generate TS types from the backend OpenAPI schema (kills §6 drift permanently).
- **R0.5** Add minimal CI: backend `ruff` + `pytest` smoke, frontend `tsc --noEmit` + `next build`.
- **Acceptance:** `npm run build` and backend import/health tests pass in CI; no hex literals in components; dead files removed.

### R1 — Canonical Document Schema + Rendering Pipeline  *(the keystone)*
- **R1.1** Define `schemaVersion` document model (shared JSON schema, validated with `zod` in TS and Pydantic on the server):
  ```
  Document = { schemaVersion, root: Node, tokens: {...} }
  Node     = { id, type, props, style, responsiveStyle?, children: Node[] }
  ```
  Element types: `page`, `section`, `container`, `grid`, `heading`, `text`, `image`, `button`, `link`, `divider`, `spacer`, `list`, `form`, `input`, `nav`, `footer`, `html`.
- **R1.2** Build a **single component registry** (`type → React component`) used by **both** the editor canvas and the published site. WYSIWYG becomes structural, not aspirational.
- **R1.3** Migrate `pages.content` to the new schema (Alembic data migration mapping legacy `blocks` and legacy `sections` → new tree).
- **R1.4** **Delete server-side rendering** (`services/renderer.py`) and serve published sites from Next.js using the shared registry (decided, D2). This removes the temp-dir/upload path and the duplicate-renderer problem (F4.1/F4.2) outright.
- **Acceptance:** a hand-authored JSON document renders identically in the editor canvas and on the published route.

### R2 — The Builder (main effort)
- **R2.1** Real routes: `/builder/dashboard`, `/builder/new`, `/builder/[siteId]/edit`, `/preview`, `/settings`.
- **R2.2** Zustand document store: tree ops, selection (single+multi), history (undo/redo ≥50), autosave, cross-tab conflict detection.
- **R2.3** **Nested drag-and-drop with `@dnd-kit`**: palette → canvas insert; drag to reorder; drop *into* containers; duplicate/delete; drag handle UX; keyboard-accessible reordering.
- **R2.4** Properties panel with real style controls: spacing, colour (token-aware), typography, alignment, size, border; **device-specific overrides** (desktop/tablet/mobile).
- **R2.5** Media manager backed by a new **assets upload router** + storage (closes F2.3/F4.4).
- **R2.6** Templates become full canonical documents (not section-name lists), so choosing one actually changes the design (closes F2.5).
- **Acceptance:** a user can build a multi-section page with nested containers, style each element per breakpoint, add images, and undo/redo reliably.

### R3 — Publishing That Works
- **R3.1** Publish model is decided (D2): render on demand via Next.js (route per subdomain/slug) + cache invalidation — eliminates F4.2/F4.3. Add a `/s/[subdomain]` path-based route first, subdomain routing second.
- **R3.2** Serving layer: wildcard subdomain (`*.kleelab.com`) via the frontend host; custom domain = DNS verification + host mapping (a real task, not a string field).
- **R3.3** SEO: per-page metadata, `sitemap.xml`, `robots.txt` served by the **rendering host** (the current backend `seo.py` sitemap has no HTML to point at).
- **R3.4** Analytics: emit events from the rendered page into the existing `analytics_events` table.
- **Acceptance:** clicking Publish yields a URL that actually loads the built site.

### R4 — Auth & Backend Alignment
- **R4.1** Token model to spec: 15-min access + **refresh rotation** + `logout` (revoke) + `/forgot-password` alias.
- **R4.2** Resolve the email-verification dead-end (F4.8): either wire Resend properly or gate publish behind a clearer, visible state.
- **R4.3** Redis-backed rate limiting (F4.6) and security headers (F4.12).
- **R4.4** Add `tally.py` if Phase 1 waitlist is still live.
- **Acceptance:** token refresh works; publish is reachable for a normal new user; limits survive multi-instance.

### R5 — Phase 2 Agency Site *(plan's own Phase 2)*
- Build the 11 marketing routes and 12 components per the master plan, on the **unified** design system from R0.2.
- Wire the contact form to a leads endpoint (the `agency_leads` table already exists but has **no router**).

### R6 — E-commerce & Launch *(plan's Phase 4/5)*
- Fix type drift for products/orders, build storefront blocks + checkout, add Stripe subscriptions/webhooks.
- Perf/security/launch work per plan Phase 5, now on a real CI/observability base.

### Suggested order & why
`R0 → R1 → R2 → R3` delivers the thing that "didn't work": a working, publishable drag-and-drop builder. `R4 → R5 → R6` then restore the original roadmap order on solid ground. Building R5 (marketing) first would repeat the original mistake of shipping surface before the engine.

### R0 Progress Log

**2026-09-12 — R0 complete**

| Task | Status | Notes |
|------|--------|-------|
| R0.1 Remove dead code | ✅ Done | Deleted `services/static_generator.py` (zero references; duplicate of `renderer.generate_static_site`) and the unrouted `components/Sidebar.tsx` + `components/tabs/*` (6 files). |
| R0.2 Brand source of truth | ✅ Done | `tailwind.config.js`, `globals.css`, and `layout.tsx` rewritten to the light editorial theme with named tokens (`paper`, `canvas`, `ink`, `muted`, `line`, `mint`, `accent`, `danger`, `success`) plus CSS variables. Dark "Control Center" remnants removed. Component-level hex sweep folded into R2 (see note). |
| R0.3 Tooling | ✅ Done | Added `zustand`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `zod`. |
| R0.4 Types from OpenAPI | ✅ Done | Backend schema dumped (38 endpoints) → `openapi.json` contract snapshot at the frontend root → `src/types/api.gen.ts` (73 KB) generated via the new `types:api` script. **Adoption** of the generated types (replacing the hand-written/fictional ones) happens in R1/R2. |
| R0.5 CI | ✅ Done | `.github/workflows/ci.yml` added: frontend `npm ci` → `lint` → `typecheck` → `build`; backend `pip install` → import smoke → `compileall`. All steps verified locally. |
| R0.6 Next.js 16 upgrade | ✅ Done | `next@16.3.5`, `react`/`react-dom`@19.3.0, `@types/react(-dom)`@19, `eslint-config-next`@16, `eslint`@9. **`npm audit`: 0 vulnerabilities.** See details below. |

**R0.2 deferral note:** the hex-sweep in `BuilderWorkspace.tsx` / `EditorCanvas.tsx` was **deliberately deferred into R2**, because both components are replaced by the freeform rebuild. `EditorCanvas.tsx` also contains 2,291-character lines that fall outside safe single-edit boundaries. Sweeping colours out of files that are about to be deleted is wasted churn; the tokens are in place for R1/R2 to consume.

**Verification:** `npm run lint` (0 errors, 1 warning), `npm run typecheck` clean, `next build` passes, dev server serves `GET / 200`, backend import smoke prints 38 routes, `compileall` exit 0.

**R0.6 — Next.js 16 upgrade notes** (the F0.4 blocker, now cleared):
- Ran the upgrade **manually** rather than via the interactive codemod: every codemod migration was verified non-applicable (no `middleware.ts`, no `experimental.turbo` config, no `unstable_` APIs, no `experimental_ppr`).
- **`next lint` is removed in 16**, and the project had **no ESLint config at all** (so it never actually ran). Added `eslint.config.mjs` (flat config, `core-web-vitals` + `typescript`) and changed the script to `eslint .`.
- **`eslint@latest` resolved to v10, which `eslint-config-next`'s bundled `eslint-plugin-react` does not support yet** (crashed with `contextOrFilename.getFilename is not a function`). Pinned to `eslint@^9`.
- Fixed the one real lint error: `react-hooks/set-state-in-effect` flagged the mount effect in `BuilderWorkspace`; the template fetch now updates state inside promise callbacks (which also added an unmount-safety `active` guard).
- Next.js auto-adjusted `tsconfig.json` (`jsx: react-jsx`, `target: ES2017`, `.next/dev/types` include).
- Added `turbopack.root` to `next.config.mjs` — Next had inferred the workspace root outside the repo (it warned about `~/pnpm-lock.yaml`).
- Next 16 now auto-generates `AGENTS.md` + `CLAUDE.md` (agent docs); kept them, since `next dev` re-creates them and the official guide recommends the setup.
- **Remaining lint warning (deliberate):** `@next/next/no-img-element` on the template thumbnail in `BuilderWorkspace` (line ~496). Template thumbnails are arbitrary remote URLs; `next/image` would require widening `images.remotePatterns` to all hosts. Resolved by R2's media manager.
- **R3 implications:** host routing must be written as `proxy.ts` (not `middleware.ts`; Node runtime only), request APIs (`params`/`searchParams`/`cookies`) are async-only, and cache invalidation now uses `revalidateTag(tag, profile)` / `updateTag`.

**R0 incidentally resolved:** F0.5 (env files are properly git-ignored).

### R1 Progress Log

**2026-09-12 — R1 core complete**

| Task | Status | Notes |
|------|--------|-------|
| R1.1 Canonical schema | ✅ Done | Frontend `src/lib/document.ts`: zod `documentSchema`/`nodeSchema`, `Style` token model, factories, `parseDocument`. Backend `schemas/document.py` mirrors it and is enforced on page create/update **only when `content.document` is present** (422 otherwise), so legacy writes still work. |
| R1.2 Shared registry | ✅ Done | `src/components/render/registry.tsx` — one `NODE_REGISTRY` covering all 17 node types, plus `NodeRenderer`/`DocumentRenderer`. A client component (event handlers) that still server-renders for SEO. |
| R1.3 Data migration | 🔀 **Re-sequenced into R2** | Migrating data before the *writer* changes is pointless — the editor still writes legacy `blocks`. Instead the renderer does a non-destructive **read-time** migration (`parseDocument`), so both shapes work today. The Alembic backfill + dropping legacy keys moves to R2, when the editor starts writing documents. |
| R1.4 Delete server renderer | ✅ Done | `services/static_generator.py` (R0) and `services/renderer.py` (R1) are both gone. `publish_site` no longer generates anything: it marks the site published and returns a real frontend URL (`{FRONTEND_URL}/s/{subdomain}`). |
| R1.5 Public read API | ✅ Done (added) | New `routers/public.py`: `GET /api/public/sites/{subdomain}` and `.../page?slug=` — published sites only. API went 38 → 40 routes. |
| R1.6 Published route | ✅ Done | `src/app/s/[subdomain]/[[...slug]]/page.tsx` — dynamic, rendered through the shared registry, with `generateMetadata` from the SEO fields. |

**Verification:** lint 0 errors · build routes `/`, `/_not-found`, `ƒ /s/[subdomain]/[[...slug]]` · typecheck clean · backend import 40 routes, `compileall` 0. The schema, migrator, and style resolver were exercised at runtime with a throwaway Node script: legacy `blocks` (hero/features/contact) and legacy `sections` (hero/gallery) both convert correctly, responsive overrides resolve (`max-md:text-center max-md:py-4`), and invalid documents are rejected.

**Not yet proven end-to-end:** rendering a live published page needs a running database (no DB/fixtures in this environment). Belongs to R3 verification.

**Editor adoption:** the canvas still edits legacy `blocks`. R2 rewires it onto the document model and deletes the legacy path.

### R2 Progress Log

**2026-09-12 — R2 core (drag-and-drop editor) working**

| Task | Status | Notes |
|------|--------|-------|
| R2.2 Document store | ✅ Done | `src/lib/editor/tree.ts` (immutable tree ops: find/insert/move/remove/clone, self-descendant guard) + `src/lib/editor/store.ts` (Zustand: document, selection, 50-step history, device, per-breakpoint style targets). |
| R2.3 Nested drag-and-drop | ✅ Core done | `@dnd-kit` with a palette (13 blocks) and a recursive sortable canvas. Custom collision detection (pointer-based, deepest-node preference) plus edge-aware `before / after / inside` placement. |
| R2.4 Properties panel | ✅ Done | `Inspector.tsx`: per-type content controls (heading/text/button/link/image/list/spacer/nav/footer) and layout tokens (background, colour, align, size, padding, gap, radius, shadow, max-width) targeting **all / tablet / mobile**. |
| R2.1 Real routes | ✅ Done | `/builder/dashboard` (sites list, publish/unpublish, open editor, settings, delete, sign out), `/builder/new` (template onboarding), `/builder/[siteId]/settings` (name, subdomain, custom domain, per-page SEO, publish, delete). Editor + settings reachable from the dashboard; editor toolbar links back to it. |
| R2.5 Media manager + assets upload | ⬜ **Remaining** | Needs a backend assets router **and a storage decision** (S3/R2 credentials). Image blocks take a URL for now. |
| R2.6 Templates as documents | ✅ Done | `src/lib/templates.ts` builds a full canonical document per template category (`config.document` wins when a template record ships one). New sites are now seeded with a **document**, not legacy blocks. |
| Page switching | ✅ Done (added) | `PagesBar` + `openPage`/`createPage` in the editor. Switching **flushes the pending autosave first**, so edits cannot be lost when changing pages. |

**The original complaint is now fixed:** drag-and-drop exists and works.

**Browser-verified** (real Chromium, real pointer events, DOM order asserted after each step):
- palette → canvas insert at a precise index (dropped a Divider on the heading's top edge → `H1,P,A` became `HR,H1,P,A`)
- moving an **existing** node before a target (`HR,H1,P,A` → `HR,A,H1,P`)
- **undo** reverts a move
- selection drives the inspector; device toggle renders
- build / lint / typecheck all green; routes `/`, `/_not-found`, `ƒ /builder/[siteId]/edit`, `ƒ /s/[subdomain]/[[...slug]]`

**Bug found and fixed during verification:** applying `closestCenter` alone resolved drops onto the page root whenever a node was dragged by its own handle (element-centre vs cursor), so moves silently did nothing. Replaced with pointer-based collision detection preferring the deepest droppable.

**Second bug found and fixed:** `api.updatePage` always sent a `content` key, so any metadata-only update (site settings, SEO) would have **overwritten the stored page document with `{}`**. Content is now only sent when explicitly supplied. This is exactly the class of silent data-loss the original editor/renderer mismatch caused.

**Routes after R2:** `/`, `/_not-found`, `○ /builder/dashboard`, `○ /builder/new`, `ƒ /builder/[siteId]/edit`, `ƒ /builder/[siteId]/settings`, `ƒ /s/[subdomain]/[[...slug]]`. Browser-verified: dashboard renders its signed-out state, `/builder/new` renders the template onboarding, and the editor shows the new `PAGES / Add page` bar alongside the palette.

**Known gaps**
- The palette and inspector are `lg:`/`xl:`-only, so narrow viewports show canvas alone. Needs a collapsible/mobile treatment.
- Autosave writes `{ document }` (the new format) — **now verified end-to-end, see below**.
- `BuilderWorkspace`'s old internal block editor is now unreachable (site open/creation navigate to the new editor); `EditorCanvas.tsx` is superseded and should be trimmed once the dashboard routes land.
- Form-field editing and image upload are still to come.

### End-to-End Verification (2026-09-12) — closes the earlier "unverified" gaps

The configured `DATABASE_URL` points at a **remote Neon instance** (`neondb`), already at migration head (`add_user_account_fields`) and seeded with 15 templates. No migration or seed was needed or run. The backend was started against it and the real stack driven with a browser.

| Step | Result |
|------|--------|
| Backend health | `{"status":"ok","database":"connected"}` |
| Register + login | 201 / 200 |
| Create site + page **with a canonical document** | 201 — the backend's Pydantic document validator accepted it |
| Editor loads the document from the database | heading and body rendered from stored content |
| Edit → autosave | persisted; confirmed by polling `content.document` (landed in ~4.3 s) |
| Reload the editor | content restored from the database, not local state |
| Publish | `is_published=true`, `published_at` set, returned `https://kleelab.com/s/{subdomain}` |
| Public route `/s/{subdomain}` | rendered the same document through the shared registry (heading + text + divider); `generateMetadata` produced `Home · {site} · KleeLab` |

All test data was removed afterwards (`DELETE /api/users/me`); row counts returned to their pre-test values (users 6, sites 4, pages 3).

**Environment findings worth keeping**
- **email-validator rejects special-use domains** (`.test`, `.example`, `.invalid`), so registration tests need a real TLD. This produced a 422 that looked like an application bug.
- **Remote-database latency is seconds, not milliseconds.** A fixed 2.5 s wait produced a *false negative* — the editor looked like it had failed to load. Verification must poll for a condition, never sleep a fixed amount.
- **PowerShell environment variables persist between commands.** A `$env:DATABASE_URL` set earlier for a CI smoke test leaked into a later command and silently redirected a database check to the wrong server.
- Starting the backend requires the `.env` value to be in effect; an environment override takes precedence and fails confusingly (`password authentication failed for user "ci"`).

---

## 9. Decisions (Locked)

| # | Decision | Chosen | Consequence |
|---|----------|--------|-------------|
| **D1** | Builder engine | ✅ **`@dnd-kit` + custom Zustand tree store** | We own the nested-DnD implementation; budget a dedicated prototype milestone (highest-risk item) |
| **D2** | Publish model | ✅ **Next.js renders from schema (shared registry)** | `services/renderer.py` and `static_generator.py` both get deleted; no object storage needed for v1 |
| **D3** | Brand source of truth | ✅ **Light editorial theme** (`#f6f7f2`/`#17231c`/`#e25d3f`, serif) | `layout.tsx`/`globals.css`/`tailwind.config.js` must be rewritten to match; plan's clover-green is dropped |
| **D4** | Backend fate | ✅ **Keep + repair** | Keep auth/ownership/models; replace rendering/publishing; add assets + refresh tokens + Redis limiter |
| **D5** | Templates | ✅ **Full canonical documents** | Required for real template-driven design (R2.6) |

---

## 10. Risk Register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Nested-tree DnD is genuinely hard (drop-into-container, keyboard a11y) | Schedule | Prototype in isolation first; treat as its own milestone |
| Publishing subdomain + SSL requires DNS/host work outside code | Blocks "real" launch | Ship path-based publishing (`/s/[subdomain]`) first, domains later |
| Legacy `pages.content` data exists in two shapes | Data loss | Alembic data migration with a dual-read fallback during transition |
| Type drift recurs | Rework | Generate TS types from OpenAPI (R0.4) — ban hand-written API types |
| Three design identities | Inconsistent UI | D3 locked (light editorial); encode once in R0.2 |
| No tests around a rewrite | Regressions | Add CI (R0.5) before R1 rewrites the renderer |

---

## 11. Appendix — Key Evidence

| Claim | Location |
|-------|----------|
| Only one route | `kleelab-frontend/src/app/page.tsx` |
| No DnD, arrow-button reorder | `kleelab-frontend/src/components/BuilderWorkspace.tsx` (`moveBlock`, `addBlock`) |
| Flat block model | `kleelab-frontend/src/types/api.ts` (`BuilderBlock`) |
| Editor saves `blocks` | `kleelab-frontend/src/services/api.ts` (`savePage` → `{version:1, blocks}`) |
| Renderer reads `sections` | `kleelab-backend/src/kleelab/services/renderer.py` (`render_page`, `render_section`) |
| Duplicate renderer (dead) | `kleelab-backend/src/kleelab/services/static_generator.py` |
| Publish → temp dir, stub upload | `renderer.generate_static_site`, `static_generator.generate_static_site` |
| Publish import + is_verified gate | `kleelab-backend/src/kleelab/routers/sites.py` (`publish_site`) |
| 24h token, no refresh | `kleelab-backend/src/kleelab/core/config.py`, `core/security.py` |
| In-memory rate limiter | `kleelab-backend/src/kleelab/core/rate_limiter.py` |
| No assets router (model exists) | `routers/` has no `assets.py`; `models/asset.py` exists |
| Dark theme vs light builder | `app/layout.tsx`, `app/globals.css`, `tailwind.config.js` vs `EditorCanvas.tsx` |
| Dead dashboard tabs | `components/Sidebar.tsx`, `components/tabs/*` (unreferenced) |
| Schema drift | `migrations/versions/initial_schema.py` vs `src/types/api.ts` |
| Backend-only deploy | `render.yaml` |
