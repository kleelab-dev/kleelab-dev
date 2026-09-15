import type { z } from 'zod';
import type { Node } from '@/lib/document';

/**
 * The Section Kit.
 *
 * A recipe is a **designed section**: a heading and its spacing, a grid and its
 * gap, a card and its border — assembled by code, and therefore the same every
 * time. The only thing a recipe accepts from outside is *content*: the words, the
 * items, the links.
 *
 * That split is the whole point of the kit. It is what lets a language model
 * write a site without being asked to do layout, which is the thing it is worst
 * at and the reason AI-generated pages usually look amateur. The model chooses
 * *which* sections a business needs and writes what goes in them; the studio's
 * judgement about spacing, hierarchy and colour lives here, in code, where it can
 * be reviewed and fixed once for every site.
 *
 * Two rules keep recipes trustworthy:
 *
 * 1. **A recipe emits only existing node types.** No new renderer components, no
 *    registry changes, no inspector changes — the recipe is a starting tree, and
 *    once it is on the canvas it is an ordinary document that the user can take
 *    apart node by node.
 * 2. **A recipe with no content still renders something presentable.** If the
 *    model returns nonsense, or nothing, the recipe produces a coherent section
 *    rather than an empty band. A blank section is worse than generic copy.
 */

export const SECTION_CATEGORIES = [
  'navigation',
  'hero',
  'content',
  'proof',
  'conversion',
  'commerce',
  'footer',
] as const;

export type SectionCategory = (typeof SECTION_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<SectionCategory, string> = {
  navigation: 'Navigation',
  hero: 'Headers',
  content: 'Content',
  proof: 'Proof',
  conversion: 'Conversion',
  commerce: 'Shop',
  footer: 'Footers',
};

/**
 * Context a recipe may use at build time.
 *
 * Currently just the currency, for shop sections. Passed in rather than read from
 * a provider so `build` stays a pure function of its arguments — which is what
 * makes a recipe testable without rendering it.
 */
export interface RecipeContext {
  currency?: string;
}

/**
 * One designed section.
 *
 * `contentSchema` describes exactly what the model (or a human) may supply.
 * It is declared here, in TypeScript, and travels to the backend with the
 * request when the AI is involved. The server never keeps its own copy: a third
 * definition of the same contract would drift from this one, and this repository
 * has already paid for that lesson twice.
 */
export interface SectionRecipe<C = Record<string, unknown>> {
  /** Stable identifier. Appears in stored documents and in model responses. */
  id: string;
  name: string;
  category: SectionCategory;
  /** Words a model can match a brief against when choosing sections. */
  tags: string[];
  /** One line, shown in the palette and offered to the model as a description. */
  description: string;
  /**
   * What may be supplied, and its placeholder values.
   *
   * Every field carries a `.default(...)`, which buys two things at once:
   * `parse({})` yields a complete, presentable content object (so the recipe's
   * fallback is derived from the schema rather than kept beside it and left to
   * drift), and partially-correct model output fills its own gaps instead of
   * being discarded wholesale.
   */
  contentSchema: z.ZodType<C>;
  build: (content: C, context?: RecipeContext) => Node;
}

/**
 * Type-erased recipe, for holding a mixed catalogue.
 *
 * `SectionRecipe<unknown>` would make every `build` call a type error, so the
 * registry stores this shape and `defineRecipe` below does the narrowing once.
 */
export interface AnySectionRecipe {
  id: string;
  name: string;
  category: SectionCategory;
  tags: string[];
  description: string;
  contentSchema: z.ZodType<Record<string, unknown>>;
  build: (content: never, context?: RecipeContext) => Node;
}

/**
 * Declare a recipe while keeping its content type inferred.
 *
 * Written as an identity function with a single cast at the boundary. The
 * alternative — typing every recipe as `SectionRecipe<Record<string, unknown>>`
 * — would make `content.heading` unusable inside `build` and push casts into
 * every recipe instead of keeping the one here.
 */
export function defineRecipe<C>(recipe: SectionRecipe<C>): AnySectionRecipe {
  return recipe as unknown as AnySectionRecipe;
}
