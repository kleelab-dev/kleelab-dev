'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowPathIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { KleeLabLogo } from '@/components/marketing/KleeLabLogo';
import { PlanLimitHint } from '@/components/dashboard/PlanLimitHint';
import { buildPageDocument, contentById, sectionSpecs } from '@/lib/ai/assemble';
import { loginHref } from '@/lib/auth';
import { createDocument } from '@/lib/document';
import { SECTION_KIT, getRecipe } from '@/lib/sections/kit';
import { createSiteWithUniqueSubdomain } from '@/lib/sites';
import { apiService, clearToken, hasSession, ApiError } from '@/services/api';
import type { KleeLabDocument } from '@/lib/document';
import type { AiBrief, AiDesign, AiStatus } from '@/types/api';

/**
 * Starting a site.
 *
 * Describe the business; the model decides which of our designed sections each
 * page needs and writes the copy; we assemble it into a real document and open
 * the builder. From that point it is an ordinary site, and every later change is
 * made the same way — by describing it — rather than by rearranging blocks.
 *
 * The two-call flow exists so the brief can be *shown and corrected* before the
 * expensive half runs. That is the cheapest possible place to fix a
 * misunderstanding, and it is why there is a review step rather than a spinner.
 */

const EXAMPLES = [
  'A coffee roastery in Leeds with a subscription and an online shop',
  'A freelance illustrator’s portfolio, calm and image-led',
  'A family plumbing business that takes bookings by phone',
];

type Capability = 'checking' | 'ready' | 'not_configured' | 'exhausted' | 'unreachable';
type Stage = 'idle' | 'briefing' | 'review' | 'writing';

const STORE_KEY = 'kleelab_ai_prompt';

export function AiStart() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [capability, setCapability] = useState<Capability>('checking');
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [prompt, setPrompt] = useState('');
  const [siteName, setSiteName] = useState('');
  const [brief, setBrief] = useState<AiBrief | null>(null);
  const [design, setDesign] = useState<AiDesign | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [startingBlank, setStartingBlank] = useState(false);

  // localStorage does not exist on the server, so the session can only be read
  // after mount. Deciding during render would mismatch hydration.
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      const present = hasSession();
      setSignedIn(present);
      // A prompt typed before signing in is restored, because losing a paragraph
      // at the moment of commitment is how a signup wall turns into an exit.
      const saved = window.sessionStorage.getItem(STORE_KEY);
      if (saved) setPrompt(saved);
      if (present) {
        apiService
          .getAiStatus()
          .then((value) => {
            if (!active) return;
            setStatus(value);
            setCapability(
              value.available ? 'ready' : value.reason === 'quota_exhausted' ? 'exhausted' : 'not_configured',
            );
          })
          .catch((reason: unknown) => {
            if (!active) return;
            // An expired session is not an outage. Saying "we could not reach the
            // AI builder" for a signed-out user would be both wrong and
            // misleading — the fix is to sign in, not to retry.
            if (reason instanceof ApiError && reason.status === 401) {
              setSignedIn(false);
              setCapability('ready');
              return;
            }
            setCapability('unreachable');
          });
      } else {
        setCapability('ready');
      }
    });
    return () => {
      active = false;
    };
  }, []);

  function requireSignIn(): boolean {
    if (signedIn) return false;
    window.sessionStorage.setItem(STORE_KEY, prompt);
    router.push(loginHref('/builder/new'));
    return true;
  }

  async function askForBrief() {
    if (!prompt.trim() || prompt.trim().length < 10) {
      setError(new Error('Tell us a little more — a sentence or two about the business.'));
      return;
    }
    if (requireSignIn()) return;

    setStage('briefing');
    setError(null);
    try {
      const { brief: value, design: chosen } = await apiService.createBrief({
        prompt: prompt.trim(),
        site_name: siteName.trim() || null,
        // The kit, not the server, decides what can be built — and it sends the
        // name and purpose of each section, because a model choosing from bare
        // ids picks the same three safe ones every time.
        sections: sectionSpecs(SECTION_KIT.map((recipe) => recipe.id)),
      });
      setBrief(value);
      // Kept alongside the brief rather than inside it: the brief is the model's
      // understanding of the business, and this is the library's answer about how
      // it should look. They come from different places and neither overrides the
      // other.
      setDesign(chosen ?? null);
      setSiteName(value.business_name);
      setStage('review');
    } catch (reason) {
      setError(reason);
      setStage('idle');
    }
  }

  async function build() {
    if (!brief) return;
    setStage('writing');
    setError(null);

    try {
      // Content is gathered for every page *before* anything is written to the
      // database, so a failure halfway through cannot leave a half-built site
      // behind for the customer to clean up.
      const prepared: { page: AiBrief['pages'][number]; document: KleeLabDocument }[] = [];

      for (let index = 0; index < brief.pages.length; index += 1) {
        const page = brief.pages[index];
        setProgress(
          brief.pages.length > 1
            ? `Writing ${page.title} — ${index + 1} of ${brief.pages.length}…`
            : `Writing ${page.title}…`,
        );

        let content: Record<string, unknown> = {};
        try {
          const response = await apiService.createContent({
            brief,
            page_title: page.title,
            sections: sectionSpecs(page.sections),
          });
          content = contentById(response.sections);
        } catch (reason) {
          // An empty first page means there is nothing worth saving, so the
          // failure is surfaced. A later page failing still leaves a usable site,
          // and the recipes fill their own placeholders.
          if (prepared.length === 0) throw reason;
        }

        prepared.push({
          page,
          document: buildPageDocument(page.sections, content, {
            title: page.title,
            // The design wins when the library offered one. The palette is the
            // fallback for a trade the library does not recognise, so a customer
            // is never left with the neutral default for want of a product type.
            design,
            palette: brief.palette,
          }),
        });
      }

      setProgress('Saving your site…');
      const site = await createSiteWithUniqueSubdomain(siteName.trim() || brief.business_name);

      // Slugs come from the model, so they can repeat. Two pages sharing a slug
      // would both be reachable at the same address and the published route would
      // serve whichever it found first.
      const usedSlugs = new Set<string>();

      for (const item of prepared) {
        const requested = item.page.slug;
        let slug = requested;
        let suffix = 2;
        while (usedSlugs.has(slug)) {
          slug = requested === '/' ? `/${suffix}` : `${requested}-${suffix}`;
          suffix += 1;
        }
        usedSlugs.add(slug);

        await apiService.createPage(site.id, {
          title: item.page.title,
          slug,
          content_json: { document: item.document },
          meta_title: `${item.page.title} · ${brief.business_name}`,
          meta_description: item.page.purpose || brief.summary,
        });
      }

      window.sessionStorage.removeItem(STORE_KEY);
      router.replace(`/builder/${site.id}/edit`);
    } catch (reason) {
      setError(reason);
      setStage('review');
    }
  }
