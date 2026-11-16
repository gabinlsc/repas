import { add, div, mul, rat, toNumberForDisplay, ZERO, type Rational } from "./rational.js";
import type { Ingredient, Nutrition100g } from "./types.js";
import { baseToGrams, toBase } from "./units.js";

export const EMPTY_NUTRITION: Nutrition100g = { kcal: ZERO, protein: ZERO, carbs: ZERO, fat: ZERO, fiber: ZERO, sugar: ZERO, salt: ZERO };

const KEYS = ["kcal", "protein", "carbs", "fat", "fiber", "sugar", "salt"] as const;

export function addNutrition(a: Nutrition100g, b: Nutrition100g): Nutrition100g {
  return Object.fromEntries(KEYS.map((k) => [k, add(a[k], b[k])])) as unknown as Nutrition100g;
}
export function scaleNutrition(a: Nutrition100g, f: Rational): Nutrition100g {
  return Object.fromEntries(KEYS.map((k) => [k, mul(a[k], f)])) as unknown as Nutrition100g;
}

type NutIng = Pick<Ingredient, "id" | "baseUnit" | "densityGPerMl" | "pieceWeightG" | "conversions" | "nutrition">;

export interface NutritionLine {
  readonly ingredient: NutIng;
  readonly quantity: Rational | null;
  readonly unit: string | null;
}

/**
 * Nutrition par portion : somme(grammes × valeurs/100 g) / portions de base. Les lignes
 * floues ou sans données sont ignorées et comptées dans `missing` (transparence).
 */
export function recipeNutritionPerServing(lines: readonly NutritionLine[], baseServings: number): { perServing: Nutrition100g; missing: number } {
  let total = EMPTY_NUTRITION;
  let missing = 0;
  for (const l of lines) {
    if (!l.quantity || !l.unit || !l.ingredient.nutrition) {
      if (l.quantity) missing++;
      continue;
    }
    try {
      const b = toBase(l.quantity, l.unit, l.ingredient);
      if (b.kind === "fuzzy") continue;
      const g = baseToGrams(b.quantity, l.ingredient);
      if (!g) {
        missing++;
        continue;
      }
      total = addNutrition(total, scaleNutrition(l.ingredient.nutrition, div(g, rat(100))));
    } catch {
      missing++; // conversion impossible : on n'invente pas de valeur
    }
  }
  return { perServing: scaleNutrition(total, rat(1, baseServings)), missing };
}

export interface WeeklyNutritionInput {
  readonly days: number;
  /** somme des facteurs de portion (un enfant à 0,5 compte pour une demi-personne). */
  readonly people: Rational;
  readonly total: Nutrition100g;
  readonly distinctVegetables: number;
  readonly kcalTargetPerPersonDay: number;
}

export interface WeeklyNutritionScore {
  readonly score: number;
  readonly kcalPerPersonDay: number;
  readonly fiberPerPersonDay: number;
  readonly proteinPerPersonDay: number;
  readonly distinctVegetables: number;
  readonly alerts: readonly string[];
}

/**
 * Score hebdomadaire indicatif (0–100) : écart à la cible énergétique, fibres (repère
 * 30 g/j), protéines (≥ 50 g/j), diversité des légumes (≥ 10 variétés/semaine).
 * Il éclaire, il ne prescrit pas : pas de conseil médical.
 */
export function weeklyNutritionScore(i: WeeklyNutritionInput): WeeklyNutritionScore {
  const raw = mul(rat(Math.max(1, i.days)), i.people);
  const denom = raw.n > 0n ? raw : rat(1);
  const kcal = toNumberForDisplay(div(i.total.kcal, denom));
  const fiber = toNumberForDisplay(div(i.total.fiber, denom));
  const protein = toNumberForDisplay(div(i.total.protein, denom));
  const alerts: string[] = [];
  const kcalRatio = i.kcalTargetPerPersonDay > 0 ? kcal / i.kcalTargetPerPersonDay : 1;
  const kcalScore = Math.max(0, 1 - Math.abs(1 - kcalRatio) * 2);
  if (kcalRatio < 0.8) alerts.push("nutrition.lowEnergy");
  if (kcalRatio > 1.2) alerts.push("nutrition.highEnergy");
  const fiberScore = Math.min(1, fiber / 30);
  if (fiber < 20) alerts.push("nutrition.lowFiber");
  const proteinScore = Math.min(1, protein / 50);
  if (protein < 40) alerts.push("nutrition.lowProtein");
  const vegScore = Math.min(1, i.distinctVegetables / 10);
  if (i.distinctVegetables < 5) alerts.push("nutrition.lowVegetableDiversity");
  const score = Math.round(100 * (0.3 * kcalScore + 0.25 * fiberScore + 0.2 * proteinScore + 0.25 * vegScore));
  return { score, kcalPerPersonDay: Math.round(kcal), fiberPerPersonDay: Math.round(fiber), proteinPerPersonDay: Math.round(protein), distinctVegetables: i.distinctVegetables, alerts };
}
