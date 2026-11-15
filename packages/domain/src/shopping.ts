import { DomainError } from "./errors.js";
import { chooseCheapestPacks, type PackChoice, type PackOption } from "./packs.js";
import { allocatePantry, type PantryLot, type Use } from "./pantry.js";
import { add, div, gt, isZero, mul, rat, sub, sum, ZERO, type Rational } from "./rational.js";
import type { Aisle, Ingredient } from "./types.js";
import { AISLES } from "./types.js";
import { toBase } from "./units.js";

export interface ListRecipeIngredient {
  readonly ingredientId: string | null;
  readonly rawText: string;
  readonly quantity: Rational | null;
  readonly unit: string | null;
  readonly optional: boolean;
  readonly fuzzy: boolean;
}

export interface ListMeal {
  readonly day: number;
  readonly recipeId: string;
  readonly recipeTitle: string;
  readonly baseServings: number;
  /** portions servies (somme des portion_factor des convives, + restes prévus). */
  readonly servings: Rational;
  readonly ingredients: readonly ListRecipeIngredient[];
  /** repas servi à partir de restes : aucun achat. */
  readonly isLeftover: boolean;
}

export interface ListProduct extends PackOption {
  readonly ingredientId: string;
  readonly aisle: Aisle | null;
}

export type ListIngredient = Pick<Ingredient, "id" | "name" | "baseUnit" | "densityGPerMl" | "pieceWeightG" | "conversions" | "aisle">;

export interface ShoppingInput {
  readonly weekStart: string;
  readonly meals: readonly ListMeal[];
  readonly ingredients: ReadonlyMap<string, ListIngredient>;
  /** variantes fusionnées vers un identifiant canonique (ex. « oignon-jaune » → « oignon »). */
  readonly canonical?: ReadonlyMap<string, string>;
  readonly pantry: readonly PantryLot[];
  readonly products: readonly ListProduct[];
  readonly aisleOrder?: readonly Aisle[];
  readonly budgetCents?: number | null;
  readonly includeOptional?: boolean;
}

export interface ShoppingLine {
  readonly ingredientId: string;
  readonly label: string;
  readonly baseUnit: Ingredient["baseUnit"];
  readonly needed: Rational;
  readonly fromPantry: Rational;
  readonly net: Rational;
  readonly packs: readonly PackChoice[];
  readonly purchased: Rational;
  readonly surplus: Rational;
  readonly costCents: number | null;
  readonly aisle: Aisle;
  readonly firstUseDay: number;
  readonly recipes: readonly string[];
  readonly expiredLotIds: readonly string[];
}

export interface ToCheckLine {
  readonly label: string;
  readonly ingredientId: string | null;
  readonly recipes: readonly string[];
  readonly reason: "fuzzy" | "unresolved" | "unconvertible" | "no_product" | "optional";
}

export interface ShoppingResult {
  readonly lines: readonly ShoppingLine[];
  readonly toCheck: readonly ToCheckLine[];
  readonly byAisle: ReadonlyArray<{ readonly aisle: Aisle; readonly lines: readonly ShoppingLine[] }>;
  readonly totalCents: number;
  /** vrai si au moins une ligne n'a pas de prix connu : le total est un minorant. */
  readonly totalIsPartial: boolean;
  readonly budgetCents: number | null;
  readonly budgetDeltaCents: number | null;
}

interface Acc {
  uses: Use[];
  recipes: Set<string>;
}

/**
 * Pipeline §6.1 : agrégation à l'échelle des portions → normalisation en unité de base →
 * fusion par ingrédient canonique → déduction du stock (FEFO, DLC) → conditionnements
 * au coût minimal → regroupement par rayon → coût et écart au budget.
 */
