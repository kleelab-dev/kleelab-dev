/**
 * The public site's new visuals, read from the source.
 *
 * Spec: docs/specs/2026-11-18-visual-marketing-site.md, acceptance criteria
 *   2  the new components use no hex colours
 *   6  /contact and /book keep no numbered list of their own and use StepRail
 *   7  the new visuals add no animation of their own (the reduced-motion rule in
 *      globals.css covers the ones that exist)
 *   9  no "Built with" strip, so StackStrip does not exist and the home page does not use it
 *
 * Needs no server and no browser, so CI runs it on every push.
 * Run with `npm run check:marketing-source`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`PASS  ${label}`);
    return;
  }
  failures += 1;
  console.error(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
}

const NEW_COMPONENTS = ['StageSketch', 'QuoteMock', 'CareReportMock', 'BeforeAfter', 'StepRail', 'BrowserFrame', 'ServiceHero'];

// 2: no hex colours.
for (const name of NEW_COMPONENTS) {
  const rel = `src/components/site/${name}.tsx`;
  check(`${rel} exists`, existsSync(join(ROOT, rel)));
  if (!existsSync(join(ROOT, rel))) continue;
  const hits = [...read(rel).matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0]);
  check(`2: ${name} has no hex colours`, hits.length === 0, `found ${hits.join(', ')}`);
}

// 6: both pages use StepRail and neither writes its own <ol>.
for (const page of ['contact', 'book']) {
  const rel = `src/app/(marketing)/${page}/page.tsx`;
  const src = read(rel);
  check(`6: /${page} imports StepRail`, /from '@\/components\/site\/StepRail'/.test(src));
  check(`6: /${page} renders <StepRail`, /<StepRail\b/.test(src));
  check(`6: /${page} has no <ol of its own`, !/<ol\b/.test(src));
}

// 7: no new animation of their own in the new components (the spec allows Reveal, .kl-stamp-in and useScrollProgress; the browser check proves they stop), and the reduced-motion rule is still there.
const MOTION = /animate-|animation|@keyframes|transition-/;
for (const name of NEW_COMPONENTS) {
  const rel = `src/components/site/${name}.tsx`;
  if (!existsSync(join(ROOT, rel))) continue;
  const hit = read(rel).match(MOTION)?.[0];
  check(`7: ${name} adds no motion of its own`, !hit, `uses ${hit}`);
}
const css = read('src/app/globals.css');
check(
  '7: globals.css still stops animations and transitions under prefers-reduced-motion',
  /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 0\.01ms !important[\s\S]*transition-duration: 0\.01ms !important/.test(css),
);

// 9: the owner did not answer the stack-strip question, so there is none.
check('9: StackStrip.tsx does not exist', !existsSync(join(ROOT, 'src/components/site/StackStrip.tsx')));
check('9: the home page does not use StackStrip', !/StackStrip/.test(read('src/app/(marketing)/page.tsx')));

// No raster images or public/ folder (Design, "Rules for every visual").
check('no public/ folder was created', !existsSync(join(ROOT, 'public')));

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll marketing source checks passed.');
