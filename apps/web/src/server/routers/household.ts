import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { decryptJson, EMPTY_SENSITIVE, encryptJson, householdMembers, households, stores, type MemberSensitive } from "@mise/db";
import { DEFAULT_WEIGHTS, DIETS, EQUIPMENT, EU_ALLERGENS, MEAL_SLOTS } from "@mise/domain";
import { audit } from "../audit";
import { adminProcedure, assertMember, badRequest, householdProcedure, router } from "../trpc";

export const sensitiveSchema = z.object({
  allergens: z.array(z.enum(EU_ALLERGENS)).max(14),
  diets: z.array(z.enum(DIETS)).max(7),
  aversions: z.array(z.string().max(64)).max(50),
  kcalTarget: z.number().int().min(800).max(5000).nullable(),
});

const memberInput = z.object({
  name: z.string().trim().min(1).max(40),
  portionFactor: z.string().regex(/^(?:[0-2](?:\.\d{1,2})?|3(?:\.0{1,2})?)$/).refine((v) => Number(v) > 0, "Portion > 0"),
  presentDays: z.array(z.number().int().min(0).max(6)).max(7),
  sensitive: sensitiveSchema,
});

const settingsInput = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  weeklyBudgetCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
  mealSlots: z.array(z.enum(MEAL_SLOTS)).min(1).max(4).optional(),
  maxPrepMinutes: z.array(z.number().int().min(0).max(600)).length(7).optional(),
  repeatWindowDays: z.number().int().min(0).max(28).optional(),
  equipment: z.array(z.enum(EQUIPMENT)).max(EQUIPMENT.length).optional(),
  defaultStoreId: z.string().uuid().nullable().optional(),
  weights: z.record(z.enum(Object.keys(DEFAULT_WEIGHTS) as [keyof typeof DEFAULT_WEIGHTS]), z.number().int().min(0).max(10)).optional(),
});

export const householdRouter = router({
  get: householdProcedure.query(async ({ ctx }) => {
    const [h] = await ctx.db.select().from(households).where(eq(households.id, ctx.householdId));
    const members = await ctx.db.select().from(householdMembers).where(eq(householdMembers.householdId, ctx.householdId)).orderBy(householdMembers.createdAt);
    return {
      household: { ...h!, weights: { ...DEFAULT_WEIGHTS, ...(h!.weights ?? {}) } },
      role: ctx.role,
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        isMe: m.userId === ctx.user.id,
        portionFactor: m.portionFactor,
        presentDays: m.presentDays,
        sensitive: m.sensitive ? decryptJson<MemberSensitive>(m.sensitive, ctx.ring) : EMPTY_SENSITIVE,
      })),
    };
  }),

  update: adminProcedure.input(settingsInput).mutation(async ({ ctx, input }) => {
    if (input.defaultStoreId) {
      const [st] = await ctx.db.select({ id: stores.id, h: stores.householdId }).from(stores).where(eq(stores.id, input.defaultStoreId));
      if (!st || (st.h !== null && st.h !== ctx.householdId)) input.defaultStoreId = null;
    }
    await ctx.db.update(households).set(input).where(eq(households.id, ctx.householdId));
    return { ok: true };
  }),

  completeOnboarding: adminProcedure
    .input(z.object({ settings: settingsInput, members: z.array(memberInput.extend({ id: z.string().uuid().optional() })).min(1).max(8) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        await tx.update(households).set({ ...input.settings, onboardedAt: new Date() }).where(eq(households.id, ctx.householdId));
        const existing = await tx.select().from(householdMembers).where(eq(householdMembers.householdId, ctx.householdId));
        const keep = new Set<string>();
        for (const m of input.members) {
          const values = { name: m.name, portionFactor: m.portionFactor, presentDays: m.presentDays, sensitive: encryptJson(m.sensitive, ctx.ring) };
          const target = m.id ? existing.find((e) => e.id === m.id) : undefined;
          if (target) {
            keep.add(target.id);
            await tx.update(householdMembers).set(values).where(eq(householdMembers.id, target.id));
          } else {
            const [n] = await tx.insert(householdMembers).values({ ...values, householdId: ctx.householdId, role: "member" }).returning({ id: householdMembers.id });
            keep.add(n!.id);
          }
        }
        // Les membres retirés du formulaire sont supprimés, sauf le compte courant.
        for (const e of existing) if (!keep.has(e.id) && e.userId !== ctx.user.id) await tx.delete(householdMembers).where(eq(householdMembers.id, e.id));
      });
      await audit(ctx.db, { householdId: ctx.householdId, userId: ctx.user.id, action: "onboarding", entity: "household", entityId: ctx.householdId, meta: { members: input.members.length } });
      return { ok: true };
    }),

  addMember: adminProcedure.input(memberInput).mutation(async ({ ctx, input }) => {
    const count = (await ctx.db.select({ id: householdMembers.id }).from(householdMembers).where(eq(householdMembers.householdId, ctx.householdId))).length;
    if (count >= 8) badRequest("Un foyer compte au plus 8 personnes");
    const [m] = await ctx.db
      .insert(householdMembers)
      .values({ householdId: ctx.householdId, name: input.name, portionFactor: input.portionFactor, presentDays: input.presentDays, sensitive: encryptJson(input.sensitive, ctx.ring), role: "member" })
      .returning({ id: householdMembers.id });
    await audit(ctx.db, { householdId: ctx.householdId, userId: ctx.user.id, action: "create", entity: "member", entityId: m!.id });
    return m!;
  }),

  updateMember: adminProcedure.input(memberInput.extend({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await assertMember(ctx.db, ctx.householdId, input.id);
    await ctx.db
      .update(householdMembers)
      .set({ name: input.name, portionFactor: input.portionFactor, presentDays: input.presentDays, sensitive: encryptJson(input.sensitive, ctx.ring) })
      .where(and(eq(householdMembers.id, input.id), eq(householdMembers.householdId, ctx.householdId)));
    await audit(ctx.db, { householdId: ctx.householdId, userId: ctx.user.id, action: "update", entity: "member", entityId: input.id });
    return { ok: true };
  }),

  removeMember: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await assertMember(ctx.db, ctx.householdId, input.id);
    if (input.id === ctx.memberId) badRequest("Impossible de vous retirer vous-même");
    await ctx.db.delete(householdMembers).where(and(eq(householdMembers.id, input.id), eq(householdMembers.householdId, ctx.householdId)));
    await audit(ctx.db, { householdId: ctx.householdId, userId: ctx.user.id, action: "delete", entity: "member", entityId: input.id });
    return { ok: true };
  }),
});
