/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
/**
 * /dashboard opens the only project straight away, and /verify-email lands on sign-in.
 *
 * Spec: docs/specs/2026-11-18-simplify-backend-dashboard.md, acceptance criteria
 * 13 and 14. The page is rendered on the server side with the data call, the
 * signed-in user and the router replaced, and effects run at once so the
 * redirect can be seen. No sign-in, API or browser is needed.
 *
 * Run with `npm run check:dashboard-redirect`.
 */

// Makes this file a module, so its names stay out of the global scope that tsc shares with src/.
export {};

const Module = require('module');
const realReact = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

let projects: any[] | null = null;
const replaced: string[] = [];
const realLoad = Module._load;
Module._load = function (request: string, parent: unknown, ...rest: unknown[]) {
  const from = String((parent as any)?.filename ?? '').split(String.fromCharCode(92)).join('/');
  if (request === 'react' && from.endsWith('/src/app/dashboard/page.tsx')) {
    // Effects normally wait for a browser; here they run as the page renders.
    return { ...realReact, useEffect: (fn: () => void) => void fn() };
  }
  if (request === 'next/navigation' && from.endsWith('/src/app/dashboard/page.tsx')) {
    return { useRouter: () => ({ replace: (to: string) => void replaced.push(to), push() {} }) };
  }
  let file = '';
  try {
    file = Module._resolveFilename(request, parent).split(String.fromCharCode(92)).join('/');
  } catch {
    /* a package, not one of our files */
  }
  if (file.endsWith('/src/lib/useLiveData.ts')) {
    return { LIVE_INTERVAL_MS: 1, useLiveData: () => ({ data: projects, error: null, stale: false, retry() {}, set() {} }) };
  }
  if (file.endsWith('/src/components/app/AppShell.tsx')) {
    return { useCurrentUser: () => ({ id: 'u1', email: 'c@example.com', full_name: 'Ada Client', role: 'client' }) };
  }
  return realLoad.call(this, request, parent, ...rest);
};

const DashboardPage = require('@/app/dashboard/page').default;

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`PASS  ${label}`);
    return;
  }
  failures += 1;
  console.error(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
}

const summary = (id: string, title: string) => ({
  id, reference: `KL-${id}`, title, status: 'active', target_date: null, current_stage: null, stages_done: 0, stages_total: 3,
  pending_approvals: 0, open_requests: 0, unpaid_invoices: 0, updated_at: '2026-11-01T10:00:00Z', client_email: null,
  client_name: null, owner_id: null, owner_name: null, awaiting_reply: false,
});

function open(list: any[] | null): string {
  projects = list;
  replaced.length = 0;
  return renderToStaticMarkup(realReact.createElement(DashboardPage));
}
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

// --- Criterion 13 -----------------------------------------------------------------------
{
  const html = open([summary('abc', 'Only project')]);
  check('one project: sent to /dashboard/projects/abc', replaced.length === 1 && replaced[0] === '/dashboard/projects/abc', `replace calls: ${JSON.stringify(replaced)}`);
  check('one project: the list is not shown while it redirects', !text(html).includes('Only project'));
  check('one project: it uses replace, so Back does not bounce', replaced.length === 1);

  const odd = open([summary('a b/c', 'Odd id')]);
  check('an id with unsafe characters is encoded in the address', replaced[0] === '/dashboard/projects/a%20b%2Fc', `got ${JSON.stringify(replaced)} ${odd.length}`);

  const two = open([summary('a', 'First project'), summary('b', 'Second project')]);
  check('two projects: no redirect', replaced.length === 0, `replace calls: ${JSON.stringify(replaced)}`);
  check('two projects: both are in the list', text(two).includes('First project') && text(two).includes('Second project'));
  check('two projects: each links to its own page', two.includes('href="/dashboard/projects/a"') && two.includes('href="/dashboard/projects/b"'));

  const none = open([]);
  check('no projects: no redirect, and the empty state shows', replaced.length === 0 && text(none).includes('No projects yet'));

  open(null);
  check('still loading: no redirect', replaced.length === 0);
}

// --- Criterion 14 -----------------------------------------------------------------------
{
  const VerifyEmailPage = require('@/app/verify-email/page').default;
  let digest = '';
  try {
    VerifyEmailPage();
  } catch (err: any) {
    digest = String(err?.digest ?? '');
  }
  check('/verify-email redirects to /login', /^NEXT_REDIRECT;(replace|push);\/login;/.test(digest), `digest was ${JSON.stringify(digest)}`);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll dashboard redirect checks passed.');
