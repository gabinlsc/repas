import {
  buildPlanRequest, DEFAULT_WEIGHTS, parseRational, planResponseSchema, weightsSchema, type MealSlot, type PlanRequest, type PlanResponse, type PlanWeights,
} from "@mise/domain";
import { and, eq } from "drizzle-orm";
import type { Db } from "../client.js";
import { decryptJson, type Keyring } from "../crypto.js";
import * as s from "../schema.js";
import { EMPTY_SENSITIVE, loadIngredients, loadPantry, loadPlannableRecipes, loadProducts, type MemberSensitive } from "./catalog.js";

export class PlanError extends Error {
  constructor(readonly code: "NO_MEMBERS" | "NO_SLOTS" | "NOT_FOUND" | "INVALID_WEEK", message: string) {
    super(message);
  }
}

export function isMonday(iso: string): boolean {
  return new Date(`${iso}T00:00:00Z`).getUTCDay() === 1;
}

export async function getOrCreatePlan(db: Db, householdId: string, weekStart: string): Promise<typeof s.mealPlans.$inferSelect> {
  if (!isMonday(weekStart)) throw new PlanError("INVALID_WEEK", "La semaine doit commencer un lundi");
  const [existing] = await db.select().from(s.mealPlans).where(and(eq(s.mealPlans.householdId, householdId), eq(s.mealPlans.weekStart, weekStart)));
  if (existing) return existing;
  const [created] = await db.insert(s.mealPlans).values({ householdId, weekStart }).onConflictDoNothing().returning();
  if (created) return created;
  const [again] = await db.select().from(s.mealPlans).where(and(eq(s.mealPlans.householdId, householdId), eq(s.mealPlans.weekStart, weekStart)));
  return again!;
}

export interface GenerationOptions {
  readonly householdId: string;
  readonly weekStart: string;
  readonly seed: number;
  readonly timeLimitS: number;
  /** régénération d'un seul créneau : tous les autres repas sont figés. */
  readonly onlySlot?: { day: number; slot: MealSlot } | null;
  readonly weights?: Partial<PlanWeights> | null;
}

/** Construit le snapshot reproductible et enregistre le job (statut « queued »). */
export async function prepareGeneration(db: Db, ring: Keyring, opts: GenerationOptions): Promise<{ jobId: string; mealPlanId: string; request: PlanRequest }> {
  const plan = await getOrCreatePlan(db, opts.householdId, opts.weekStart);
  const [household] = await db.select().from(s.households).where(eq(s.households.id, opts.householdId));
  if (!household) throw new PlanError("NOT_FOUND", "Foyer introuvable");
  const members = await db.select().from(s.householdMembers).where(eq(s.householdMembers.householdId, opts.householdId));
  if (members.length === 0) throw new PlanError("NO_MEMBERS", "Ajoutez au moins un membre au foyer");
  const existing = await db.select().from(s.plannedMeals).where(eq(s.plannedMeals.mealPlanId, plan.id));

  const [ingredients, recipes, products, pantry] = await Promise.all([
    loadIngredients(db),
    loadPlannableRecipes(db, opts.householdId),
    loadProducts(db, opts.householdId),
    loadPantry(db, opts.householdId),
  ]);

  const sensitive = members.map((m) => (m.sensitive ? decryptJson<MemberSensitive>(m.sensitive, ring) : EMPTY_SENSITIVE));
  const locks = new Map<string, string>();
  for (const m of existing) {
    const key = `${m.day}:${m.slot}`;
    if (opts.onlySlot) {
      if (!(m.day === opts.onlySlot.day && m.slot === opts.onlySlot.slot)) locks.set(key, m.recipeId);
    } else if (m.locked) locks.set(key, m.recipeId);
  }
  const slots = [0, 1, 2, 3, 4, 5, 6].flatMap((day) => {
    const attendees = members.filter((m) => m.presentDays.includes(day)).map((m) => m.id);
    if (attendees.length === 0) return [];
    return (household.mealSlots as MealSlot[]).map((slot) => ({ day, slot, attendeeIds: attendees, lockedRecipeId: locks.get(`${day}:${slot}`) ?? null }));
  });
  if (slots.length === 0) throw new PlanError("NO_SLOTS", "Aucun repas à planifier cette semaine");

  // Régénération d'un créneau : on écarte la recette actuelle pour proposer autre chose.
  const current = opts.onlySlot ? existing.find((m) => m.day === opts.onlySlot!.day && m.slot === opts.onlySlot!.slot) : undefined;
  const lockedIds = new Set(locks.values());
  const plannable = current && !lockedIds.has(current.recipeId) ? recipes.filter((r) => r.id !== current.recipeId) : recipes;

  const weights = weightsSchema.parse({ ...DEFAULT_WEIGHTS, ...(household.weights ?? {}), ...(opts.weights ?? {}) });
  const request = buildPlanRequest({
    seed: opts.seed,
    timeLimitS: opts.timeLimitS,
    weekStart: opts.weekStart,
    repeatWindowDays: household.repeatWindowDays,
    budgetCents: household.weeklyBudgetCents,
    equipment: household.equipment,
    weights,
    members: members.map((m, i) => ({
      id: m.id,
      portionFactor: parseRational(m.portionFactor),
      allergens: sensitive[i]!.allergens,
      diets: sensitive[i]!.diets,
      kcalTarget: sensitive[i]!.kcalTarget,
      aversions: sensitive[i]!.aversions,
    })),
    maxPrepMinutesByDay: household.maxPrepMinutes,
    slots,
    recipes: plannable,
    ingredients,
    products,
    pantry,
  });
  const [job] = await db
    .insert(s.generationJobs)
    .values({ householdId: opts.householdId, mealPlanId: plan.id, seed: opts.seed, snapshot: request as unknown as Record<string, unknown>, status: "queued" })
    .returning({ id: s.generationJobs.id });
  await db.update(s.mealPlans).set({ status: "generating", params: { seed: opts.seed, weights, onlySlot: opts.onlySlot ?? null }, updatedAt: new Date() }).where(eq(s.mealPlans.id, plan.id));
  return { jobId: job!.id, mealPlanId: plan.id, request };
}

