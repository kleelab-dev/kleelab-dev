import { z } from 'zod';

/**
 * The KleeLab document model.
 *
 * This is the single source of truth for page content. Both the editor canvas
 * and the published site render from a `KleeLabDocument`, which guarantees that
 * what a user builds is exactly what visitors see.
 *
 * Shape:
 *   Document = { schemaVersion, root: Node, tokens? }
 *   Node     = { id, type, props, style?, responsive?, children? }
 */

export const DOCUMENT_SCHEMA_VERSION = 1;

export const NODE_TYPES = [
  'page',
  'section',
  'container',
  'grid',
  'heading',
  'text',
  'image',
  'button',
  'link',
  'divider',
  'spacer',
  'list',
  'form',
  'input',
  'nav',
  'footer',
  'html',
  // Storefront. These render the site's own catalogue, which the published page
  // supplies as data; in the editor they show a placeholder instead.
  'product_grid',
  'cart_button',
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

/** Nodes that may contain children. Enforced by the editor, tolerated by the renderer. */
export const CONTAINER_TYPES: readonly NodeType[] = [
  'page',
  'section',
  'container',
  'grid',
  'list',
  'form',
  'nav',
  'footer',
];

// ---------------------------------------------------------------------------
// Style tokens
// ---------------------------------------------------------------------------

export const SPACE_SCALE = ['none', 'xs', 'sm', 'md', 'lg', 'xl'] as const;
export const ALIGNMENTS = ['left', 'center', 'right'] as const;
export const TEXT_SIZES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'] as const;

/**
 * How tightly lines sit.
 *
 * A separate axis from size, because the two answer different questions. A
 * paragraph wants looser lines than a label of the same size: the previous fixed
 * classes gave body copy `text-sm leading-6` — a ratio of 1.7 — while the same
 * size token pairs with 1.4. Tying leading to size alone cannot express that, and
 * the result is body copy that reads as cramped.
 */
export const LEADING = ['tight', 'snug', 'normal', 'relaxed'] as const;
export const RADII = ['none', 'sm', 'md', 'lg', 'full'] as const;
export const SHADOWS = ['none', 'sm', 'md', 'lg'] as const;
export const MAX_WIDTHS = ['sm', 'md', 'lg', 'xl', 'full'] as const;
export const BORDER_WIDTHS = ['none', 'thin', 'medium', 'thick'] as const;

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/**
 * Named colour slots in a site theme.
 *
 * A style value may be one of these slot names *or* any CSS colour. Slot names
 * resolve to a CSS variable so changing the theme restyles everything that uses
 * it; a literal colour is used as-is, which is what gives per-element freedom.
 */
export const THEME_SLOTS = [
  'paper',
  'surface',
  'canvas',
  'mint',
  'ink',
  'muted',
  'accent',
  'line',
] as const;
export type ThemeSlot = (typeof THEME_SLOTS)[number];

/**
 * Neutral defaults.
 *
 * Deliberately greyscale: a new site must not arrive dressed in KleeLab's brand.
 * The previous model mapped these slots straight onto KleeLab's Tailwind colours,
 * so every customer site was permanently rendered in the studio's palette.
 */
export const DEFAULT_THEME: Record<ThemeSlot, string> = {
  paper: '#ffffff',
  surface: '#ffffff',
  canvas: '#f4f4f5',
  mint: '#e4e4e7',
  ink: '#111113',
  muted: '#6b7280',
  accent: '#111113',
  line: '#e4e4e7',
};

export type SiteTheme = Record<ThemeSlot, string>;

export function resolveTheme(tokens: Record<string, string> | undefined): SiteTheme {
  const theme = { ...DEFAULT_THEME };
  for (const slot of THEME_SLOTS) {
    const value = tokens?.[slot];
    if (typeof value === 'string' && value.trim()) theme[slot] = value.trim();
  }
  return theme;
}

const CSS_COLOUR = /^(#[0-9a-fA-F]{3,8}$|rgb|hsl|hwb|lab|lch|oklab|oklch|color\(|var\()/;

/**
 * Quick colours for the per-element picker.
 *
 * The default theme is neutral on purpose, which left the picker showing nothing
 * but greys and made it look broken. These are starting points, not a
 * constraint: the picker still accepts any colour.
 */
export const PRESET_COLOURS = [
  '#000000',
  '#404040',
  '#71717a',
  '#a1a1aa',
  '#e4e4e7',
  '#ffffff',
  '#b91c1c',
  '#ea580c',
  '#d97706',
  '#65a30d',
  '#16a34a',
  '#0d9488',
  '#0284c7',
  '#1d4ed8',
  '#7c3aed',
  '#c026d3',
  '#db2777',
  '#78350f',
] as const;

/**
 * Whole-theme starting points.
 *
 * Applying one sets every slot at once, so a site gets a coherent palette in a
 * single click rather than eight separate colour choices.
 */
export const PRESET_THEMES: { name: string; theme: SiteTheme }[] = [
  { name: 'Neutral', theme: DEFAULT_THEME },
  {
    name: 'Warm',
    theme: {
      paper: '#fffbf5',
      surface: '#ffffff',
      canvas: '#fdf2e9',
      mint: '#f8e3d0',
      ink: '#2b1c12',
      muted: '#8a6f5c',
      accent: '#c2410c',
      line: '#efd9c6',
    },
  },
  {
    name: 'Ocean',
    theme: {
      paper: '#f8fafc',
      surface: '#ffffff',
      canvas: '#eff6ff',
      mint: '#dbeafe',
      ink: '#0f172a',
      muted: '#64748b',
      accent: '#1d4ed8',
      line: '#dbe4f0',
    },
  },
  {
    name: 'Forest',
    theme: {
      paper: '#f8faf7',
      surface: '#ffffff',
      canvas: '#f0f5ee',
      mint: '#dcfce7',
      ink: '#14261a',
      muted: '#5f7a68',
      accent: '#15803d',
      line: '#d9e5da',
    },
  },
  {
    name: 'Plum',
    theme: {
      paper: '#fdfaff',
      surface: '#ffffff',
      canvas: '#f7f0fb',
      mint: '#f3e8ff',
      ink: '#231030',
      muted: '#7c628c',
      accent: '#7e22ce',
      line: '#e9dcf2',
    },
  },
  {
    name: 'Dark',
    theme: {
      paper: '#0f1115',
      surface: '#171a20',
      canvas: '#1d2129',
      mint: '#242832',
      ink: '#f4f4f5',
      muted: '#a1a1aa',
      accent: '#fafafa',
      line: '#2e333d',
    },
  },
];

/**
 * Turn a style value into something CSS will accept.
 *
 * A theme slot becomes `var(--kl-<slot>)`; anything else is passed through as a
 * literal colour. Unrecognised values are dropped rather than guessed at, so a
 * typo leaves an element unstyled instead of painting it the wrong colour.
 */
export function resolveColour(value: string | undefined | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if ((THEME_SLOTS as readonly string[]).includes(trimmed)) return `var(--kl-${trimmed})`;
  if (CSS_COLOUR.test(trimmed)) return trimmed;
  return undefined;
}

/**
 * Whether a colour value would survive `resolveColour`.
 *
 * Exported so the AI's `set_theme` and `set_style` replies can be judged by the
 * same rule that decides whether a colour is rendered at all. Anything else would
 * let the builder accept a colour that silently does nothing, which reads as the
 * feature being broken rather than the value being wrong.
 */
export function isColourToken(value: string | undefined | null): boolean {
  return resolveColour(value) !== undefined;
}

/**
 * The design scales a site can be given.
 *
 * These are the axes that decide what a site looks like: how large its type gets,
 * how much air it has, how round its corners are, how heavy its shadows, how wide
 * it measures, how thick its rules, and which faces it sets in. Until this existed
 * the only axis was colour. Every other value was a fixed Tailwind class —
 * `size: 'xl'` was literally the string `'text-xl'` — so two customers in the same
 * trade received the same layout, in the same type, at the same spacing, and the
 * only thing that could differ was eight hex values.
 *
 * A node's style still speaks in the vocabulary it always did (`size: 'xl'`,
 * `padding: 'lg'`). What changed is what those words resolve to: a custom property
 * instead of a class. That keeps every stored document valid, and lets one set of
 * values restyle every recipe at once without touching a single recipe.
 *
 * The defaults below reproduce the previous fixed classes exactly, so nothing that
 * already exists moves until a design system is deliberately applied to it.
 */
export const DEFAULT_DESIGN: Record<string, string> = {
  // Type. Each size carries its own line-height, because a size without one is how
  // large text ends up cramped and small text ends up loose — and a design system
  // that changes the scale has to change both together or the result is worse than
  // either value alone.
  'size-xs': '0.75rem',
  'size-xs-lh': '1rem',
  'size-sm': '0.875rem',
  'size-sm-lh': '1.25rem',
  'size-md': '1rem',
  'size-md-lh': '1.5rem',
  'size-lg': '1.125rem',
  'size-lg-lh': '1.75rem',
  'size-xl': '1.25rem',
  'size-xl-lh': '1.75rem',
  'size-2xl': '1.5rem',
  'size-2xl-lh': '2rem',
  'size-3xl': '1.875rem',
  'size-3xl-lh': '2.25rem',
  'size-4xl': '2.25rem',
  'size-4xl-lh': '2.5rem',
  'size-5xl': '3rem',
  'size-5xl-lh': '1',

  // Padding.
  'space-none': '0',
  'space-xs': '0.5rem',
  'space-sm': '1rem',
  'space-md': '1.5rem',
  'space-lg': '2.5rem',
  'space-xl': '4rem',

  // Gaps. A separate scale on purpose: the previous fixed classes used a tighter
  // one for gaps than for padding, and unifying them here would silently shift the
  // spacing of every document that already exists.
  'gap-none': '0',
  'gap-xs': '0.25rem',
  'gap-sm': '0.5rem',
  'gap-md': '1rem',
  'gap-lg': '1.5rem',
  'gap-xl': '2.5rem',

  'radius-none': '0',
  'radius-sm': '0.25rem',
  'radius-md': '0.5rem',
  'radius-lg': '1rem',
  'radius-full': '9999px',

  'shadow-none': 'none',
  'shadow-sm': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  'shadow-md': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  'shadow-lg': '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',

  'measure-sm': '24rem',
  'measure-md': '28rem',
  'measure-lg': '32rem',
  'measure-xl': '56rem',
  'measure-full': 'none',

  'border-none': '0px',
  'border-thin': '1px',
  'border-medium': '2px',
  'border-thick': '4px',

  // Leading. Unitless multipliers, so a line-height follows whatever size it is
  // put next to instead of being pinned to one.
  'leading-tight': '1.1',
  'leading-snug': '1.3',
  'leading-normal': '1.5',
  'leading-relaxed': '1.7',

  // Faces. Customer sites get their own pair; this default is the neutral system
  // stack that the previous rendering implied, so nothing changes until a pairing
  // is chosen for the site.
  'font-display': 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  'font-body':
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

/** Every token a design system may set. Used to reject a value that is not one. */
export const DESIGN_KEYS: readonly string[] = Object.keys(DEFAULT_DESIGN);

/**
 * A site's design, complete.
 *
 * Unknown keys in `tokens` are ignored rather than trusted: a stored document is
 * data, and data from an older or newer version of this code must not be able to
 * inject an arbitrary custom property into a published page.
 */
export function resolveDesign(tokens: Record<string, string> | undefined): Record<string, string> {
  const design = { ...DEFAULT_DESIGN };
  for (const key of DESIGN_KEYS) {
    const value = tokens?.[key];
    if (typeof value === 'string' && value.trim()) design[key] = value.trim();
  }
  return design;
}

/**
 * Every custom property a rendered page needs: its colours and its design.
 *
 * One wrapper carries them all, so a whole site restyles by changing one object.
 */
export function designVariables(tokens: Record<string, string> | undefined): Record<string, string> {
  const theme = resolveTheme(tokens);
  const variables: Record<string, string> = {};
  for (const slot of THEME_SLOTS) variables[`--kl-${slot}`] = theme[slot];
  for (const [key, value] of Object.entries(resolveDesign(tokens))) {
    variables[`--kl-${key}`] = value;
  }
  return variables;
}

/**
 * The webfont request a site's design needs, if it has one.
 *
 * A URL rather than a custom property, so it is deliberately not part of
 * `DEFAULT_DESIGN` — that map is the whitelist of values a design may set, and a
 * URL has no business being settable through it. It travels on `tokens` beside the
 * rest of the design because it is part of the same decision.
 *
 * Customer sites do not use KleeLab's own typefaces. They are set in a pairing
 * chosen for the business, fetched by request rather than bundled: there are 74
 * pairings and around 150 families, and shipping all of them to every visitor so
 * that each site can have two is not a trade worth making.
 */
export function webFontHref(tokens: Record<string, string> | undefined): string | undefined {
  const href = tokens?.webfonts;
  if (typeof href !== 'string') return undefined;
  const trimmed = href.trim();
  return trimmed.startsWith('https://fonts.googleapis.com/') ? trimmed : undefined;
}

export const styleSchema = z.object({
  // Free-form: a theme slot name, a hex value, or any CSS colour function.
  background: z.string().optional(),
  color: z.string().optional(),
  borderColor: z.string().optional(),
  borderWidth: z.enum(BORDER_WIDTHS).optional(),
  align: z.enum(ALIGNMENTS).optional(),
  size: z.enum(TEXT_SIZES).optional(),
  leading: z.enum(LEADING).optional(),
  padding: z.enum(SPACE_SCALE).optional(),
  paddingX: z.enum(SPACE_SCALE).optional(),
  paddingY: z.enum(SPACE_SCALE).optional(),
  gap: z.enum(SPACE_SCALE).optional(),
  radius: z.enum(RADII).optional(),
  shadow: z.enum(SHADOWS).optional(),
  maxWidth: z.enum(MAX_WIDTHS).optional(),
});

export type Style = z.infer<typeof styleSchema>;

export type Breakpoint = 'tablet' | 'mobile';

/**
 * The two breakpoints a node may carry overrides for.
 *
 * Defined here rather than as Tailwind prefixes because the overrides are emitted
 * as a generated stylesheet — see `documentStyleSheet`. A prefix cannot be put in
 * front of a custom property: `md:font-size: var(--kl-size-lg)` is not a thing, so
 * the old `md:`-prefixed classes could never have carried a design system.
 */
export const BREAKPOINT_MEDIA: Record<Breakpoint, string> = {
  tablet: '(min-width: 768px)',
  mobile: '(max-width: 767px)',
};

// ---------------------------------------------------------------------------
// Node + document schema
// ---------------------------------------------------------------------------

export interface Node {
  id: string;
  type: NodeType;
  props: Record<string, unknown>;
  style?: Style;
  responsive?: Partial<Record<Breakpoint, Style>>;
  children?: Node[];
}

export const nodeSchema: z.ZodType<Node> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    type: z.enum(NODE_TYPES),
    props: z.record(z.string(), z.unknown()),
    style: styleSchema.optional(),
    responsive: z
      .object({ tablet: styleSchema.optional(), mobile: styleSchema.optional() })
      .optional(),
    children: z.array(nodeSchema).optional(),
  }),
);

