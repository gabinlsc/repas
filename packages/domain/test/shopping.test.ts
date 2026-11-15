import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildShoppingList, covers, gte, rat, type ListMeal, type ListProduct, type ListRecipeIngredient, type PantryLot } from "../src/index.js";
import { ING, ingredientMap } from "./fixtures.js";

const ri = (ingredientId: string | null, q: number | null, unit: string | null, extra: Partial<ListRecipeIngredient> = {}): ListRecipeIngredient => ({
  ingredientId, rawText: `${q ?? ""} ${unit ?? ""} ${ingredientId}`, quantity: q === null ? null : rat(q), unit, optional: false, fuzzy: q === null, ...extra,
});
const meal = (day: number, ingredients: ListRecipeIngredient[], servings = 4, base = 4, extra: Partial<ListMeal> = {}): ListMeal => ({
  day, recipeId: `r${day}`, recipeTitle: `Recette ${day}`, baseServings: base, servings: rat(servings), ingredients, isLeftover: false, ...extra,
});
const product = (id: string, ingredientId: string, size: number, price: number | null, aisle: ListProduct["aisle"] = null): ListProduct => ({ productId: id, name: id, ingredientId, size: rat(size), priceCents: price, aisle });

const products: ListProduct[] = [
  product("oignon-1kg", "oignon", 1000, 199),
  product("oignon-500", "oignon", 500, 129),
  product("oeufs-6", "oeuf", 6, 189),
  product("oeufs-12", "oeuf", 12, 319),
  product("pates-500", "pates", 500, 99),
  product("tomates-boite", "tomate_pelee", 400, 89),
  product("tomates-fraiches", "tomate_pelee", 1000, 349, "fruits_legumes"),
  product("lait-1l", "lait", 1000, 105),
];

