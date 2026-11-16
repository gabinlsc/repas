import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { ingredients, loadIngredients, pantryItems } from "@mise/db";
import { expiryAlerts, formatQuantity, parseRational, toBase, toFixed, type BaseUnit } from "@mise/domain";
import { badRequest, householdProcedure, notFound, router } from "../trpc";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const pantryRouter = router({
  list: householdProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({ item: pantryItems, name: ingredients.name, baseUnit: ingredients.baseUnit, aisle: ingredients.aisle })
      .from(pantryItems)
      .innerJoin(ingredients, eq(ingredients.id, pantryItems.ingredientId))
      .where(eq(pantryItems.householdId, ctx.householdId))
      .orderBy(asc(pantryItems.bestBefore), asc(ingredients.name));
    const today = new Date().toISOString().slice(0, 10);
    const alerts = expiryAlerts(rows.map((r) => ({ id: r.item.id, ingredientId: r.item.ingredientId, quantity: parseRational(r.item.quantity), bestBefore: r.item.bestBefore, expiryKind: r.item.expiryKind })), today);
    const alertBy = new Map(alerts.map((a) => [a.lotId, a]));
    return rows
      .filter((r) => parseRational(r.item.quantity).n > 0n)
      .map((r) => ({ ...r.item, name: r.name, baseUnit: r.baseUnit, aisle: r.aisle, display: formatQuantity(parseRational(r.item.quantity), r.baseUnit as BaseUnit), alert: alertBy.get(r.item.id) ?? null }));
  }),

  /** Ajout rapide : « 500 g de riz » ou quantité + unité explicites. */
  add: householdProcedure
    .input(
      z.object({
        ingredientId: z.string().max(64),
        quantity: z.string().regex(/^\d{1,7}([.,]\d{1,3})?$/),
        unit: z.string().max(20),
        bestBefore: date.nullable(),
        expiryKind: z.enum(["dlc", "ddm"]).default("ddm"),
        location: z.enum(["fridge", "freezer", "cupboard"]).default("cupboard"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const catalog = await loadIngredients(ctx.db);
      const ing = catalog.get(input.ingredientId);
      if (!ing) notFound("Ingrédient");
      let base;
      try {
        base = toBase(parseRational(input.quantity.replace(",", ".")), input.unit, ing);
      } catch {
        badRequest("Unité incompatible avec cet ingrédient");
      }
      if (base.kind !== "exact") badRequest("Quantité imprécise : indiquez une valeur");
      const [row] = await ctx.db
        .insert(pantryItems)
        .values({ householdId: ctx.householdId, ingredientId: ing.id, quantity: toFixed(base.quantity, 3, "floor"), bestBefore: input.bestBefore, expiryKind: input.expiryKind, location: input.location })
        .returning({ id: pantryItems.id });
      return row!;
    }),

  update: householdProcedure
    .input(z.object({ id: z.string().uuid(), quantity: z.string().regex(/^\d{1,9}(\.\d{1,3})?$/).optional(), bestBefore: date.nullable().optional(), location: z.enum(["fridge", "freezer", "cupboard"]).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...set } = input;
      const res = await ctx.db.update(pantryItems).set({ ...set, updatedAt: new Date() }).where(and(eq(pantryItems.id, id), eq(pantryItems.householdId, ctx.householdId))).returning({ id: pantryItems.id });
      if (!res.length) notFound("Article");
      return { ok: true };
    }),

  remove: householdProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const res = await ctx.db.delete(pantryItems).where(and(eq(pantryItems.id, input.id), eq(pantryItems.householdId, ctx.householdId))).returning();
    if (!res.length) notFound("Article");
    const r = res[0]!;
    // Renvoyé au client pour permettre « Annuler » sans dialogue de confirmation.
    return { removed: { ingredientId: r.ingredientId, quantity: r.quantity, bestBefore: r.bestBefore, expiryKind: r.expiryKind, location: r.location } };
  }),

  restore: householdProcedure
    .input(z.object({ ingredientId: z.string().max(64), quantity: z.string().regex(/^\d{1,9}(\.\d{1,3})?$/), bestBefore: date.nullable(), expiryKind: z.enum(["dlc", "ddm"]), location: z.enum(["fridge", "freezer", "cupboard"]) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(pantryItems).values({ householdId: ctx.householdId, ...input });
      return { ok: true };
    }),
});
