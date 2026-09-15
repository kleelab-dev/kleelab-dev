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

/**
 * A heading.
 *
 * The size is set here rather than left to the renderer, and that is a change of
 * ownership rather than a refactor. How large an h1 is relative to an h2 is a design
 * decision — exactly the kind a site's design system owns — so it belongs with the
 * studio's judgement in the recipe, not hardcoded per level in a React component
 * that has no idea what the heading is for.
 *
 * The level-1 size also steps up at the tablet breakpoint, which is what the fixed
 * classes used to do. That is now expressed as a token override, so a design system
 * can change both steps together instead of the desktop size being unreachable.
 */
const HEADING_STYLE: Record<1 | 2 | 3 | 4, { style: Style; responsive?: Node['responsive'] }> = {
  1: { style: { size: '4xl' }, responsive: { tablet: { size: '5xl' } } },
  2: { style: { size: '3xl' } },
  3: { style: { size: '2xl' } },
  4: { style: { size: 'xl' } },
};

export const heading = (text: string, level: 1 | 2 | 3 | 4 = 2, style: Style = {}): Node => {
  const hierarchy = HEADING_STYLE[level];
  return createNode('heading', { text, level }, {
    style: { ...hierarchy.style, ...style },
    responsive: hierarchy.responsive,
  });
};

/**
 * A paragraph.
 *
 * Sets its own size and leading rather than inheriting the renderer's, because the
 * two are the recipe's business: body copy needs to be a step smaller than a
 * heading and noticeably looser than a label of the same size. Leaving it to the
 * renderer is how every paragraph on every site ended up at the same fixed pair.
 *
 * Carries the theme's muted colour by default (the renderer supplies it), so the
 * `style` argument only exists for the cases where a band is dark and the default
 * would be unreadable.
 */
export const paragraph = (text: string, style: Style = {}): Node =>
  createNode('text', { text }, { style: { size: 'sm', leading: 'relaxed', ...style } });

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
