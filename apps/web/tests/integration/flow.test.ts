import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { householdMembers, pantryItems, sessions } from "@mise/db";
import { encodeHlc } from "@mise/domain";
import { validateSession } from "@/server/auth";
import { anonCaller, testEnv, userCaller, type TestEnv } from "./helpers";

let env: TestEnv;
beforeAll(async () => {
  env = await testEnv();
});
afterAll(async () => env.close());

const settings = { weeklyBudgetCents: 9000, mealSlots: ["lunch", "dinner"] as Array<"lunch" | "dinner">, maxPrepMinutes: [30, 30, 30, 30, 30, 60, 60], repeatWindowDays: 7, equipment: ["plaques", "four"] as Array<"plaques" | "four"> };
const sensitive = (allergens: string[] = [], diets: string[] = []) => ({ allergens, diets, aversions: [], kcalTarget: null }) as never;
const WEEK = "2026-11-16";

describe("authentification", () => {
  it("inscription, connexion, erreurs génériques, déconnexion", async () => {
    const { email, caller, token } = await userCaller(env);
    expect((await caller.auth.me())!.email).toBe(email);
    await expect(anonCaller(env).auth.register({ email, password: "motdepasse-solide", displayName: "X" })).rejects.toThrow(/Inscription impossible/);
    await expect(anonCaller(env).auth.login({ email, password: "mauvais-mot-de-passe" })).rejects.toThrow(/Identifiants incorrects/);
    await expect(anonCaller(env).auth.login({ email: "inconnu@test.fr", password: "peu-importe-123" })).rejects.toThrow(/Identifiants incorrects/);
    await expect(anonCaller(env).auth.register({ email: "a@b.fr", password: "court", displayName: "X" })).rejects.toThrow();
    const cookies: string[] = [];
    await anonCaller(env, cookies).auth.login({ email: email.toUpperCase(), password: "motdepasse-solide" });
    expect(cookies[0]).toMatch(/mise_session=.+HttpOnly; SameSite=Lax/);
    await caller.auth.logout();
    expect(await validateSession(env.db, token)).toBeNull();
  });

  it("limite les tentatives de connexion", async () => {
    const { email } = await userCaller(env);
    const c = anonCaller(env);
    for (let i = 0; i < 10; i++) await c.auth.login({ email, password: "faux-mot-de-passe" }).catch(() => undefined);
    await expect(c.auth.login({ email, password: "motdepasse-solide" })).rejects.toThrow(/Trop de tentatives/);
  });

  it("rotation du jeton de session après 24 h, ancien jeton accepté brièvement", async () => {
    const { token, userId } = await userCaller(env);
    await env.db.update(sessions).set({ rotatedAt: new Date(Date.now() - 25 * 3600_000) }).where(eq(sessions.userId, userId));
    const r = await validateSession(env.db, token);
    expect(r!.rotatedToken).toBeTruthy();
    expect(await validateSession(env.db, token)).not.toBeNull(); // période de grâce
    expect((await validateSession(env.db, r!.rotatedToken!))!.rotatedToken).toBeNull();
    await env.db.update(sessions).set({ rotatedAt: new Date(Date.now() - 120_000) }).where(eq(sessions.userId, userId));
    expect(await validateSession(env.db, token)).toBeNull(); // grâce expirée
    expect(await validateSession(env.db, "jeton-bidon")).toBeNull();
  });
});

