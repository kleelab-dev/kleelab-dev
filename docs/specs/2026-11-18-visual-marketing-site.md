# Make the public site visual and marketable

- **Status:** Shipped
- **Date:** 2026-11-18
- **Apps:** frontend
- **Size:** M (a few days). Release 1 (shared pieces + Services, service pages, How we build) can ship on its own if time runs short; Release 2 is the rest.

## Open questions (owner)
1. **Stack strip.** Do you want a "Built with" strip, and which tools should it name? It would be text wordmarks only, with no logo files. If you say no or do not answer, the strip is left out.
2. **Real people.** Do you have real team photos or names for About? If not, About gets a drawing and no faces. We will not use stock photos of "the team".
3. **Portfolio on service pages.** Should a service page show real portfolio items whose `tags` include the service slug (`websites`, `shops`, `apps`, `systems`)? If yes, staff tag the items in admin. If no, item P1 is dropped.

## Why
The owner says visitors see mostly text, so the site does not sell. The home page already has drawings: `ProjectPreview`, `ServiceSketch`, `ProcessTimeline`, `DashboardShowcase`, `ExampleShot` and `PortfolioSlider`. The inner pages do not. Services add-ons and pricing, the service detail pages, How we build, About, Care, Contact, Book and the empty Portfolio are all text cards.

## What changes
Every public page gets at least one picture of the product or the process. The pictures are drawn in code in the Blueprint style: graph paper, ink lines, cobalt pen, sun highlighter, stamps, dimension lines and the offset shadow. Visitors see what they will get: the dashboard, the written quote, the monthly care report and the steps.

## Out of scope
- Stock photos, fake client logos, testimonials or invented numbers. A mock may show example data only if it is labelled "example" and contains no percentages, counts of clients or performance figures presented as fact.
- New pages, copy rewrites beyond alt text and labels, and legal pages (`/privacy`, `/terms`, `/cookies`).
- The client dashboard and admin.
- New npm dependencies, including animation, icon or illustration libraries. Use `@heroicons/react`, which is already installed, and inline SVG.
- `/s` routes and anything from the old builder.

## Design

### Rules for every visual
- Use tokens from `kleelab-frontend/tailwind.config.js` only. For SVG strokes, reuse the `pen` and colour constants from `components/site/ServiceSketch.tsx`: export them from there instead of copying hex values.
- Use server components unless the visual moves. Anything that moves uses the existing `Reveal`, `.kl-stamp-in` or `useScrollProgress`, and respects `prefers-reduced-motion` (already in `globals.css`).
- **Decorative** drawings get `aria-hidden` on the SVG or wrapper. **Product mocks** are a `<figure aria-label="Example of …">`, with their inner text `aria-hidden`, so a screen reader hears one sentence instead of fake data.
- At 375px wide, each visual fits within 343px. Mocks use `aspect-[…]` boxes and percentage widths and never set a fixed width over 320px. There is no sideways scroll; clip oversize decoration with `overflow-x-clip`, the way the home hero does.
- No raster images are added and no `public/` folder is created. Portfolio screenshots already come from Cloudinary through `components/site/PortfolioImage.tsx` (`next/image`, `res.cloudinary.com` in `next.config.mjs`), uploaded by staff in admin. OG images are drawn with `next/og`.

