import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testEnv, userCaller, type TestEnv } from "./helpers";

let env: TestEnv;
beforeAll(async () => {
  env = await testEnv();
});
afterAll(async () => env.close());

const none = { allergens: [], diets: [], aversions: [], kcalTarget: null };

describe("foyer, magasins, stock, budget", () => {
  it("gestion des membres et réglages", async () => {
    const { caller } = await userCaller(env);
    await caller.household.update({ weeklyBudgetCents: 5000, weights: { cost: 9 }, repeatWindowDays: 5, defaultStoreId: "00000000-0000-0000-0000-000000000000" });
    const h = await caller.household.get();
    expect(h.household.weeklyBudgetCents).toBe(5000);
    expect(h.household.weights.cost).toBe(9);
    expect(h.household.defaultStoreId).toBeNull();
    const m = await caller.household.addMember({ name: "Zoé", portionFactor: "0.75", presentDays: [5, 6], sensitive: { ...none, allergens: ["sesame"] } });
    await caller.household.updateMember({ id: m.id, name: "Zoé", portionFactor: "1", presentDays: [6], sensitive: none });
    expect((await caller.household.get()).members.find((x) => x.id === m.id)!.portionFactor).toBe("1.00");
    await expect(caller.household.removeMember({ id: h.members[0]!.id })).rejects.toThrow(/vous-même/);
    await caller.household.removeMember({ id: m.id });
    for (let i = 0; i < 7; i++) await caller.household.addMember({ name: `M${i}`, portionFactor: "1", presentDays: [], sensitive: none });
    await expect(caller.household.addMember({ name: "trop", portionFactor: "1", presentDays: [], sensitive: none })).rejects.toThrow(/8 personnes/);
    await expect(caller.household.addMember({ name: "x", portionFactor: "4", presentDays: [], sensitive: none })).rejects.toThrow();
  });

  it("magasins personnalisés et ordre des rayons", async () => {
    const { caller } = await userCaller(env);
    await expect(caller.stores.create({ name: "x", aisles: ["boissons", "boissons"] })).rejects.toThrow(/double/);
    const s = await caller.stores.create({ name: "Mon marché", aisles: ["fruits_legumes", "cremerie"] });
    await caller.stores.setLayout({ storeId: s.id, aisles: ["cremerie", "fruits_legumes", "boissons"] });
    const mine = (await caller.stores.list()).find((x) => x.id === s.id)!;
    expect(mine.aisles).toEqual(["cremerie", "fruits_legumes", "boissons"]);
    await expect(caller.stores.setLayout({ storeId: s.id, aisles: ["boissons", "boissons"] })).rejects.toThrow(/double/);
    await caller.household.update({ defaultStoreId: s.id });
    expect((await caller.household.get()).household.defaultStoreId).toBe(s.id);
  });

  it("stock : ajout avec conversion, alertes, mise à jour, retrait et annulation", async () => {
    const { caller } = await userCaller(env);
    await caller.pantry.add({ ingredientId: "oeuf", quantity: "1", unit: "douzaine", bestBefore: new Date(Date.now() + 86400_000).toISOString().slice(0, 10), expiryKind: "dlc", location: "fridge" });
    await caller.pantry.add({ ingredientId: "lait", quantity: "1,5", unit: "l", bestBefore: null, expiryKind: "ddm", location: "cupboard" });
    await expect(caller.pantry.add({ ingredientId: "oeuf", quantity: "1", unit: "ml", bestBefore: null, expiryKind: "ddm", location: "fridge" })).rejects.toThrow(/incompatible/);
    await expect(caller.pantry.add({ ingredientId: "sel", quantity: "1", unit: "pincee", bestBefore: null, expiryKind: "ddm", location: "fridge" })).rejects.toThrow(/imprécise/);
    await expect(caller.pantry.add({ ingredientId: "licorne", quantity: "1", unit: "g", bestBefore: null, expiryKind: "ddm", location: "fridge" })).rejects.toThrow(/introuvable/);
    const list = await caller.pantry.list();
    const eggs = list.find((p) => p.ingredientId === "oeuf")!;
    expect(eggs.display).toBe("12 pièces");
    expect(eggs.alert?.level).toBe("soon");
    expect(list.find((p) => p.ingredientId === "lait")!.display).toBe("1,5 l");
    await caller.pantry.update({ id: eggs.id, quantity: "6" });
    const { removed } = await caller.pantry.remove({ id: eggs.id });
    expect(removed.quantity).toBe("6.000");
    await caller.pantry.restore(removed);
    expect((await caller.pantry.list()).some((p) => p.ingredientId === "oeuf")).toBe(true);
    await expect(caller.pantry.update({ id: "00000000-0000-0000-0000-000000000000", quantity: "1" })).rejects.toThrow(/introuvable/);
  });

  it("prix : historique et observation manuelle", async () => {
    const { caller } = await userCaller(env);
    const prods = await caller.budget.products({ ingredientId: "pates" });
    expect(prods.length).toBeGreaterThan(0);
    await caller.budget.addPrice({ productId: prods[0]!.id, priceCents: 89, storeId: null });
    const h = await caller.budget.priceHistory({ productId: prods[0]!.id });
    expect(h.observations[0]!.priceCents).toBe(89);
    expect(h.observations.some((o) => o.source === "seed")).toBe(true);
    await expect(caller.budget.priceHistory({ productId: "00000000-0000-0000-0000-000000000000" })).rejects.toThrow(/introuvable/);
    const s = await caller.budget.summary({ weeks: 4 });
    expect(s.weeks).toEqual([]);
  });

  it("recettes : recherche, filtres, analyse d'une ligne, unités", async () => {
    const { caller } = await userCaller(env);
    expect((await caller.recipes.list({ q: "carbonara" }))[0]!.title).toBe("Spaghetti carbonara");
    expect((await caller.recipes.list({ slot: "breakfast", diet: "vegan", limit: 100 })).every((r) => r.diets.includes("vegan"))).toBe(true);
    const line = await caller.recipes.parseLine({ text: "2 c. à soupe d'huile d'olive" });
    expect(line).toMatchObject({ quantity: "2", unit: "cs", ingredientId: "huile_olive" });
    expect((await caller.recipes.ingredients({ q: "tomate" })).length).toBeGreaterThan(0);
    expect(await caller.recipes.ingredients({ q: " " })).toEqual([]);
    expect((await caller.recipes.units()).some((u) => u.code === "cs")).toBe(true);
    expect((await caller.recipes.ingredientById({ ids: ["riz"] }))[0]!.name).toBe("Riz");
    expect(await caller.recipes.ingredientById({ ids: [] })).toEqual([]);
    const r = await caller.recipes.get({ id: (await caller.recipes.list({ q: "carbonara" }))[0]!.id });
    expect(r.nutrition.kcal).toBeGreaterThan(300);
    await expect(caller.recipes.importText({ text: "court" })).rejects.toThrow();
  });

  it("déconnexion de tous les appareils", async () => {
    const { caller, cookies } = await userCaller(env);
    await caller.account.logoutEverywhere();
    expect(cookies.at(-1)).toMatch(/Max-Age=0/);
  });
});
