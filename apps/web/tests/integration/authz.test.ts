import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encodeHlc } from "@mise/domain";
import { testEnv, userCaller, type TestEnv } from "./helpers";

let env: TestEnv;
beforeAll(async () => {
  env = await testEnv();
});
afterAll(async () => env.close());

/**
 * Accès inter-foyers : l'utilisateur B ne doit jamais lire ni modifier une ressource
 * du foyer A en connaissant son identifiant. Chaque route qui prend un identifiant est testée.
 */
describe("cloisonnement entre foyers", () => {
  it("aucune ressource de A n'est accessible à B", async () => {
    const a = await userCaller(env);
    const b = await userCaller(env);
    const ha = await a.caller.household.get();
    await a.caller.household.completeOnboarding({ settings: { mealSlots: ["dinner"] }, members: [{ id: ha.members[0]!.id, name: "A", portionFactor: "1", presentDays: [0, 1, 2, 3, 4, 5, 6], sensitive: { allergens: [], diets: [], aversions: [], kcalTarget: null } }, { name: "A2", portionFactor: "1", presentDays: [0], sensitive: { allergens: [], diets: [], aversions: [], kcalTarget: null } }] });
    const ha2 = await a.caller.household.get();
    const { jobId } = await a.caller.plan.generate({ weekStart: "2026-11-30", seed: 3 });
    const plan = await a.caller.plan.current({ weekStart: "2026-11-30" });
    const meal = plan.meals[0]!;
    const { listId } = await a.caller.shopping.generate({ mealPlanId: plan.plan.id });
    const list = await a.caller.shopping.get({ listId });
    const item = list.items[0]!;
    const lot = await a.caller.pantry.add({ ingredientId: "riz", quantity: "500", unit: "g", bestBefore: null, expiryKind: "ddm", location: "cupboard" });
    const recipe = await a.caller.recipes.create({ title: "Privée A", prepMinutes: 1, cookMinutes: 1, baseServings: 1, difficulty: 1, equipment: [], mealSlots: ["dinner"], tags: [], cuisine: null, leftoverDays: 0, freezes: false, steps: ["x"], sourceUrl: null, sourceName: null, lines: [{ rawText: "100 g de riz", ingredientId: "riz", quantity: "100", unit: "g", note: null, optional: false }] });
    const store = await a.caller.stores.create({ name: "Mon magasin", aisles: ["fruits_legumes", "cremerie"] });
    const memberA2 = ha2.members.find((m) => m.name === "A2")!;

    const B = b.caller;
    const denied = /introuvable|NOT_FOUND|FORBIDDEN/;
    await expect(B.plan.job({ jobId })).rejects.toThrow(denied);
    await expect(B.plan.setLocked({ mealId: meal.id, locked: true })).rejects.toThrow(denied);
    await expect(B.plan.move({ mealId: meal.id, day: 1, slot: "dinner" })).rejects.toThrow(denied);
    await expect(B.plan.replace({ mealId: meal.id, recipeId: meal.recipeId })).rejects.toThrow(denied);
    await expect(B.plan.remove({ mealId: meal.id })).rejects.toThrow(denied);
    await expect(B.plan.markCooked({ mealId: meal.id })).rejects.toThrow(denied);
    await expect(B.plan.regenerateSlot({ mealId: meal.id })).rejects.toThrow(denied);
    await expect(B.shopping.generate({ mealPlanId: plan.plan.id })).rejects.toThrow(denied);
    await expect(B.shopping.get({ listId })).rejects.toThrow(denied);
    await expect(B.shopping.markdown({ listId })).rejects.toThrow(denied);
    await expect(B.shopping.close({ listId })).rejects.toThrow(denied);
    await expect(B.shopping.surplus({ listId })).rejects.toThrow(denied);
    const clock = encodeHlc({ wall: Date.now() + 10_000, counter: 0, node: "b" });
    const r = await B.shopping.sync({ ops: [{ id: crypto.randomUUID(), type: "patch", itemId: item.id, patch: { checked: true }, clock }] });
    expect(r.results[0]!.status).toBe("rejected");
    await expect(B.shopping.sync({ ops: [{ id: crypto.randomUUID(), type: "add", itemId: crypto.randomUUID(), listId, label: "intrus", aisle: "boissons", clock }] })).rejects.toThrow(denied);
    expect((await a.caller.shopping.get({ listId })).items.find((i) => i.id === item.id)!.checked).toBe(false);
    await expect(B.pantry.update({ id: lot.id, quantity: "1" })).rejects.toThrow(denied);
    await expect(B.pantry.remove({ id: lot.id })).rejects.toThrow(denied);
    await expect(B.recipes.get({ id: recipe.id })).rejects.toThrow(denied);
    await expect(B.recipes.update({ id: recipe.id, title: "pirate", prepMinutes: 1, cookMinutes: 1, baseServings: 1, difficulty: 1, equipment: [], mealSlots: ["dinner"], tags: [], cuisine: null, leftoverDays: 0, freezes: false, steps: ["x"], sourceUrl: null, sourceName: null, lines: [{ rawText: "x", ingredientId: "riz", quantity: "1", unit: "g", note: null, optional: false }] })).rejects.toThrow(denied);
    await expect(B.recipes.remove({ id: recipe.id })).rejects.toThrow(denied);
    await expect(B.recipes.feedback({ recipeId: recipe.id, favorite: true })).rejects.toThrow(denied);
    expect((await B.recipes.list({ q: "Privée A" })).length).toBe(0);
    await expect(B.household.updateMember({ id: memberA2.id, name: "x", portionFactor: "1", presentDays: [], sensitive: { allergens: [], diets: [], aversions: [], kcalTarget: null } })).rejects.toThrow(denied);
    await expect(B.household.removeMember({ id: memberA2.id })).rejects.toThrow(denied);
    await expect(B.stores.setLayout({ storeId: store.id, aisles: ["boissons"] })).rejects.toThrow(denied);
    expect((await B.stores.list()).some((s) => s.id === store.id)).toBe(false);
    // Le plan de B pour la même semaine est distinct
    const bPlan = await B.plan.current({ weekStart: "2026-11-30" });
    expect(bPlan.plan.id).not.toBe(plan.plan.id);
    expect(bPlan.meals).toHaveLength(0);
  });
});
