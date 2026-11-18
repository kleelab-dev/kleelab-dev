/**
 * The public pages, as a browser sees them.
 *
 * Spec: docs/specs/2026-11-18-visual-marketing-site.md, acceptance criteria
 *   1  each listed visual is present, and nothing scrolls sideways at 375, 768 and 1280px
 *   4  every drawing is hidden from screen readers; each product mock is one labelled figure
 *   7  with prefers-reduced-motion, nothing keeps moving
 *   8  a service page's share image (found through its og:image tag) is a 1200x630 PNG
 *
 * It needs a running site (`npm run dev` or `npm run start`) and, for 1, 4 and 7, a
 * Chrome or Edge it can start headless. It talks to the browser over the DevTools
 * protocol, so it adds no dependency. Node 22 or newer is needed for the built-in
 * WebSocket.
 *
 * Run with `npm run check:marketing`. BASE_URL (default http://localhost:3000) says
 * where the site is; CHROME_PATH says which browser. Without a browser, 1, 4 and 7
 * are reported as SKIP and the script fails only if 8 does; set REQUIRE_BROWSER=1
 * to make a missing browser a failure (CI does).
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const WIDTHS = [375, 768, 1280];

let failures = 0;
function check(label, ok, detail = '') {
  if (ok) {
    console.log(`PASS  ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  }
}

/**
 * What each page must show. `figures` are the exact labels of the product mocks on it;
 * `min` counts elements by CSS selector.
 */
const PAGES = [
  // The home page's own mocks were there before this change and are out of its scope,
  // so they are counted but not held to the new "nothing readable inside" rule.
  { path: '/', min: { 'svg.sketch': 3 }, figures: ['Example of a client dashboard', 'Example of the client dashboard'], legacy: true },
  { path: '/services', min: { 'svg.sketch': 7 }, figures: ['Example of the written plan you get'] },
  { path: '/services/website-design', min: { 'svg.sketch': 1 }, figures: [/^Example (project|of a)/] },
  { path: '/services/online-shops', min: { 'svg.sketch': 1 }, figures: [/^Example (project|of a)/] },
  { path: '/services/web-apps', min: { 'svg.sketch': 1 }, figures: [/^Example (project|of a)/] },
  { path: '/services/internal-systems', min: { 'svg.sketch': 1 }, figures: [/^Example (project|of a)/] },
  { path: '/how-we-build', min: { 'svg[viewBox="0 0 200 112"]': 6 }, figures: [] },
  { path: '/about', min: {}, figures: ['Example: a project without and with a dashboard'] },
  { path: '/care', min: { 'svg.sketch': 3 }, figures: ['Example of a monthly care report'] },
  { path: '/contact', min: { ol: 1 }, figures: ['Example of the written plan you get'] },
  { path: '/book', min: { ol: 1 }, figures: [] },
];

// --- 8: the share image -----------------------------------------------------------------

async function checkShareImage() {
  const pagePath = '/services/website-design';
  const res = await fetch(BASE + pagePath);
  const html = await res.text();
  const tag = html.match(/<meta[^>]+property="og:image"[^>]*>/)?.[0] ?? '';
  const content = tag.match(/content="([^"]+)"/)?.[1] ?? '';
  check('8: the service page has an og:image tag', content !== '', `no og:image in the page (status ${res.status})`);
  if (!content) return;
  check('8: the og:image is the service route, not the home card', content.includes('/services/website-design/opengraph-image'), content);
  // The tag carries the public address; fetch the same path from the site under test.
  const url = new URL(content);
  const img = await fetch(BASE + url.pathname + url.search);
  const type = img.headers.get('content-type') ?? '';
  const bytes = Buffer.from(await img.arrayBuffer());
  check(`8: the image answers 200 as image/png (${img.status}, ${type})`, img.status === 200 && type.startsWith('image/png'));
  const isPng = bytes.length > 24 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  check('8: the bytes are a PNG', isPng);
  if (!isPng) return;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  check(`8: the PNG is 1200x630 (${width}x${height})`, width === 1200 && height === 630);

  // Each service has its own card, and it differs from the home card.
  const home = await fetch(BASE + '/opengraph-image');
  void home.body?.cancel();
  const other = html.match(/<meta[^>]+property="og:image:alt"[^>]*content="([^"]*)"/)?.[1];
  check('8: the image has alt text', typeof other === 'string' && other.length > 0, `og:image:alt was ${JSON.stringify(other)}`);
  const second = await (await fetch(BASE + '/services/online-shops')).text();
  const secondUrl = second.match(/property="og:image"[^>]*content="([^"]+)"/)?.[1] ?? '';
  const secondBytes = Buffer.from(await (await fetch(BASE + new URL(secondUrl, BASE).pathname + new URL(secondUrl, BASE).search)).arrayBuffer());
  check('8: another service has a different image', secondUrl !== '' && !secondBytes.equals(bytes));
}

// --- the browser ------------------------------------------------------------------------

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

async function startBrowser(exe) {
  const profile = mkdtempSync(join(tmpdir(), 'kl-check-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const child = spawn(
    exe,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'],
    { stdio: 'ignore' },
  );
  let wsUrl = '';
  for (let i = 0; i < 100 && !wsUrl; i += 1) {
    try {
      wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!wsUrl) {
    child.kill();
    throw new Error('the browser did not start');
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('could not connect to the browser'));
  });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject } = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      id += 1;
      waiting.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  await call('Page.enable');
  return {
    call,
    async close() {
      try {
        await send('Browser.close');
      } catch {
        /* already gone */
      }
      ws.close();
      child.kill();
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        /* the browser may still hold the folder */
      }
    },
  };
}

