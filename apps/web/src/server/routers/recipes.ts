import { z } from "zod";
import { and, asc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { ingredients, loadIngredients, recipeFeedback, recipeIngredients, recipes } from "@mise/db";
import {
  buildIngredientIndex, DIETS, EQUIPMENT, extractRecipeFromHtml, matchIngredient, MEAL_SLOTS, parseIngredientLine, parseRational, parseRecipeText,
  recipeAllergens, recipeDiets, recipeNutritionPerServing, toBase, toDecimalString, toFixed, toNumberForDisplay, UNITS, type ImportedRecipe, type Ingredient,
} from "@mise/domain";
import { audit } from "../audit";
import { ExternalError } from "../http";
import { rateLimit } from "../security";
import { badRequest, householdProcedure, notFound, router } from "../trpc";

const lineInput = z.object({
  rawText: z.string().trim().min(1).max(200),
  ingredientId: z.string().max(64).nullable(),
  quantity: z.string().regex(/^\d{1,7}(\.\d{1,3})?$/).nullable(),
  unit: z.string().max(20).nullable(),
  note: z.string().max(200).nullable(),
  optional: z.boolean(),
});

const recipeInput = z.object({
  title: z.string().trim().min(2).max(120),
  prepMinutes: z.number().int().min(0).max(1440),
  cookMinutes: z.number().int().min(0).max(1440),
  baseServings: z.number().int().min(1).max(50),
  difficulty: z.number().int().min(1).max(3),
  equipment: z.array(z.enum(EQUIPMENT)),
  mealSlots: z.array(z.enum(MEAL_SLOTS)).min(1),
  tags: z.array(z.string().max(30)).max(20),
  cuisine: z.string().max(40).nullable(),
  leftoverDays: z.number().int().min(0).max(7),
  freezes: z.boolean(),
  steps: z.array(z.string().trim().min(1).max(2000)).min(1).max(60),
  lines: z.array(lineInput).min(1).max(60),
  sourceUrl: z.string().url().max(500).nullable(),
  sourceName: z.string().max(120).nullable(),
});

const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

type Line = z.infer<typeof lineInput>;

/**
 * Validation métier d'une ligne : unité connue, quantité plausible, conversion possible.
 * Une recette n'est « validée » (donc planifiable) que si toutes ses lignes sont résolues.
 */
function checkLine(l: Line, catalog: Map<string, Ingredient>): string | null {
  if (!l.ingredientId) return "ingrédient non associé";
  const ing = catalog.get(l.ingredientId);
  if (!ing) return "ingrédient inconnu";
  if (l.quantity === null || l.unit === null) return null; // ligne floue (« sel »)
  if (!UNITS[l.unit]) return "unité inconnue";
  try {
    const b = toBase(parseRational(l.quantity), l.unit, ing);
    if (b.kind === "exact") {
      const v = toNumberForDisplay(b.quantity);
      const max = ing.baseUnit === "piece" ? 200 : 20_000;
      if (v <= 0 || v > max) return "quantité invraisemblable";
    }
  } catch {
    return "conversion impossible pour cet ingrédient";
  }
  return null;
}

/** Brouillon importé + propositions de correspondances (écran de validation). */
function toDraft(imp: ImportedRecipe, catalog: Map<string, Ingredient>) {
  const index = buildIngredientIndex([...catalog.values()]);
  return {
    title: imp.title,
    servings: imp.servings ?? 4,
    prepMinutes: imp.prepMinutes ?? 15,
    cookMinutes: imp.cookMinutes ?? 0,
    steps: imp.steps,
    sourceUrl: imp.sourceUrl,
    sourceName: imp.sourceName,
    lines: imp.ingredients.map((l) => {
      const m = matchIngredient(l.name, index);
      return {
        rawText: l.raw,
        name: l.name,
        quantity: l.quantity ? toFixed(l.quantity, 3, "ceil") : null,
        unit: l.unit,
        note: l.note,
        optional: l.optional,
        fuzzy: l.fuzzy,
        match: m.status,
        ingredientId: m.status === "matched" ? m.ingredientId : null,
        candidates: m.candidates.map((c) => ({ id: c.ingredientId, name: c.name, score: c.score })),
      };
    }),
  };
}

async function writeRecipe(ctx: { db: import("@mise/db").Db; householdId: string; userId: string }, input: z.infer<typeof recipeInput>, id?: string) {
  const catalog = await loadIngredients(ctx.db);
  const problems = input.lines.map((l, i) => ({ i, error: checkLine(l, catalog) })).filter((p) => p.error);
  const ings = input.lines.filter((l) => l.ingredientId && catalog.has(l.ingredientId)).map((l) => catalog.get(l.ingredientId!)!);
  // Allergènes et régimes TOUJOURS recalculés par règles (jamais saisis).
  const values = {
    householdId: ctx.householdId,
    slug: slugify(input.title) || "recette",
    title: input.title,
    sourceUrl: input.sourceUrl,
    sourceName: input.sourceName,
    prepMinutes: input.prepMinutes,
    cookMinutes: input.cookMinutes,
    difficulty: input.difficulty,
    equipment: input.equipment,
    baseServings: input.baseServings,
    steps: input.steps,
    tags: input.tags,
    mealSlots: input.mealSlots,
    cuisine: input.cuisine,
    leftoverDays: input.leftoverDays,
    freezes: input.freezes,
    status: problems.length === 0 ? ("validated" as const) : ("pending_review" as const),
    allergens: recipeAllergens(ings),
    diets: problems.length === 0 ? recipeDiets(ings) : [],
    createdBy: ctx.userId,
    updatedAt: new Date(),
  };
  return ctx.db.transaction(async (tx) => {
    let recipeId = id;
    if (recipeId) {
      await tx.update(recipes).set(values).where(and(eq(recipes.id, recipeId), eq(recipes.householdId, ctx.householdId)));
      await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId));
    } else {
      // Slug unique dans le foyer : suffixe numérique si besoin.
      const taken = await tx.select({ slug: recipes.slug }).from(recipes).where(and(eq(recipes.householdId, ctx.householdId), ilike(recipes.slug, `${values.slug}%`)));
      const slug = taken.length ? `${values.slug}-${taken.length + 1}` : values.slug;
      const [r] = await tx.insert(recipes).values({ ...values, slug }).returning({ id: recipes.id });
      recipeId = r!.id;
    }
    await tx.insert(recipeIngredients).values(
      input.lines.map((l, position) => ({
        recipeId: recipeId!,
        position,
        ingredientId: l.ingredientId && catalog.has(l.ingredientId) ? l.ingredientId : null,
        rawText: l.rawText,
        quantity: l.quantity,
        unitCode: l.unit && UNITS[l.unit] ? l.unit : null,
        note: l.note,
        optional: l.optional,
        fuzzy: l.quantity === null || l.unit === null,
      })),
    );
    return { id: recipeId!, status: values.status, problems };
  });
}