### Components (all under `kleelab-frontend/src/components/site/`)
| # | Component | New / changed | What it draws | Used on |
|---|---|---|---|---|
| C1 | `ServiceSketch.tsx` | changed | Adds three drawings to `DRAWINGS`: `deployment` (rocket on a dashed launch line), `hosting` (server rack with a heartbeat line), `maintenance` (wrench over a checklist). Exports `pen`, `INK`, `COBALT`, `SUN`. | Home "Optional extras", `/services` add-ons, `/care` plan cards |
| C2 | `StageSketch.tsx` | new | Six small drawings keyed by the stage names in `content/site.ts` `processStages` (Planning: sticky notes and arrow; Design: wireframe with a colour swatch; Build: brackets and a component tree; Testing: phone and laptop with a tick; Going live: a switch flipped to "LIVE"; Hand-over: a key on a folder). Same pen as C1, `viewBox 0 0 200 112`. | `/how-we-build` (one per stage) |
| C3 | `ExampleShot.tsx` | changed | Adds a `site` shot (hero, three cards, footer) to `SHOTS` and the `WorkExample['shot']` type in `content/work.ts`. Adds a `size?: 'sm' \| 'lg'` prop; `lg` drops the outer padding so it can fill a hero column. | Service detail heroes, `/portfolio` empty state |
| C4 | `QuoteMock.tsx` | new | An example written plan on paper: a title block, 4 line items with week ranges instead of prices, a total line reading "Fixed price, agreed before work starts", and a cobalt `stamp` reading "Approved". Labelled "example". | `/services` Pricing, `/contact` aside |
| C5 | `CareReportMock.tsx` | new | An example monthly care report in a `BrowserFrame`: rows for Updates, Backups, Security check and Changes you asked for, each with a tick or "done", and a note from the team. No uptime or speed percentages. | `/care` "How it works" |
| C6 | `BeforeAfter.tsx` | new | Two panels side by side (stacked below `sm`). "Without a dashboard": a messy email thread drawn as overlapping grey cards with "Any update?" "Re: Re: Fwd:". "With KleeLab": a tidy stage list with one approval card. A dimension line between them reads "same project". | `/about` "Why the dashboard" |
| C7 | `StepRail.tsx` | new | A vertical numbered rail with a cobalt line and a stamp on the last step. It **replaces** the copy-pasted numbered `<ol>` in `/contact` (`NEXT_STEPS`) and `/book` (`ON_THE_CALL`). Props: `steps: string[]`, `stamp?: string`. | `/contact`, `/book` |
| C8 | `BrowserFrame.tsx` | new | The three-dot browser bar plus a URL pill, taken out of `ExampleShot`. Props: `url?`, `children`, `className`. `ExampleShot`, C5 and C9 use it. `DashboardShowcase` keeps its own frame, unchanged. | via C3, C5, C9 |
| C9 | `ServiceHero.tsx` | new | The right-hand hero column for a service page: `ExampleShot size="lg"` (websites→`site`, shops→`shop`, apps→`portal`, systems→`tracker`) inside C8, with a `.dim` dimension line under it showing `service.timeline`, and a `stamp` "Fixed price". | `/services/[service]` |
| C10 | `StackStrip.tsx` | new, **only if Q1 = yes** | A single row of mono wordmarks on `bg-white` between rules, like the `AudienceTicker` but static. Text only. | Home, below "What we build" |
| C11 | `services/[service]/opengraph-image.tsx` | new (in `app/(marketing)/services/[service]/`) | The same layout as `app/opengraph-image.tsx`, with the service name and code. Reuse its `bricolage()` font loader by moving it to `src/lib/og.ts`. | Shares of the four service pages |
| P1 | `PortfolioCard.tsx` reuse | **only if Q3 = yes** | Up to 3 items from `getPortfolio()` whose `tags` include `service.slug`. The section is hidden when none match. | `/services/[service]` |

Icons: in the systems examples grid on `/services/[service]`, add an `icon` field (a heroicon component name) to each entry in `content/services.ts` `examples`, and render it at 24px in cobalt with `aria-hidden`.

### Per page and section
| Page (file under `app/(marketing)/`) | Section | Visual |
|---|---|---|
| Home `page.tsx` | Hero, Audience ticker, What we build, Portfolio, How we build, Promises band, Dashboard band, Examples | Already visual. No change. |
| Home | After "What we build" | C10 (if Q1 = yes) |
| Home | Optional extras | C1 drawing at the top of each add-on card |
| `/services` `services/page.tsx` | Service rows | Already uses `ServiceSketch`. No change. |
| `/services` | Optional extras | C1 per add-on card |
| `/services` | Pricing | Two columns at `lg`: the three `pricingModel` cards on the left, C4 on the right. C4 sits below the cards on phones. |
| Service detail `services/[service]/page.tsx` | `PageHero` | Two-column hero at `lg`, with the text and buttons left and C9 right. C9 sits below the buttons on phones. `PageHero` in `Section.tsx` gets an optional `aside` prop, so other pages are untouched. |
| Service detail | Systems examples grid | Heroicon per example |
| Service detail | New band before `CallToAction` | P1 (if Q3 = yes) |
| `/how-we-build` | Each stage row | C2 inside the existing right column, above the "Your part" card |
| `/about` | Hero | A large decorative drawing in the right column: a desk on graph paper with a laptop showing `ExampleShot` `site`, a pencil and an "Approved" stamp. Built from C3 and C8, `aria-hidden`. |
| `/about` | Why the dashboard | C6 under the heading. The "what we turn down" card stays. |
| `/care` | Plan cards | C1 per card |
| `/care` | How it works | C5 beside the 4 step cards at `lg`, below them on phones |
| `/contact` | Aside | C7 replaces the `NEXT_STEPS` list, and C4 goes under it at small size |
| `/book` | Aside | C7 replaces the `ON_THE_CALL` list |
| `/work` | Example cards | Already use `ExampleShot`. No change. |
| `/portfolio` | Empty state | Three `ExampleShot` (`site`, `shop`, `tracker`), each with a "Example" stamp, above the existing sentence and link |
| `/portfolio/[slug]` | Images | Already real Cloudinary screenshots. No change. |

