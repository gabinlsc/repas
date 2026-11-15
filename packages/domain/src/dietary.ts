import type { Allergen, Diet, Ingredient, IngredientTrait } from "./types.js";
import { EU_ALLERGENS } from "./types.js";

type DietIng = Pick<Ingredient, "allergens" | "traits">;

/** Règle de compatibilité régime ↔ caractéristiques ; jamais déduite par un modèle. */
const DIET_FORBIDS: Readonly<Record<Diet, readonly IngredientTrait[]>> = {
  vegetarian: ["meat", "pork", "fish", "seafood", "gelatin"],
  vegan: ["meat", "pork", "fish", "seafood", "gelatin", "dairy", "lactose", "egg", "honey"],
  pescatarian: ["meat", "pork", "gelatin"],
  gluten_free: [],
  lactose_free: ["lactose"],
  pork_free: ["pork"],
  alcohol_free: ["alcohol"],
};

export function ingredientFitsDiet(ing: DietIng, diet: Diet): boolean {
  if (diet === "gluten_free" && ing.allergens.includes("gluten")) return false;
  return !DIET_FORBIDS[diet].some((t) => ing.traits.includes(t));
}

/**
 * Allergènes d'une recette = union des allergènes de tous ses ingrédients, y compris
 * optionnels : on ne parie pas sur le fait que le cuisinier omettra l'ingrédient.
 */
export function recipeAllergens(ingredients: readonly DietIng[]): Allergen[] {
  const set = new Set<Allergen>();
  for (const i of ingredients) for (const a of i.allergens) set.add(a);
  return EU_ALLERGENS.filter((a) => set.has(a));
}

export function recipeDiets(ingredients: readonly DietIng[]): Diet[] {
  const all: Diet[] = ["vegetarian", "vegan", "pescatarian", "gluten_free", "lactose_free", "pork_free", "alcohol_free"];
  return all.filter((d) => ingredients.every((i) => ingredientFitsDiet(i, d)));
}

export interface EaterConstraints {
  readonly allergens: readonly Allergen[];
  readonly diets: readonly Diet[];
}

/** Vrai si la recette est servable à tous les convives donnés. */
export function recipeIsSafeFor(recipe: { allergens: readonly Allergen[]; diets: readonly Diet[] }, eaters: readonly EaterConstraints[]): boolean {
  return eaters.every((e) => e.allergens.every((a) => !recipe.allergens.includes(a)) && e.diets.every((d) => recipe.diets.includes(d)));
}
