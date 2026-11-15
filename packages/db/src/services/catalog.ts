import {
  parseRational, rat, type Allergen, type Diet, type Ingredient, type IngredientTrait, type ListProduct, type MealSlot, type PantryLot, type SnapshotRecipe,
} from "@mise/domain";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import * as s from "../schema.js";

type IngredientRow = typeof s.ingredients.$inferSelect;

export function ingredientFromRow(row: IngredientRow, conversions: Record<string, string>): Ingredient {
  const n = row.nutrition;
  return {
    id: row.id,
    name: row.name,
    synonyms: row.synonyms,
    aisle: row.aisle,
    baseUnit: row.baseUnit,
    densityGPerMl: row.densityGPerMl ? parseRational(row.densityGPerMl) : null,
    pieceWeightG: row.pieceWeightG ? parseRational(row.pieceWeightG) : null,
    conversions: Object.fromEntries(Object.entries(conversions).map(([k, v]) => [k, parseRational(v)])),
    allergens: row.allergens as Allergen[],
    traits: row.traits as IngredientTrait[],
    nutrition: n
      ? {
          kcal: parseRational(n.kcal ?? "0"),
          protein: parseRational(n.protein ?? "0"),
          carbs: parseRational(n.carbs ?? "0"),
          fat: parseRational(n.fat ?? "0"),
          fiber: parseRational(n.fiber ?? "0"),
          sugar: parseRational(n.sugar ?? "0"),
          salt: parseRational(n.salt ?? "0"),
        }
      : null,
    seasonMonths: row.seasonMonths,
    proteinType: row.proteinType,
    vegetableType: row.vegetableType,
    perishableDays: row.perishableDays,
  };
}

/** Tout le référentiel d'ingrédients (≈ quelques centaines de lignes : chargé en une fois). */
export async function loadIngredients(db: Db): Promise<Map<string, Ingredient>> {
  const [rows, convs] = await Promise.all([db.select().from(s.ingredients), db.select().from(s.unitConversions)]);
  const byIng = new Map<string, Record<string, string>>();
  for (const c of convs) byIng.set(c.ingredientId, { ...(byIng.get(c.ingredientId) ?? {}), [c.unitCode]: c.toBase });
  return new Map(rows.map((r) => [r.id, ingredientFromRow(r, byIng.get(r.id) ?? {})]));
}

export async function loadCanonicalMap(db: Db): Promise<Map<string, string>> {
  const rows = await db.select({ id: s.ingredients.id, canonicalId: s.ingredients.canonicalId }).from(s.ingredients).where(sql`${s.ingredients.canonicalId} is not null`);
  return new Map(rows.map((r) => [r.id, r.canonicalId!]));
}

/**
 * Produits avec leur dernier prix connu. Les observations du foyer (tickets, saisies)
 * priment sur les prix indicatifs globaux.
 */
export async function loadProducts(db: Db, householdId: string): Promise<ListProduct[]> {
  const prods = await db
    .select()
    .from(s.products)
    .where(or(isNull(s.products.householdId), eq(s.products.householdId, householdId)));
  if (prods.length === 0) return [];
  const prices = await db
    .selectDistinctOn([s.priceObservations.productId], { productId: s.priceObservations.productId, priceCents: s.priceObservations.priceCents })
    .from(s.priceObservations)
    .where(and(inArray(s.priceObservations.productId, prods.map((p) => p.id)), or(isNull(s.priceObservations.householdId), eq(s.priceObservations.householdId, householdId))))
    .orderBy(s.priceObservations.productId, sql`(${s.priceObservations.householdId} is null)`, desc(s.priceObservations.observedAt));
  const priceBy = new Map(prices.map((p) => [p.productId, p.priceCents]));
  return prods.map((p) => ({
    productId: p.id,
    ingredientId: p.ingredientId,
    name: p.name,
    size: parseRational(p.packageQuantity),
    priceCents: priceBy.get(p.id) ?? null,
    aisle: p.aisle,
  }));
}

export async function loadPantry(db: Db, householdId: string): Promise<PantryLot[]> {
  const rows = await db.select().from(s.pantryItems).where(eq(s.pantryItems.householdId, householdId));
  return rows
    .filter((r) => parseRational(r.quantity).n > 0n)
    .map((r) => ({ id: r.id, ingredientId: r.ingredientId, quantity: parseRational(r.quantity), bestBefore: r.bestBefore, expiryKind: r.expiryKind }));
}

export interface RecipeWithLines {
  readonly row: typeof s.recipes.$inferSelect;
  readonly lines: Array<typeof s.recipeIngredients.$inferSelect>;
}

/** Recettes planifiables : catalogue validé + recettes validées du foyer, hors exclusions. */
export async function loadPlannableRecipes(db: Db, householdId: string): Promise<SnapshotRecipe[]> {
  const rows = await db
    .select()
    .from(s.recipes)
    .where(and(eq(s.recipes.status, "validated"), or(isNull(s.recipes.householdId), eq(s.recipes.householdId, householdId))));
  if (rows.length === 0) return [];
  const [lines, feedback] = await Promise.all([
    db.select().from(s.recipeIngredients).where(inArray(s.recipeIngredients.recipeId, rows.map((r) => r.id))),
    db.select().from(s.recipeFeedback).where(eq(s.recipeFeedback.householdId, householdId)),
  ]);
  const fb = new Map(feedback.map((f) => [f.recipeId, f]));
  const byRecipe = new Map<string, typeof lines>();
  for (const l of lines) byRecipe.set(l.recipeId, [...(byRecipe.get(l.recipeId) ?? []), l]);
  return rows
    .filter((r) => !fb.get(r.id)?.excluded)
    .map((r) => ({
      id: r.id,
      title: r.title,
      prepMinutes: r.prepMinutes,
      cookMinutes: r.cookMinutes,
      equipment: r.equipment,
      slots: r.mealSlots as MealSlot[],
      baseServings: r.baseServings,
      cuisine: r.cuisine,
      leftoverDays: r.leftoverDays,
      freezes: r.freezes,
      rating: fb.get(r.id)?.rating ?? null,
      favorite: fb.get(r.id)?.favorite ?? false,
      ingredients: (byRecipe.get(r.id) ?? [])
        .sort((a, b) => a.position - b.position)
        .map((l) => ({ ingredientId: l.ingredientId, quantity: l.quantity ? parseRational(l.quantity) : null, unit: l.unitCode, optional: l.optional, fuzzy: l.fuzzy })),
    }));
}

export interface MemberSensitive {
  allergens: Allergen[];
  diets: Diet[];
  aversions: string[];
  kcalTarget: number | null;
}

export const EMPTY_SENSITIVE: MemberSensitive = { allergens: [], diets: [], aversions: [], kcalTarget: null };

export const ONE = rat(1);