export type PlannerCall = (req: PlanRequest) => Promise<unknown>;

/** Exécute un job : appelle le solveur, valide la réponse, écrit le plan. Idempotent. */
export async function runGenerationJob(db: Db, jobId: string, callPlanner: PlannerCall): Promise<PlanResponse | null> {
  const [job] = await db.select().from(s.generationJobs).where(eq(s.generationJobs.id, jobId));
  if (!job) throw new PlanError("NOT_FOUND", "Job introuvable");
  if (job.status === "succeeded") return planResponseSchema.parse(job.result);
  const started = Date.now();
  await db.update(s.generationJobs).set({ status: "running", startedAt: new Date() }).where(eq(s.generationJobs.id, jobId));
  try {
    const raw = await callPlanner(job.snapshot as unknown as PlanRequest);
    const res = planResponseSchema.parse(raw);
    await applyPlanResponse(db, job.mealPlanId, job.snapshot as unknown as PlanRequest, res);
    await db
      .update(s.generationJobs)
      .set({ status: "succeeded", result: res as unknown as Record<string, unknown>, durationMs: Date.now() - started, finishedAt: new Date() })
      .where(eq(s.generationJobs.id, jobId));
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "erreur inconnue";
    await db.update(s.generationJobs).set({ status: "failed", error: message.slice(0, 2000), durationMs: Date.now() - started, finishedAt: new Date() }).where(eq(s.generationJobs.id, jobId));
    await db.update(s.mealPlans).set({ status: "failed", diagnostics: [{ code: "planner_error", message: "Le moteur de planification est indisponible, réessayez.", params: {} }] }).where(eq(s.mealPlans.id, job.mealPlanId));
    throw e;
  }
}

/**
 * Écrit la réponse du solveur. Un plan infaisable ne détruit jamais le plan existant :
 * seuls les diagnostics sont enregistrés (l'utilisateur garde sa semaine actuelle).
 */
export async function applyPlanResponse(db: Db, mealPlanId: string, req: PlanRequest, res: PlanResponse): Promise<void> {
  await db.transaction(async (tx) => {
    if (res.status === "infeasible" || res.status === "invalid" || res.meals.length === 0) {
      await tx.update(s.mealPlans).set({ status: "failed", diagnostics: res.diagnostics, updatedAt: new Date() }).where(eq(s.mealPlans.id, mealPlanId));
      return;
    }
    const lockedKeys = new Set(req.days.flatMap((d) => d.slots.filter((x) => x.locked_recipe_id).map((x) => `${d.day}:${x.slot}`)));
    const previous = await tx.select().from(s.plannedMeals).where(eq(s.plannedMeals.mealPlanId, mealPlanId));
    const wasLocked = new Set(previous.filter((p) => p.locked).map((p) => `${p.day}:${p.slot}`));
    await tx.delete(s.plannedMeals).where(eq(s.plannedMeals.mealPlanId, mealPlanId));
    const inserted = await tx
      .insert(s.plannedMeals)
      .values(
        res.meals.map((m) => ({
          mealPlanId,
          day: m.day,
          slot: m.slot,
          recipeId: m.recipe_id,
          servings: (m.servings_centi / 100).toFixed(2),
          locked: wasLocked.has(`${m.day}:${m.slot}`) && lockedKeys.has(`${m.day}:${m.slot}`),
          cookBig: m.cook_big,
          explanations: m.explanations,
        })),
      )
      .returning({ id: s.plannedMeals.id, day: s.plannedMeals.day, slot: s.plannedMeals.slot });
    const idBy = new Map(inserted.map((r) => [`${r.day}:${r.slot}`, r.id]));
    for (const m of res.meals) {
      if (!m.leftover_of) continue;
      const src = idBy.get(`${m.leftover_of.day}:${m.leftover_of.slot}`);
      if (src) await tx.update(s.plannedMeals).set({ leftoverOfId: src }).where(eq(s.plannedMeals.id, idBy.get(`${m.day}:${m.slot}`)!));
    }
    await tx
      .update(s.mealPlans)
      .set({ status: "ready", score: (res.score ?? {}) as Record<string, unknown>, diagnostics: res.diagnostics, estimatedCostCents: res.estimated_cost_cents, updatedAt: new Date() })
      .where(eq(s.mealPlans.id, mealPlanId));
  });
}
