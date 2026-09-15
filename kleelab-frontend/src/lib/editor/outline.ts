import {
  ALIGNMENTS,
  BORDER_WIDTHS,
  MAX_WIDTHS,
  RADII,
  SHADOWS,
  SPACE_SCALE,
  TEXT_SIZES,
  THEME_SLOTS,
  type Node,
} from '@/lib/document';
import { recipeSummaries } from '@/lib/sections/kit';
import type { AiOutlineNode, AiSectionSpec } from '@/types/api';

/**
 * The page, described to the model.
 *
 * The conversation works because the model is given exactly two things: the ids
 * it may aim at, and the values it may use. Everything it might otherwise invent
 * — a node id, a style token, a colour slot, a section id — is listed here from
 * the code that defines it, so a wrong answer is recognisable as wrong.
 *
 * Two rules follow from that, and both are load-bearing:
 *
 * 1. **The id list is the whitelist.** An operation naming anything else is
 *    discarded before it is applied. Nothing here is advisory.
 * 2. **Every list is derived, never restated.** The style tokens come from the
 *    same constants the renderer reads, and the catalogue from the recipes
 *    themselves. A copy kept beside them would be a second answer to "what is
 *    allowed", and this repository has already fixed that class of bug three
 *    times.
 */

/**
 * Props that hold a single piece of copy, in the order they are looked up.
 *
 * These are the string props the renderer actually reads (`text`, `label`,
 * `brand`, `html`, `alt`) plus the ones the recipes write (`heading`,
 * `subheading`, `body`, `title`, `quote`, `price`). `alt` is deliberately absent:
 * a picture's alt text belongs to `set_image`, and offering it here as well would
 * give one field two owners.
 */
export const TEXT_KEYS = [
  'heading',
  'subheading',
  'title',
  'subtitle',
  'text',
  'body',
  'label',
  'quote',
  'price',
  'brand',
  'html',
] as const;

/** Container types that read as a named region of the page to a person. */
const REGIONS = new Set(['section', 'footer', 'nav']);

/**
 * Types whose text props are metadata rather than copy.
 *
 * The page node holds `props.title`, which is the document's name and is not
 * rendered anywhere. Offering it as text the assistant may rewrite would let it
 * report "I changed the heading" while the page stayed exactly as it was — a
 * refusal is more honest, and the page's own name is changed in site settings.
 */
const METADATA_TEXT_TYPES = new Set(['page']);

export interface Outline {
  /** The flat list sent to the model. */
  nodes: AiOutlineNode[];
  /**
   * Which prop holds each node's copy.
   *
   * The model says "change the text of `h-3`"; it does not say which prop to
   * write to, and it should not have to. This map is how the client knows, and
   * keeping it out of the wire format means the model can never pick the wrong
   * key and blank a field instead of filling it.
   */
  textKeys: Record<string, string>;
}

/** Deepest text in a subtree, for naming a region by what it says. */
function firstText(node: Node, depth = 0): string {
  const own = textOf(node);
  if (own) return own;
  if (depth > 2) return '';
  for (const child of node.children ?? []) {
    const found = firstText(child, depth + 1);
    if (found) return found;
  }
  return '';
}

function textOf(node: Node): string {
  for (const key of TEXT_KEYS) {
    const value = node.props?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function regionName(node: Node): string {
  const own = firstText(node);
  const noun = node.type === 'page' ? 'Page' : node.type === 'footer' ? 'Footer' : node.type === 'nav' ? 'Menu' : 'Section';
  return own ? `${noun}: ${own.slice(0, 60)}` : noun;
}

/**
 * Walk the document into the flat outline the model is shown.
 *
 * Nodes are listed in reading order, and each one carries the region it belongs
 * to. Without that, "make the heading bigger" is ambiguous on any page with more
 * than one heading, and the model would have to guess from ids — which it cannot
 * read.
 */
export function buildOutline(root: Node): Outline {
  const nodes: AiOutlineNode[] = [];
  const textKeys: Record<string, string> = {};

  const walk = (node: Node, region: string) => {
    const isRegion = REGIONS.has(node.type);
    const own = node.type === 'page' ? regionName(node) : region;

    for (const key of TEXT_KEYS) {
      const value = node.props?.[key];
      if (typeof value === 'string' && value.trim() && !METADATA_TEXT_TYPES.has(node.type)) {
        textKeys[node.id] = key;
        break;
      }
    }

    const label = isRegion
      ? regionName(node)
      : own
        ? `in ${own}`
        : node.type;

    nodes.push({
      id: node.id,
      type: node.type,
      label,
      text: METADATA_TEXT_TYPES.has(node.type) ? '' : textOf(node).slice(0, 140),
    });

    const nextRegion = isRegion ? regionName(node) : own;
    for (const child of node.children ?? []) walk(child, nextRegion);
  };

  walk(root, '');
  return { nodes, textKeys };
}

/** Every style key and the values it accepts, taken from the document model. */
export function styleTokens(): Record<string, string[]> {
  return {
    background: [...THEME_SLOTS],
    color: [...THEME_SLOTS],
    borderColor: [...THEME_SLOTS],
    borderWidth: [...BORDER_WIDTHS],
    align: [...ALIGNMENTS],
    size: [...TEXT_SIZES],
    padding: [...SPACE_SCALE],
    paddingX: [...SPACE_SCALE],
    paddingY: [...SPACE_SCALE],
    gap: [...SPACE_SCALE],
    radius: [...RADII],
    shadow: [...SHADOWS],
    maxWidth: [...MAX_WIDTHS],
  };
}

/**
 * The catalogue in the shape `/api/ai/edit` expects.
 *
 * The example object is the important part: `replace_section` and `add_section`
 * carry a whole section's content, and showing the model a complete valid object
 * to write over is far more reliable than describing the shape in prose. It comes
 * from the same schema that validates the answer, so the two cannot disagree.
 */
export function sectionCatalogue(): AiSectionSpec[] {
  return recipeSummaries().map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    description: recipe.description,
    example: recipe.example,
  }));
}

/** The names of the whole-site palettes, for "make it warmer". */
export const PALETTE_NAMES = ['neutral', 'warm', 'ocean', 'forest', 'plum', 'dark'] as const;