/**
   * An empty page, for someone who would rather not describe anything.
   *
   * This replaces the template catalogue. A template only ever gave a starting
   * arrangement of the same sections, and the section picker in the editor does
   * that better and without a second gallery to maintain.
   */
  async function startBlank() {
    if (requireSignIn()) return;
    setStartingBlank(true);
    setError(null);
    try {
      const site = await createSiteWithUniqueSubdomain(siteName.trim() || 'My site');
      await apiService.createPage(site.id, {
        title: 'Home',
        slug: '/',
        content_json: { document: createDocument('Home') },
      });
      window.sessionStorage.removeItem(STORE_KEY);
      router.replace(`/builder/${site.id}/edit`);
    } catch (reason) {
      setError(reason);
      setStartingBlank(false);
    }
  }

  const busy = stage === 'briefing' || stage === 'writing' || startingBlank;
  const canBuild = capability === 'ready';

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-content items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="text-ink no-underline" aria-label="KleeLab home">
            <KleeLabLogo className="h-7 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/builder/dashboard" className="text-sm text-muted hover:text-ink">
              Your sites
            </Link>
            {signedIn && (
              <button
                type="button"
                onClick={() => {
                  void apiService.logout();
                  clearToken();
                  setSignedIn(false);
                }}
                className="rounded-full border border-line-strong px-3.5 py-1.5 text-xs font-medium hover:border-ink"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-content px-6 py-12">
        {stage === 'review' && brief ? (
          <BriefReview
            brief={brief}
            design={design}
            siteName={siteName}
            busy={busy}
            progress={progress}
            error={error}
            onNameChange={setSiteName}
            onBack={() => {
              setBrief(null);
              setStage('idle');
            }}
            onConfirm={() => void build()}
          />
        ) : (
          <>
            <p className="font-mono text-[10px] uppercase tracking-label text-muted">
              New site
            </p>
            <h1 className="mt-3 max-w-3xl font-serif text-4xl leading-tight sm:text-5xl">
              Describe your business. We’ll build the site.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
              A sentence or two is enough. We choose the sections each page needs, write the
              words, and open it in the editor — where you can change anything, or just say what
              to fix next.
            </p>

            <div className="mt-9 max-w-3xl">
              <section aria-labelledby="describe-heading">
                <h2 id="describe-heading" className="sr-only">
                  Describe your site
                </h2>

                <label htmlFor="ai-prompt" className="mb-2 block text-xs font-bold">
                  What is the business?
                </label>
                <textarea
                  id="ai-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={6}
                  maxLength={2000}
                  disabled={busy}
                  placeholder="A bakery in Bristol that sells sourdough and runs weekend classes. We want to sell online eventually and take class bookings."
                  className="w-full resize-y rounded-xl border border-line-strong bg-paper px-4 py-3 text-sm leading-6 outline-none transition-colors focus:border-ink disabled:opacity-60"
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      disabled={busy}
                      onClick={() => setPrompt(example)}
                      className="rounded-full border border-line bg-paper px-3 py-1.5 text-xs text-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
                    >
                      {example}
                    </button>
                  ))}
                </div>

                <div className="mt-5">
                  <label htmlFor="ai-site-name" className="mb-2 block text-xs font-bold">
                    Business name <span className="font-normal text-muted">(optional)</span>
                  </label>
                  <input
                    id="ai-site-name"
                    value={siteName}
                    onChange={(event) => setSiteName(event.target.value)}
                    disabled={busy}
                    placeholder="We’ll take it from your description if you leave this blank"
                    className="w-full rounded-xl border border-line-strong bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink disabled:opacity-60"
                  />
                </div>

                {!canBuild && capability !== 'checking' && (
                  <CapabilityNotice capability={capability} status={status} />
                )}

                {error != null && stage === 'idle' && (
                  <p
                    role="alert"
                    className="mt-4 flex items-start gap-2 rounded-lg border border-danger-line bg-danger-surface px-3 py-2.5 text-sm"
                  >
                    <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>
                      {error instanceof Error ? error.message : 'Something went wrong.'}
                      <PlanLimitHint error={error} />
                    </span>
                  </p>
                )}

                <div className="mt-6 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => void askForBrief()}
                    disabled={busy || capability === 'checking' || !canBuild}
                    aria-busy={busy}
                    title={canBuild ? undefined : 'The AI builder is not switched on'}
                    className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper disabled:opacity-50"
                  >
                    {stage === 'briefing' ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden />
                        Reading your description…
                      </>
                    ) : (
                      <>
                        <SparklesIcon className="h-4 w-4" aria-hidden />
                        {!canBuild ? 'AI builder is off' : signedIn ? 'Build my site' : 'Sign in and build'}
                        {canBuild && <ArrowRightIcon className="h-4 w-4" aria-hidden />}
                      </>
                    )}
                  </button>

                  {/*
                    When the AI cannot run, this becomes the primary action rather
                    than a footnote. A button that looks live and answers with a 503
                    is how "nothing happened" turns into a support question — which
                    is exactly what happened here.
                  */}
                  <button
                    type="button"
                    onClick={() => void startBlank()}
                    disabled={busy}
                    className={
                      canBuild
                        ? 'text-sm text-muted underline underline-offset-2 transition-colors hover:text-ink disabled:opacity-50'
                        : 'inline-flex items-center gap-2 rounded-full border border-line-strong px-6 py-3 text-sm font-medium transition-colors hover:border-ink disabled:opacity-50'
                    }
                  >
                    {startingBlank
                      ? 'Creating…'
                      : canBuild
                        ? 'Or start with an empty page'
                        : 'Start with an empty page'}
                  </button>
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function CapabilityNotice({
  capability,
  status,
}: {
  capability: Capability;
  status: AiStatus | null;
}) {
  const message =
    capability === 'not_configured'
      ? 'The AI builder is not switched on yet. You can start with an empty page and build from the section library — or tell us about the site and we will build it for you.'
      : capability === 'exhausted'
        ? `You have used all ${status?.builds_per_month ?? 0} AI builds this month. They reset on the 1st, and everything else still works.`
        : capability === 'unreachable'
          ? 'We could not reach the AI builder just now. Starting with an empty page still works.'
          : '';

  return (
    <p className="mt-4 rounded-lg border border-line-strong bg-paper px-3 py-2.5 text-sm leading-6 text-muted">
      {message}
      {capability === 'exhausted' && (
        <>
          {' '}
          <Link href="/builder/upgrade" className="font-medium text-ink underline underline-offset-2">
            See what a bigger plan includes
          </Link>
          .
        </>
      )}
    </p>
  );
}