export const recipesRouter = router({
  list: householdProcedure
    .input(z.object({ q: z.string().max(100).optional(), slot: z.enum(MEAL_SLOTS).optional(), diet: z.enum(DIETS).optional(), mine: z.boolean().optional(), limit: z.number().int().min(1).max(100).default(30), offset: z.number().int().min(0).default(0) }))
    .query(async ({ ctx, input }) => {
      const where = and(
        input.mine ? eq(recipes.householdId, ctx.householdId) : or(isNull(recipes.householdId), eq(recipes.householdId, ctx.householdId)),
        input.q ? or(ilike(recipes.title, `%${input.q.replace(/[%_]/g, "")}%`), sql`${input.q.toLowerCase()} = any(${recipes.tags})`) : undefined,
        input.slot ? sql`${input.slot}::meal_slot = any(${recipes.mealSlots})` : undefined,
        input.diet ? sql`${input.diet} = any(${recipes.diets})` : undefined,
      );
      const rows = await ctx.db
        .select({ id: recipes.id, title: recipes.title, prepMinutes: recipes.prepMinutes, cookMinutes: recipes.cookMinutes, tags: recipes.tags, allergens: recipes.allergens, diets: recipes.diets, status: recipes.status, householdId: recipes.householdId, cuisine: recipes.cuisine })
        .from(recipes)
        .where(where)
        .orderBy(asc(recipes.title))
        .limit(input.limit)
        .offset(input.offset);
      const fb = rows.length ? await ctx.db.select().from(recipeFeedback).where(and(eq(recipeFeedback.householdId, ctx.householdId), inArray(recipeFeedback.recipeId, rows.map((r) => r.id)))) : [];
      const by = new Map(fb.map((f) => [f.recipeId, f]));
      return rows.map((r) => ({ ...r, mine: r.householdId === ctx.householdId, favorite: by.get(r.id)?.favorite ?? false, rating: by.get(r.id)?.rating ?? null, excluded: by.get(r.id)?.excluded ?? false }));
    }),

  get: householdProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [r] = await ctx.db.select().from(recipes).where(and(eq(recipes.id, input.id), or(isNull(recipes.householdId), eq(recipes.householdId, ctx.householdId))));
    if (!r) notFound("Recette");
    const lines = await ctx.db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, r.id)).orderBy(asc(recipeIngredients.position));
    const catalog = await loadIngredients(ctx.db);
    const nut = recipeNutritionPerServing(
      lines.filter((l) => l.ingredientId && catalog.has(l.ingredientId)).map((l) => ({ ingredient: catalog.get(l.ingredientId!)!, quantity: l.quantity ? parseRational(l.quantity) : null, unit: l.unitCode })),
      r.baseServings,
    );
    const [fb] = await ctx.db.select().from(recipeFeedback).where(and(eq(recipeFeedback.householdId, ctx.householdId), eq(recipeFeedback.recipeId, r.id)));
    return {
      ...r,
      mine: r.householdId === ctx.householdId,
      feedback: fb ?? null,
      lines: lines.map((l) => ({ ...l, ingredientName: l.ingredientId ? (catalog.get(l.ingredientId)?.name ?? null) : null })),
      nutrition: Object.fromEntries(Object.entries(nut.perServing).map(([k, v]) => [k, Math.round(toNumberForDisplay(v))])) as Record<string, number>,
      nutritionMissing: nut.missing,
    };
  }),

  ingredients: householdProcedure.input(z.object({ q: z.string().max(60) })).query(async ({ ctx, input }) => {
    const catalog = await loadIngredients(ctx.db);
    if (!input.q.trim()) return [];
    const m = matchIngredient(input.q, buildIngredientIndex([...catalog.values()]), 8);
    return m.candidates.map((c) => ({ id: c.ingredientId, name: c.name, baseUnit: catalog.get(c.ingredientId)!.baseUnit }));
  }),

  parseLine: householdProcedure.input(z.object({ text: z.string().max(200) })).query(async ({ ctx, input }) => {
    const catalog = await loadIngredients(ctx.db);
    const p = parseIngredientLine(input.text);
    const m = matchIngredient(p.name, buildIngredientIndex([...catalog.values()]));
    return { quantity: p.quantity ? toDecimalString(p.quantity) : null, unit: p.unit, name: p.name, note: p.note, optional: p.optional, fuzzy: p.fuzzy, match: m.status, ingredientId: m.status === "matched" ? m.ingredientId : null, candidates: m.candidates };
  }),

  importUrl: householdProcedure.input(z.object({ url: z.string().url().max(500) })).mutation(async ({ ctx, input }) => {
    await rateLimit(ctx.db, `import:${ctx.householdId}`, 30, 3600);
    let page;
    try {
      page = await ctx.fetchPage(input.url);
    } catch (e) {
      badRequest(e instanceof ExternalError ? `Page inaccessible : ${e.message}` : "Page inaccessible");
    }
    const imp = extractRecipeFromHtml(page.html, page.url);
    if (!imp) badRequest("Aucune recette reconnue sur cette page (essayez l'import par texte)");
    return toDraft(imp, await loadIngredients(ctx.db));
  }),

  importText: householdProcedure.input(z.object({ text: z.string().min(10).max(20_000) })).mutation(async ({ ctx, input }) => toDraft(parseRecipeText(input.text), await loadIngredients(ctx.db))),

  create: householdProcedure.input(recipeInput).mutation(async ({ ctx, input }) => {
    const res = await writeRecipe({ db: ctx.db, householdId: ctx.householdId, userId: ctx.user.id }, input);
    await audit(ctx.db, { householdId: ctx.householdId, userId: ctx.user.id, action: "create", entity: "recipe", entityId: res.id });
    return res;
  }),

  update: householdProcedure.input(recipeInput.extend({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const [r] = await ctx.db.select({ id: recipes.id }).from(recipes).where(and(eq(recipes.id, input.id), eq(recipes.householdId, ctx.householdId)));
    if (!r) notFound("Recette");
    return writeRecipe({ db: ctx.db, householdId: ctx.householdId, userId: ctx.user.id }, input, r.id);
  }),

  remove: householdProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const res = await ctx.db.delete(recipes).where(and(eq(recipes.id, input.id), eq(recipes.householdId, ctx.householdId))).returning({ id: recipes.id }).catch(() => badRequest("Recette utilisée dans un plan : retirez-la d'abord du plan"));
    if (res.length === 0) notFound("Recette");
    await audit(ctx.db, { householdId: ctx.householdId, userId: ctx.user.id, action: "delete", entity: "recipe", entityId: input.id });
    return { ok: true };
  }),

  feedback: householdProcedure
    .input(z.object({ recipeId: z.string().uuid(), rating: z.number().int().min(1).max(5).nullable().optional(), favorite: z.boolean().optional(), excluded: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db.select({ id: recipes.id }).from(recipes).where(and(eq(recipes.id, input.recipeId), or(isNull(recipes.householdId), eq(recipes.householdId, ctx.householdId))));
      if (!r) notFound("Recette");
      const set = { ...(input.rating !== undefined ? { rating: input.rating } : {}), ...(input.favorite !== undefined ? { favorite: input.favorite } : {}), ...(input.excluded !== undefined ? { excluded: input.excluded } : {}), updatedAt: new Date() };
      await ctx.db.insert(recipeFeedback).values({ householdId: ctx.householdId, recipeId: r.id, ...set }).onConflictDoUpdate({ target: [recipeFeedback.householdId, recipeFeedback.recipeId], set });
      return { ok: true };
    }),

  units: householdProcedure.query(() => Object.values(UNITS).map((u) => ({ code: u.code, label: u.labelFr, kind: u.kind }))),

  ingredientById: householdProcedure.input(z.object({ ids: z.array(z.string().max(64)).max(100) })).query(async ({ ctx, input }) =>
    input.ids.length ? ctx.db.select({ id: ingredients.id, name: ingredients.name, baseUnit: ingredients.baseUnit }).from(ingredients).where(inArray(ingredients.id, input.ids)) : [],
  ),
});
