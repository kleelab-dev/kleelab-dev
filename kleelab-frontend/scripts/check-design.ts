/**
 * The design system.
 *
 * The claim this file exists to test is narrow and load-bearing: **one document,
 * two design systems, two different-looking sites.** Until this change the only
 * thing that could differ between two generated sites was eight colour values —
 * every size, space, corner and shadow was a fixed Tailwind class, so `size: 'xl'`
 * was literally the string `text-xl` and no design system could exist.
 *
 * Three things are checked, in order of how badly they would hurt:
 *
 *   1. **No dangling token.** Every `var(--kl-…)` any recipe can produce must
 *      exist in the resolved design. A missing one renders as nothing at all —
 *      no error, just a section that has quietly lost its spacing or its size.
 *      This walks all 19 recipes rather than trusting that the scales and the
 *      tokens were kept in step by hand.
 *   2. **The old look is preserved.** The defaults must reproduce the classes they
 *      replaced, or every document already stored would visibly move.
 *   3. **A design system actually reaches the page.** The same node under two
 *      designs must resolve to different values, and responsive overrides must
 *      come out as media queries rather than as prefixed classes that cannot
 *      address a custom property.
 *
 * Run with `npm run check:design`. No network, no database, no browser.
 */

import {
  DEFAULT_DESIGN,
  DEFAULT_THEME,
  THEME_SLOTS,
  BORDER_WIDTHS,
  LEADING,
  MAX_WIDTHS,
  RADII,
  SHADOWS,
  SPACE_SCALE,
  TEXT_SIZES,
  createDocument,
  designVariables,
  documentStyleSheet,
  nodeStyle,
  resolveDesign,
  styleDeclarations,
  webFontHref,
  type Node,
  type Style,
} from '@/lib/document';
import { SECTION_KIT, buildSection, recipeDefaults } from '@/lib/sections/kit';
import { heading, paragraph } from '@/lib/sections/_shared';
import { tokensFromDesign } from '@/lib/ai/assemble';
import type { AiDesign } from '@/types/api';

let failures = 0;

function fail(message: string): void {
  failures += 1;
  console.error(`FAIL  ${message}`);
}

function pass(message: string): void {
  console.log(`PASS  ${message}`);
}

function check(message: string, condition: boolean, detail = ''): void {
  if (condition) pass(message);
  else fail(`${message}${detail ? ` — ${detail}` : ''}`);
}

/** Every `--kl-…` name a set of declarations refers to. */
function variablesIn(declarations: Record<string, string>): string[] {
  return Object.values(declarations).flatMap((value) =>
    [...value.matchAll(/var\((--kl-[A-Za-z0-9-]+)\)/g)].map((match) => match[1]),
  );
}

function walk(root: Node, visit: (node: Node) => void): void {
  visit(root);
  for (const child of root.children ?? []) walk(child, visit);
}

// --- 1. No dangling token, anywhere in the kit -----------------------------------

const available = new Set(Object.keys(designVariables(undefined)));
const referenced = new Map<string, string>(); // variable -> where it came from

for (const recipe of SECTION_KIT) {
  const node = buildSection(recipe.id, recipeDefaults(recipe));
  if (!node) {
    fail(`recipe ${recipe.id} did not build`);
    continue;
  }
  walk(node, (current) => {
    for (const variable of variablesIn(styleDeclarations(current.style))) {
      if (!referenced.has(variable)) referenced.set(variable, recipe.id);
    }
    for (const breakpoint of ['tablet', 'mobile'] as const) {
      const override = current.responsive?.[breakpoint];
      if (!override) continue;
      for (const variable of variablesIn(styleDeclarations(override))) {
        if (!referenced.has(variable)) referenced.set(variable, recipe.id);
      }
    }
  });
}

const dangling = [...referenced.keys()].filter((variable) => !available.has(variable));
check(
  `every style value in all ${SECTION_KIT.length} recipes resolves to a real design token`,
  dangling.length === 0,
  dangling.map((variable) => `${variable} (from ${referenced.get(variable)})`).join(', '),
);
check(
  'the recipes actually exercise the design system rather than setting nothing',
  referenced.size > 0,
  `${referenced.size} variables referenced`,
);

