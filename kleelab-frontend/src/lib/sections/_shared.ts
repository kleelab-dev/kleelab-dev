import { createNode, type Node, type Style } from '@/lib/document';

/**
 * The vocabulary recipes are written in.
 *
 * Recipes are built from these few primitives rather than from raw node
 * literals, so that "how much padding does a band get" and "what does a card
 * look like" are answered in exactly one place. A catalogue of two dozen
 * sections authored by hand is a catalogue where two dozen sections slowly stop
 * matching each other, and that mismatch is precisely the amateur look the kit
 * exists to prevent.
 */

/**
 * A full-width band.
 *
 * `paddingX` is set explicitly and cannot be omitted. The registry's
 * `sectionDefaults` only supplies `px-6 py-12 md:px-10` when a section has *no*
 * padding of its own, so a band that sets `paddingY` and nothing else loses its
 * horizontal padding too and its content runs to the viewport edge — a bug that
 * looks like a styling opinion.
 */
export const band = (style: Style, children: Node[]): Node =>
  createNode('section', {}, { style: { paddingX: 'lg', ...style }, children });

/**
 * A bordered surface, for anything that should read as a discrete object:
 * a feature, a price, a quote.
 *
 * Uses the `surface` and `line` theme slots rather than literal greys, so a
 * customer's own palette flows through it.
 */
export const card = (children: Node[], style: Style = {}): Node =>
  createNode(
    'section',
    {},
    {
      style: {
        background: 'surface',
        borderColor: 'line',
        borderWidth: 'thin',
        radius: 'lg',
        padding: 'md',
        ...style,
      },
      children,
    },
  );

/**
 * A responsive column layout.
 *
 * No `gap` is set: the grid node already carries `gap-6`, and adding a second
 * gap utility would produce two classes of identical specificity whose winner
 * depends on their order in the generated stylesheet rather than on intent.
 */
export const columns = (count: number, children: Node[]): Node =>
  createNode('grid', { columns: count }, { children });

/** The centred content wrapper. Carries the page's readable measure. */
export const stack = (children: Node[], style: Style = {}): Node =>
  createNode('container', {}, { style, children });

export const heading = (text: string, level: 1 | 2 | 3 | 4 = 2, style: Style = {}): Node =>
  createNode('heading', { text, level }, { style });

/**
 * A paragraph.
 *
 * Carries the theme's muted colour by default (the renderer supplies it), so the
 * `style` argument only exists for the cases where a band is dark and the default
 * would be unreadable.
 */
export const paragraph = (text: string, style: Style = {}): Node =>
  createNode('text', { text }, { style });

export const button = (label: string, href = '#'): Node =>
  createNode('button', { label, href });

/**
 * An image slot.
 *
 * `intent` says what the photograph should show. It is what the editor draws
 * while the slot is empty, what the alt text falls back to, and the only thing
 * that tells an owner what to go and find — a customer cannot be expected to
 * work out what a designer had in mind from a blank rectangle.
 */
export const image = (src: string, alt: string, intent = ''): Node => {
  const props: Record<string, unknown> = { src, alt };
  if (intent) props.intent = intent;
  return createNode('image', props);
};

export const bulletList = (items: string[], ordered = false): Node =>
  createNode('list', { items, ordered });