describe("liste de courses", () => {
  it("fusionne pièces et masse (« 2 oignons » + « 150 g d'oignon »)", () => {
    const r = buildShoppingList({
      weekStart: "2026-11-16",
      meals: [meal(0, [ri("oignon", 2, "piece")]), meal(1, [ri("oignon", 150, "g")])],
      ingredients: ingredientMap, pantry: [], products,
    });
    const l = r.lines.find((x) => x.ingredientId === "oignon")!;
    expect(l.needed).toEqual(rat(450));
    expect(l.packs.map((p) => [p.productId, p.count])).toEqual([["oignon-500", 1]]);
    expect(l.surplus).toEqual(rat(50));
    expect(r.totalCents).toBe(129);
  });
  it("met à l'échelle selon les portions", () => {
    const r = buildShoppingList({ weekStart: "2026-11-16", meals: [meal(0, [ri("pates", 400, "g")], 6, 4)], ingredients: ingredientMap, pantry: [], products });
    expect(r.lines[0]!.needed).toEqual(rat(600));
    expect(r.lines[0]!.packs[0]!.count).toBe(2);
  });
  it("unités floues → basiques à vérifier ; non résolus et optionnels listés", () => {
    const r = buildShoppingList({
      weekStart: "2026-11-16",
      meals: [meal(0, [ri("sel", null, "pincee"), ri(null, 1, "piece", { rawText: "1 truc mystère" }), ri("lait", 10, "cl", { optional: true }), ri("inconnu", 1, "g"), ri("oignon", 1, "gousse")])],
      ingredients: ingredientMap, pantry: [], products,
    });
    expect(r.lines).toHaveLength(0);
    expect(r.toCheck.map((t) => t.reason).sort()).toEqual(["fuzzy", "optional", "unconvertible", "unresolved", "unresolved"]);
  });
  it("inclut les optionnels sur demande", () => {
    const r = buildShoppingList({ weekStart: "2026-11-16", meals: [meal(0, [ri("lait", 10, "cl", { optional: true })])], ingredients: ingredientMap, pantry: [], products, includeOptional: true });
    expect(r.lines[0]!.needed).toEqual(rat(100));
  });
  it("œufs indivisibles : 7 → lot de 12", () => {
    const r = buildShoppingList({ weekStart: "2026-11-16", meals: [meal(0, [ri("oeuf", 7, "piece")])], ingredients: ingredientMap, pantry: [], products });
    expect(r.lines[0]!.packs[0]!.productId).toBe("oeufs-12");
  });
  it("même ingrédient dans plusieurs rayons : le rayon suit le produit choisi", () => {
    const r = buildShoppingList({ weekStart: "2026-11-16", meals: [meal(0, [ri("tomate_pelee", 400, "g")])], ingredients: ingredientMap, pantry: [], products });
    expect(r.lines[0]!.aisle).toBe("conserves");
    const r2 = buildShoppingList({ weekStart: "2026-11-16", meals: [meal(0, [ri("tomate_pelee", 400, "g")])], ingredients: ingredientMap, pantry: [], products: [products[6]!] });
    expect(r2.lines[0]!.aisle).toBe("fruits_legumes");
  });
  it("déduit le stock et ne liste pas ce qui est couvert", () => {
    const pantry: PantryLot[] = [{ id: "l1", ingredientId: "pates", quantity: rat(1000), bestBefore: null, expiryKind: "ddm" }];
    const r = buildShoppingList({ weekStart: "2026-11-16", meals: [meal(0, [ri("pates", 400, "g")])], ingredients: ingredientMap, pantry, products });
    expect(r.lines[0]!.fromPantry).toEqual(rat(400));
    expect(r.byAisle).toHaveLength(0);
    expect(r.totalCents).toBe(0);
  });
  it("sans produit connu : achat exact, total partiel signalé", () => {
    const r = buildShoppingList({ weekStart: "2026-11-16", meals: [meal(0, [ri("courgette", 2, "piece")])], ingredients: ingredientMap, pantry: [], products, budgetCents: 1000 });
    expect(r.totalIsPartial).toBe(true);
    expect(r.lines[0]!.purchased).toEqual(rat(500));
    expect(r.budgetDeltaCents).toBe(1000);
    expect(r.toCheck.some((t) => t.reason === "no_product")).toBe(true);
  });
  it("tri par rayon selon l'ordre du magasin, restes ignorés, variantes fusionnées", () => {
    const r = buildShoppingList({
      weekStart: "2026-11-16",
      meals: [meal(0, [ri("lait", 1, "l"), ri("oignon", 1, "kg")]), meal(1, [ri("pates", 2000, "g")], 4, 4, { isLeftover: true }), meal(2, [ri("oignon_jaune", 100, "g")])],
      ingredients: ingredientMap, canonical: new Map([["oignon_jaune", "oignon"]]), pantry: [], products,
      aisleOrder: ["cremerie", "fruits_legumes"], budgetCents: 200,
    });
    expect(r.byAisle.map((a) => a.aisle)).toEqual(["cremerie", "fruits_legumes"]);
    expect(r.lines.some((l) => l.ingredientId === "pates")).toBe(false);
    expect(r.lines.find((l) => l.ingredientId === "oignon")!.needed).toEqual(rat(1100));
    expect(r.budgetDeltaCents).toBe(200 - r.totalCents);
  });
  it("rejette des portions de base invalides", () => {
    expect(() => buildShoppingList({ weekStart: "2026-11-16", meals: [meal(0, [], 4, 0)], ingredients: ingredientMap, pantry: [], products })).toThrow();
  });

  it("propriété : jamais d'achat inférieur au besoin net ; surplus ≥ 0", () => {
    const ids = ["oignon", "oeuf", "pates", "lait", "tomate_pelee"] as const;
    const units: Record<(typeof ids)[number], string> = { oignon: "g", oeuf: "piece", pates: "g", lait: "ml", tomate_pelee: "g" };
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 6 }), fc.constantFrom(...ids), fc.integer({ min: 1, max: 2000 }), fc.integer({ min: 1, max: 12 })), { minLength: 1, maxLength: 15 }),
        fc.array(fc.tuple(fc.constantFrom(...ids), fc.integer({ min: 0, max: 3000 }), fc.option(fc.integer({ min: -3, max: 10 }))), { maxLength: 5 }),
        (meals, lots) => {
          const r = buildShoppingList({
            weekStart: "2026-11-16",
            meals: meals.map(([d, id, q, s]) => meal(d, [ri(id, q, units[id])], s, 4)),
            ingredients: ingredientMap,
            pantry: lots.map(([id, q, off], i) => ({ id: `l${i}`, ingredientId: id, quantity: rat(q), bestBefore: off === null ? null : `2026-11-${String(16 + off).padStart(2, "0")}`, expiryKind: "dlc" as const })),
            products,
          });
          for (const l of r.lines) {
            expect(covers(l)).toBe(true);
            expect(gte(l.purchased, l.net)).toBe(true);
            expect(gte(l.surplus, rat(0))).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("fixtures", () => {
  it("cohérentes", () => expect(ING.oignon!.pieceWeightG).toEqual(rat(150)));
});
