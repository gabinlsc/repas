import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  generationJobs, getOrCreatePlan, householdMembers, loadIngredients, loadPantry, mealPlans, pantryItems, plannedMeals, prepareGeneration, PlanError, recipeIngredients, recipes,
} from "@mise/db";
import {
  add, addNutrition, consumeFromPantry, div, EMPTY_NUTRITION, mul, MEAL_SLOTS, parseRational, rat, recipeIsSafeFor, recipeNutritionPerServing, scaleNutrition, toBase, toFixed,
  weeklyNutritionScore, type Allergen, type Diet,
} from "@mise/domain";
import { decryptJson, EMPTY_SENSITIVE, type MemberSensitive } from "@mise/db";
import { TRPCError } from "@trpc/server";
import { audit } from "../audit";
import { rateLimit } from "../security";
import { badRequest, householdProcedure, notFound, router } from "../trpc";

const week = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function ownedMeal(db: import("@mise/db").Db, householdId: string, mealId: string) {
  const [row] = await db
    .select({ meal: plannedMeals, plan: mealPlans })
    .from(plannedMeals)
    .innerJoin(mealPlans, eq(mealPlans.id, plannedMeals.mealPlanId))
    .where(and(eq(plannedMeals.id, mealId), eq(mealPlans.householdId, householdId)));
  if (!row) notFound("Repas");
  return row;
}

async function eatersOf(db: import("@mise/db").Db, ring: import("@mise/db").Keyring, householdId: string, day: number) {
  const ms = await db.select().from(householdMembers).where(eq(householdMembers.householdId, householdId));
  return ms
    .filter((m) => m.presentDays.includes(day))
    .map((m) => (m.sensitive ? decryptJson<MemberSensitive>(m.sensitive, ring) : EMPTY_SENSITIVE))
    .map((s) => ({ allergens: s.allergens as Allergen[], diets: s.diets as Diet[] }));
}

/** Toute modification manuelle respecte la même règle de sécurité que le solveur. */
async function assertSafe(db: import("@mise/db").Db, ring: import("@mise/db").Keyring, householdId: string, recipeId: string, day: number) {
  const [r] = await db.select({ allergens: recipes.allergens, diets: recipes.diets, status: recipes.status }).from(recipes).where(eq(recipes.id, recipeId));
  if (!r) notFound("Recette");
  if (r.status !== "validated") badRequest("Recette non validée");
  const eaters = await eatersOf(db, ring, householdId, day);
  if (!recipeIsSafeFor({ allergens: r.allergens as Allergen[], diets: r.diets as Diet[] }, eaters)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cette recette contient un allergène ou ne respecte pas le régime d'un convive" });
  }
}

