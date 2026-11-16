import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import {
  auditEvents, decryptJson, householdMembers, households, mealPlans, pantryItems, plannedMeals, priceObservations, recipeFeedback, recipeIngredients, recipes, sessions,
  shoppingListItems, shoppingLists, stores, users,
} from "@mise/db";
import { TRPCError } from "@trpc/server";
import { audit } from "../audit";
import { clearSessionCookie, destroyAllSessions } from "../auth";
import { verifyPassword } from "../security";
import { authedProcedure, householdProcedure, router } from "../trpc";

export const accountRouter = router({
  /** Export RGPD : toutes les données du compte et du foyer, en clair, au format JSON. */
  export: householdProcedure.query(async ({ ctx }) => {
    const h = ctx.householdId;
    const [user] = await ctx.db.select({ id: users.id, email: users.email, displayName: users.displayName, locale: users.locale, createdAt: users.createdAt }).from(users).where(eq(users.id, ctx.user.id));
    const members = await ctx.db.select().from(householdMembers).where(eq(householdMembers.householdId, h));
    const plans = await ctx.db.select().from(mealPlans).where(eq(mealPlans.householdId, h));
    const lists = await ctx.db.select().from(shoppingLists).where(eq(shoppingLists.householdId, h));
    const myRecipes = await ctx.db.select().from(recipes).where(eq(recipes.householdId, h));
    return {
      exportedAt: new Date().toISOString(),
      user,
      household: (await ctx.db.select().from(households).where(eq(households.id, h)))[0],
      members: members.map((m) => ({ ...m, sensitive: m.sensitive ? decryptJson(m.sensitive, ctx.ring) : null })),
      recipes: myRecipes,
      recipeIngredients: myRecipes.length ? await ctx.db.select().from(recipeIngredients).where(inArray(recipeIngredients.recipeId, myRecipes.map((r) => r.id))) : [],
      feedback: await ctx.db.select().from(recipeFeedback).where(eq(recipeFeedback.householdId, h)),
      mealPlans: plans,
      plannedMeals: plans.length ? await ctx.db.select().from(plannedMeals).where(inArray(plannedMeals.mealPlanId, plans.map((p) => p.id))) : [],
      shoppingLists: lists,
      shoppingListItems: lists.length ? await ctx.db.select().from(shoppingListItems).where(inArray(shoppingListItems.listId, lists.map((l) => l.id))) : [],
      pantry: await ctx.db.select().from(pantryItems).where(eq(pantryItems.householdId, h)),
      prices: await ctx.db.select().from(priceObservations).where(eq(priceObservations.householdId, h)),
      stores: await ctx.db.select().from(stores).where(eq(stores.householdId, h)),
      audit: await ctx.db.select().from(auditEvents).where(eq(auditEvents.householdId, h)),
    };
  }),

  /**
   * Suppression complète (RGPD). Si l'utilisateur est le dernier compte du foyer, le
   * foyer et toutes ses données partent en cascade ; sinon seul son compte est supprimé.
   */
  delete: authedProcedure.input(z.object({ password: z.string().max(200), confirm: z.literal("SUPPRIMER") })).mutation(async ({ ctx, input }) => {
    const [u] = await ctx.db.select().from(users).where(eq(users.id, ctx.user.id));
    if (!u || !(await verifyPassword(u.passwordHash, input.password))) throw new TRPCError({ code: "UNAUTHORIZED", message: "Mot de passe incorrect" });
    const memberships = await ctx.db.select().from(householdMembers).where(eq(householdMembers.userId, u.id));
    await ctx.db.transaction(async (tx) => {
      for (const m of memberships) {
        const others = (await tx.select().from(householdMembers).where(eq(householdMembers.householdId, m.householdId))).filter((x) => x.userId && x.userId !== u.id);
        if (others.length === 0) await tx.delete(households).where(eq(households.id, m.householdId));
        else await tx.delete(householdMembers).where(eq(householdMembers.id, m.id));
      }
      await tx.delete(sessions).where(eq(sessions.userId, u.id));
      await tx.delete(users).where(eq(users.id, u.id));
    });
    await destroyAllSessions(ctx.db, u.id);
    // Trace minimale et anonyme de la suppression (obligation de preuve).
    await audit(ctx.db, { action: "delete", entity: "user", meta: { households: memberships.length } });
    ctx.setCookie(clearSessionCookie(ctx.cookieSecure));
    return { ok: true };
  }),

  logoutEverywhere: authedProcedure.mutation(async ({ ctx }) => {
    await destroyAllSessions(ctx.db, ctx.user.id);
    ctx.setCookie(clearSessionCookie(ctx.cookieSecure));
    return { ok: true };
  }),
});