### States
All visuals are static except the existing animated ones. P1 is the only visual that depends on data: it renders nothing when the portfolio is empty or the fetch fails, and `getPortfolio()` already returns `[]` on error.

### Words and SEO
- Each mock's `aria-label`: "Example of the written plan you get", "Example of a monthly care report", "Example: a project without and with a dashboard", "Example of a {service} project".
- Page titles, descriptions and `<h1>` stay unchanged. C11 sets `alt` to "KleeLab: {service name}".

## Acceptance criteria
1. Given any page in the table, when it is opened at 375px, 768px and 1280px, then each listed visual is present and `document.documentElement.scrollWidth <= window.innerWidth`.
2. Given the repo, when you run `grep -rnE "#[0-9a-fA-F]{6}" src/components/site/{StageSketch,QuoteMock,CareReportMock,BeforeAfter,StepRail,BrowserFrame,ServiceHero,StackStrip}.tsx`, then there are no matches. Colours come from Tailwind classes or the constants exported by `ServiceSketch.tsx`.
3. Given `package.json`, when the change is done, then `dependencies` and `devDependencies` are unchanged, apart from the owner-approved security upgrade of `next` and `eslint-config-next` to `^16.4.6` (2026-11-18) and the `npm audit fix` lockfile updates that came with it. No new packages are added.
4. Given any new SVG drawing, when the accessibility tree is inspected, then it is `aria-hidden`. Each product mock is exposed as exactly one labelled figure.
5. Given the mocks C4, C5 and C6, when they are read, then each shows the word "example" and contains no `%` sign, no client names and no counts presented as results.
6. Given `/contact` and `/book`, when the source is read, then neither page defines its own numbered `<ol>` for steps. Both use `StepRail`.
7. Given `prefers-reduced-motion: reduce`, when any page loads, then no new visual animates.
8. Given `/services/website-design` is shared, when its `og:image` tag is read and that address is requested (Next 16 puts a hash in it: `/services/website-design/opengraph-image-<hash>`), then it returns a 1200×630 PNG, and another service's image differs.
9. Given Q1 is unanswered or "no", then `StackStrip.tsx` does not exist and the home page is unchanged in that spot.
10. Given Q3 = yes and no portfolio item is tagged for a service, when that service page loads, then no empty portfolio band shows.
11. Given a Lighthouse mobile run on `/`, `/services/website-design` and `/how-we-build`, then Performance and Accessibility are no lower than before the change. Record both numbers in the report.
12. `npm run typecheck`, `npm run lint` and `npm run build` pass in `kleelab-frontend`.

## Risks
- **Mocks read as claims.** Handled by acceptance criterion 5 and the "example" labels. Reviewers check every string in the mocks.
- **Page weight.** Inline SVG adds HTML. Keep each drawing under about 60 elements and render repeated shapes with `.map`. Acceptance criterion 11 guards it.
- **Phone overflow.** Rotated stamps and dimension lines overflow easily. Use `overflow-x-clip` on sections that hold them (acceptance criterion 1).
- **`PageHero` change.** It is shared by every inner page. The new `aside` prop is optional, so pages that do not pass it render as they do now.

## Build order
1. frontend-engineer — C8 `BrowserFrame`, then C1, C3 and the `pen` export. Every later step depends on these.
2. In parallel, each on separate files:
   - frontend-engineer A — C9, `PageHero` `aside` prop, `services/[service]/page.tsx`, icons in `content/services.ts`, C11 with `lib/og.ts` (this touches `app/opengraph-image.tsx`), P1 if approved.
   - frontend-engineer B — C2 with `how-we-build/page.tsx`, C4 with `services/page.tsx`, C7 with `contact/page.tsx` and `book/page.tsx`.
   - frontend-engineer C — C5 with `care/page.tsx`, C6 and the About drawing with `about/page.tsx`, the portfolio empty state, home add-ons, C10 if approved.
   A and C both touch nothing shared after step 1. Only A edits `Section.tsx`.
3. content-strategist — checks every mock string and `aria-label` against acceptance criterion 5 and the no-location rule.
4. test-engineer — acceptance criteria 1, 4, 6, 7 and 8 as Playwright or script checks, and 11 as a recorded Lighthouse run.

Release 1 is steps 1, 2A and the C2/C4 part of 2B. Release 2 is the rest.

## Release notes
No environment variables, migrations or backend changes. If Q3 = yes, staff add the service slug to `tags` on the matching portfolio items in admin.