// Every step of every scale must have a token. Growing a scale without adding its
// token is the quiet way a design system stops working: the value is accepted,
// stored, and renders as nothing.
const scaleSteps: [string, readonly string[], string][] = [
  ['size', TEXT_SIZES, 'size'],
  ['space', SPACE_SCALE, 'space'],
  ['gap', SPACE_SCALE, 'gap'],
  ['radius', RADII, 'radius'],
  ['shadow', SHADOWS, 'shadow'],
  ['border', BORDER_WIDTHS, 'border'],
  ['measure', MAX_WIDTHS, 'measure'],
  ['leading', LEADING, 'leading'],
];

for (const [label, steps, prefix] of scaleSteps) {
  const missing = steps.filter(
    (step) => !(`--kl-${prefix}-${step}` in designVariables(undefined)),
  );
  check(
    `the ${label} scale has a token for every step`,
    missing.length === 0,
    missing.join(', '),
  );
}

const missingLineHeights = TEXT_SIZES.filter(
  (size) => !(`--kl-size-${size}-lh` in designVariables(undefined)),
);
check(
  'every type size carries a line-height',
  missingLineHeights.length === 0,
  'a size without one is how headings end up cramped and body copy loose',
);

// --- 2. The defaults reproduce what they replaced --------------------------------

/**
 * Anchors, not a copy of the table.
 *
 * Each of these pins one value to the Tailwind class it replaced, because the
 * promise to existing documents is that nothing moves until a design system is
 * applied. A test that restated the whole table would pass while the table was
 * wrong; these are the values whose change would be noticed.
 */
const ANCHORS: [string, string, string][] = [
  ['--kl-size-xl', '1.25rem', 'text-xl'],
  ['--kl-size-4xl', '2.25rem', 'text-4xl'],
  ['--kl-space-lg', '2.5rem', 'p-10'],
  ['--kl-gap-md', '1rem', 'gap-4'],
  ['--kl-radius-lg', '1rem', 'rounded-2xl'],
  ['--kl-measure-xl', '56rem', 'max-w-4xl'],
  ['--kl-border-thin', '1px', 'border'],
];

const resolvedDefaults = designVariables(undefined);
for (const [variable, expected, was] of ANCHORS) {
  check(
    `${variable} still matches the ${was} it replaced`,
    resolvedDefaults[variable] === expected,
    `expected ${expected}, got ${resolvedDefaults[variable] ?? 'nothing'}`,
  );
}

check(
  'the colour slots are emitted alongside the design tokens',
  THEME_SLOTS.every((slot) => `--kl-${slot}` in resolvedDefaults),
);
check(
  'the neutral default theme is what a site with no theme gets',
  resolvedDefaults['--kl-ink'] === DEFAULT_THEME.ink &&
    resolvedDefaults['--kl-accent'] === DEFAULT_THEME.accent,
);

// A scale that is not monotonic is not a scale.
const sizeValues = TEXT_SIZES.map((size) => parseFloat(DEFAULT_DESIGN[`size-${size}`]));
check(
  'the type scale increases at every step',
  sizeValues.every((value, index) => index === 0 || value > sizeValues[index - 1]),
  sizeValues.join(' < '),
);

const spaceValues = SPACE_SCALE.map((step) => parseFloat(DEFAULT_DESIGN[`space-${step}`]));
check(
  'the spacing scale increases at every step',
  spaceValues.every((value, index) => index === 0 || value > spaceValues[index - 1]),
  spaceValues.join(' < '),
);

// --- 3. A design system reaches the page -----------------------------------------

const styled: Style = { size: 'xl', padding: 'lg', gap: 'md', radius: 'lg', maxWidth: 'lg' };
const declarations = styleDeclarations(styled);

