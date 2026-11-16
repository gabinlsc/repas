import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { and, eq } from "drizzle-orm";
import { householdMembers, type Db, type Keyring } from "@mise/db";
import { DomainError } from "@mise/domain";
import type { SessionResult } from "./auth";
import type { Enqueue } from "./queue";
import { RateLimitError } from "./security";
import { metrics } from "./metrics";

export interface Deps {
  db: Db;
  ring: Keyring;
  enqueue: Enqueue;
  publish: (householdId: string, payload: unknown) => void;
  fetchPage: (url: string) => Promise<{ url: string; html: string }>;
  lookupEan: (ean: string) => Promise<{ name: string; brand: string | null; quantity: string | null; allergens: string[] } | null>;
  cookieSecure: boolean;
  plannerTimeLimitS: number;
}

export interface Context extends Deps {
  session: SessionResult | null;
  ip: string;
  userAgent: string | null;
  setCookie: (cookie: string) => void;
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const cause = error.cause;
    return {
      ...shape,
      data: {
        ...shape.data,
        // Codes stables pour que l'interface traduise le message (i18n).
        appCode: cause instanceof DomainError ? cause.code : cause instanceof RateLimitError ? "RATE_LIMITED" : null,
        zod: cause instanceof ZodError ? cause.flatten() : null,
        stack: undefined,
      },
    };
  },
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

const timing = t.middleware(async ({ path, next }) => {
  const end = metrics().rpcDuration.startTimer({ path });
  const res = await next();
  end({ status: res.ok ? "ok" : "error" });
  return res;
});

const errors = t.middleware(async ({ next }) => {
  const res = await next();
  if (!res.ok) {
    const c = res.error.cause;
    if (c instanceof RateLimitError) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: c.message, cause: c });
    if (c instanceof DomainError) throw new TRPCError({ code: "BAD_REQUEST", message: c.message, cause: c });
  }
  return res;
});

export const publicProcedure = t.procedure.use(timing).use(errors);

export const authedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Connexion requise" });
  return next({ ctx: { ...ctx, session: ctx.session, user: ctx.session.user } });
});

/**
 * Toute ressource métier appartient à un foyer : ce middleware résout le foyer de
 * l'utilisateur côté serveur. Les routeurs filtrent *systématiquement* par
 * `ctx.householdId` — jamais par un identifiant de foyer fourni par le client.
 */
export const householdProcedure = authedProcedure.use(async ({ ctx, next }) => {
  const [m] = await ctx.db
    .select({ householdId: householdMembers.householdId, memberId: householdMembers.id, role: householdMembers.role })
    .from(householdMembers)
    .where(eq(householdMembers.userId, ctx.user.id))
    .limit(1);
  if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "Aucun foyer" });
  return next({ ctx: { ...ctx, householdId: m.householdId, memberId: m.memberId, role: m.role } });
});

export const adminProcedure = householdProcedure.use(({ ctx, next }) => {
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Réservé aux administrateurs du foyer" });
  return next();
});

export function notFound(what = "Ressource"): never {
  throw new TRPCError({ code: "NOT_FOUND", message: `${what} introuvable` });
}

export async function assertMember(db: Db, householdId: string, memberId: string): Promise<void> {
  const [m] = await db.select({ id: householdMembers.id }).from(householdMembers).where(and(eq(householdMembers.id, memberId), eq(householdMembers.householdId, householdId)));
  if (!m) notFound("Membre");
}

export function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}
