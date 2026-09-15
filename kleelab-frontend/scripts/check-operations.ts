/**
 * Applying the assistant's changes.
 *
 * `applyOperations` is the one place where a language model's output becomes
 * changes to a real page, so it earns its own sweep. Two properties matter, and
 * both are checked here rather than assumed:
 *
 *   1. **Nothing invalid is applied.** An operation aimed at a node that does not
 *      exist, a colour that cannot be read, a picture set on a heading — each is
 *      refused and named, never applied quietly.
 *   2. **A refusal changes nothing.** The document afterwards must be identical
 *      to the document before, not merely similar. A half-applied change is worse
 *      than a rejected one, because it is invisible.
 *
 * Run with `npm run check:operations`. No network, no database, no browser.
 */

import { createDocument, documentSchema, type KleeLabDocument } from '@/lib/document';
import { describeTurnForModel } from '@/lib/ai/edit';
import { buildOutline } from '@/lib/editor/outline';
import { applyOperations } from '@/lib/editor/operations';
import { buildSection } from '@/lib/sections/kit';
import type { AiEditOperation } from '@/types/api';

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

/** A small page with a heading that has copy, a picture, and two sections. */
function page(): KleeLabDocument {
  const document = createDocument('Home');
  const nav = buildSection('nav.bar', { brand: 'Fern & Field' });
  const hero = buildSection('hero.split', { heading: 'Fresh bread daily' });
  const footer = buildSection('footer.columns', { text: '© Fern & Field' });
  if (!nav || !hero || !footer) throw new Error('The kit is missing a section this sweep needs');
  document.root.children = [nav, hero, footer];
  return document;
}

function run(
  document: KleeLabDocument,
  operations: AiEditOperation[],
): ReturnType<typeof applyOperations> {
  return applyOperations(document, operations, buildOutline(document.root).textKeys);
}

/** Every heading with copy, so a change can be aimed at one of them. */
function headingIds(document: KleeLabDocument): string[] {
  const found: string[] = [];
  const walk = (node: { id: string; type: string; props?: Record<string, unknown>; children?: unknown[] }) => {
    if (node.type === 'heading' && typeof node.props?.text === 'string') found.push(node.id);
    for (const child of (node.children ?? []) as typeof node[]) walk(child);
  };
  walk(document.root as never);
  return found;
}

function imageIds(document: KleeLabDocument): string[] {
  const found: string[] = [];
  const walk = (node: { id: string; type: string; children?: unknown[] }) => {
    if (node.type === 'image') found.push(node.id);
    for (const child of (node.children ?? []) as typeof node[]) walk(child);
  };
  walk(document.root as never);
  return found;
}

const base = page();
const headings = headingIds(base);
const images = imageIds(base);

check('the fixture page has headings and a picture to aim at', headings.length > 0 && images.length > 0, `${headings.length} headings, ${images.length} images`);

// --- Changes that should work ----------------------------------------------------

const textResult = run(base, [{ op: 'set_text', node_id: headings[0], text: 'Baked this morning' }]);
const rewritten = JSON.stringify(textResult.document).includes('Baked this morning');
check(
  'a text change is written to the prop the outline named',
  textResult.applied.length === 1 && rewritten,
  JSON.stringify(textResult.applied),
);

const styleResult = run(base, [{ op: 'set_style', node_id: headings[0], style: { align: 'center' } }]);
check(
  'a valid style change is applied',
  styleResult.applied.length === 1 && styleResult.refused.length === 0,
  JSON.stringify(styleResult.refused),
);

const paletteResult = run(base, [{ op: 'set_theme', slot: 'warm', colour: '' }]);
check(
  'a named palette sets every colour slot at once',
  paletteResult.applied.length === 1 && Object.keys(paletteResult.document.tokens ?? {}).length >= 8,
  JSON.stringify(paletteResult.document.tokens),
);

const imageResult = run(base, [
  { op: 'set_image', node_id: images[0], src: 'https://example.com/mine.jpg', alt: 'My loaf' },
]);
check(
  'a picture can be replaced with the owner’s own',
  imageResult.applied.length === 1 &&
    JSON.stringify(imageResult.document).includes('https://example.com/mine.jpg'),
  JSON.stringify(imageResult.refused),
);

// --- Rewriting a section keeps its id --------------------------------------------

const heroId = base.root.children?.[1]?.id ?? '';
const replaced = run(base, [
  { op: 'replace_section', node_id: heroId, section_id: 'hero.centered', content: { heading: 'New' } },
]);
check(
  'a rewritten section keeps its id, so later turns still refer to it',
  replaced.applied.length === 1 &&
    (replaced.document.root.children ?? []).some((child) => child.id === heroId),
  JSON.stringify(replaced.refused),
);

// --- Adding a section lands where it was asked to --------------------------------

const added = run(base, [
  { op: 'add_section', after_node_id: base.root.id, section_id: 'faq.list', content: {} },
]);
const addedChildren = added.document.root.children ?? [];
check(
  'a section added after the page node lands at the top',
  added.applied.length === 1 &&
    addedChildren.length === (base.root.children ?? []).length + 1 &&
    addedChildren[0]?.id !== (base.root.children ?? [])[0]?.id,
  `${addedChildren.length} children`,
);