function BriefReview({
  brief,
  design,
  siteName,
  busy,
  progress,
  error,
  onNameChange,
  onBack,
  onConfirm,
}: {
  brief: AiBrief;
  design: AiDesign | null;
  siteName: string;
  busy: boolean;
  progress: string;
  error: unknown;
  onNameChange: (value: string) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const sectionCount = brief.pages.reduce((total, page) => total + page.sections.length, 0);

  return (
    <section aria-labelledby="review-heading">
      <p className="font-mono text-[10px] uppercase tracking-label text-muted">
        Step 2 of 2 · check we understood
      </p>
      <h1 id="review-heading" className="mt-3 font-serif text-4xl leading-tight">
        Here’s what we’ll build.
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
        Fix anything that is wrong now — it is much cheaper than fixing it later. Changing the
        name or the wording below changes nothing about the design.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-6">
          <div className="rounded-xl border border-line bg-paper p-5">
            <label htmlFor="review-name" className="mb-2 block text-xs font-bold">
              Business name
            </label>
            <input
              id="review-name"
              value={siteName}
              onChange={(event) => onNameChange(event.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-line-strong bg-white px-4 py-2.5 text-sm outline-none focus:border-ink disabled:opacity-60"
            />
            <dl className="mt-4 divide-y divide-line border-t border-line text-sm">
              <div className="flex gap-4 py-2.5">
                <dt className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-label text-muted">
                  Tagline
                </dt>
                <dd className="text-ink">{brief.tagline || '—'}</dd>
              </div>
              <div className="flex gap-4 py-2.5">
                <dt className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-label text-muted">
                  Audience
                </dt>
                <dd className="text-ink">{brief.audience || '—'}</dd>
              </div>
              <div className="flex gap-4 py-2.5">
                <dt className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-label text-muted">
                  Tone
                </dt>
                <dd className="text-ink">{brief.tone || '—'}</dd>
              </div>
              <div className="flex gap-4 py-2.5">
                <dt className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-label text-muted">
                  Design
                </dt>
                <dd className="text-ink">
                  {design ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {/* The colours as swatches, because a palette's name means
                          nothing and its colours mean everything. */}
                      <span aria-hidden="true" className="inline-flex overflow-hidden rounded-full border border-line">
                        {(['paper', 'ink', 'accent', 'onAccent'] as const).map((slot) =>
                          design.colours[slot] ? (
                            <span
                              key={slot}
                              className="h-4 w-4"
                              style={{ backgroundColor: design.colours[slot] }}
                            />
                          ) : null,
                        )}
                      </span>
                      <span>
                        {design.style_name || design.product_type}
                        {design.pairing ? ` · ${design.pairing}` : ''}
                      </span>
                    </span>
                  ) : (
                    // Said plainly rather than left blank: the customer is about to
                    // get a plainly-styled site and should know why.
                    <span className="text-muted capitalize">
                      {brief.palette} — we could not place this trade closely enough to give it a
                      designed look yet
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-line bg-paper p-5">
            <h2 className="text-xs font-bold uppercase tracking-label text-muted">
              {brief.pages.length} {brief.pages.length === 1 ? 'page' : 'pages'} · {sectionCount}{' '}
              sections
            </h2>
            <ul className="mt-4 space-y-4">
              {brief.pages.map((page) => (
                <li key={page.slug} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
                  <p className="font-serif text-xl">
                    {page.title}
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-label text-muted">
                      {page.slug}
                    </span>
                  </p>
                  {page.purpose && (
                    <p className="mt-1 text-sm leading-6 text-muted">{page.purpose}</p>
                  )}
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {page.sections.map((id) => (
                      <li
                        key={`${page.slug}-${id}`}
                        className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted"
                      >
                        {getRecipe(id)?.name ?? id}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          {busy ? (
            <div
              className="rounded-xl border border-line bg-paper p-5"
              role="status"
              aria-live="polite"
            >
              <p className="flex items-center gap-2 text-sm">
                <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden />
                {progress || 'Writing your site…'}
              </p>
              <ul className="mt-4 space-y-2 text-xs text-muted">
                <li className="flex items-center gap-2">
                  <CheckCircleIcon className="h-4 w-4" aria-hidden /> Chose the sections
                </li>
                <li className="flex items-center gap-2">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden /> Writing the copy
                </li>
                <li className="flex items-center gap-2 opacity-50">
                  <span className="h-4 w-4 rounded-full border border-line" aria-hidden /> Saving
                  your site
                </li>
              </ul>
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-paper p-5">
              <p className="text-sm leading-6 text-muted">
                This takes about half a minute. You will land in the editor with everything
                editable — nothing is published until you say so.
              </p>
            </div>
          )}

          {error != null && !busy && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-danger-line bg-danger-surface px-3 py-2.5 text-sm"
            >
              <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {error instanceof Error ? error.message : 'Something went wrong.'}
                <PlanLimitHint error={error} />
              </span>
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper disabled:opacity-60"
            >
              <SparklesIcon className="h-4 w-4" aria-hidden />
              {busy ? 'Building…' : 'Write it and build'}
            </button>
            <button
              type="button"
              onClick={onBack}
              disabled={busy}
              className="rounded-full border border-line-strong px-5 py-3 text-sm font-medium hover:border-ink disabled:opacity-50"
            >
              Describe it differently
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
