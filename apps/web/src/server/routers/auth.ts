import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { householdMembers, households, users } from "@mise/db";
import { audit } from "../audit";
import { clearSessionCookie, createSession, destroySession, sessionCookie } from "../auth";
import { metrics } from "../metrics";
import { hashPassword, rateLimit, verifyPassword } from "../security";
import { authedProcedure, publicProcedure, router } from "../trpc";

const email = z.string().trim().toLowerCase().email().max(254);
// 10 caractères minimum, sans règle de composition (NIST SP 800-63B).
const password = z.string().min(10, "10 caractères minimum").max(200);

export const authRouter = router({
  register: publicProcedure
    .input(z.object({ email, password, displayName: z.string().trim().min(1).max(60), locale: z.enum(["fr-FR", "en-GB"]).default("fr-FR") }))
    .mutation(async ({ ctx, input }) => {
      await rateLimit(ctx.db, `register:ip:${ctx.ip}`, 10, 3600);
      const passwordHash = await hashPassword(input.password);
      const created = await ctx.db.transaction(async (tx) => {
        const exists = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${input.email}`);
        if (exists.length) return null;
        const [u] = await tx.insert(users).values({ email: input.email, passwordHash, displayName: input.displayName, locale: input.locale }).returning();
        const [h] = await tx.insert(households).values({ name: `Foyer de ${input.displayName}` }).returning();
        await tx.insert(householdMembers).values({ householdId: h!.id, userId: u!.id, name: input.displayName, role: "owner" });
        return { user: u!, household: h! };
      });
      // Message identique que l'e-mail existe ou non : pas d'énumération de comptes.
      if (!created) throw new TRPCError({ code: "CONFLICT", message: "Inscription impossible avec ces informations" });
      const token = await createSession(ctx.db, created.user.id, ctx.userAgent);
      ctx.setCookie(sessionCookie(token, ctx.cookieSecure));
      await audit(ctx.db, { householdId: created.household.id, userId: created.user.id, action: "register", entity: "user", entityId: created.user.id });
      return { userId: created.user.id };
    }),

  login: publicProcedure.input(z.object({ email, password: z.string().max(200) })).mutation(async ({ ctx, input }) => {
    await rateLimit(ctx.db, `login:ip:${ctx.ip}`, 30, 900);
    await rateLimit(ctx.db, `login:email:${input.email}`, 10, 900);
    const [u] = await ctx.db.select().from(users).where(sql`lower(${users.email}) = ${input.email} and ${users.deletedAt} is null`);
    const ok = await verifyPassword(u?.passwordHash ?? null, input.password);
    if (!u || !ok) {
      metrics().loginFailures.inc();
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Identifiants incorrects" });
    }
    const token = await createSession(ctx.db, u.id, ctx.userAgent);
    ctx.setCookie(sessionCookie(token, ctx.cookieSecure));
    await audit(ctx.db, { userId: u.id, action: "login", entity: "session" });
    return { userId: u.id };
  }),

  logout: authedProcedure.mutation(async ({ ctx }) => {
    await destroySession(ctx.db, ctx.session.sessionId);
    ctx.setCookie(clearSessionCookie(ctx.cookieSecure));
    return { ok: true };
  }),

  me: publicProcedure.query(({ ctx }) => (ctx.session ? ctx.session.user : null)),
});
