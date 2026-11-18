/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
/**
 * The client's project page: six panels, in order, and every action still on it.
 *
 * Spec: docs/specs/2026-11-18-simplify-backend-dashboard.md, acceptance criteria
 * 11 and 12. The page is rendered to HTML with the data call replaced by a fixed
 * project, so it needs no sign-in, no API and no browser.
 *
 * What this cannot show is what a click does (approve, tick, send, upload, pay):
 * it proves each control is on the page, in the right panel. Clicking is for the
 * qa-engineer.
 *
 * Run with `npm run check:dashboard`.
 */

// Makes this file a module, so its names stay out of the global scope that tsc shares with src/.
export {};

const Module = require('module');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

let fixture: any = null;
const realLoad = Module._load;
Module._load = function (request: string, parent: unknown, ...rest: unknown[]) {
  let file = '';
  try {
    file = Module._resolveFilename(request, parent).split(String.fromCharCode(92)).join('/');
  } catch {
    /* a package, not one of our files */
  }
  if (file.endsWith('/src/lib/useLiveData.ts')) {
    return { LIVE_INTERVAL_MS: 1, useLiveData: () => ({ data: fixture, error: null, stale: false, retry() {}, set() {} }) };
  }
  return realLoad.call(this, request, parent, ...rest);
};

const { ClientProjectView } = require('@/components/project/ClientProjectView');

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`PASS  ${label}`);
    return;
  }
  failures += 1;
  console.error(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
}

const NOW = '2026-11-01T10:00:00Z';
const SIX = ['Over to you', 'Where we are', 'Messages and updates', 'Files and links', 'Invoices', 'Looking after your site'];

const stage = (id: string, position: number, name: string, status: string) => ({
  id, position, name, status, description: null, due_date: null, completed_at: status === 'done' ? NOW : null,
});
const update = (over: Record<string, unknown>) => ({
  id: 'u', stage_id: null, kind: 'progress', title: 'A title', body: 'A body', link_url: null, link_label: null,
  approval_status: null, approval_note: null, resolved_at: null, created_at: NOW, author_name: 'Team', from_team: true,
  attachments: [], ...over,
});
const invoice = (over: Record<string, unknown>) => ({
  id: 'i1', number: 'INV-1', title: 'Deposit', amount_cents: 10000, currency: 'USD', due_date: null, status: 'unpaid',
  pay_url: 'https://pay.example/1', paid_at: null, created_at: NOW, ...over,
});

/** A quiet project: nothing waiting, nothing paid or owed, nothing handed over. */
function quiet(): any {
  return {
    id: 'p1', reference: 'KL-1', title: 'Example project', summary: null, status: 'active', start_date: null, target_date: null,
    live_url: null, created_at: NOW, updated_at: NOW,
    stages: [stage('s1', 1, 'Planning', 'done'), stage('s2', 2, 'Design', 'in_progress'), stage('s3', 3, 'Build', 'upcoming')],
    updates: [], requests: [], files: [], invoices: [], client_email: null, client_name: null, owner_id: null, owner_name: null,
    lead_id: null, checklist: [{ id: 'c0', position: 1, title: 'Logo', description: null, done_at: NOW, note: null, done_by_name: 'C' }],
    handover: null, care_plan: null,
  };
}

/** Everything at once: the project the spec describes for criterion 11. */
function busy(): any {
  const p = quiet();
  p.stages[1].status = 'waiting_on_client';
  p.updates = [
    update({ id: 'u1', stage_id: 's2', kind: 'approval', title: 'Approve the design', approval_status: 'pending' }),
    update({ id: 'u2', title: 'Preview is up', link_url: 'https://preview.example/p', link_label: 'Open preview' }),
  ];
  p.files = [{ id: 'f1', filename: 'logo.png', content_type: 'image/png', size: 10, created_at: NOW, update_id: null, uploaded_by_name: 'C', from_team: false }];
  p.invoices = [invoice({})];
  p.checklist = [{ id: 'c1', position: 1, title: 'Send the logo', description: null, done_at: null, note: null, done_by_name: null }];
  p.handover = { notes: 'Notes', items: [], published_at: NOW, updated_at: NOW };
  p.care_plan = {
    id: 'cp', name: 'Care plan', includes: null, amount_cents: 100, currency: 'USD', interval: 'month', minutes_included: null,
    status: 'active', started_on: '2026-11-01', next_bill_on: '2026-12-01', period_start: null, minutes_used: null,
  };
  return p;
}

function render(project: unknown): string {
  fixture = project;
  return renderToStaticMarkup(React.createElement(ClientProjectView, { projectId: 'p1' }));
}
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const h2s = (html: string) => [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => text(m[1]).trim());
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => text(m[1]).trim());
const has = (html: string, re: RegExp) => re.test(html);

