import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { households, mealPlans, priceObservations, products, shoppingListItems, shoppingLists, stores } from "@mise/db";
import { parseRational, toDecimalString } from "@mise/domain";
import { householdProcedure, notFound, router } from "../trpc";

export const budgetRouter = router({
  /** Coût estimé vs réel par semaine (les prix réels viennent du mode magasin). */
  summary: householdProcedure.input(z.object({ weeks: z.number().int().min(1).max(52).default(8) })).query(async ({ ctx, input }) => {
    const [h] = await ctx.db.select({ budget: households.weeklyBudgetCents }).from(households).where(eq(households.id, ctx.householdId));
    const since = new Date(Date.now() - input.weeks * 7 * 86400_000).toISOString().slice(0, 10);
    const plans = await ctx.db.select().from(mealPlans).where(and(eq(mealPlans.householdId, ctx.householdId), gte(mealPlans.weekStart, since))).orderBy(asc(mealPlans.weekStart));
    const lists = plans.length ? await ctx.db.select().from(shoppingLists).where(and(eq(shoppingLists.householdId, ctx.householdId), inArray(shoppingLists.mealPlanId, plans.map((p) => p.id)))) : [];
    const actual = lists.length
      ? await ctx.db
          .select({ listId: shoppingListItems.listId, spent: sql<number>`coalesce(sum(${shoppingListItems.actualPriceCents}), 0)::int`, priced: sql<number>`count(${shoppingListItems.actualPriceCents})::int` })
          .from(shoppingListItems)
          .where(inArray(shoppingListItems.listId, lists.map((l) => l.id)))
          .groupBy(shoppingListItems.listId)
      : [];
    return {
      budgetCents: h?.budget ?? null,
      weeks: plans.map((p) => {
        const l = lists.find((x) => x.mealPlanId === p.id);
        const a = l ? actual.find((x) => x.listId === l.id) : undefined;
        return { weekStart: p.weekStart, plannedCents: p.estimatedCostCents, listCents: l?.estimatedCents ?? null, actualCents: a && a.priced > 0 ? a.spent : null };
      }),
    };
  }),

  products: householdProcedure.input(z.object({ ingredientId: z.string().max(64) })).query(async ({ ctx, input }) =>
    ctx.db.select({ id: products.id, name: products.name, packageQuantity: products.packageQuantity }).from(products).where(and(eq(products.ingredientId, input.ingredientId), or(isNull(products.householdId), eq(products.householdId, ctx.householdId)))),
  ),

  priceHistory: householdProcedure.input(z.object({ productId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [p] = await ctx.db.select().from(products).where(and(eq(products.id, input.productId), or(isNull(products.householdId), eq(products.householdId, ctx.householdId))));
    if (!p) notFound("Produit");
    const obs = await ctx.db
      .select({ priceCents: priceObservations.priceCents, observedAt: priceObservations.observedAt, source: priceObservations.source, store: stores.name })
      .from(priceObservations)
      .leftJoin(stores, eq(stores.id, priceObservations.storeId))
      .where(and(eq(priceObservations.productId, p.id), or(isNull(priceObservations.householdId), eq(priceObservations.householdId, ctx.householdId))))
      .orderBy(desc(priceObservations.observedAt))
      .limit(100);
    return { product: { ...p, size: toDecimalString(parseRational(p.packageQuantity)) }, observations: obs };
  }),

  addPrice: householdProcedure
    .input(z.object({ productId: z.string().uuid(), priceCents: z.number().int().min(1).max(999_999), storeId: z.string().uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const [p] = await ctx.db.select({ id: products.id }).from(products).where(and(eq(products.id, input.productId), or(isNull(products.householdId), eq(products.householdId, ctx.householdId))));
      if (!p) notFound("Produit");
      await ctx.db.insert(priceObservations).values({ productId: p.id, priceCents: input.priceCents, storeId: input.storeId, householdId: ctx.householdId, source: "manual" });
      return { ok: true };
    }),
});