export const documentSchema = z.object({
  schemaVersion: z.number().int().positive(),
  root: nodeSchema,
  tokens: z.record(z.string(), z.string()).optional(),
});

export type KleeLabDocument = z.infer<typeof documentSchema>;

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

let idCounter = 0;

export function newNodeId(type: NodeType): string {
  idCounter += 1;
  return `${type}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function createNode(
  type: NodeType,
  props: Record<string, unknown> = {},
  options: {
    style?: Style;
    responsive?: Partial<Record<Breakpoint, Style>>;
    children?: Node[];
  } = {},
): Node {
  const node: Node = { id: newNodeId(type), type, props };
  if (options.style) node.style = options.style;
  // Responsive overrides are declared where the design decision is made — in the
  // recipe — rather than by the renderer, which has no idea what a heading is for.
  if (options.responsive) node.responsive = options.responsive;
  if (options.children?.length) node.children = options.children;
  return node;
}

export function createDocument(title = 'Home'): KleeLabDocument {
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    root: createNode(
      'page',
      { title },
      {
        children: [
          createNode(
            'section',
            {},
            {
              style: { background: 'mint', paddingY: 'lg' },
              children: [
                createNode('heading', { text: title, level: 1 }),
                createNode('text', { text: 'Start building your page.' }),
                createNode('button', { label: 'Get started', href: '#' }),
              ],
            },
          ),
        ],
      },
    ),
  };
}

// ---------------------------------------------------------------------------
// Style -> CSS
// ---------------------------------------------------------------------------

/**
 * One style object, as CSS declarations.
 *
 * Every value a design system owns becomes a `var()` into the site's tokens: a
 * size is `--kl-size-xl`, a gap is `--kl-gap-md`, a corner is `--kl-radius-lg`.
 * The words a node uses have not changed; what they resolve to has, which is what
 * lets one set of values restyle every recipe at once without touching a recipe.
 *
 * Colours are the exception and stay literal, because a colour may be any CSS
 * value rather than one of a fixed set.
 */
export function styleDeclarations(style: Style | undefined): Record<string, string> {
  if (!style) return {};
  const declarations: Record<string, string> = {};

  const background = resolveColour(style.background);
  if (background) declarations.backgroundColor = background;
  const colour = resolveColour(style.color);
  if (colour) declarations.color = colour;
  const borderColour = resolveColour(style.borderColor);
  if (borderColour) declarations.borderColor = borderColour;

  if (style.align) declarations.textAlign = style.align;

  if (style.size) {
    // The line-height travels with the size unless a leading is named, because
    // setting a size and nothing else is how a design system produces cramped
    // headings at 5xl and loose ones at xs.
    declarations.fontSize = `var(--kl-size-${style.size})`;
    if (!style.leading) declarations.lineHeight = `var(--kl-size-${style.size}-lh)`;
  }
  if (style.leading) declarations.lineHeight = `var(--kl-leading-${style.leading})`;

  if (style.padding) declarations.padding = `var(--kl-space-${style.padding})`;
  if (style.paddingX) {
    declarations.paddingLeft = `var(--kl-space-${style.paddingX})`;
    declarations.paddingRight = `var(--kl-space-${style.paddingX})`;
  }
  if (style.paddingY) {
    declarations.paddingTop = `var(--kl-space-${style.paddingY})`;
    declarations.paddingBottom = `var(--kl-space-${style.paddingY})`;
  }
  if (style.gap) declarations.gap = `var(--kl-gap-${style.gap})`;
  if (style.radius) declarations.borderRadius = `var(--kl-radius-${style.radius})`;
  if (style.shadow) declarations.boxShadow = `var(--kl-shadow-${style.shadow})`;

  if (style.maxWidth) {
    declarations.maxWidth =
      style.maxWidth === 'full' ? 'none' : `var(--kl-measure-${style.maxWidth})`;
  }

  if (style.borderWidth && style.borderWidth !== 'none') {
    declarations.borderWidth = `var(--kl-border-${style.borderWidth})`;
    // The class this replaced brought its own style. Without it a node would get a
    // width and no line, which looks like the style being ignored.
    declarations.borderStyle = 'solid';
  }

  return declarations;
}

/**
 * A node's colours and design, as inline CSS.
 *
 * Renamed from `nodeColourStyle`, which is what it used to return. It now carries
 * the whole design system, and a name that says "colour" while emitting a font
 * size is the kind of small lie that makes a codebase hard to trust.
 */
export function nodeStyle(node: Node): Record<string, string> {
  return styleDeclarations(node.style);
}

/**
 * The classes a node needs, which is now only its identity.
 *
 * Every value a design system owns moved into `nodeStyle`, because a Tailwind
 * prefix cannot be put in front of a custom property. What remains is a hook for
 * the generated stylesheet to address: a CSS rule needs a selector, and the node
 * id is the only stable one.
 */
export function nodeClasses(node: Node): string {
  return `kl-n-${node.id}`;
}

/**
 * An id, safe to use in a selector.
 *
 * Ids are generated by `newNodeId` and are already alphanumeric with hyphens, but
 * a stored document is data and may hold anything. Escaping rather than skipping
 * matters: a node whose responsive override was silently dropped would look like
 * the override being ignored.
 */
function escapeClassSelector(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, (character) => `\\${character}`);
}

function declarationsToCss(declarations: Record<string, string>): string {
  return Object.entries(declarations)
    .map(
      ([property, value]) =>
        `${property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${value}`,
    )
    .join(';');
}

function eachNode(root: Node, visit: (node: Node) => void): void {
  visit(root);
  for (const child of root.children ?? []) eachNode(child, visit);
}

/**
 * The media queries a document's nodes need.
 *
 * Responsive overrides cannot be inline styles, so they become a stylesheet keyed
 * by node id. Nothing writes `node.responsive` today — the inspector that used to
 * was removed — so this is the mechanism waiting for the first thing that needs it
 * rather than one nothing can reach, which is what the prefixed classes had become.
 */
export function documentStyleSheet(document: KleeLabDocument): string {
  const rules: string[] = [];

  eachNode(document.root, (node) => {
    if (!node.responsive) return;
    for (const breakpoint of ['tablet', 'mobile'] as Breakpoint[]) {
      const override = node.responsive[breakpoint];
      if (!override) continue;
      const css = declarationsToCss(styleDeclarations(override));
      if (css) {
        rules.push(
          `@media ${BREAKPOINT_MEDIA[breakpoint]}{.kl-n-${escapeClassSelector(node.id)}{${css}}}`,
        );
      }
    }
  });

  return rules.join('');
}

// ---------------------------------------------------------------------------
// Legacy migration
// ---------------------------------------------------------------------------

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const strArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/**
 * Convert a legacy builder block into canonical nodes.
 * The old model (flat typed sections) is mapped onto the new tree.
 */
function nodesFromLegacyBlock(block: Record<string, unknown>): Node[] {
  const type = str(block.type, 'text');
  const title = str(block.title);
  const body = str(block.body);
  const cta = str(block.cta);
  const imageUrl = str(block.image_url);
  const items = strArray(block.items);

  const section = (style: Style, children: Node[]): Node =>
    createNode('section', {}, { style, children });

  switch (type) {
    case 'hero':
      return [
        section({ background: 'mint', paddingY: 'lg' }, [
          createNode('heading', { text: title, level: 1 }),
          ...(body ? [createNode('text', { text: body })] : []),
          ...(cta ? [createNode('button', { label: cta, href: '#' })] : []),
        ]),
      ];
    case 'image':
      return [
        section({}, [
          ...(imageUrl ? [createNode('image', { src: imageUrl, alt: title })] : []),
          ...(body ? [createNode('text', { text: body })] : []),
        ]),
      ];
    case 'features':
      return [
        section({}, [
          createNode('heading', { text: title, level: 2 }),
          ...(body ? [createNode('text', { text: body })] : []),
          createNode(
            'grid',
            { columns: Math.max(items.length, 1) },
            { style: { gap: 'md' }, children: items.map((item) => createNode('text', { text: item })) },
          ),
        ]),
      ];
    case 'testimonials':
      return [
        section({ background: 'canvas' }, [
          createNode('heading', { text: title || 'What people say', level: 2 }),
          ...(body ? [createNode('text', { text: body })] : []),
        ]),
      ];
    case 'contact':
      return [
        section({ background: 'ink', color: 'paper', paddingY: 'lg' }, [
          createNode('heading', { text: title || 'Get in touch', level: 2 }),
          ...(body ? [createNode('text', { text: body })] : []),
          createNode(
            'form',
            {
              fields: [
                { name: 'name', label: 'Name', type: 'text' },
                { name: 'email', label: 'Email', type: 'email' },
                { name: 'message', label: 'Message', type: 'textarea' },
              ],
            },
            { style: { gap: 'sm' } },
          ),
        ]),
      ];
    default:
      return [
        section({}, [
          ...(title ? [createNode('heading', { text: title, level: 2 })] : []),
          ...(body ? [createNode('text', { text: body })] : []),
        ]),
      ];
  }
}

/** Convert the old renderer's `sections` format into canonical nodes. */
function nodesFromLegacySection(section: Record<string, unknown>): Node[] {
  const type = str(section.type, 'text');
  const data = (section.data ?? {}) as Record<string, unknown>;
  const title = str(data.title);
  const subtitle = str(data.subtitle);
  const text = str(data.text) || str(data.html);

  if (type === 'hero') {
    return [
      createNode('section', {}, {
        style: { background: 'mint', paddingY: 'lg' },
        children: [
          ...(title ? [createNode('heading', { text: title, level: 1 })] : []),
          ...(subtitle ? [createNode('text', { text: subtitle })] : []),
        ],
      }),
    ];
  }

  if (type === 'gallery') {
    const images = strArray(data.images);
    return [
      createNode('section', {}, {
        style: { paddingY: 'md' },
        children: images.map((src) => createNode('image', { src, alt: '' })),
      }),
    ];
  }

  return [
    createNode('section', {}, {
      children: [
        ...(title ? [createNode('heading', { text: title, level: 2 })] : []),
        ...(text ? [createNode('text', { text })] : []),
      ],
    }),
  ];
}

/**
 * Build a document from any legacy page content.
 * Non-destructive: callers can keep serving the old shape while this is adopted.
 */
export function migrateLegacyContent(content: unknown, title = 'Home'): KleeLabDocument {
  const source = (content ?? {}) as Record<string, unknown>;

  // Already migrated.
  if (source.document && typeof source.document === 'object') {
    return source.document as KleeLabDocument;
  }

  let children: Node[] = [];

  if (Array.isArray(source.blocks)) {
    children = source.blocks.flatMap((block) =>
      nodesFromLegacyBlock((block ?? {}) as Record<string, unknown>),
    );
  } else if (Array.isArray(source.sections)) {
    children = source.sections.flatMap((section) =>
      nodesFromLegacySection((section ?? {}) as Record<string, unknown>),
    );
  }

  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    root: createNode('page', { title }, { children }),
  };
}

/**
 * Validate arbitrary content into a document, falling back to migrating legacy
 * shapes when it is not yet in the new format.
 */
export function parseDocument(content: unknown, title = 'Home'): KleeLabDocument {
  const direct = documentSchema.safeParse(content);
  if (direct.success) return direct.data;

  const wrapped = documentSchema.safeParse((content as Record<string, unknown> | null)?.document);
  if (wrapped.success) return wrapped.data;

  return migrateLegacyContent(content, title);
}