// --- Criterion 11: everything there is -------------------------------------------------
{
  const html = render(busy());
  const titles = h2s(html);
  check('busy project: exactly the six panels, in order', JSON.stringify(titles) === JSON.stringify(SIX), `got ${JSON.stringify(titles)}`);
  check('busy project: no "Everything is in" panel', !/Everything is in/i.test(text(html)));
  check('busy project: no second "Previews and links" list', !/Previews and links/.test(html));
  check('busy project: no separate "Happening now" or "Getting started" panel', !/Happening now|Getting started/.test(text(html)));

  // Where each action lives: the markup cut up by panel heading.
  const at = (title: string) => html.indexOf(`>${title}</h2>`);
  const slice = (from: string, to?: string) => html.slice(at(from), to ? at(to) : undefined);
  const over = html.slice(0, at('Where we are'));
  const btn = buttons(over);
  check('Over to you: Approve is here', btn.includes('Approve'));
  check('Over to you: Ask for changes is here', btn.includes('Ask for changes'));
  check('Over to you: the checklist item can be ticked here', has(over, /role="checkbox"[^>]*aria-label="Mark “Send the logo” as done"/));
  check('Over to you: Tick with a note is here', btn.includes('Tick with a note'));
  check('Over to you: points to the unpaid invoice', has(over, /href="#invoices"/));

  const msgs = slice('Messages and updates', 'Files and links');
  check('Messages: a message box and Send message', has(msgs, /<textarea id="message-p1"/) && buttons(msgs).includes('Send message'));
  check('Messages: files can be attached to a message', has(msgs, /id="attach-p1"/));

  const files = slice('Files and links', 'Invoices');
  check(
    'Files and links: the file with its download and remove buttons',
    has(files, /logo\.png/) && has(files, /aria-label="Download logo\.png"/) && has(files, /aria-label="Remove logo\.png"/),
  );
  check('Files and links: a file can be added', has(files, /id="file-p1"/) && buttons(files).includes('Add a file'));
  check('Files and links: the preview link is in the same panel', has(files, /href="https:\/\/preview\.example\/p"/));
  check(
    'Files and links: links come before files',
    files.indexOf('preview.example') > -1 && files.indexOf('preview.example') < files.indexOf('logo.png'),
  );

  const inv = slice('Invoices', 'Looking after your site');
  check(
    'Invoices: the invoice and a Pay now link to the payment page',
    has(inv, /INV-1/) && has(inv, /href="https:\/\/pay\.example\/1"/) && /Pay now/.test(text(inv)),
  );
  check('Invoices: the panel can be jumped to (#invoices)', has(html, /id="invoices"/));

  const after = slice('Looking after your site');
  check('After launch: hand-over pack', /Your hand-over pack/.test(text(after)));
  check('After launch: care plan', /Your care plan/.test(text(after)));
  check(
    'After launch: the request form is open, with all four kinds and Send',
    ['Help going live', 'Hosting', 'Monthly care', 'A change'].every((k) => text(after).includes(k)) &&
      has(after, /id="request-message"/) &&
      buttons(after).includes('Send'),
  );
  check('After launch: it is the last panel', titles[titles.length - 1] === 'Looking after your site');
}

// --- Criterion 12: nothing to show ---------------------------------------------------
{
  const html = render(quiet());
  const titles = h2s(html);
  check('quiet project: Over to you and Invoices are hidden', !titles.includes('Over to you') && !titles.includes('Invoices'), `got ${JSON.stringify(titles)}`);
  check(
    'quiet project: the four other panels, in order',
    JSON.stringify(titles) === JSON.stringify(['Where we are', 'Messages and updates', 'Files and links', 'Looking after your site']),
    `got ${JSON.stringify(titles)}`,
  );
  check('quiet project: nothing reads "Everything is in"', !/Everything is in/i.test(text(html)));
  check('quiet project: the empty files text', /No files or links yet\. Add one, or we will share previews here\./.test(text(html)));
  check('quiet project: the request form waits behind "Need hosting or care?"', buttons(html).includes('Need hosting or care?') && !has(html, /id="request-message"/));
  check('quiet project: that button says it is collapsed', has(html, /aria-expanded="false"[^>]*>\s*Need hosting or care\?/));
  check('quiet project: a message can still be sent', has(html, /id="message-p1"/));
  check('quiet project: a file can still be added', has(html, /id="file-p1"/));
  check('quiet project: no hand-over or care plan headings', !/Your hand-over pack|Your care plan/.test(text(html)));
}

// --- Edges ------------------------------------------------------------------------------
{
  const waiting = quiet();
  waiting.invoices = [invoice({})];
  const t1 = h2s(render(waiting));
  check('only an unpaid invoice: Over to you appears, and so does Invoices', t1.includes('Over to you') && t1.includes('Invoices'), `got ${JSON.stringify(t1)}`);

  const paid = quiet();
  paid.invoices = [invoice({ status: 'paid', paid_at: NOW })];
  const t2 = h2s(render(paid));
  check('only a paid invoice: Invoices shows, Over to you does not', t2.includes('Invoices') && !t2.includes('Over to you'), `got ${JSON.stringify(t2)}`);

  const cancelled = quiet();
  cancelled.invoices = [invoice({ status: 'cancelled' })];
  check('only a cancelled invoice: Invoices is hidden', !h2s(render(cancelled)).includes('Invoices'));

  const owed = quiet();
  owed.balance_due_cents = 50000;
  owed.balance_currency = 'USD';
  check('a balance still to be billed: Invoices shows', h2s(render(owed)).includes('Invoices'));

  const todo = quiet();
  todo.checklist = [{ id: 'c1', position: 1, title: 'Send the logo', description: null, done_at: null, note: null, done_by_name: null }];
  const t3 = h2s(render(todo));
  check('an outstanding checklist item brings Over to you back', t3[0] === 'Over to you', `got ${JSON.stringify(t3)}`);

  const finished = render(quiet());
  check('a finished checklist is not a panel and hides Over to you', !h2s(finished).includes('Over to you') && !/Everything is in/i.test(text(finished)));

  const careOnly = quiet();
  careOnly.care_plan = busy().care_plan;
  const h = render(careOnly);
  check('a care plan without a hand-over still opens the request form', /Your care plan/.test(text(h)) && has(h, /id="request-message"/));

  const asked = quiet();
  asked.requests = [{ id: 'r1', kind: 'hosting', message: 'Please host it', status: 'open', created_at: NOW }];
  const ha = render(asked);
  check('an existing request is listed in the last panel', /Please host it/.test(text(ha.slice(ha.indexOf('>Looking after your site</h2>')))));
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll project panel checks passed.');
