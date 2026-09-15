import {
  ALIGNMENTS,
  BORDER_WIDTHS,
  LEADING,
  MAX_WIDTHS,
  PRESET_THEMES,
  RADII,
  SHADOWS,
  SPACE_SCALE,
  TEXT_SIZES,
  THEME_SLOTS,
  isColourToken,
  type KleeLabDocument,
  type Node,
  type Style,
  type ThemeSlot,
} from '@/lib/document';
import { buildSection, getRecipe } from '@/lib/sections/kit';
import type { AiEditOperation } from '@/types/api';
import { TEXT_KEYS } from './outline';
import * as tree from './tree';

/**
 * Applying what the conversation asked for.
 *
 * The rule this file exists to enforce: **a change is either applied completely
 * or not at all, and what was not applied is reported.** There is no path here
 * that half-changes a node, and no path that quietly does nothing — a customer
 * who is told their heading was enlarged must be able to see that it was.
 *
 * Operations are applied in order to a working copy, so each one sees the result
 * of the last. Everything is validated against that copy rather than against the
 * outline the model was shown: if an earlier operation removed a section, a later
 * one naming it must fail, not resurrect it.
 */

const STYLE_VALUES: Record<string, readonly string[]> = {
  borderWidth: BORDER_WIDTHS,
  align: ALIGNMENTS,
  size: TEXT_SIZES,
  leading: LEADING,
  padding: SPACE_SCALE,
  paddingX: SPACE_SCALE,
  paddingY: SPACE_SCALE,
  gap: SPACE_SCALE,
  radius: RADII,
  shadow: SHADOWS,
  maxWidth: MAX_WIDTHS,
};

const COLOUR_STYLE_KEYS = ['background', 'color', 'borderColor'];

/** Named palettes, so "make it warmer" works without naming eight colours. */
const PALETTES: Record<string, Record<string, string>> = Object.fromEntries(
  PRESET_THEMES.map((preset) => [preset.name.toLowerCase(), preset.theme]),
);

export interface ApplyResult {
  document: KleeLabDocument;
  /** What actually changed, in the customer's words — the basis of the reply. */
  applied: string[];
  /** What could not be, and why. Never silent. */
  refused: string[];
}

