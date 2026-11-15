import { planRequestSchema, type PlanRequest, type PlanResponse } from "@mise/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decryptJson, encryptJson, generateShoppingList, needsRotation, parseKeyring, prepareGeneration, runGenerationJob, CryptoConfigError, PlanError, getOrCreatePlan } from "../src/index.js";
import * as s from "../src/schema.js";
import { makeHousehold, ring, testDb } from "./helpers.js";

/** Solveur factice : premier candidat sûr par créneau (la vraie optimisation est testée en Python). */
function fakePlanner(req: PlanRequest): PlanResponse {
  const members = new Map(req.members.map((m) => [m.id, m]));
  const used = new Set<string>();
  const meals = req.days.flatMap((d) =>
    d.slots.map((slot) => {
      const eaters = slot.attendees.map((a) => members.get(a)!);
      const r =
        req.recipes.find((x) => x.id === slot.locked_recipe_id) ??
        req.recipes.find(
          (x) => !used.has(x.id) && x.slots.includes(slot.slot) && eaters.every((e) => e.allergens.every((a) => !x.allergens.includes(a)) && e.diets.every((di) => x.diets.includes(di))),
        )!;
      used.add(r.id);
      return { day: d.day, slot: slot.slot, recipe_id: r.id, servings_centi: slot.servings_centi, cook_big: false, leftover_of: null, explanations: [{ code: "fits_time", params: {} }] };
    }),
  );
  return { version: "1", status: "feasible", deterministic: true, wall_time_ms: 1, estimated_cost_cents: 1234, score: null, meals, diagnostics: [] };
}

let ctx: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  ctx = await testDb();
});
afterAll(async () => ctx.close());

describe("chiffrement des données sensibles", () => {
  it("aller-retour, rotation et erreurs", () => {
    const buf = encryptJson({ allergens: ["gluten"] }, ring);
    expect(decryptJson(buf, ring)).toEqual({ allergens: ["gluten"] });
    expect(buf.includes(Buffer.from("gluten"))).toBe(false);
    const rotated = parseKeyring(`k2:${Buffer.alloc(32, 7).toString("base64")},k1:${ring.keys.get("k1")!.toString("base64")}`);
    expect(needsRotation(buf, rotated)).toBe(true);
    expect(decryptJson(buf, rotated)).toEqual({ allergens: ["gluten"] });
    expect(() => parseKeyring("")).toThrow(CryptoConfigError);
    expect(() => parseKeyring("k1:abc")).toThrow(/32 octets/);
    expect(() => parseKeyring("bad")).toThrow(CryptoConfigError);
    expect(() => decryptJson(encryptJson(1, rotated), parseKeyring(`k9:${Buffer.alloc(32).toString("base64")}`))).toThrow(/absente/);
    const tampered = Buffer.from(buf);
    tampered[tampered.length - 1]! ^= 1;
    expect(() => decryptJson(tampered, ring)).toThrow();
  });
});