check(
  'a style resolves to token references rather than fixed values',
  Object.values(declarations).every((value) => value.includes('var(--kl-') || value === 'solid'),
  JSON.stringify(declarations),
);
check(
  'a size brings its line-height with it',
  declarations.fontSize === 'var(--kl-size-xl)' && declarations.lineHeight === 'var(--kl-size-xl-lh)',
  JSON.stringify(declarations),
);
check(
  'padding on one axis does not discard the other',
  styleDeclarations({ paddingY: 'xl', paddingX: 'sm' }).paddingLeft === 'var(--kl-space-sm)' &&
    styleDeclarations({ paddingY: 'xl', paddingX: 'sm' }).paddingTop === 'var(--kl-space-xl)',
);
check(
  'a border width brings a border style, or it would draw nothing',
  styleDeclarations({ borderWidth: 'thin' }).borderStyle === 'solid',
);
check(
  'a measure of "full" is none rather than a variable that means nothing',
  styleDeclarations({ maxWidth: 'full' }).maxWidth === 'none',
);

/*
 * Leading is a separate axis from size, and the reason is concrete: body copy wants
 * looser lines than a label of the same size, so a design that could only set the
 * size of its text could not set how it reads.
 */
check(
  'a named leading overrides the one the size implies',
  styleDeclarations({ size: 'sm', leading: 'relaxed' }).lineHeight ===
    'var(--kl-leading-relaxed)',
  JSON.stringify(styleDeclarations({ size: 'sm', leading: 'relaxed' })),
);
check(
  'a size on its own still brings its own leading',
  styleDeclarations({ size: 'sm' }).lineHeight === 'var(--kl-size-sm-lh)',
);
check(
  'body copy is looser than the leading its size implies',
  parseFloat(resolvedDefaults['--kl-leading-relaxed']) >
    parseFloat(resolvedDefaults['--kl-size-sm-lh']) /
      parseFloat(resolvedDefaults['--kl-size-sm']),
  `${resolvedDefaults['--kl-leading-relaxed']} vs the size ratio`,
);
check(
  'the leading scale increases at every step',
  LEADING.map((step) => parseFloat(DEFAULT_DESIGN[`leading-${step}`])).every(
    (value, index, all) => index === 0 || value > all[index - 1],
  ),
);

/*
 * The core claim. The declarations are identical — they have to be, they are var
 * references — so what must differ is what those variables resolve to. This is the
 * difference between a builder that can be given one design system and one that
 * cannot be given any.
 */
const oneDesign = resolveDesign({ 'size-xl': '1.25rem', 'space-lg': '2.5rem' });
const otherDesign = resolveDesign({
  'size-xl': '2rem',
  'size-xl-lh': '2.25rem',
  'space-lg': '6rem',
});
check(
  'two design systems give the same document two different resolved values',
  oneDesign['size-xl'] !== otherDesign['size-xl'] &&
    oneDesign['space-lg'] !== otherDesign['space-lg'],
  `${oneDesign['size-xl']} vs ${otherDesign['size-xl']}`,
);
check(
  'the declarations do not change when the design does, only their resolution',
  JSON.stringify(styleDeclarations(styled)) === JSON.stringify(declarations),
);

const siteWithATheme = designVariables({
  accent: '#0d9488',
  'size-xl': '2rem',
  'font-display': 'Georgia, serif',
});
check(
  'a site carries its colours and its design in one set of variables',
  siteWithATheme['--kl-accent'] === '#0d9488' &&
    siteWithATheme['--kl-size-xl'] === '2rem' &&
    siteWithATheme['--kl-font-display'] === 'Georgia, serif',
);

/*
 * A stored document is data. An unknown key must be ignored rather than becoming an
 * arbitrary custom property on a published page — the token map is a whitelist, not
 * a channel.
 */
const withJunk = designVariables({ 'size-xl': '2rem', 'evil-inject': 'url(javascript:1)' });
check(
  'a token key that is not part of the design is ignored',
  !Object.keys(withJunk).some((key) => key.includes('evil-inject')),
);
check(
  'a known key with a blank value falls back rather than emptying it',
  designVariables({ 'size-xl': '   ' })['--kl-size-xl'] === DEFAULT_DESIGN['size-xl'],
);