export function applyOperations(
  document: KleeLabDocument,
  operations: AiEditOperation[],
  textKeys: Record<string, string>,
): ApplyResult {
  let working = document;
  const applied: string[] = [];
  const refused: string[] = [];

  for (const operation of operations) {
    const root = working.root;

    switch (operation.op) {
      case 'set_text': {
        const id = operation.node_id ?? '';
        const node = tree.findNode(root, id);
        const text = typeof operation.text === 'string' ? operation.text.trim() : '';
        if (!node) {
          refused.push('a text change aimed at a part of the page that no longer exists');
          break;
        }
        if (!text) {
          refused.push(`an empty text for ${describe(node)}`);
          break;
        }
        const key = textKeyFor(node, textKeys);
        if (!key) {
          refused.push(`a text change on ${describe(node)}, which holds no text`);
          break;
        }
        working = withTree(working, (current) =>
          tree.updateNode(current, id, (target) => ({
            ...target,
            props: { ...target.props, [key]: text },
          })),
        );
        applied.push(`changed the text of ${describe(node)}`);
        break;
      }

      case 'set_style': {
        const id = operation.node_id ?? '';
        const node = tree.findNode(root, id);
        if (!node) {
          refused.push('a style change aimed at a part of the page that no longer exists');
          break;
        }
        const { clean, dropped } = cleanStyle(operation.style);
        if (Object.keys(clean).length === 0) {
          refused.push(`a style change on ${describe(node)} that named no usable value`);
          break;
        }
        if (dropped.length > 0) refused.push(`the style values ${dropped.join(', ')}`);
        working = withTree(working, (current) =>
          tree.updateNode(current, id, (target) => ({
            ...target,
            style: { ...target.style, ...clean },
          })),
        );
        applied.push(`restyled ${describe(node)}`);
        break;
      }

      case 'set_theme': {
        const slot = (operation.slot ?? '').trim().toLowerCase();
        const colour = (operation.colour ?? '').trim();
        const palette = PALETTES[slot];
        if (palette) {
          working = { ...working, tokens: { ...(working.tokens ?? {}), ...palette } };
          applied.push(`switched the colour scheme to ${slot}`);
          break;
        }
        if (!(THEME_SLOTS as readonly string[]).includes(slot)) {
          refused.push(`a colour scheme name "${slot}", which is not one I can set`);
          break;
        }
        if (!isColourToken(colour)) {
          refused.push(`the colour "${colour}", which I could not read`);
          break;
        }
        working = {
          ...working,
          tokens: { ...(working.tokens ?? {}), [slot as ThemeSlot]: colour },
        };
        applied.push(`changed the ${slot} colour to ${colour}`);
        break;
      }

      case 'set_image': {
        const id = operation.node_id ?? '';
        const node = tree.findNode(root, id);
        const src = (operation.src ?? '').trim();
        if (!node || node.type !== 'image') {
          refused.push('a picture change aimed at something that is not a picture');
          break;
        }
        if (!/^(https?:\/\/|data:image\/|\/)/i.test(src)) {
          refused.push(`the picture address "${src}", which is not a usable link`);
          break;
        }
        const alt = (operation.alt ?? '').trim();
        working = withTree(working, (current) =>
          tree.updateNode(current, id, (target) => ({
            ...target,
            props: { ...target.props, src, ...(alt ? { alt } : {}) },
          })),
        );
        applied.push('changed a picture');
        break;
      }

      case 'replace_section':
      case 'add_section': {
        const sectionId = operation.section_id ?? '';
        const recipe = getRecipe(sectionId);
        if (!recipe) {
          refused.push(`a section called "${sectionId}", which the kit does not have`);
          break;
        }
        const built = buildSection(sectionId, operation.content);
        if (!built) {
          refused.push(`the section "${sectionId}"`);
          break;
        }

        if (operation.op === 'replace_section') {
          const id = operation.node_id ?? '';
          const node = tree.findNode(root, id);
          if (!node) {
            refused.push('a rewrite of a part of the page that no longer exists');
            break;
          }
          // The replacement keeps the old id. Ids are how the conversation
          // refers to things, so a rewrite that renumbered itself would make
          // every later turn — and the undo history — point at nothing.
          const replacement: Node = { ...built, id: node.id };
          working = withTree(working, (current) =>
            tree.updateNode(current, id, () => replacement),
          );
          applied.push(`rebuilt ${describe(node)} as ${recipe.name}`);
          break;
        }

        const anchorId = operation.after_node_id ?? '';
        const anchor = tree.findNode(root, anchorId);
        if (!anchor) {
          refused.push('a new section with nowhere to go');
          break;
        }
        if (anchor.id === root.id) {
          // After the page node means the top of the page.
          const first = (root.children ?? [])[0];
          const at = first ? (root.children ?? []).findIndex((child) => child.id === first.id) : 0;
          working = withTree(working, (current) => tree.insertNode(current, root.id, at, built));
        } else {
          const parent = tree.findParent(root, anchor.id);
          if (!parent) {
            refused.push('a new section with nowhere to go');
            break;
          }
          const index = (parent.children ?? []).findIndex((child) => child.id === anchor.id) + 1;
          working = withTree(working, (current) =>
            tree.insertNode(current, parent.id, index, built),
          );
        }
        applied.push(`added ${recipe.name}`);
        break;
      }

      case 'remove_section': {
        const id = operation.node_id ?? '';
        const node = tree.findNode(root, id);
        if (!node || node.id === root.id) {
          refused.push('a request to delete the whole page');
          break;
        }
        const remaining = (root.children ?? []).length - 1;
        if (remaining < 1) {
          refused.push('a request to delete the last section on the page');
          break;
        }
        working = withTree(working, (current) => tree.removeNode(current, id).root);
        applied.push(`removed ${describe(node)}`);
        break;
      }

      case 'move_section': {
        const id = operation.node_id ?? '';
        const anchorId = operation.after_node_id ?? '';
        const node = tree.findNode(root, id);
        const anchor = tree.findNode(root, anchorId);
        if (!node || !anchor) {
          refused.push('a move between parts of the page that no longer exist');
          break;
        }
        if (node.id === anchor.id) {
          refused.push('a section moved to where it already is');
          break;
        }
        if (tree.canHaveChildren(node.type) && tree.isSelfOrDescendant(node, anchorId)) {
          refused.push('a section moved inside itself, which would delete it');
          break;
        }
        const parent = tree.findParent(root, anchor.id);
        if (!parent) {
          refused.push('a section moved to the top of the page, which is not allowed');
          break;
        }
        const index = (parent.children ?? []).findIndex((child) => child.id === anchor.id) + 1;
        // Moving within one container shifts the target index once the node is
        // lifted out, so compensate — the same correction the drag handle needed.
        const currentParent = tree.findParent(root, id);
        const adjusted =
          currentParent?.id === parent.id &&
          (currentParent.children ?? []).findIndex((child) => child.id === id) < index
            ? index - 1
            : index;
        working = withTree(working, (current) =>
          tree.moveNode(current, id, parent.id, adjusted),
        );
        applied.push(`moved ${describe(node)}`);
        break;
      }
    }
  }

  return { document: working, applied, refused };
}

/**
 * Which prop to write a node's copy into.
 *
 * Prefers the key recorded when the outline was built — that is the field the
 * model was actually shown — and falls back to the first text prop present, which
 * covers a node created earlier in the same batch.
 */
function textKeyFor(node: Node, textKeys: Record<string, string>): string | null {
  // The page node's text props are the document's name, not anything a visitor
  // reads. Writing one would look like a successful change and be invisible.
  if (node.type === 'page') return null;
  const recorded = textKeys[node.id];
  if (recorded && typeof node.props?.[recorded] === 'string') return recorded;
  for (const key of TEXT_KEYS) {
    if (typeof node.props?.[key] === 'string') return key;
  }
  return null;
}

/** Keep the style values that are real, name the rest. */
function cleanStyle(style: unknown): { clean: Style; dropped: string[] } {
  const clean: Record<string, string> = {};
  const dropped: string[] = [];
  if (!style || typeof style !== 'object') return { clean: {}, dropped };

  for (const [key, value] of Object.entries(style as Record<string, unknown>)) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) continue;

    if (COLOUR_STYLE_KEYS.includes(key)) {
      if (isColourToken(text)) clean[key] = text;
      else dropped.push(`${key}=${text}`);
      continue;
    }

    const allowed = STYLE_VALUES[key];
    if (!allowed) {
      dropped.push(key);
      continue;
    }
    if (allowed.includes(text)) clean[key] = text;
    else dropped.push(`${key}=${text}`);
  }

  return { clean: clean as Style, dropped };
}

function withTree(
  document: KleeLabDocument,
  mutate: (root: Node) => Node,
): KleeLabDocument {
  const root = mutate(document.root);
  return root === document.root ? document : { ...document, root };
}

/** A short, human name for a node, for the reply and the refusal list. */
function describe(node: Node): string {
  for (const key of TEXT_KEYS) {
    const value = node.props?.[key];
    if (typeof value === 'string' && value.trim()) {
      return `“${value.trim().slice(0, 40)}”`;
    }
  }
  return node.type === 'image' ? 'the picture' : `the ${node.type}`;
}
