import { createNode, type Node, type NodeType, type Style } from '@/lib/document';

/** Palette entries: what a user can drag onto the canvas. */

export type PaletteEntry = {
  type: NodeType;
  label: string;
  hint: string;
  props: Record<string, unknown>;
  style?: Style;
};

export const PALETTE: PaletteEntry[] = [
  { type: 'section', label: 'Section', hint: 'Full-width band', props: {}, style: { paddingY: 'lg' } },
  { type: 'container', label: 'Container', hint: 'Centred content wrapper', props: {} },
  { type: 'grid', label: 'Columns', hint: 'Side-by-side layout', props: { columns: 2 }, style: { gap: 'md' } },
  { type: 'heading', label: 'Heading', hint: 'Section title', props: { text: 'Heading', level: 2 } },
  { type: 'text', label: 'Text', hint: 'A paragraph', props: { text: 'Write something here.' } },
  { type: 'image', label: 'Image', hint: 'Picture with alt text', props: { src: '', alt: '' } },
  { type: 'button', label: 'Button', hint: 'Call to action', props: { label: 'Get started', href: '#' } },
  { type: 'list', label: 'List', hint: 'Bulleted or numbered', props: { items: ['First point', 'Second point'] } },
  { type: 'form', label: 'Form', hint: 'Contact fields', props: { fields: [
    { name: 'name', label: 'Name', type: 'text' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'message', label: 'Message', type: 'textarea' },
  ] } },
  { type: 'divider', label: 'Divider', hint: 'Horizontal rule', props: {} },
  { type: 'spacer', label: 'Spacer', hint: 'Vertical breathing room', props: { size: 'md' } },
  { type: 'nav', label: 'Navbar', hint: 'Brand and links', props: { brand: 'KleeLab', links: [
    { label: 'Home', href: '#' },
    { label: 'About', href: '#' },
  ] } },
  { type: 'footer', label: 'Footer', hint: 'Closing line', props: { text: '© KleeLab' } },
];

export const PALETTE_BY_TYPE: Record<string, PaletteEntry> = Object.fromEntries(
  PALETTE.map((entry) => [entry.type, entry]),
);

export function nodeFromPalette(type: NodeType): Node {
  const entry = PALETTE_BY_TYPE[type];
  if (!entry) return createNode(type, {});
  return createNode(type, { ...entry.props }, { style: entry.style ? { ...entry.style } : undefined });
}

/** Human label for a node, used in the canvas and outline. */
export function nodeLabel(node: Node): string {
  const entry = PALETTE_BY_TYPE[node.type];
  const text = node.props.text ?? node.props.label ?? node.props.brand;
  if (typeof text === 'string' && text.trim()) return text.trim().slice(0, 40);
  return entry?.label ?? node.type;
}
