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

import { createDocument, documentSchema, DEFAULT_THEME, PRESET_THEMES, type Node } from '@/lib/document';
import { buildPageDocument, sectionSpecs, themeFromPalette, unknownSectionIds } from '@/lib/ai/assemble';
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

// 6. Assembling a page from a brief, which is what the AI flow actually does.
const brief = {
  sections: ['nav.bar', 'hero.split', 'stats.banner', 'contact.form', 'footer.columns'],
  palette: 'warm',
};
const assembled = buildPageDocument(brief.sections, {}, { title: 'Home', palette: brief.palette });

const assembledProblem = documentSchema.safeParse(assembled);
if (!assembledProblem.success) {
  fail(`an assembled page is not a valid document — ${assembledProblem.error.issues[0]?.message}`);
} else {
  pass(`a five-section page assembles into a valid document`);
}

if ((assembled.root.children ?? []).length !== brief.sections.length) {
  fail(
    `assembling dropped a section: expected ${brief.sections.length}, got ${(assembled.root.children ?? []).length}`,
  );
} else {
  pass('every chosen section reaches the page, in order');
}

/** Find the first node of a type, anywhere in the tree. */
function findType(node: Node, type: string): Node | null {
  if (node.type === type) return node;
  for (const child of node.children ?? []) {
    const found = findType(child, type);
    if (found) return found;
  }
  return null;
}

if (!findType(assembled.root, 'image')) {
  fail('the assembled header contains no image slot, so the page cannot look alive');
} else {
  pass('the assembled header carries an image slot');
}

// The palette is what gives a generated site its colour. An unrecognised name must
// fall back rather than produce an unstyled page.
const warm = themeFromPalette('warm');
if (warm.accent !== PRESET_THEMES.find((preset) => preset.name === 'Warm')?.theme.accent) {
  fail('a named palette does not resolve to its preset');
} else {
  pass('a named palette resolves to its preset');
}
if (JSON.stringify(themeFromPalette('chartreuse')) !== JSON.stringify(DEFAULT_THEME)) {
  fail('an unknown palette did not fall back to the neutral default');
} else {
  pass('an unknown palette falls back to neutral rather than breaking');
}

// The model is given names and purposes, not bare ids, because a model choosing
// from ids alone picks the same three safe sections every time.
const specs = sectionSpecs(SECTION_KIT.map((recipe) => recipe.id));
if (specs.length !== SECTION_KIT.length) {
  fail(`sectionSpecs dropped recipes: ${specs.length} of ${SECTION_KIT.length}`);
} else if (!specs.every((spec) => spec.name && spec.description && Object.keys(spec.example).length)) {
  fail('a section spec is missing its name, description or example');
} else {
  pass('every recipe is described to the model with a name, purpose and example');
}

if (unknownSectionIds(['hero.split', 'not.real']).join() !== 'not.real') {
  fail('unknownSectionIds did not report the id the kit cannot build');
} else {
  pass('an id the kit cannot build is reported rather than silently ignored');
}

console.log('');
if (failures > 0) {
  console.error(`${failures} failure${failures === 1 ? '' : 's'}.\n`);
  process.exit(1);
}
console.log('All section kit checks passed.\n');
