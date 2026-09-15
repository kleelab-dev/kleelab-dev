import {
  DEFAULT_THEME,
  PRESET_THEMES,
  createDocument,
  type KleeLabDocument,
  type SiteTheme,
} from '@/lib/document';
import { buildSection, describeRecipe, getRecipe } from '@/lib/sections/kit';
import type { AiDesign, AiSectionSpec } from '@/types/api';

/**
 * Turning a brief and a page of copy into a document.
 *
 * This is where the two halves of the product meet: the model's *choices* become
 * the studio's *design*. Nothing here invents structure — every section goes
 * through `buildSection`, so a generated site is assembled from the same recipes
 * the assistant later draws on, and every change to it goes through the same
 * section builder, whether it arrived from a build or from a conversation.
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

/**
 * The document tokens a chosen design produces.
 *
 * Three things arrive together and end up in one flat map, because that map is how
 * the renderer already works: colour slots, design tokens such as a corner radius or
 * a shadow weight, and the two type faces. A site's whole appearance is therefore
 * one object, and changing it changes everything that references it.
 *
 * `webfonts` is a URL rather than a value, and is read separately by
 * `webFontHref`. It is ignored by the design whitelist on purpose — a design may set
 * colours and type, not arbitrary links.
 */
export function tokensFromDesign(design: AiDesign): Record<string, string> {
  return {
    ...design.tokens,
    ...design.colours,
    ...(design.fonts.display ? { 'font-display': design.fonts.display } : {}),
    ...(design.fonts.body ? { 'font-body': design.fonts.body } : {}),
    ...(design.fonts.href ? { webfonts: design.fonts.href } : {}),
  };
}

/**
 * Build one page's document.
 *
 * A design wins when the library had one; otherwise the older palette preset is
 * used, so a business the library has no product type for still gets a considered
 * starting point rather than the neutral default.
 */
export function buildPageDocument(
  sectionIds: string[],
  contentById: Record<string, unknown>,
  options: { title: string; palette?: string; design?: AiDesign | null },
): KleeLabDocument {
  const children = sectionIds.flatMap((id) => {
    const node = buildSection(id, contentById[id]);
    return node ? [node] : [];
  });

  const document = createDocument(options.title);
  document.tokens = options.design
    ? tokensFromDesign(options.design)
    : themeFromPalette(options.palette);

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