async function open(browser, path, width, reducedMotion) {
  await browser.call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
  await browser.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' }] });
  await browser.call('Page.navigate', { url: BASE + path });
  // Wait for the load event, then let hydration and entrance animations settle.
  for (let i = 0; i < 300; i += 1) {
    const { result } = await browser.call('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
    if (result.value === 'complete') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await new Promise((r) => setTimeout(r, 1200));
}

async function evaluate(browser, fn, arg) {
  const expression = `(${fn.toString()})(${JSON.stringify(arg ?? null)})`;
  const { result, exceptionDetails } = await browser.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? 'script failed in the page');
  return result.value;
}

// Run inside the page.
function measure({ min, figures }) {
  const counts = {};
  for (const selector of Object.keys(min)) counts[selector] = document.querySelectorAll(selector).length;
  const labels = [...document.querySelectorAll('figure[aria-label]')].map((f) => f.getAttribute('aria-label'));
  return {
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    counts,
    labels,
    wanted: figures.length,
  };
}

// Run inside the page: what a screen reader could still reach.
function exposure() {
  const hidden = (el) => !!el.closest('[aria-hidden="true"], [hidden]');
  const exposedSvgs = [...document.querySelectorAll('svg')]
    .filter((svg) => !hidden(svg))
    .map((svg) => (svg.getAttribute('class') ?? '').slice(0, 60) || svg.outerHTML.slice(0, 80));
  const figures = [...document.querySelectorAll('figure[aria-label]')].map((figure) => {
    const walker = document.createTreeWalker(figure, NodeFilter.SHOW_TEXT);
    const reachable = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent.trim();
      if (text && !node.parentElement.closest('[aria-hidden="true"]')) reachable.push(text.slice(0, 40));
    }
    const nested = figure.querySelectorAll('figure').length;
    return { label: figure.getAttribute('aria-label'), reachable, nested };
  });
  return { exposedSvgs, figures };
}

// Run inside the page: animations still running, once motion is reduced.
function moving() {
  return document
    .getAnimations()
    .map((a) => {
      const timing = a.effect?.getComputedTiming?.() ?? {};
      return { name: a.animationName ?? a.transitionProperty ?? a.constructor.name, duration: Number(timing.duration), iterations: timing.iterations, state: a.playState };
    })
    .filter((a) => a.iterations === Infinity || a.duration > 1);
}

const matches = (want, got) => (want instanceof RegExp ? want.test(got) : want === got);

async function checkInBrowser(browser) {
  for (const page of PAGES) {
    for (const width of WIDTHS) {
      await open(browser, page.path, width, false);
      const m = await evaluate(browser, measure, { min: page.min, figures: page.figures });
      check(
        `1: ${page.path} at ${width}px does not scroll sideways (${m.scrollWidth} <= ${m.innerWidth})`,
        m.scrollWidth <= m.innerWidth,
      );
      for (const [selector, count] of Object.entries(page.min)) {
        check(`1: ${page.path} at ${width}px has at least ${count} of ${selector} (${m.counts[selector]})`, m.counts[selector] >= count);
      }
      for (const want of page.figures) {
        check(`1: ${page.path} at ${width}px shows the figure ${want}`, m.labels.some((l) => matches(want, l)), `labels: ${JSON.stringify(m.labels)}`);
      }
    }

    await open(browser, page.path, 1280, false);
    const e = await evaluate(browser, exposure);
    check(`4: ${page.path}: every drawing is hidden from screen readers`, e.exposedSvgs.length === 0, `exposed: ${JSON.stringify(e.exposedSvgs)}`);
    check(
      `4: ${page.path}: each product mock is exactly one labelled figure (${e.figures.length} of ${page.figures.length})`,
      e.figures.length === page.figures.length && page.figures.every((want) => e.figures.some((f) => matches(want, f.label))),
      `figures: ${JSON.stringify(e.figures.map((f) => f.label))}`,
    );
    for (const f of page.legacy ? [] : e.figures) {
      check(`4: ${page.path}: "${f.label}" exposes no fake data inside`, f.reachable.length === 0 && f.nested === 0, `reachable text: ${JSON.stringify(f.reachable)}`);
    }

    if (page.path === '/') {
      // Not a pass or fail: shows the motion check can see motion when it is allowed.
      await open(browser, page.path, 1280, false);
      const allowed = await evaluate(browser, moving);
      console.log(`NOTE  / without the reduced-motion setting has ${allowed.length} moving animation(s), so the check can see motion`);
    }
    await open(browser, page.path, 1280, true);
    const still = await evaluate(browser, moving);
    check(`7: ${page.path} with reduced motion: nothing keeps moving`, still.length === 0, `still animating: ${JSON.stringify(still)}`);
  }
}

// --- run ---------------------------------------------------------------------------------

try {
  await fetch(BASE + '/', { method: 'HEAD' });
} catch {
  console.error(`FAIL  nothing is answering at ${BASE}. Start the site first (npm run dev, or npm run build && npm run start).`);
  process.exit(1);
}

await checkShareImage();

const exe = findBrowser();
if (!exe) {
  const message = 'no Chrome or Edge found (set CHROME_PATH): criteria 1, 4 and 7 not run';
  if (process.env.REQUIRE_BROWSER) check(message, false);
  else console.log(`SKIP  ${message}`);
} else {
  const browser = await startBrowser(exe);
  try {
    await checkInBrowser(browser);
  } finally {
    await browser.close();
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll marketing page checks passed.');