describe("parcours principal : onboarding → plan → liste → magasin → stock", () => {
  it("de bout en bout", async () => {
    const { caller } = await userCaller(env);
    const h = await caller.household.get();
    await caller.household.completeOnboarding({
      settings,
      members: [
        { id: h.members[0]!.id, name: "Moi", portionFactor: "1", presentDays: [0, 1, 2, 3, 4, 5, 6], sensitive: sensitive(["fruits_a_coque"]) },
        { name: "Enfant", portionFactor: "0.5", presentDays: [0, 1, 2, 3, 4, 5, 6], sensitive: sensitive(["oeufs"], ["vegetarian"]) },
      ],
    });
    const h2 = await caller.household.get();
    expect(h2.members).toHaveLength(2);
    expect(h2.members[1]!.sensitive.allergens).toEqual(["oeufs"]);
    // Données de santé chiffrées en base
    const raw = await env.db.select().from(householdMembers).where(eq(householdMembers.householdId, h2.household.id));
    expect(raw.every((m) => m.sensitive && !m.sensitive.includes(Buffer.from("oeufs")))).toBe(true);

    const { jobId } = await caller.plan.generate({ weekStart: WEEK, seed: 1 });
    expect((await caller.plan.job({ jobId })).status).toBe("succeeded");
    const plan = await caller.plan.current({ weekStart: WEEK });
    expect(plan.meals).toHaveLength(14);
    for (const m of plan.meals) {
      expect(m.recipe.allergens).not.toContain("oeufs");
      expect(m.recipe.allergens).not.toContain("fruits_a_coque");
      expect(m.recipe.diets).toContain("vegetarian");
    }
    expect(plan.nutrition.score).toBeGreaterThanOrEqual(0);

    // Verrouillage, déplacement (échange), remplacement refusé si dangereux
    const [m0, m1] = plan.meals;
    await caller.plan.setLocked({ mealId: m0!.id, locked: true });
    await caller.plan.move({ mealId: m0!.id, day: m1!.day, slot: m1!.slot });
    const after = await caller.plan.current({ weekStart: WEEK });
    expect(after.meals.find((m) => m.day === m1!.day && m.slot === m1!.slot)!.recipeId).toBe(m0!.recipeId);
    const unsafe = (await caller.recipes.list({ q: "Omelette" }))[0]!;
    await expect(caller.plan.replace({ mealId: m1!.id, recipeId: unsafe.id })).rejects.toThrow(/allergène|régime/);

    // Régénération d'un seul créneau
    const target = after.meals[5]!;
    const regen = await caller.plan.regenerateSlot({ mealId: target.id });
    expect((await caller.plan.job({ jobId: regen.jobId })).status).toBe("succeeded");
    const regenerated = await caller.plan.current({ weekStart: WEEK });
    for (const m of regenerated.meals) if (!(m.day === target.day && m.slot === target.slot)) expect(m.recipeId).toBe(after.meals.find((x) => x.day === m.day && x.slot === m.slot)!.recipeId);

    // Liste de courses
    const { listId } = await caller.shopping.generate({ mealPlanId: plan.plan.id });
    const list = await caller.shopping.get({ listId });
    expect(list.items.length).toBeGreaterThan(5);
    expect(list.list.estimatedCents).toBeGreaterThan(0);
    expect(env.published.some((p) => (p.payload as { listId?: string }).listId === listId)).toBe(true);
    const md = await caller.shopping.markdown({ listId });
    expect(md).toMatch(/^# Liste de courses/);

    // Mode magasin : opérations idempotentes, LWW
    const item = list.items[0]!;
    const clockA = encodeHlc({ wall: Date.now(), counter: 0, node: "a" });
    const op = { id: crypto.randomUUID(), type: "patch" as const, itemId: item.id, patch: { checked: true, actualPriceCents: 250 }, clock: clockA };
    expect((await caller.shopping.sync({ ops: [op] })).results[0]!.status).toBe("applied");
    expect((await caller.shopping.sync({ ops: [op] })).results[0]!.status).toBe("duplicate");
    const older = encodeHlc({ wall: Date.now() - 60_000, counter: 0, node: "b" });
    await caller.shopping.sync({ ops: [{ id: crypto.randomUUID(), type: "patch", itemId: item.id, patch: { checked: false }, clock: older }] });
    expect((await caller.shopping.get({ listId })).items.find((i) => i.id === item.id)!.checked).toBe(true);
    const extraId = crypto.randomUUID();
    await caller.shopping.sync({ ops: [{ id: crypto.randomUUID(), type: "add", itemId: extraId, listId, label: "Papier toilette", aisle: "epicerie_salee", clock: clockA }] });
    expect((await caller.shopping.get({ listId })).items.some((i) => i.id === extraId && i.isExtra)).toBe(true);

    // Régénérer la liste conserve l'article ajouté et les coches
    await caller.shopping.generate({ mealPlanId: plan.plan.id });
    const regenList = await caller.shopping.get({ listId });
    expect(regenList.items.some((i) => i.id === extraId)).toBe(true);
    expect(regenList.items.find((i) => i.ingredientId === item.ingredientId)!.checked).toBe(true);

    // Clôture → stock
    const closed = await caller.shopping.close({ listId });
    expect(closed.addedToPantry).toBe(1);
    const pantry = await caller.pantry.list();
    expect(pantry).toHaveLength(1);

    // Cuisiné → décrément du stock si l'ingrédient est utilisé
    const cookMeal = regenerated.meals.find((m) => m.day === 0)!;
    await caller.plan.markCooked({ mealId: cookMeal.id });
    expect((await caller.plan.markCooked({ mealId: cookMeal.id })).decremented).toBe(0);

    // Budget
    const budget = await caller.budget.summary({ weeks: 52 });
    expect(budget.budgetCents).toBe(9000);
    expect(budget.weeks.find((w) => w.weekStart === WEEK)!.actualCents).toBe(250);

    // Export RGPD puis suppression du compte
    const exp = await caller.account.export();
    expect(exp.members[1]!.sensitive).toMatchObject({ allergens: ["oeufs"] });
    await expect(caller.account.delete({ password: "faux", confirm: "SUPPRIMER" })).rejects.toThrow(/incorrect/);
    await caller.account.delete({ password: "motdepasse-solide", confirm: "SUPPRIMER" });
    expect(await env.db.select().from(pantryItems).where(eq(pantryItems.householdId, h2.household.id))).toHaveLength(0);
  });
});

describe("recettes : import et validation", () => {
  it("import URL → brouillon avec correspondances, création validée ou en attente", async () => {
    const { caller } = await userCaller(env);
    const draft = await caller.recipes.importUrl({ url: "https://exemple.fr/soupe" });
    expect(draft.title).toBe("Soupe test");
    expect(draft.lines.map((l) => l.match)).toEqual(["matched", "matched", "unknown"]);
    const base = { title: "Soupe test", prepMinutes: 10, cookMinutes: 20, baseServings: 2, difficulty: 1, equipment: ["plaques" as const], mealSlots: ["dinner" as const], tags: [], cuisine: null, leftoverDays: 0, freezes: false, steps: ["Cuire."], sourceUrl: null, sourceName: null };
    const pending = await caller.recipes.create({ ...base, lines: draft.lines.map((l) => ({ rawText: l.rawText, ingredientId: l.ingredientId, quantity: l.quantity, unit: l.unit, note: null, optional: false })) });
    expect(pending.status).toBe("pending_review");
    const ok = await caller.recipes.update({ id: pending.id, ...base, lines: [{ rawText: "2 carottes", ingredientId: "carotte", quantity: "2", unit: "piece", note: null, optional: false }, { rawText: "50 g de beurre", ingredientId: "beurre", quantity: "50", unit: "g", note: null, optional: false }] });
    expect(ok.status).toBe("validated");
    const r = await caller.recipes.get({ id: pending.id });
    expect(r.allergens).toEqual(["lait"]);
    expect(r.diets).toContain("vegetarian");
    await expect(caller.recipes.create({ ...base, lines: [{ rawText: "x", ingredientId: "carotte", quantity: "999999", unit: "kg", note: null, optional: false }] })).resolves.toMatchObject({ status: "pending_review" });
    const text = await caller.recipes.importText({ text: "Crêpes\nPour 4 personnes\nIngrédients\n250 g de farine\n3 œufs\nPréparation\nMélanger." });
    expect(text.lines.every((l) => l.match === "matched")).toBe(true);
    await caller.recipes.feedback({ recipeId: pending.id, favorite: true, rating: 5 });
    expect((await caller.recipes.list({ mine: true })).find((r) => r.id === pending.id)!.favorite).toBe(true);
    expect((await caller.products.lookupEan({ ean: "3017620422003" }))!.source).toBe("openfoodfacts");
    await caller.recipes.remove({ id: pending.id });
  });
});