export const planRouter = router({
  current: householdProcedure.input(z.object({ weekStart: week })).query(async ({ ctx, input }) => {
    const plan = await getOrCreatePlan(ctx.db, ctx.householdId, input.weekStart).catch((e: unknown) => (e instanceof PlanError ? badRequest(e.message) : Promise.reject(e)));
    const meals = await ctx.db.select().from(plannedMeals).where(eq(plannedMeals.mealPlanId, plan.id));
    const rids = [...new Set(meals.map((m) => m.recipeId))];
    const rs = rids.length ? await ctx.db.select().from(recipes).where(inArray(recipes.id, rids)) : [];
    const lines = rids.length ? await ctx.db.select().from(recipeIngredients).where(inArray(recipeIngredients.recipeId, rids)) : [];
    const [job] = await ctx.db.select().from(generationJobs).where(eq(generationJobs.mealPlanId, plan.id)).orderBy(desc(generationJobs.createdAt)).limit(1);
    const catalog = await loadIngredients(ctx.db);
    const byRecipe = new Map(rs.map((r) => [r.id, r]));
    // Nutrition et diversité de la semaine (indicatif).
    let total = EMPTY_NUTRITION;
    const vegetables = new Set<string>();
    for (const m of meals) {
      const r = byRecipe.get(m.recipeId)!;
      const ls = lines.filter((l) => l.recipeId === r.id && l.ingredientId && catalog.has(l.ingredientId));
      const nut = recipeNutritionPerServing(ls.map((l) => ({ ingredient: catalog.get(l.ingredientId!)!, quantity: l.quantity ? parseRational(l.quantity) : null, unit: l.unitCode })), r.baseServings);
      total = addNutrition(total, scaleNutrition(nut.perServing, parseRational(m.servings)));
      for (const l of ls) {
        const v = catalog.get(l.ingredientId!)!.vegetableType;
        if (v) vegetables.add(catalog.get(l.ingredientId!)!.id);
      }
    }
    const members = await ctx.db.select().from(householdMembers).where(eq(householdMembers.householdId, ctx.householdId));
    const targets = members.map((m) => (m.sensitive ? decryptJson<MemberSensitive>(m.sensitive, ctx.ring).kcalTarget : null)).filter((k): k is number => k !== null);
    const people = members.reduce((acc, m) => add(acc, parseRational(m.portionFactor)), rat(0));
    const days = new Set(meals.map((m) => m.day)).size || 1;
    const slotsPerDay = Math.max(1, new Set(meals.map((m) => m.slot)).size);
    const nutrition = weeklyNutritionScore({
      days,
      people,
      total,
      distinctVegetables: vegetables.size,
      // Cible au prorata des repas réellement planifiés (ex. dîner seul ≈ 35 %).
      kcalTargetPerPersonDay: Math.round(((targets.length ? targets.reduce((a, b) => a + b, 0) / targets.length : 2000) * Math.min(1, slotsPerDay * 0.35))),
    });
    return {
      plan,
      job: job ? { id: job.id, status: job.status, error: job.error } : null,
      nutrition,
      meals: meals
        .map((m) => {
          const r = byRecipe.get(m.recipeId)!;
          return { ...m, recipe: { id: r.id, title: r.title, prepMinutes: r.prepMinutes, cookMinutes: r.cookMinutes, allergens: r.allergens, diets: r.diets, tags: r.tags } };
        })
        .sort((a, b) => a.day - b.day || MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot)),
    };
  }),

  generate: householdProcedure
    .input(z.object({ weekStart: week, seed: z.number().int().min(0).max(2_147_483_647).optional() }))
    .mutation(async ({ ctx, input }) => {
      await rateLimit(ctx.db, `generate:${ctx.householdId}`, 60, 3600);
      const seed = input.seed ?? Math.floor(Math.random() * 1_000_000);
      try {
        const { jobId } = await prepareGeneration(ctx.db, ctx.ring, { householdId: ctx.householdId, weekStart: input.weekStart, seed, timeLimitS: ctx.plannerTimeLimitS });
        await ctx.enqueue(jobId);
        await audit(ctx.db, { householdId: ctx.householdId, userId: ctx.user.id, action: "generate", entity: "meal_plan", meta: { seed } });
        return { jobId };
      } catch (e) {
        if (e instanceof PlanError) badRequest(e.message);
        throw e;
      }
    }),

  regenerateSlot: householdProcedure.input(z.object({ mealId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const { meal, plan } = await ownedMeal(ctx.db, ctx.householdId, input.mealId);
    await rateLimit(ctx.db, `generate:${ctx.householdId}`, 60, 3600);
    const { jobId } = await prepareGeneration(ctx.db, ctx.ring, { householdId: ctx.householdId, weekStart: plan.weekStart, seed: Math.floor(Math.random() * 1_000_000), timeLimitS: Math.min(5, ctx.plannerTimeLimitS), onlySlot: { day: meal.day, slot: meal.slot } });
    await ctx.enqueue(jobId);
    return { jobId };
  }),

  job: householdProcedure.input(z.object({ jobId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [j] = await ctx.db
      .select({ id: generationJobs.id, status: generationJobs.status, error: generationJobs.error, durationMs: generationJobs.durationMs })
      .from(generationJobs)
      .where(and(eq(generationJobs.id, input.jobId), eq(generationJobs.householdId, ctx.householdId)));
    if (!j) notFound("Job");
    return j;
  }),

  setLocked: householdProcedure.input(z.object({ mealId: z.string().uuid(), locked: z.boolean() })).mutation(async ({ ctx, input }) => {
    await ownedMeal(ctx.db, ctx.householdId, input.mealId);
    await ctx.db.update(plannedMeals).set({ locked: input.locked }).where(eq(plannedMeals.id, input.mealId));
    return { ok: true };
  }),

  /** Glisser-déposer : déplace un repas vers un créneau (échange si occupé). */
  move: householdProcedure.input(z.object({ mealId: z.string().uuid(), day: z.number().int().min(0).max(6), slot: z.enum(MEAL_SLOTS) })).mutation(async ({ ctx, input }) => {
    const { meal } = await ownedMeal(ctx.db, ctx.householdId, input.mealId);
    await assertSafe(ctx.db, ctx.ring, ctx.householdId, meal.recipeId, input.day);
    await ctx.db.transaction(async (tx) => {
      const [other] = await tx.select().from(plannedMeals).where(and(eq(plannedMeals.mealPlanId, meal.mealPlanId), eq(plannedMeals.day, input.day), eq(plannedMeals.slot, input.slot)));
      if (other && other.id === meal.id) return;
      if (other) {
        await assertSafe(ctx.db, ctx.ring, ctx.householdId, other.recipeId, meal.day);
        // Échange des contenus : les portions restent attachées au créneau (convives présents).
        const swap = (m: typeof meal) => ({ recipeId: m.recipeId, locked: m.locked, cookBig: m.cookBig, explanations: m.explanations, leftoverOfId: null, cookedAt: m.cookedAt });
        await tx.update(plannedMeals).set(swap(other)).where(eq(plannedMeals.id, meal.id));
        await tx.update(plannedMeals).set(swap(meal)).where(eq(plannedMeals.id, other.id));
      } else {
        await tx.update(plannedMeals).set({ day: input.day, slot: input.slot, leftoverOfId: null }).where(eq(plannedMeals.id, meal.id));
      }
    });
    return { ok: true };
  }),

  replace: householdProcedure.input(z.object({ mealId: z.string().uuid(), recipeId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const { meal } = await ownedMeal(ctx.db, ctx.householdId, input.mealId);
    const [r] = await ctx.db.select({ id: recipes.id, h: recipes.householdId }).from(recipes).where(eq(recipes.id, input.recipeId));
    if (!r || (r.h !== null && r.h !== ctx.householdId)) notFound("Recette");
    await assertSafe(ctx.db, ctx.ring, ctx.householdId, r.id, meal.day);
    const previous = meal.recipeId;
    await ctx.db.update(plannedMeals).set({ recipeId: r.id, cookBig: false, leftoverOfId: null, explanations: [{ code: "manual", params: {} }] }).where(eq(plannedMeals.id, meal.id));
    return { ok: true, previousRecipeId: previous };
  }),

  remove: householdProcedure.input(z.object({ mealId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const { meal } = await ownedMeal(ctx.db, ctx.householdId, input.mealId);
    await ctx.db.delete(plannedMeals).where(eq(plannedMeals.id, input.mealId));
    return { removed: { day: meal.day, slot: meal.slot, recipeId: meal.recipeId, servings: meal.servings } };
  }),

  restore: householdProcedure
    .input(z.object({ weekStart: week, day: z.number().int().min(0).max(6), slot: z.enum(MEAL_SLOTS), recipeId: z.string().uuid(), servings: z.string().regex(/^\d{1,4}(\.\d{1,2})?$/) }))
    .mutation(async ({ ctx, input }) => {
      const plan = await getOrCreatePlan(ctx.db, ctx.householdId, input.weekStart);
      await assertSafe(ctx.db, ctx.ring, ctx.householdId, input.recipeId, input.day);
      await ctx.db.insert(plannedMeals).values({ mealPlanId: plan.id, day: input.day, slot: input.slot, recipeId: input.recipeId, servings: input.servings }).onConflictDoNothing();
      return { ok: true };
    }),

  /** « Cuisiné » : décrémente le stock (FEFO) des ingrédients utilisés. */
  markCooked: householdProcedure.input(z.object({ mealId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const { meal } = await ownedMeal(ctx.db, ctx.householdId, input.mealId);
    if (meal.cookedAt) return { ok: true, decremented: 0 };
    const [r] = await ctx.db.select().from(recipes).where(eq(recipes.id, meal.recipeId));
    const lines = await ctx.db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, meal.recipeId));
    const catalog = await loadIngredients(ctx.db);
    const pantry = await loadPantry(ctx.db, ctx.householdId);
    const today = new Date().toISOString().slice(0, 10);
    const scale = div(parseRational(meal.servings), rat(r!.baseServings));
    let decremented = 0;
    await ctx.db.transaction(async (tx) => {
      // Un repas de restes ne consomme rien : les ingrédients l'ont été au repas « batch ».
      if (!meal.leftoverOfId) {
        for (const l of lines) {
          if (!l.ingredientId || !l.quantity || !l.unitCode || l.fuzzy) continue;
          const ing = catalog.get(l.ingredientId);
          if (!ing) continue;
          let q;
          try {
            const b = toBase(parseRational(l.quantity), l.unitCode, ing);
            if (b.kind !== "exact") continue;
            q = mul(b.quantity, meal.cookBig ? mul(scale, rat(2)) : scale);
          } catch {
            continue;
          }
          const { updates } = consumeFromPantry(pantry.filter((p) => p.ingredientId === ing.id), q, today);
          for (const [lotId, left] of updates) {
            await tx.update(pantryItems).set({ quantity: toFixed(left, 3, "floor"), updatedAt: new Date() }).where(and(eq(pantryItems.id, lotId), eq(pantryItems.householdId, ctx.householdId)));
            decremented++;
          }
        }
      }
      await tx.update(plannedMeals).set({ cookedAt: new Date() }).where(eq(plannedMeals.id, meal.id));
    });
    return { ok: true, decremented };
  }),
});
