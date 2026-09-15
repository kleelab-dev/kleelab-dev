/**
 * Recipe validity sweep.
 *
 * The Section Kit is the part of the AI builder that decides whether a generated
 * site looks professional, and it is also the part a language model can hand
 * arbitrary rubbish to. So it gets checked two ways:
 *
 *   1. Every recipe, built from nothing, produces a node that the canonical
 *      document schema accepts and that actually renders something. A recipe
 *      that builds an empty band would ship as a blank gap on a customer's page.
 *   2. Every recipe survives garbage input — `null`, the wrong types, a field
 *      that is an array where a string belongs — by falling back to its own
 *      defaults. A model response can therefore produce a plain section but
 *      never a broken one.
 *
 * Run with `npm run check:sections`. It needs no network, no database and no
 * browser, which is why it is the first thing to run after touching the kit.
 */

import { createDocument, documentSchema, type Node } from '@/lib/document';
import { buildSection, recipeDefaults, SECTION_KIT } from '@/lib/sections/kit';

let failures = 0;

function fail(message: string): void {
  failures += 1;
  console.error(`FAIL  ${message}`);
}

function pass(message: string): void {
  console.log(`PASS  ${message}`);
}

/** Put a node somewhere it would really live and validate the whole document. */
function validateInPage(node: Node): string | null {
  const document = createDocument('Sweep');
  document.root.children = [node];
  const parsed = documentSchema.safeParse(document);
  if (parsed.success) return null;
  return parsed.error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
}

/** A section that renders nothing at all is a blank gap on a live page. */
function rendersSomething(node: Node): boolean {
  if ((node.children ?? []).length > 0) return true;
  return Object.keys(node.props).length > 0;
}

const GARBAGE: unknown[] = [
  undefined,
  null,
  {},
  'not an object at all',
  [1, 2, 3],
  { unrelated: true },
  { heading: 12345 },
  { items: 'should be an array' },
  { items: [{ name: null, price: [] as unknown as string }] },
];

console.log(`\nSection kit: ${SECTION_KIT.length} recipes\n`);

// 1. Every recipe builds from no content, and the result is a valid page.
for (const recipe of SECTION_KIT) {
  const node = buildSection(recipe.id);
  if (!node) {
    fail(`${recipe.id}: build returned null`);
    continue;
  }
  if (!rendersSomething(node)) {
    fail(`${recipe.id}: builds an empty node — it would render as a blank gap`);
    continue;
  }
  const problem = validateInPage(node);
  if (problem) {
    fail(`${recipe.id}: invalid document — ${problem}`);
    continue;
  }
  pass(`${recipe.id.padEnd(24)} builds a valid section`);
}

// 2. The content schema's own defaults are complete, since they are the safety net.
for (const recipe of SECTION_KIT) {
  const defaults = recipeDefaults(recipe);
  if (Object.keys(defaults).length === 0) {
    fail(`${recipe.id}: content schema exposes no fields`);
  }
}

// 3. Garbage from a model degrades to defaults rather than breaking the build.
for (const recipe of SECTION_KIT) {
  for (const value of GARBAGE) {
    const node = buildSection(recipe.id, value);
    if (!node) {
      fail(`${recipe.id}: build returned null for ${JSON.stringify(value)}`);
      break;
    }
    if (!rendersSomething(node)) {
      fail(`${recipe.id}: empty node for ${JSON.stringify(value)}`);
      break;
    }
    const problem = validateInPage(node);
    if (problem) {
      fail(`${recipe.id}: invalid document for ${JSON.stringify(value)} — ${problem}`);
      break;
    }
  }
}
pass(`every recipe survives ${GARBAGE.length} kinds of malformed content`);

// 4. Real content is used, not silently replaced by the defaults.
const overridden = buildSection('hero.centered', {
  heading: 'A specific heading',
  body: 'A specific body.',
  ctaLabel: 'A specific button',
  ctaHref: '/somewhere',
});
const heading = overridden?.children?.[0]?.children?.[0];
if (heading?.props.text !== 'A specific heading') {
  fail(`supplied content was ignored: heading node is ${JSON.stringify(heading?.props)}`);
} else {
  pass('supplied content reaches the built nodes');
}

// 5. An unknown id is a caller bug and must be visible, not silently invented.
if (buildSection('does.not.exist') !== null) {
  fail('an unknown recipe id returned a node instead of null');
} else {
  pass('an unknown recipe id returns null');
}

console.log('');
if (failures > 0) {
  console.error(`${failures} failure${failures === 1 ? '' : 's'}.\n`);
  process.exit(1);
}
console.log('All section kit checks passed.\n');
