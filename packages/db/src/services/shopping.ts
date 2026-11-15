import { buildShoppingList, parseRational, toFixed, type Aisle, type ListMeal, type ShoppingResult } from "@mise/domain";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "../client.js";
import * as s from "../schema.js";
import { loadCanonicalMap, loadIngredients, loadPantry, loadProducts } from "./catalog.js";

/** Génère (ou régénère) la liste de courses d'un plan, en conservant les articles ajoutés à la main. */
export async function generateShoppingList(db: Db, householdId: string, mealPlanId: string, storeId: string | null): Promise<{ listId: string; result: ShoppingResult }> {
  const [plan] = await db.select().from(s.mealPlans).where(and(eq(s.mealPlans.id, mealPlanId), eq(s.mealPlans.householdId, householdId)));
  if (!plan) throw new Error("NOT_FOUND");
  const [household] = await db.select().from(s.households).where(eq(s.households.id, householdId));
  const meals = await db.select().from(s.plannedMeals).where(eq(s.plannedMeals.mealPlanId, mealPlanId));
  const recipeIds = [...new Set(meals.map((m) => m.recipeId))];
  const [recipes, lines, ingredients, canonical, pantry, products] = await Promise.all([
    recipeIds.length ? db.select().from(s.recipes).where(inArray(s.recipes.id, recipeIds)) : Promise.resolve([]),
    recipeIds.length ? db.select().from(s.recipeIngredients).where(inArray(s.recipeIngredients.recipeId, recipeIds)) : Promise.resolve([]),
    loadIngredients(db),
    loadCanonicalMap(db),
    loadPantry(db, householdId),
    loadProducts(db, householdId),
  ]);
  const store = storeId ?? household?.defaultStoreId ?? null;
  const layout = store ? await db.select().from(s.storeLayouts).where(eq(s.storeLayouts.storeId, store)).orderBy(asc(s.storeLayouts.position)) : [];
  const recipeBy = new Map(recipes.map((r) => [r.id, r]));
  const listMeals: ListMeal[] = meals
    .filter((m) => !m.cookedAt)
    .map((m) => {
      const r = recipeBy.get(m.recipeId)!;
      // Un repas « batch » prépare aussi la portion de restes : on double la quantité.
      const servings = parseRational(m.servings);
      return {
        day: m.day,
        recipeId: r.id,
        recipeTitle: r.title,
        baseServings: r.baseServings,
        servings: m.cookBig ? { n: servings.n * 2n, d: servings.d } : servings,
        isLeftover: m.leftoverOfId !== null,
        ingredients: lines
          .filter((l) => l.recipeId === r.id)
          .sort((a, b) => a.position - b.position)
          .map((l) => ({ ingredientId: l.ingredientId, rawText: l.rawText, quantity: l.quantity ? parseRational(l.quantity) : null, unit: l.unitCode, optional: l.optional, fuzzy: l.fuzzy })),
      };
    });
  const result = buildShoppingList({
    weekStart: plan.weekStart,
    meals: listMeals,
    ingredients,
    canonical,
    pantry,
    products,
    aisleOrder: layout.length ? layout.map((l) => l.aisle as Aisle) : undefined,
    budgetCents: household?.weeklyBudgetCents ?? null,
  });

  const listId = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(s.shoppingLists).where(and(eq(s.shoppingLists.mealPlanId, mealPlanId), eq(s.shoppingLists.householdId, householdId)));
    let id = existing?.id;
    if (existing) {
      // On garde l'état coché et les ajouts manuels ; on remplace les lignes calculées.
      const old = await tx.select().from(s.shoppingListItems).where(eq(s.shoppingListItems.listId, existing.id));
      const checkedBy = new Map(old.filter((o) => !o.isExtra && o.ingredientId).map((o) => [o.ingredientId!, o]));
      await tx.delete(s.shoppingListItems).where(and(eq(s.shoppingListItems.listId, existing.id), eq(s.shoppingListItems.isExtra, false)));
      await tx.update(s.shoppingLists).set({ storeId: store, estimatedCents: result.totalCents, totalIsPartial: result.totalIsPartial, toCheck: result.toCheck.map((t) => ({ label: t.label, reason: t.reason, recipes: [...t.recipes] })) }).where(eq(s.shoppingLists.id, existing.id));
      await insertLines(tx, existing.id, result, checkedBy);
    } else {
      const [created] = await tx
        .insert(s.shoppingLists)
        .values({ householdId, mealPlanId, storeId: store, estimatedCents: result.totalCents, totalIsPartial: result.totalIsPartial, toCheck: result.toCheck.map((t) => ({ label: t.label, reason: t.reason, recipes: [...t.recipes] })) })
        .returning({ id: s.shoppingLists.id });
      id = created!.id;
      await insertLines(tx, id, result, new Map());
    }
    return id!;
  });
  return { listId, result };
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function insertLines(tx: Tx, listId: string, result: ShoppingResult, previous: Map<string, typeof s.shoppingListItems.$inferSelect>): Promise<void> {
  const rows = result.byAisle.flatMap(({ lines }) =>
    lines.map((l) => {
      const prev = previous.get(l.ingredientId);
      return {
        listId,
        ingredientId: l.ingredientId,
        label: l.label,
        aisle: l.aisle,
        baseUnit: l.baseUnit,
        quantityNeeded: toFixed(l.net, 3, "ceil"),
        quantityToBuy: toFixed(l.purchased, 3, "ceil"),
        surplus: toFixed(l.surplus, 3, "floor"),
        packs: l.packs.map((p) => ({ productId: p.productId, name: p.name, count: p.count, size: toFixed(p.size, 3) })),
        estimatedCents: l.costCents,
        checked: prev?.checked ?? false,
        purchasedQuantity: prev?.purchasedQuantity ?? null,
        actualPriceCents: prev?.actualPriceCents ?? null,
        fieldClocks: prev?.fieldClocks ?? {},
      };
    }),
  );
  if (rows.length) await tx.insert(s.shoppingListItems).values(rows);
}
