import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildPlanRequest, DEFAULT_WEIGHTS, EU_ALLERGENS, planResponseSchema, rat, recipeIsSafeFor, type SnapshotInput, type SnapshotRecipe } from "../src/index.js";
import { ingredientMap } from "./fixtures.js";

const recipe = (id: string, ings: Array<[string | null, number, string]>, extra: Partial<SnapshotRecipe> = {}): SnapshotRecipe => ({
  id, title: id, prepMinutes: 10, cookMinutes: 20, equipment: ["plaques"], slots: ["lunch", "dinner"], baseServings: 4, cuisine: "française",
  leftoverDays: 0, freezes: false, rating: null, favorite: false,
  ingredients: ings.map(([ingredientId, q, unit]) => ({ ingredientId, quantity: rat(q), unit, optional: false, fuzzy: false })),
  ...extra,
});

const input = (over: Partial<SnapshotInput> = {}): SnapshotInput => ({
  seed: 42, timeLimitS: 5, weekStart: "2026-07-06", repeatWindowDays: 7, budgetCents: 8000, equipment: ["plaques", "four"], weights: DEFAULT_WEIGHTS,
  members: [
    { id: "m1", portionFactor: rat(1), allergens: [], diets: [], kcalTarget: 2000, aversions: [] },
    { id: "m2", portionFactor: rat(1, 2), allergens: ["oeufs"], diets: ["vegetarian"], kcalTarget: null, aversions: ["courgette"] },
  ],
  maxPrepMinutesByDay: [30, 30, 30, 30, 30, 60, 60],
  slots: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, slot: "dinner" as const, attendeeIds: ["m1", "m2"], lockedRecipeId: null })),
  recipes: [
    recipe("omelette", [["oeuf", 8, "piece"], ["oignon", 1, "piece"]], { favorite: true, rating: 5 }),
    recipe("ratatouille", [["courgette", 2, "piece"], ["oignon", 200, "g"], ["huile_olive", 2, "cs"]]),
    recipe("poulet", [["poulet", 600, "g"], ["ail", 2, "gousse"]]),
    recipe("mystere", [[null, 1, "g"]]),
    recipe("pates", [["pates", 400, "g"], ["sel", 1, "pincee"]]),
  ],
  ingredients: ingredientMap,
  products: [
    { productId: "p1", ingredientId: "pates", name: "Pâtes 500 g", size: rat(500), priceCents: 99, aisle: null },
    { productId: "p2", ingredientId: "pates", name: "Pâtes 1 kg", size: rat(1000), priceCents: 160, aisle: null },
    { productId: "p3", ingredientId: "oeuf", name: "6 œufs", size: rat(6), priceCents: null, aisle: null },
  ],
  pantry: [
    { id: "l1", ingredientId: "pates", quantity: rat(250), bestBefore: null, expiryKind: "ddm" },
    { id: "l2", ingredientId: "poulet", quantity: rat(300), bestBefore: "2026-07-08", expiryKind: "dlc" },
  ],
  ...over,
});

describe("snapshot du solveur", () => {
  it("recalcule allergènes/régimes, exclut les recettes non résolues", () => {
    const req = buildPlanRequest(input());
    const ids = req.recipes.map((r) => r.id);
    expect(ids).not.toContain("mystere");
    const om = req.recipes.find((r) => r.id === "omelette")!;
    expect(om.allergens).toEqual(["oeufs"]);
    expect(om.diets).toContain("vegetarian");
    expect(om.preference).toBe(3);
    expect(req.recipes.find((r) => r.id === "ratatouille")!.preference).toBe(-2);
    expect(req.recipes.find((r) => r.id === "poulet")!.protein).toBe("volaille");
  });
  it("quantités par portion en centi-unités et portions des convives", () => {
    const req = buildPlanRequest(input());
    const pates = req.recipes.find((r) => r.id === "pates")!;
    expect(pates.ingredients).toEqual([{ ingredient_id: "pates", qty_per_serving_centi: 10000 }]);
    expect(req.days[0]!.slots[0]!.servings_centi).toBe(150);
    expect(req.kcal_target_per_day).toBe(2000);
  });
  it("produit de référence au meilleur prix unitaire et stock", () => {
    const req = buildPlanRequest(input());
    const pates = req.ingredients.find((i) => i.id === "pates")!;
    expect(pates.pack_size_centi).toBe(100000);
    expect(pates.pack_price_cents).toBe(160);
    expect(pates.pantry).toEqual([{ qty_centi: 25000, expiry_day: null, must_use: false }]);
    const poulet = req.ingredients.find((i) => i.id === "poulet")!;
    expect(poulet.pantry).toEqual([{ qty_centi: 30000, expiry_day: 2, must_use: true }]);
    expect(req.ingredients.find((i) => i.id === "oeuf")!.pack_size_centi).toBeNull();
  });
  it("saison : courgette en juillet", () => {
    const req = buildPlanRequest(input());
    expect(req.recipes.find((r) => r.id === "ratatouille")!.season_score).toBeGreaterThan(50);
  });
  it("valide la réponse du solveur", () => {
    expect(planResponseSchema.safeParse({ version: "1", status: "optimal", deterministic: true, wall_time_ms: 10, estimated_cost_cents: 0, score: null, meals: [], diagnostics: [] }).success).toBe(true);
  });
  it("propriété : chaque recette du snapshot porte au moins les allergènes de ses ingrédients", () => {
    const ids = [...ingredientMap.keys()];
    fc.assert(fc.property(fc.array(fc.subarray(ids, { minLength: 1, maxLength: 4 }), { minLength: 1, maxLength: 6 }), fc.subarray([...EU_ALLERGENS]), (sets, allergens) => {
      const recipes = sets.map((s, i) => recipe(`r${i}`, s.map((id) => [id, 100, "g"] as [string, number, string])));
      const req = buildPlanRequest(input({ recipes }));
      for (const r of req.recipes) {
        const ings = sets[Number(r.id.slice(1))]!.map((id) => ingredientMap.get(id)!);
        const expected = new Set(ings.flatMap((i) => i.allergens));
        for (const a of expected) expect(r.allergens).toContain(a);
        const safe = recipeIsSafeFor(r, [{ allergens, diets: [] }]);
        if (allergens.some((a) => expected.has(a))) expect(safe).toBe(false);
      }
    }), { numRuns: 200 });
  });
});
