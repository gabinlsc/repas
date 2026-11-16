import { z } from "zod";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  generateShoppingList, ingredients, mealPlans, pantryItems, priceObservations, products, shoppingListItems, shoppingLists, storeLayouts, stores, syncOps, type Db,
} from "@mise/db";
import { AISLES, applyPatch, formatQuantity, gt, parseRational, sub, ZERO, type Aisle, type BaseUnit } from "@mise/domain";
import { audit } from "../audit";
import { householdProcedure, notFound, router } from "../trpc";

const hlc = z.string().regex(/^\d{15}:\d{6}:[A-Za-z0-9_-]{1,64}$/);

/** Champs synchronisables d'un article (fusion LWW champ par champ). */
const patchSchema = z
  .object({
    checked: z.boolean(),
    purchasedQuantity: z.string().regex(/^\d{1,9}(\.\d{1,3})?$/).nullable(),
    actualPriceCents: z.number().int().min(0).max(1_000_000).nullable(),
  })
  .partial();

const opSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string().uuid(), type: z.literal("patch"), itemId: z.string().uuid(), patch: patchSchema, clock: hlc }),
  z.object({ id: z.string().uuid(), type: z.literal("add"), itemId: z.string().uuid(), listId: z.string().uuid(), label: z.string().trim().min(1).max(80), aisle: z.enum(AISLES), clock: hlc }),
  z.object({ id: z.string().uuid(), type: z.literal("delete"), itemId: z.string().uuid(), clock: hlc }),
]);
export type SyncOp = z.infer<typeof opSchema>;

async function ownedList(db: Db, householdId: string, listId: string) {
  const [l] = await db.select().from(shoppingLists).where(and(eq(shoppingLists.id, listId), eq(shoppingLists.householdId, householdId)));
  if (!l) notFound("Liste");
  return l;
}

async function serializeList(db: Db, listId: string) {
  const [list] = await db.select().from(shoppingLists).where(eq(shoppingLists.id, listId));
  const items = await db.select().from(shoppingListItems).where(eq(shoppingListItems.listId, listId));
  const order = list!.storeId ? await db.select().from(storeLayouts).where(eq(storeLayouts.storeId, list!.storeId)) : [];
  const rank = (a: Aisle) => order.find((o) => o.aisle === a)?.position ?? 100 + AISLES.indexOf(a);
  return {
    list: list!,
    items: items
      .map((i) => ({
        ...i,
        display: i.quantityToBuy && i.baseUnit ? formatQuantity(parseRational(i.quantityToBuy), i.baseUnit as BaseUnit) : null,
        surplusDisplay: i.surplus && i.baseUnit && gt(parseRational(i.surplus), ZERO) ? formatQuantity(parseRational(i.surplus), i.baseUnit as BaseUnit) : null,
      }))
      .sort((a, b) => rank(a.aisle) - rank(b.aisle) || a.label.localeCompare(b.label, "fr")),
  };
}