// --- Responsive overrides --------------------------------------------------------

const responsiveDocument = createDocument('Responsive');
responsiveDocument.root.children = [
  {
    id: 'section-with-override',
    type: 'section',
    props: {},
    style: { paddingY: 'md' },
    responsive: { tablet: { paddingY: 'xl' }, mobile: { paddingY: 'sm' } },
    children: [],
  },
];

const stylesheet = documentStyleSheet(responsiveDocument);
check(
  'a responsive override becomes a media query',
  stylesheet.includes('@media (min-width: 768px)') && stylesheet.includes('@media (max-width: 767px)'),
  stylesheet,
);
check(
  'a responsive override addresses the node and uses the token',
  stylesheet.includes('.kl-n-section-with-override{padding-top:var(--kl-space-xl)') &&
    stylesheet.includes('.kl-n-section-with-override{padding-top:var(--kl-space-sm)'),
  stylesheet,
);
check(
  'a document with no overrides generates no stylesheet at all',
  documentStyleSheet(createDocument('Plain')) === '',
);

// Ids are generated by us and are alphanumeric with hyphens, but a stored document
// is data. An id that broke the selector would look like the override being ignored.
const exoticDocument = createDocument('Exotic');
exoticDocument.root.children = [
  {
    id: 'a.b', // the dot would end the class selector and match something else
    type: 'section',
    props: {},
    responsive: { tablet: { paddingY: 'lg' } },
  },
];
const exoticStylesheet = documentStyleSheet(exoticDocument);
check(
  'an id with a character that would break a selector is escaped, not skipped',
  exoticStylesheet.includes('.kl-n-a\\.b{'),
  exoticStylesheet,
);

// --- A node carries its own styling ----------------------------------------------

const styledNode: Node = {
  id: 'h-1',
  type: 'heading',
  props: { text: 'Hello', level: 1 },
  style: { size: '4xl', align: 'center', color: 'accent' },
};
const nodeDeclarations = nodeStyle(styledNode);
check(
  'a node carries its size, alignment and colour',
  nodeDeclarations.fontSize === 'var(--kl-size-4xl)' &&
    nodeDeclarations.textAlign === 'center' &&
    nodeDeclarations.color === 'var(--kl-accent)',
  JSON.stringify(nodeDeclarations),
);
check(
  'a node with no style declares nothing rather than defaulting',
  Object.keys(nodeStyle({ id: 'x', type: 'text', props: {} })).length === 0,
);

// --- Heading hierarchy is the recipe's decision ----------------------------------

/*
 * This is the change that gives the design system control of the page. Until now a
 * heading's size was chosen by a React component from a fixed class map, so the
 * largest heading on a site was `text-5xl` no matter what design that site had been
 * given. Now the recipe declares it, in tokens, and the component has no opinion.
 */
const LEVELS = [1, 2, 3, 4] as const;
const headingNodes = LEVELS.map((level) => heading('A heading', level));

check(
  'every heading level is given a size by the recipe',
  headingNodes.every((node) => Boolean(node.style?.size)),
  JSON.stringify(headingNodes.map((node) => node.style?.size)),
);
check(
  'a heading size is drawn from the type scale rather than invented',
  headingNodes.every((node) => TEXT_SIZES.includes(node.style!.size!)),
  JSON.stringify(headingNodes.map((node) => node.style?.size)),
);

const headingSizes = headingNodes.map((node) =>
  parseFloat(DEFAULT_DESIGN[`size-${node.style!.size}`]),
);
check(
  'heading sizes descend with level',
  headingSizes.every((value, index) => index === 0 || value < headingSizes[index - 1]),
  headingSizes.join(' > '),
);
check(
  'the largest heading steps up at the tablet breakpoint',
  headingNodes[0].responsive?.tablet?.size === '5xl',
  JSON.stringify(headingNodes[0].responsive),
);
check(
  'a caller can still override a heading size',
  heading('A heading', 1, { size: 'lg' }).style?.size === 'lg',
);

