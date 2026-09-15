import type { Node } from '@/lib/document';
import { CONTENT_RECIPES } from './recipes/content';
import { CONVERSION_RECIPES } from './recipes/conversion';
import { STRUCTURE_RECIPES } from './recipes/structure';
import {
  CATEGORY_LABELS,
  SECTION_CATEGORIES,
  type AnySectionRecipe,
  type RecipeContext,
  type SectionCategory,
} from './types';

/**
 * The catalogue, and the only sanctioned way to turn a recipe into nodes.
 *
 * Everything that builds a section goes through `buildSection`. That matters
 * because there are two callers with very different levels of trust: a person
 * dragging a block from the palette, and a language model returning JSON. Both
 * get the same treatment — content is parsed against the recipe's schema and
 * anything unusable falls back to the recipe's own defaults — so a malformed
 * response can produce a plain section but never a broken one.
 */

export const SECTION_KIT: AnySectionRecipe[] = [
  ...STRUCTURE_RECIPES,
  ...CONTENT_RECIPES,
  ...CONVERSION_RECIPES,
];

export const SECTION_KIT_BY_ID: Record<string, AnySectionRecipe> = Object.fromEntries(
  SECTION_KIT.map((recipe) => [recipe.id, recipe]),
);

/** Duplicate ids would silently shadow each other in the lookup above. */
const duplicateIds = SECTION_KIT.map((recipe) => recipe.id).filter(
  (id, index, all) => all.indexOf(id) !== index,
);
if (duplicateIds.length > 0) {
  throw new Error(`Section kit has duplicate recipe ids: ${duplicateIds.join(', ')}`);
}

export function getRecipe(id: string): AnySectionRecipe | undefined {
  return SECTION_KIT_BY_ID[id];
}

/**
 * The complete content object for a recipe, with every placeholder filled in.
 *
 * Derived from the schema rather than declared beside it: two lists that must
 * agree will eventually disagree, and the disagreement would show up as a
 * section rendering differently from the example the model was shown.
 */
export function recipeDefaults(recipe: AnySectionRecipe): Record<string, unknown> {
  return recipe.contentSchema.parse({});
}

/**
 * Build a recipe into a node, tolerating bad content.
 *
 * Returns `null` only when the recipe id is unknown, which is a caller bug
 * rather than bad data and should be visible.
 */
export function buildSection(
  recipeId: string,
  content?: unknown,
  context?: RecipeContext,
): Node | null {
  const recipe = getRecipe(recipeId);
  if (!recipe) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = recipe.contentSchema.parse(content ?? {});
  } catch {
    // Model output is untrusted and may be the wrong shape entirely. Falling
    // back to the schema's own defaults means a bad response degrades to generic
    // copy instead of failing the whole build.
    parsed = recipeDefaults(recipe);
  }

  return recipe.build(parsed as never, context);
}

/** Recipes grouped for the palette, in a deliberate reading order. */
export function recipesByCategory(): { category: SectionCategory; label: string; recipes: AnySectionRecipe[] }[] {
  return SECTION_CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    recipes: SECTION_KIT.filter((recipe) => recipe.category === category),
  })).filter((group) => group.recipes.length > 0);
}

export interface RecipeSummary {
  id: string;
  name: string;
  category: SectionCategory;
  description: string;
  tags: string[];
  /** Field names, so a model knows what it may fill in. */
  fields: string[];
  /** A filled-in example — the skeleton to write copy into. */
  example: Record<string, unknown>;
}

/**
 * A compact description of one recipe, for a language model's prompt.
 *
 * The example is doing the real work here. Showing the model a complete, valid
 * object it can write over is far more reliable than describing the shape in
 * prose, and because the example comes from the same schema that validates the
 * answer, the two cannot disagree.
 */
export function describeRecipe(recipe: AnySectionRecipe): RecipeSummary {
  const shape = (recipe.contentSchema as unknown as { shape?: Record<string, unknown> }).shape;
  return {
    id: recipe.id,
    name: recipe.name,
    category: recipe.category,
    description: recipe.description,
    tags: recipe.tags,
    fields: shape ? Object.keys(shape) : [],
    example: recipeDefaults(recipe),
  };
}

export function recipeSummaries(): RecipeSummary[] {
  return SECTION_KIT.map(describeRecipe);
}
