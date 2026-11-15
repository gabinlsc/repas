import { z } from "zod";
import { recipeAllergens, recipeDiets } from "./dietary.js";
import { chooseCheapestPacks } from "./packs.js";
import { daysBetween, type PantryLot } from "./pantry.js";
import { add, div, mul, rat, roundToInt, toNumberForDisplay, type Rational } from "./rational.js";
import { seasonalityScore } from "./season.js";
import { recipeNutritionPerServing } from "./nutrition.js";
import type { Allergen, Diet, Ingredient, MealSlot } from "./types.js";
import { DIETS, EU_ALLERGENS, MEAL_SLOTS } from "./types.js";
import { toBase } from "./units.js";
import type { ListProduct } from "./shopping.js";

/*
 * Contrat versionné avec le service Python (POST /v1/plan). Les quantités transitent en
 * « centi-unités de base » entières (0,01 g, 0,01 ml, 0,01 pièce) : le solveur CP-SAT ne
 * manipule que des entiers, et ce pas est assez fin pour tous les usages culinaires.
 */
export const PLANNER_API_VERSION = "1";

const slot = z.enum(MEAL_SLOTS);
const allergen = z.enum(EU_ALLERGENS);
const diet = z.enum(DIETS);

export const weightsSchema = z.object({
  cost: z.number().int().min(0).max(10),
  diversity: z.number().int().min(0).max(10),
  pantry: z.number().int().min(0).max(10),
  seasonality: z.number().int().min(0).max(10),
  distinct_ingredients: z.number().int().min(0).max(10),
  nutrition: z.number().int().min(0).max(10),
  preferences: z.number().int().min(0).max(10),
});
export type PlanWeights = z.infer<typeof weightsSchema>;
export const DEFAULT_WEIGHTS: PlanWeights = { cost: 5, diversity: 5, pantry: 6, seasonality: 4, distinct_ingredients: 3, nutrition: 3, preferences: 5 };

export const planRequestSchema = z.object({
  version: z.literal(PLANNER_API_VERSION),
  seed: z.number().int().min(0).max(2_147_483_647),
  time_limit_s: z.number().int().min(1).max(60),
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  repeat_window_days: z.number().int().min(0).max(28),
  budget_cents: z.number().int().min(0).nullable(),
  equipment: z.array(z.string()),
  weights: weightsSchema,
  kcal_target_per_day: z.number().int().min(0).nullable(),
  members: z.array(z.object({ id: z.string(), allergens: z.array(allergen), diets: z.array(diet) })),
  days: z.array(
    z.object({
      day: z.number().int().min(0).max(13),
      max_prep_minutes: z.number().int().min(0),
      slots: z.array(
        z.object({
          slot,
          attendees: z.array(z.string()).min(1),
          servings_centi: z.number().int().min(1),
          locked_recipe_id: z.string().nullable(),
        }),
      ),
    }),
  ),
  recipes: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      total_minutes: z.number().int().min(0),
      equipment: z.array(z.string()),
      allergens: z.array(allergen),
      diets: z.array(diet),
      slots: z.array(slot),
      protein: z.string().nullable(),
      cuisine: z.string().nullable(),
      vegetables: z.array(z.string()),
      season_score: z.number().int().min(0).max(100),
      preference: z.number().int().min(-3).max(3),
      kcal_per_serving: z.number().int().min(0),
      leftover_days: z.number().int().min(0).max(7),
      freezes: z.boolean(),
      ingredients: z.array(z.object({ ingredient_id: z.string(), qty_per_serving_centi: z.number().int().min(0) })),
    }),
  ),
  ingredients: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      pack_size_centi: z.number().int().min(1).nullable(),
      pack_price_cents: z.number().int().min(0).nullable(),
      pantry: z.array(z.object({ qty_centi: z.number().int().min(0), expiry_day: z.number().int().nullable(), must_use: z.boolean() })),
    }),
  ),
});
export type PlanRequest = z.infer<typeof planRequestSchema>;

export const explanationSchema = z.object({ code: z.string(), params: z.record(z.string(), z.union([z.string(), z.number()])) });
export type Explanation = z.infer<typeof explanationSchema>;

