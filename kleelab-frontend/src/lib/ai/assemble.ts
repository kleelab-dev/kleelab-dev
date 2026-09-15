import {
  DEFAULT_THEME,
  PRESET_THEMES,
  createDocument,
  type KleeLabDocument,
  type SiteTheme,
} from '@/lib/document';
import { buildSection, describeRecipe, getRecipe } from '@/lib/sections/kit';
import type { AiSectionSpec } from '@/types/api';

/**
 * Turning a brief and a page of copy into a document.
 *
 * This is where the two halves of the product meet: the model's *choices* become
 * the studio's *design*. Nothing here invents structure — every section goes
 * through `buildSection`, so a generated site is assembled from exactly the same
 * recipes a person can drag out of the palette, and is indistinguishable from one
 * they built by hand once it is on the canvas.
 *
 * It also means a failure is survivable. A section whose copy came back wrong, or
 * missing entirely, falls back to the recipe's own placeholder and still renders
 * as a coherent band. The worst case is a plainer site, never a broken one.
 */

/** The theme preset a palette name refers to, or the neutral default. */
export function themeFromPalette(name: string | undefined): SiteTheme {
  if (!name) return { ...DEFAULT_THEME };
  const preset = PRESET_THEMES.find(
    (candidate) => candidate.name.toLowerCase() === name.trim().toLowerCase(),
  );
  // An unrecognised name falls back to neutral rather than throwing: an
  // un-branded site is a recoverable outcome, a failed generation is not.
  return preset ? { ...preset.theme } : { ...DEFAULT_THEME };
}

/**
 * Describe sections to the server, using the kit.
 *
 * The example object is the schema. It is derived from the recipe's own zod
 * defaults, so the shape we show the model and the shape we validate its answer
 * against cannot drift apart.
 */
export function sectionSpecs(ids: string[]): AiSectionSpec[] {
  return ids.flatMap((id) => {
    const recipe = getRecipe(id);
    if (!recipe) return [];
    const summary = describeRecipe(recipe);
    return [
      {
        id,
        name: summary.name,
        description: summary.description,
        example: summary.example,
      },
    ];
  });
}

/** Section ids the kit cannot build, so a caller can report rather than guess. */
export function unknownSectionIds(ids: string[]): string[] {
  return ids.filter((id) => !getRecipe(id));
}

export function buildPageDocument(
  sectionIds: string[],
  contentById: Record<string, unknown>,
  options: { title: string; palette?: string },
): KleeLabDocument {
  const children = sectionIds.flatMap((id) => {
    const node = buildSection(id, contentById[id]);
    return node ? [node] : [];
  });

  const document = createDocument(options.title);
  document.tokens = themeFromPalette(options.palette);

  // If nothing survived, keep the factory document rather than shipping an empty
  // page: a blank canvas looks like the builder failed, and the customer has no
  // way to tell an empty page from a broken one.
  if (children.length > 0) {
    document.root.children = children;
  }

  return document;
}

/** Turn a content response into a lookup keyed by section id. */
export function contentById(
  sections: { id: string; content: Record<string, unknown> }[],
): Record<string, unknown> {
  return Object.fromEntries(sections.map((section) => [section.id, section.content]));
}