export function buildShoppingList(input: ShoppingInput): ShoppingResult {
  const acc = new Map<string, Acc>();
  const toCheck = new Map<string, { label: string; ingredientId: string | null; recipes: Set<string>; reason: ToCheckLine["reason"] }>();
  const flag = (key: string, label: string, ingredientId: string | null, recipe: string, reason: ToCheckLine["reason"]): void => {
    const e = toCheck.get(key) ?? { label, ingredientId, recipes: new Set<string>(), reason };
    e.recipes.add(recipe);
    toCheck.set(key, e);
  };

  for (const meal of input.meals) {
    if (meal.isLeftover) continue;
    if (meal.baseServings <= 0) throw new DomainError("INVALID_QUANTITY", "Portions de base invalides", { recipe: meal.recipeId });
    const scale = div(meal.servings, rat(meal.baseServings));
    for (const ri of meal.ingredients) {
      if (ri.optional && !input.includeOptional) {
        flag(`opt:${ri.ingredientId ?? ri.rawText}`, ri.rawText, ri.ingredientId, meal.recipeTitle, "optional");
        continue;
      }
      if (!ri.ingredientId) {
        flag(`unres:${ri.rawText}`, ri.rawText, null, meal.recipeTitle, "unresolved");
        continue;
      }
      const id = input.canonical?.get(ri.ingredientId) ?? ri.ingredientId;
      const ing = input.ingredients.get(id);
      if (!ing) {
        flag(`unres:${id}`, ri.rawText, id, meal.recipeTitle, "unresolved");
        continue;
      }
      if (ri.fuzzy || ri.quantity === null || ri.unit === null) {
        flag(`fuzzy:${id}`, ing.name, id, meal.recipeTitle, "fuzzy");
        continue;
      }
      let base;
      try {
        base = toBase(ri.quantity, ri.unit, ing);
      } catch (e) {
        if (e instanceof DomainError) {
          flag(`conv:${id}`, ri.rawText, id, meal.recipeTitle, "unconvertible");
          continue;
        }
        throw e;
      }
      if (base.kind === "fuzzy") {
        flag(`fuzzy:${id}`, ing.name, id, meal.recipeTitle, "fuzzy");
        continue;
      }
      const a = acc.get(id) ?? { uses: [], recipes: new Set<string>() };
      a.uses.push({ day: meal.day, quantity: mul(base.quantity, scale) });
      a.recipes.add(meal.recipeTitle);
      acc.set(id, a);
    }
  }

  const productsBy = new Map<string, ListProduct[]>();
  for (const p of input.products) productsBy.set(p.ingredientId, [...(productsBy.get(p.ingredientId) ?? []), p]);
  const pantryBy = new Map<string, PantryLot[]>();
  for (const l of input.pantry) {
    const id = input.canonical?.get(l.ingredientId) ?? l.ingredientId;
    pantryBy.set(id, [...(pantryBy.get(id) ?? []), l]);
  }

  const lines: ShoppingLine[] = [];
  let partial = false;
  for (const [id, a] of [...acc.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
    const ing = input.ingredients.get(id)!;
    const needed = sum(a.uses.map((u) => u.quantity));
    if (isZero(needed)) continue;
    const alloc = allocatePantry(a.uses, pantryBy.get(id) ?? [], input.weekStart);
    const firstUseDay = Math.min(...a.uses.map((u) => u.day));
    const recipes = [...a.recipes].sort();
    if (!gt(alloc.toBuy, ZERO)) {
      lines.push(line(ing, needed, alloc.fromPantry, ZERO, [], ZERO, 0, ing.aisle, firstUseDay, recipes, alloc.expiredLotIds));
      continue;
    }
    const options = productsBy.get(id) ?? [];
    const sol = chooseCheapestPacks(alloc.toBuy, options);
    if (!sol) {
      // Pas de conditionnement connu : on achète exactement le besoin, coût inconnu.
      partial = true;
      flag(`noprod:${id}`, ing.name, id, recipes[0] ?? "", "no_product");
      lines.push(line(ing, needed, alloc.fromPantry, alloc.toBuy, [], alloc.toBuy, null, ing.aisle, firstUseDay, recipes, alloc.expiredLotIds));
      continue;
    }
    if (sol.costCents === null) partial = true;
    const mainProduct = options.find((o) => o.productId === sol.choices[0]?.productId);
    lines.push(
      line(ing, needed, alloc.fromPantry, alloc.toBuy, sol.choices, sol.totalQuantity, sol.costCents, mainProduct?.aisle ?? ing.aisle, firstUseDay, recipes, alloc.expiredLotIds),
    );
  }

  const order = input.aisleOrder ?? AISLES;
  const rank = (a: Aisle): number => {
    const i = order.indexOf(a);
    return i === -1 ? order.length + AISLES.indexOf(a) : i;
  };
  const buying = lines.filter((l) => gt(l.purchased, ZERO));
  const aisles = [...new Set(buying.map((l) => l.aisle))].sort((a, b) => rank(a) - rank(b));
  const byAisle = aisles.map((aisle) => ({ aisle, lines: buying.filter((l) => l.aisle === aisle).sort((x, y) => x.label.localeCompare(y.label, "fr")) }));
  const totalCents = lines.reduce((s, l) => s + (l.costCents ?? 0), 0);
  const budgetCents = input.budgetCents ?? null;

  return {
    lines,
    toCheck: [...toCheck.values()]
      .map((t) => ({ label: t.label, ingredientId: t.ingredientId, recipes: [...t.recipes].sort(), reason: t.reason }))
      .sort((a, b) => a.reason.localeCompare(b.reason) || a.label.localeCompare(b.label, "fr")),
    byAisle,
    totalCents,
    totalIsPartial: partial,
    budgetCents,
    budgetDeltaCents: budgetCents === null ? null : budgetCents - totalCents,
  };
}

function line(
  ing: ListIngredient,
  needed: Rational,
  fromPantry: Rational,
  net: Rational,
  packs: readonly PackChoice[],
  purchased: Rational,
  costCents: number | null,
  aisle: Aisle,
  firstUseDay: number,
  recipes: readonly string[],
  expiredLotIds: readonly string[],
): ShoppingLine {
  return {
    ingredientId: ing.id,
    label: ing.name,
    baseUnit: ing.baseUnit,
    needed,
    fromPantry,
    net,
    packs,
    purchased,
    surplus: sub(purchased, net),
    costCents,
    aisle,
    firstUseDay,
    recipes,
    expiredLotIds,
  };
}

/** Somme de contrôle utile aux tests : quantité achetée + stock utilisé ≥ besoin. */
export function covers(l: ShoppingLine): boolean {
  return !gt(l.needed, add(l.purchased, l.fromPantry));
}