export const shoppingRouter = router({
  generate: householdProcedure.input(z.object({ mealPlanId: z.string().uuid(), storeId: z.string().uuid().nullable().optional() })).mutation(async ({ ctx, input }) => {
    const [plan] = await ctx.db.select({ id: mealPlans.id }).from(mealPlans).where(and(eq(mealPlans.id, input.mealPlanId), eq(mealPlans.householdId, ctx.householdId)));
    if (!plan) notFound("Plan");
    if (input.storeId) {
      const [st] = await ctx.db.select().from(stores).where(and(eq(stores.id, input.storeId), or(isNull(stores.householdId), eq(stores.householdId, ctx.householdId))));
      if (!st) notFound("Magasin");
    }
    const { listId } = await generateShoppingList(ctx.db, ctx.householdId, plan.id, input.storeId ?? null);
    ctx.publish(ctx.householdId, { type: "list", listId });
    return { listId };
  }),

  latest: householdProcedure.query(async ({ ctx }) => {
    const [l] = await ctx.db.select({ id: shoppingLists.id }).from(shoppingLists).where(and(eq(shoppingLists.householdId, ctx.householdId), isNull(shoppingLists.closedAt))).orderBy(desc(shoppingLists.createdAt)).limit(1);
    return l ? serializeList(ctx.db, l.id) : null;
  }),

  get: householdProcedure.input(z.object({ listId: z.string().uuid() })).query(async ({ ctx, input }) => {
    await ownedList(ctx.db, ctx.householdId, input.listId);
    return serializeList(ctx.db, input.listId);
  }),

  /**
   * File d'opérations hors ligne. Chaque opération porte un UUID (clé d'idempotence) :
   * rejouer une opération déjà appliquée renvoie le résultat mémorisé sans effet.
   * Les patchs sont fusionnés champ par champ (LWW + HLC) : deux membres qui cochent
   * des articles différents hors ligne ne s'écrasent jamais.
   */
  sync: householdProcedure.input(z.object({ ops: z.array(opSchema).max(500) })).mutation(async ({ ctx, input }) => {
    const results: Array<{ id: string; status: "applied" | "duplicate" | "rejected" }> = [];
    const touchedLists = new Set<string>();
    for (const op of input.ops) {
      const res = await ctx.db.transaction(async (tx) => {
        const inserted = await tx.insert(syncOps).values({ id: op.id, householdId: ctx.householdId, userId: ctx.user.id, result: { type: op.type } }).onConflictDoNothing().returning({ id: syncOps.id });
        if (inserted.length === 0) return "duplicate" as const;
        if (op.type === "add") {
          await ownedList(tx as unknown as Db, ctx.householdId, op.listId);
          await tx.insert(shoppingListItems).values({ id: op.itemId, listId: op.listId, label: op.label, aisle: op.aisle, isExtra: true, fieldClocks: { checked: op.clock } }).onConflictDoNothing();
          touchedLists.add(op.listId);
          return "applied" as const;
        }
        const [row] = await tx
          .select({ item: shoppingListItems, householdId: shoppingLists.householdId })
          .from(shoppingListItems)
          .innerJoin(shoppingLists, eq(shoppingLists.id, shoppingListItems.listId))
          .where(eq(shoppingListItems.id, op.itemId));
        if (!row || row.householdId !== ctx.householdId) return "rejected" as const;
        touchedLists.add(row.item.listId);
        if (op.type === "delete") {
          await tx.delete(shoppingListItems).where(and(eq(shoppingListItems.id, op.itemId), eq(shoppingListItems.isExtra, true)));
          return "applied" as const;
        }
        const current = { value: { checked: row.item.checked, purchasedQuantity: row.item.purchasedQuantity, actualPriceCents: row.item.actualPriceCents }, clocks: row.item.fieldClocks };
        const merged = applyPatch(current, op.patch, op.clock);
        await tx.update(shoppingListItems).set({ ...merged.value, fieldClocks: merged.clocks, updatedAt: new Date() }).where(eq(shoppingListItems.id, op.itemId));
        return "applied" as const;
      });
      results.push({ id: op.id, status: res });
    }
    for (const listId of touchedLists) ctx.publish(ctx.householdId, { type: "list", listId });
    return { results };
  }),

  /**
   * Clôture des courses : les articles achetés (et le surplus des conditionnements)
   * entrent au stock ; les prix réels saisis deviennent des observations de prix.
   */
  close: householdProcedure.input(z.object({ listId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const list = await ownedList(ctx.db, ctx.householdId, input.listId);
    if (list.closedAt) return { ok: true, addedToPantry: 0 };
    const items = await ctx.db.select().from(shoppingListItems).where(eq(shoppingListItems.listId, list.id));
    const ingIds = items.map((i) => i.ingredientId).filter((x): x is string => !!x);
    const ings = ingIds.length ? await ctx.db.select().from(ingredients).where(inArray(ingredients.id, ingIds)) : [];
    const today = new Date();
    let added = 0;
    await ctx.db.transaction(async (tx) => {
      for (const it of items) {
        if (!it.checked || !it.ingredientId) continue;
        const ing = ings.find((x) => x.id === it.ingredientId)!;
        const qty = it.purchasedQuantity ?? it.quantityToBuy;
        if (qty && gt(parseRational(qty), ZERO)) {
          const best = ing.perishableDays ? new Date(today.getTime() + ing.perishableDays * 86400_000).toISOString().slice(0, 10) : null;
          await tx.insert(pantryItems).values({
            householdId: ctx.householdId,
            ingredientId: it.ingredientId,
            quantity: qty,
            bestBefore: best,
            expiryKind: ing.perishableDays && ing.perishableDays <= 14 ? "dlc" : "ddm",
            location: ["boucherie", "poissonnerie", "cremerie", "fromagerie", "charcuterie_traiteur"].includes(ing.aisle) ? "fridge" : ing.aisle === "surgeles" ? "freezer" : "cupboard",
          });
          added++;
        }
        const pack = it.packs[0];
        if (it.actualPriceCents && pack && it.packs.length === 1) {
          const [p] = await tx.select({ id: products.id }).from(products).where(eq(products.id, pack.productId));
          if (p) await tx.insert(priceObservations).values({ productId: p.id, storeId: list.storeId, householdId: ctx.householdId, priceCents: Math.max(1, Math.round(it.actualPriceCents / pack.count)), source: "manual" });
        }
      }
      await tx.update(shoppingLists).set({ closedAt: new Date() }).where(eq(shoppingLists.id, list.id));
    });
    await audit(ctx.db, { householdId: ctx.householdId, userId: ctx.user.id, action: "close", entity: "shopping_list", entityId: list.id, meta: { added } });
    ctx.publish(ctx.householdId, { type: "list", listId: list.id });
    return { ok: true, addedToPantry: added };
  }),

  /** Export texte/Markdown (partage, impression). */
  markdown: householdProcedure.input(z.object({ listId: z.string().uuid() })).query(async ({ ctx, input }) => {
    await ownedList(ctx.db, ctx.householdId, input.listId);
    const { list, items } = await serializeList(ctx.db, input.listId);
    const out: string[] = ["# Liste de courses", ""];
    let aisle: string | null = null;
    for (const i of items) {
      if (i.aisle !== aisle) {
        aisle = i.aisle;
        out.push("", `## ${aisle}`);
      }
      const packs = i.packs.map((p) => `${p.count} × ${p.name}`).join(" + ");
      out.push(`- [${i.checked ? "x" : " "}] ${i.label}${i.display ? ` — ${i.display}` : ""}${packs ? ` (${packs})` : ""}`);
    }
    if (list.toCheck.length) {
      out.push("", "## Basiques à vérifier");
      for (const t of list.toCheck) out.push(`- ${t.label}`);
    }
    out.push("", `Total estimé : ${(list.estimatedCents / 100).toFixed(2).replace(".", ",")} €${list.totalIsPartial ? " (partiel)" : ""}`);
    return out.join("\n");
  }),

  surplus: householdProcedure.input(z.object({ listId: z.string().uuid() })).query(async ({ ctx, input }) => {
    await ownedList(ctx.db, ctx.householdId, input.listId);
    const items = await ctx.db.select().from(shoppingListItems).where(eq(shoppingListItems.listId, input.listId));
    return items.filter((i) => i.surplus && gt(parseRational(i.surplus), ZERO)).map((i) => ({ label: i.label, surplus: i.surplus, display: i.baseUnit ? formatQuantity(sub(parseRational(i.surplus!), ZERO), i.baseUnit as BaseUnit) : i.surplus }));
  }),
});