// A recipe that sets its own type is the normal case now, so check the one every
// page's body copy goes through: it must be able to set both axes.
const bodyCopy = paragraph('Some words about the business.');
check(
  'a paragraph sets its own size and leading',
  bodyCopy.style?.size === 'sm' && bodyCopy.style?.leading === 'relaxed',
  JSON.stringify(bodyCopy.style),
);
check(
  'a caller can still override a paragraph’s leading',
  paragraph('Words', { leading: 'tight' }).style?.leading === 'tight',
);
check(
  'a heading carries the tablet step all the way into the stylesheet',
  documentStyleSheet({
    schemaVersion: 1,
    root: { id: 'page', type: 'page', props: {}, children: [headingNodes[0]] },
  }).includes('font-size:var(--kl-size-5xl)'),
);

// --- A chosen design becomes a site ---------------------------------------------

/*
 * Where the design library meets the document. The server picks a design; this turns
 * it into the tokens the renderer reads. If this mapping broke, a site would be given
 * a design and quietly render in the neutral default — the failure would look like
 * the library having no effect rather than like a bug.
 */
const DESIGN: AiDesign = {
  product_type: 'Bakery/Cafe',
  style_id: 'minimalism-and-swiss-style',
  style_name: 'Minimalism & Swiss Style',
  pairing: 'Classic Elegant',
  fonts: {
    display: "'Playfair Display', Georgia, serif",
    body: "'Inter', system-ui, sans-serif",
    href: 'https://fonts.googleapis.com/css2?family=Inter&family=Playfair+Display&display=swap',
  },
  colours: { accent: '#92400E', onAccent: '#FFFFFF', paper: '#FFFBEB', ink: '#451A03' },
  tokens: { 'radius-md': '0', 'shadow-sm': 'none' },
  rationale: 'Warm neutrals and a serif face suit a craft food business.',
};

const designTokens = tokensFromDesign(DESIGN);
check(
  "a design's colours become theme slots",
  designTokens.accent === '#92400E' && designTokens.onAccent === '#FFFFFF',
  JSON.stringify(designTokens),
);
check(
  "a design's style tokens become design tokens",
  resolveDesign(designTokens)['radius-md'] === '0' &&
    resolveDesign(designTokens)['shadow-sm'] === 'none',
  JSON.stringify(resolveDesign(designTokens)),
);
check(
  "a design's faces become the display and body stacks",
  resolveDesign(designTokens)['font-display'] === "'Playfair Display', Georgia, serif" &&
    resolveDesign(designTokens)['font-body'] === "'Inter', system-ui, sans-serif",
  JSON.stringify(resolveDesign(designTokens)),
);
check(
  "a design's webfont request is carried separately from the token values",
  webFontHref(designTokens) === DESIGN.fonts.href,
  String(webFontHref(designTokens)),
);
check(
  'a design with no webfont request needs no link',
  webFontHref(tokensFromDesign({ ...DESIGN, fonts: { display: '', body: '', href: '' } })) ===
    undefined,
);

/*
 * The link is the one value on a document that is a URL, and a document is data.
 * Only Google Fonts is accepted: anywhere else would make a stored document a way to
 * load a stylesheet of someone else's choosing into a published page.
 */
check(
  'a webfont request pointing anywhere else is refused',
  webFontHref({ webfonts: 'https://example.com/evil.css' }) === undefined &&
    webFontHref({ webfonts: 'javascript:alert(1)' }) === undefined &&
    webFontHref({ webfonts: 'http://fonts.googleapis.com/css2?family=Inter' }) === undefined,
);

// A design's own keys are checked against the token whitelist before they are
// emitted, so a colour slot that does not exist cannot become a custom property.
const withUnknownSlot = tokensFromDesign({
  ...DESIGN,
  colours: { notASlot: '#123456' },
});
check(
  'a colour slot that is not part of a theme is ignored',
  !Object.keys(designVariables(withUnknownSlot)).includes('--kl-notASlot'),
);

if (failures > 0) {
  console.error(`\n${failures} failure(s).\n`);
  process.exit(1);
}
console.log('\nAll design system checks passed.\n');
