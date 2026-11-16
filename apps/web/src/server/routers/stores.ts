import { z } from "zod";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { storeLayouts, stores } from "@mise/db";
import { AISLES } from "@mise/domain";
import { badRequest, householdProcedure, notFound, router } from "../trpc";

export const storesRouter = router({
  list: householdProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(stores).where(or(isNull(stores.householdId), eq(stores.householdId, ctx.householdId))).orderBy(asc(stores.name));
    const layouts = await ctx.db.select().from(storeLayouts).orderBy(asc(storeLayouts.position));
    return rows.map((s) => ({ ...s, mine: s.householdId === ctx.householdId, aisles: layouts.filter((l) => l.storeId === s.id).map((l) => l.aisle) }));
  }),

  /** Crée un magasin du foyer, éventuellement en copiant le parcours d'un magasin type. */
  create: householdProcedure.input(z.object({ name: z.string().trim().min(1).max(60), aisles: z.array(z.enum(AISLES)).min(1) })).mutation(async ({ ctx, input }) => {
    if (new Set(input.aisles).size !== input.aisles.length) badRequest("Rayon en double");
    const [s] = await ctx.db.insert(stores).values({ householdId: ctx.householdId, name: input.name }).returning({ id: stores.id });
    await ctx.db.insert(storeLayouts).values(input.aisles.map((aisle, position) => ({ storeId: s!.id, aisle, position })));
    return s!;
  }),

  setLayout: householdProcedure.input(z.object({ storeId: z.string().uuid(), aisles: z.array(z.enum(AISLES)).min(1) })).mutation(async ({ ctx, input }) => {
    if (new Set(input.aisles).size !== input.aisles.length) badRequest("Rayon en double");
    const [s] = await ctx.db.select().from(stores).where(and(eq(stores.id, input.storeId), eq(stores.householdId, ctx.householdId)));
    if (!s) notFound("Magasin");
    await ctx.db.transaction(async (tx) => {
      await tx.delete(storeLayouts).where(eq(storeLayouts.storeId, s.id));
      await tx.insert(storeLayouts).values(input.aisles.map((aisle, position) => ({ storeId: s.id, aisle, position })));
    });
    return { ok: true };
  }),
});