// --- Everything below must be refused, and must change nothing -------------------

const REFUSALS: Record<string, AiEditOperation> = {
  'a change to a node that does not exist': { op: 'set_text', node_id: 'ghost', text: 'x' },
  'a text change to a node with no copy': {
    op: 'set_text',
    node_id: base.root.id,
    text: 'x',
  },
  'a style value outside the scale': {
    op: 'set_style',
    node_id: headings[0],
    style: { size: 'enormous' },
  },
  'a style key that is not a style': {
    op: 'set_style',
    node_id: headings[0],
    style: { fontFamily: 'Comic Sans' },
  },
  'a colour that cannot be read': { op: 'set_theme', slot: 'accent', colour: 'not a colour' },
  'a colour slot that does not exist': { op: 'set_theme', slot: 'brand', colour: '#123456' },
  'a picture set on something that is not a picture': {
    op: 'set_image',
    node_id: headings[0],
    src: 'https://example.com/x.jpg',
  },
  'a picture address that is not a link': {
    op: 'set_image',
    node_id: images[0],
    src: 'javascript:alert(1)',
  },
  'a section the kit does not have': {
    op: 'add_section',
    after_node_id: base.root.id,
    section_id: 'hero.invented',
  },
  'deleting the page itself': { op: 'remove_section', node_id: base.root.id },
  'a move onto itself': {
    op: 'move_section',
    node_id: base.root.children?.[0]?.id ?? '',
    after_node_id: base.root.children?.[0]?.id ?? '',
  },
};

for (const [label, operation] of Object.entries(REFUSALS)) {
  const result = run(base, [operation]);
  check(
    `refused: ${label}`,
    result.applied.length === 0 &&
      result.refused.length > 0 &&
      JSON.stringify(result.document) === JSON.stringify(base),
    JSON.stringify({ applied: result.applied, refused: result.refused }),
  );
}

// Deleting the last section would leave a blank page, which is not a page.
const oneSection = createDocument('Home');
oneSection.root.children = [buildSection('hero.centered', { heading: 'Only' })!];
const lastSection = run(oneSection, [
  { op: 'remove_section', node_id: oneSection.root.children[0].id },
]);
check(
  'refused: deleting the last section on a page',
  lastSection.applied.length === 0 && JSON.stringify(lastSection.document) === JSON.stringify(oneSection),
  JSON.stringify(lastSection.refused),
);

// --- A batch applies in order, and a bad one in the middle does not stop it ------

const batch = run(base, [
  { op: 'set_style', node_id: headings[0], style: { size: '4xl' } },
  { op: 'set_text', node_id: 'ghost', text: 'x' },
  { op: 'set_theme', slot: 'accent', colour: '#0d9488' },
]);
check(
  'a batch applies the good changes and reports the one that failed',
  batch.applied.length === 2 && batch.refused.length === 1,
  JSON.stringify({ applied: batch.applied, refused: batch.refused }),
);

// --- The results are still valid documents ---------------------------------------

for (const [label, result] of [
  ['a text rewrite', textResult],
  ['a style change', styleResult],
  ['a palette change', paletteResult],
  ['a picture replacement', imageResult],
  ['a section rewrite', replaced],
  ['a section addition', added],
  ['a partial batch', batch],
] as const) {
  const parsed = documentSchema.safeParse(result.document);
  check(
    `the page is still a valid document after ${label}`,
    parsed.success,
    parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 2)),
  );
}

// --- The conversation is described to the model ----------------------------------

/*
 * Half of the fix for the worst turn this builder has produced. The assistant asked
 * whether "rebuild" meant the whole page, the colours, or one section; the owner
 * answered "yes"; and the assistant tried to make the change instead of reading the
 * answer. It could see its own question in the history — nothing marked it as a
 * question, so there was nothing to treat as one.
 */
const questionTurn = describeTurnForModel({
  role: 'assistant',
  kind: 'question',
  text: 'Do you mean the whole page, the colours, or one section?',
});
check(
  "the assistant's own question is labelled as a question, not as a report",
  questionTurn.startsWith('You asked:'),
  questionTurn,
);
check(
  'a change the assistant made is not labelled as a question',
  describeTurnForModel({ role: 'assistant', kind: 'change', text: 'Made it bigger' }).startsWith(
    'You changed:',
  ),
);
check(
  'an assistant turn from before `kind` existed still reads as a report rather than throwing',
  describeTurnForModel({ role: 'assistant', text: 'Made it bigger' }).startsWith('You changed:'),
);
check(
  "the owner's words are marked as theirs",
  describeTurnForModel({ role: 'user', text: 'yes' }) === 'They said: yes',
);

if (failures > 0) {
  console.error(`\n${failures} failure(s).\n`);
  process.exit(1);
}
console.log('\nAll operation checks passed.\n');
