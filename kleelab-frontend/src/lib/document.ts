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
export const BACKGROUND_TONES = ['default', 'paper', 'canvas', 'ink', 'mint', 'accent'] as const;
export const TEXT_TONES = ['ink', 'muted', 'paper', 'accent'] as const;
export const ALIGNMENTS = ['left', 'center', 'right'] as const;
export const TEXT_SIZES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'] as const;
export const RADII = ['none', 'sm', 'md', 'lg', 'full'] as const;
export const SHADOWS = ['none', 'sm', 'md', 'lg'] as const;
export const MAX_WIDTHS = ['sm', 'md', 'lg', 'xl', 'full'] as const;

export const styleSchema = z.object({
  background: z.enum(BACKGROUND_TONES).optional(),
  color: z.enum(TEXT_TONES).optional(),
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

const BACKGROUND_CLASSES: Record<(typeof BACKGROUND_TONES)[number], string> = {
  default: '',
  paper: 'bg-paper',
  canvas: 'bg-canvas',
  ink: 'bg-ink',
  mint: 'bg-mint',
  accent: 'bg-accent',
};

const TEXT_TONE_CLASSES: Record<(typeof TEXT_TONES)[number], string> = {
  ink: 'text-ink',
  muted: 'text-muted',
  paper: 'text-paper',
  accent: 'text-accent',
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

/** Translate a style object into Tailwind classes, optionally breakpoint-prefixed. */
export function styleClasses(style: Style | undefined, prefix = ''): string {
  if (!style) return '';
  const classes: string[] = [];
  const push = (value: string | undefined) => {
    if (value) classes.push(`${prefix}${value}`);
  };

  if (style.background) push(BACKGROUND_CLASSES[style.background]);
  if (style.color) push(TEXT_TONE_CLASSES[style.color]);
  if (style.align) push(ALIGN_CLASSES[style.align]);
  if (style.size) push(SIZE_CLASSES[style.size]);
  if (style.padding) push(PADDING_CLASSES[style.padding]);
  if (style.paddingX) push(PADDING_X_CLASSES[style.paddingX]);
  if (style.paddingY) push(PADDING_Y_CLASSES[style.paddingY]);
  if (style.gap) push(GAP_CLASSES[style.gap]);
  if (style.radius) push(RADIUS_CLASSES[style.radius]);
  if (style.shadow) push(SHADOW_CLASSES[style.shadow]);
  if (style.maxWidth) push(MAX_WIDTH_CLASSES[style.maxWidth]);

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
