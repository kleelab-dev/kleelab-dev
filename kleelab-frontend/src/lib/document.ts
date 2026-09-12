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
export const TEXT_SIZES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'] as const;
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

/** CSS custom properties for a theme, to be set on the document root. */
export function themeVariables(tokens: Record<string, string> | undefined): Record<string, string> {
  const theme = resolveTheme(tokens);
  return Object.fromEntries(THEME_SLOTS.map((slot) => [`--kl-${slot}`, theme[slot]]));
}

/** The style a node's colour choices produce. */
export function nodeColourStyle(node: Node): Record<string, string> {
  const style: Record<string, string> = {};
  const background = resolveColour(node.style?.background as string | undefined);
  const colour = resolveColour(node.style?.color as string | undefined);
  const borderColour = resolveColour(node.style?.borderColor as string | undefined);
  if (background) style.backgroundColor = background;
  if (colour) style.color = colour;
  if (borderColour) style.borderColor = borderColour;
  return style;
}

export const styleSchema = z.object({
  // Free-form: a theme slot name, a hex value, or any CSS colour function.
  background: z.string().optional(),
  color: z.string().optional(),
  borderColor: z.string().optional(),
  borderWidth: z.enum(BORDER_WIDTHS).optional(),
  align: z.enum(ALIGNMENTS).optional(),
  size: z.enum(TEXT_SIZES).optional(),
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

/** Desktop-first: base styles apply everywhere, plus min/max-width overrides. */
export const RESPONSIVE_PREFIX: Record<Breakpoint, string> = {
  tablet: 'md:',
  mobile: 'max-md:',
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
  options: { style?: Style; children?: Node[] } = {},
): Node {
  const node: Node = { id: newNodeId(type), type, props };
  if (options.style) node.style = options.style;
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
// Style -> Tailwind classes
// ---------------------------------------------------------------------------

const BORDER_WIDTH_CLASSES: Record<(typeof BORDER_WIDTHS)[number], string> = {
  none: '',
  thin: 'border',
  medium: 'border-2',
  thick: 'border-4',
};

const ALIGN_CLASSES: Record<(typeof ALIGNMENTS)[number], string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

const SIZE_CLASSES: Record<(typeof TEXT_SIZES)[number], string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
  '4xl': 'text-4xl',
};

const PADDING_CLASSES: Record<(typeof SPACE_SCALE)[number], string> = {
  none: 'p-0',
  xs: 'p-2',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-10',
  xl: 'p-16',
};

const PADDING_X_CLASSES: Record<(typeof SPACE_SCALE)[number], string> = {
  none: 'px-0',
  xs: 'px-2',
  sm: 'px-4',
  md: 'px-6',
  lg: 'px-10',
  xl: 'px-16',
};

const PADDING_Y_CLASSES: Record<(typeof SPACE_SCALE)[number], string> = {
  none: 'py-0',
  xs: 'py-2',
  sm: 'py-4',
  md: 'py-6',
  lg: 'py-10',
  xl: 'py-16',
};

const GAP_CLASSES: Record<(typeof SPACE_SCALE)[number], string> = {
  none: 'gap-0',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-10',
};

const RADIUS_CLASSES: Record<(typeof RADII)[number], string> = {
  none: 'rounded-none',
  sm: 'rounded',
  md: 'rounded-lg',
  lg: 'rounded-2xl',
  full: 'rounded-full',
};

const SHADOW_CLASSES: Record<(typeof SHADOWS)[number], string> = {
  none: '',
  sm: 'shadow-sm',
  md: 'shadow',
  lg: 'shadow-xl',
};

const MAX_WIDTH_CLASSES: Record<(typeof MAX_WIDTHS)[number], string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-4xl',
  full: 'max-w-none',
};

/**
 * Translate a style object into Tailwind classes, optionally breakpoint-prefixed.
 *
 * Colours are deliberately absent: they can be any CSS value now, so they are
 * emitted as inline styles by `nodeColourStyle` instead of being constrained to
 * a fixed set of brand classes.
 */
export function styleClasses(style: Style | undefined, prefix = ''): string {
  if (!style) return '';
  const classes: string[] = [];
  const push = (value: string | undefined) => {
    if (value) classes.push(`${prefix}${value}`);
  };

  if (style.align) push(ALIGN_CLASSES[style.align]);
  if (style.size) push(SIZE_CLASSES[style.size]);
  if (style.padding) push(PADDING_CLASSES[style.padding]);
  if (style.paddingX) push(PADDING_X_CLASSES[style.paddingX]);
  if (style.paddingY) push(PADDING_Y_CLASSES[style.paddingY]);
  if (style.gap) push(GAP_CLASSES[style.gap]);
  if (style.radius) push(RADIUS_CLASSES[style.radius]);
  if (style.shadow) push(SHADOW_CLASSES[style.shadow]);
  if (style.maxWidth) push(MAX_WIDTH_CLASSES[style.maxWidth]);
  if (style.borderWidth) push(BORDER_WIDTH_CLASSES[style.borderWidth]);

  return classes.filter(Boolean).join(' ');
}

/** All Tailwind classes for a node: base style plus per-breakpoint overrides. */
export function nodeClasses(node: Node): string {
  const parts = [styleClasses(node.style)];
  if (node.responsive?.tablet) parts.push(styleClasses(node.responsive.tablet, RESPONSIVE_PREFIX.tablet));
  if (node.responsive?.mobile) parts.push(styleClasses(node.responsive.mobile, RESPONSIVE_PREFIX.mobile));
  return parts.filter(Boolean).join(' ');
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