export const planResponseSchema = z.object({
  version: z.literal(PLANNER_API_VERSION),
  status: z.enum(["optimal", "feasible", "infeasible", "invalid"]),
  deterministic: z.boolean(),
  wall_time_ms: z.number().int(),
  estimated_cost_cents: z.number().int().nullable(),
  score: z
    .object({
      objective: z.number().int(),
      cost_cents: z.number().int(),
      distinct_ingredients: z.number().int(),
      pantry_used_centi: z.number().int(),
      seasonality_avg: z.number(),
      distinct_proteins: z.number().int(),
      distinct_cuisines: z.number().int(),
      preference_total: z.number().int(),
      kcal_gap_per_day: z.number().int(),
    })
    .nullable(),
  meals: z.array(
    z.object({
      day: z.number().int(),
      slot,
      recipe_id: z.string(),
      servings_centi: z.number().int(),
      cook_big: z.boolean(),
      leftover_of: z.object({ day: z.number().int(), slot }).nullable(),
      explanations: z.array(explanationSchema),
    }),
  ),
  diagnostics: z.array(z.object({ code: z.string(), message: z.string(), params: z.record(z.string(), z.union([z.string(), z.number()])) })),
});
export type PlanResponse = z.infer<typeof planResponseSchema>;

/* ------------------------------------------------------------------ */
/* Construction du snapshot                                            */
/* ------------------------------------------------------------------ */

export interface SnapshotMember {
  readonly id: string;
  readonly portionFactor: Rational;
  readonly allergens: readonly Allergen[];
  readonly diets: readonly Diet[];
  readonly kcalTarget: number | null;
  readonly aversions: readonly string[];
}

export interface SnapshotRecipe {
  readonly id: string;
  readonly title: string;
  readonly prepMinutes: number;
  readonly cookMinutes: number;
  readonly equipment: readonly string[];
  readonly slots: readonly MealSlot[];
  readonly baseServings: number;
  readonly cuisine: string | null;
  readonly leftoverDays: number;
  readonly freezes: boolean;
  readonly rating: number | null;
  readonly favorite: boolean;
  readonly ingredients: ReadonlyArray<{ readonly ingredientId: string | null; readonly quantity: Rational | null; readonly unit: string | null; readonly optional: boolean; readonly fuzzy: boolean }>;
}

export interface SnapshotSlot {
  readonly day: number;
  readonly slot: MealSlot;
  readonly attendeeIds: readonly string[];
  readonly lockedRecipeId: string | null;
}

export interface SnapshotInput {
  readonly seed: number;
  readonly timeLimitS: number;
  readonly weekStart: string;
  readonly repeatWindowDays: number;
  readonly budgetCents: number | null;
  readonly equipment: readonly string[];
  readonly weights: PlanWeights;
  readonly members: readonly SnapshotMember[];
  readonly maxPrepMinutesByDay: readonly number[];
  readonly slots: readonly SnapshotSlot[];
  readonly recipes: readonly SnapshotRecipe[];
  readonly ingredients: ReadonlyMap<string, Ingredient>;
  readonly products: readonly ListProduct[];
  readonly pantry: readonly PantryLot[];
}

const centi = (r: Rational): number => Number(roundToInt(mul(r, rat(100)), "ceil"));

/**
 * Snapshot complet, sérialisable et reproductible : tout ce dont le solveur a besoin,
 * rien de personnel (identifiants opaques, pas de noms de membres).
 * Les allergènes et régimes des recettes sont recalculés ici par règles.
 */