describe("génération de plan et liste de courses (intégration PostgreSQL)", () => {
  it("snapshot : allergènes respectés, verrous, puis liste fusionnée", async () => {
    const h = await makeHousehold(ctx.db, { allergens: ["gluten"], budget: 8000 });
    const { jobId, mealPlanId, request } = await prepareGeneration(ctx.db, ring, { householdId: h.id, weekStart: "2026-11-16", seed: 1, timeLimitS: 5 });
    expect(planRequestSchema.safeParse(request).success).toBe(true);
    expect(request.members.find((m) => m.allergens.includes("gluten"))).toBeDefined();
    expect(request.days).toHaveLength(7);
    expect(request.days[0]!.slots[0]!.servings_centi).toBe(150);
    const res = await runGenerationJob(ctx.db, jobId, async (r) => fakePlanner(r));
    expect(res!.meals).toHaveLength(7);
    const meals = await ctx.db.select().from(s.plannedMeals).where(eq(s.plannedMeals.mealPlanId, mealPlanId));
    expect(meals).toHaveLength(7);
    const recipes = await ctx.db.select().from(s.recipes);
    for (const m of meals) expect(recipes.find((r) => r.id === m.recipeId)!.allergens).not.toContain("gluten");
    // idempotence : rejouer un job terminé ne refait rien
    expect((await runGenerationJob(ctx.db, jobId, async () => { throw new Error("ne doit pas être appelé"); }))!.meals).toHaveLength(7);

    // verrou + régénération partielle
    await ctx.db.update(s.plannedMeals).set({ locked: true }).where(eq(s.plannedMeals.id, meals.find((m) => m.day === 2)!.id));
    const again = await prepareGeneration(ctx.db, ring, { householdId: h.id, weekStart: "2026-11-16", seed: 2, timeLimitS: 5 });
    expect(again.request.days[2]!.slots[0]!.locked_recipe_id).toBe(meals.find((m) => m.day === 2)!.recipeId);
    const one = await prepareGeneration(ctx.db, ring, { householdId: h.id, weekStart: "2026-11-16", seed: 3, timeLimitS: 5, onlySlot: { day: 4, slot: "dinner" } });
    expect(one.request.days.filter((d) => d.slots[0]!.locked_recipe_id).length).toBe(6);
    expect(one.request.recipes.some((r) => r.id === meals.find((m) => m.day === 4)!.recipeId)).toBe(false);

    const { listId, result } = await generateShoppingList(ctx.db, h.id, mealPlanId, null);
    expect(result.lines.length).toBeGreaterThan(5);
    expect(result.totalCents).toBeGreaterThan(0);
    const items = await ctx.db.select().from(s.shoppingListItems).where(eq(s.shoppingListItems.listId, listId));
    expect(items.length).toBe(result.byAisle.reduce((n, a) => n + a.lines.length, 0));
    // régénérer conserve l'état coché
    await ctx.db.update(s.shoppingListItems).set({ checked: true }).where(eq(s.shoppingListItems.id, items[0]!.id));
    const second = await generateShoppingList(ctx.db, h.id, mealPlanId, null);
    expect(second.listId).toBe(listId);
    const items2 = await ctx.db.select().from(s.shoppingListItems).where(eq(s.shoppingListItems.listId, listId));
    expect(items2.find((i) => i.ingredientId === items[0]!.ingredientId)!.checked).toBe(true);
  });

  it("un plan infaisable conserve le plan existant ; erreurs du solveur tracées", async () => {
    const h = await makeHousehold(ctx.db);
    const first = await prepareGeneration(ctx.db, ring, { householdId: h.id, weekStart: "2026-11-23", seed: 1, timeLimitS: 5 });
    await runGenerationJob(ctx.db, first.jobId, async (r) => fakePlanner(r));
    const second = await prepareGeneration(ctx.db, ring, { householdId: h.id, weekStart: "2026-11-23", seed: 1, timeLimitS: 5 });
    await runGenerationJob(ctx.db, second.jobId, async () => ({ version: "1", status: "infeasible", deterministic: true, wall_time_ms: 1, estimated_cost_cents: null, score: null, meals: [], diagnostics: [{ code: "budget_too_low", message: "x", params: {} }] }));
    const [plan] = await ctx.db.select().from(s.mealPlans).where(eq(s.mealPlans.id, first.mealPlanId));
    expect(plan!.status).toBe("failed");
    expect(plan!.diagnostics[0]!.code).toBe("budget_too_low");
    expect(await ctx.db.select().from(s.plannedMeals).where(eq(s.plannedMeals.mealPlanId, first.mealPlanId))).toHaveLength(7);
    const third = await prepareGeneration(ctx.db, ring, { householdId: h.id, weekStart: "2026-11-23", seed: 1, timeLimitS: 5 });
    await expect(runGenerationJob(ctx.db, third.jobId, async () => { throw new Error("planner down"); })).rejects.toThrow("planner down");
    const [job] = await ctx.db.select().from(s.generationJobs).where(eq(s.generationJobs.id, third.jobId));
    expect(job!.status).toBe("failed");
  });

  it("refuse une semaine qui ne commence pas un lundi", async () => {
    const h = await makeHousehold(ctx.db);
    await expect(getOrCreatePlan(ctx.db, h.id, "2026-11-17")).rejects.toThrow(PlanError);
  });

  it("contraintes CHECK en base", async () => {
    await expect(ctx.db.insert(s.households).values({ name: "x", weeklyBudgetCents: -1 })).rejects.toThrow();
    await expect(ctx.db.insert(s.ingredients).values({ id: "Bad Id", name: "x", aisle: "boissons", baseUnit: "g" })).rejects.toThrow();
    await expect(ctx.db.insert(s.ingredients).values({ id: "x_ok", name: "x", aisle: "boissons", baseUnit: "g", allergens: ["licorne"] })).rejects.toThrow();
  });
});