export function buildPlanRequest(input: SnapshotInput): PlanRequest {
  const month = Number(input.weekStart.slice(5, 7));
  const usedIngredients = new Set<string>();
  const aversions = new Set(input.members.flatMap((m) => m.aversions));

  const recipes = input.recipes.flatMap((r) => {
    const resolved = r.ingredients.filter((i) => i.ingredientId && input.ingredients.has(i.ingredientId));
    // Un ingrédient non résolu peut cacher un allergène : la recette n'est pas planifiable.
    if (resolved.length !== r.ingredients.length) return [];
    const ings = resolved.map((i) => input.ingredients.get(i.ingredientId!)!);
    const perServing: Array<{ ingredient_id: string; qty_per_serving_centi: number }> = [];
    const seasonLines = [];
    for (const ri of resolved) {
      if (ri.optional || ri.fuzzy || !ri.quantity || !ri.unit) continue;
      const ing = input.ingredients.get(ri.ingredientId!)!;
      let q: Rational;
      try {
        const b = toBase(ri.quantity, ri.unit, ing);
        if (b.kind === "fuzzy") continue;
        q = b.quantity;
      } catch {
        continue;
      }
      perServing.push({ ingredient_id: ing.id, qty_per_serving_centi: centi(div(q, rat(r.baseServings))) });
      usedIngredients.add(ing.id);
      seasonLines.push({ seasonMonths: ing.seasonMonths, weight: q, isProduce: ing.aisle === "fruits_legumes" && ing.seasonMonths.length > 0 && ing.seasonMonths.length < 12 });
    }
    const nut = recipeNutritionPerServing(
      resolved.map((ri) => ({ ingredient: input.ingredients.get(ri.ingredientId!)!, quantity: ri.quantity, unit: ri.unit })),
      r.baseServings,
    );
    const proteins = [...new Set(ings.map((i) => i.proteinType).filter((p): p is string => p !== null))].sort();
    const hasAversion = ings.some((i) => aversions.has(i.id));
    const preference = Math.max(-3, Math.min(3, (r.favorite ? 2 : 0) + (r.rating !== null ? Math.round(r.rating) - 3 : 0) - (hasAversion ? 2 : 0)));
    return [
      {
        id: r.id,
        title: r.title,
        total_minutes: r.prepMinutes + r.cookMinutes,
        equipment: [...r.equipment],
        allergens: recipeAllergens(ings),
        diets: recipeDiets(ings),
        slots: [...r.slots],
        protein: proteins[0] ?? null,
        cuisine: r.cuisine,
        vegetables: [...new Set(ings.map((i) => i.vegetableType).filter((v): v is string => v !== null))].sort(),
        season_score: seasonalityScore(seasonLines, month),
        preference,
        kcal_per_serving: Math.round(toNumberForDisplay(nut.perServing.kcal)),
        leftover_days: r.leftoverDays,
        freezes: r.freezes,
        ingredients: perServing.sort((a, b) => a.ingredient_id.localeCompare(b.ingredient_id)),
      },
    ];
  });

  const ingredients = [...usedIngredients].sort().map((id) => {
    const ing = input.ingredients.get(id)!;
    const options = input.products.filter((p) => p.ingredientId === id && p.priceCents !== null);
    // Produit de référence : celui au meilleur prix unitaire (D-007).
    const ref = options
      .map((o) => ({ o, unit: div(rat(o.priceCents!), o.size) }))
      .sort((a, b) => (toNumberForDisplay(a.unit) - toNumberForDisplay(b.unit)) || a.o.productId.localeCompare(b.o.productId))[0];
    const sol = ref ? chooseCheapestPacks(ref.o.size, [ref.o]) : null;
    const lots = input.pantry.filter((l) => l.ingredientId === id);
    return {
      id,
      name: ing.name,
      pack_size_centi: ref ? centi(ref.o.size) : null,
      pack_price_cents: sol?.costCents ?? null,
      pantry: lots.map((l) => {
        const expiry = l.bestBefore && l.expiryKind === "dlc" ? daysBetween(input.weekStart, l.bestBefore) : null;
        return {
          qty_centi: Number(roundToInt(mul(l.quantity, rat(100)), "floor")),
          expiry_day: expiry,
          // À consommer obligatoirement : DLC dans l'horizon planifié et non dépassée.
          must_use: expiry !== null && expiry >= 0 && expiry < input.maxPrepMinutesByDay.length,
        };
      }),
    };
  });

  const memberById = new Map(input.members.map((m) => [m.id, m]));
  const days = input.maxPrepMinutesByDay.map((max, day) => ({
    day,
    max_prep_minutes: max,
    slots: input.slots
      .filter((s) => s.day === day)
      .map((s) => ({
        slot: s.slot,
        attendees: [...s.attendeeIds],
        servings_centi: Math.max(1, centi(s.attendeeIds.reduce((acc, id) => add(acc, memberById.get(id)?.portionFactor ?? rat(1)), rat(0)))),
        locked_recipe_id: s.lockedRecipeId,
      })),
  }));

  const kcalTargets = input.members.map((m) => m.kcalTarget).filter((k): k is number => k !== null);

  return planRequestSchema.parse({
    version: PLANNER_API_VERSION,
    seed: input.seed,
    time_limit_s: input.timeLimitS,
    week_start: input.weekStart,
    repeat_window_days: input.repeatWindowDays,
    budget_cents: input.budgetCents,
    equipment: [...input.equipment],
    weights: input.weights,
    kcal_target_per_day: kcalTargets.length ? kcalTargets.reduce((a, b) => a + b, 0) : null,
    members: input.members.map((m) => ({ id: m.id, allergens: [...m.allergens], diets: [...m.diets] })),
    days,
    recipes,
    ingredients,
  });
}

