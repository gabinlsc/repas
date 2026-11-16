import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDb, parseKeyring, runGenerationJob, runMigrations, type Db } from "@mise/db";
import { seedCatalog } from "@mise/db/seed";
import type { PlanRequest, PlanResponse } from "@mise/domain";
import { readSessionToken, validateSession } from "@/server/auth";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory, type Context, type Deps } from "@/server/trpc";

export const TEST_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/mise_test";
const createCaller = createCallerFactory(appRouter);

/** Solveur factice déterministe : premier candidat sûr et non répété par créneau. */
export function fakePlanner(req: PlanRequest): PlanResponse {
  const members = new Map(req.members.map((m) => [m.id, m]));
  const used = new Set<string>();
  const meals = req.days.flatMap((d) =>
    d.slots.map((slot) => {
      const eaters = slot.attendees.map((a) => members.get(a)!);
      const ok = (x: PlanRequest["recipes"][number]) => x.slots.includes(slot.slot) && eaters.every((e) => e.allergens.every((a) => !x.allergens.includes(a)) && e.diets.every((di) => x.diets.includes(di)));
      const r = req.recipes.find((x) => x.id === slot.locked_recipe_id) ?? req.recipes.find((x) => !used.has(x.id) && ok(x)) ?? req.recipes.find(ok)!;
      used.add(r.id);
      return { day: d.day, slot: slot.slot, recipe_id: r.id, servings_centi: slot.servings_centi, cook_big: false, leftover_of: null, explanations: [] };
    }),
  );
  return { version: "1", status: "feasible", deterministic: true, wall_time_ms: 1, estimated_cost_cents: 1000, score: null, meals, diagnostics: [] };
}

export interface TestEnv {
  db: Db;
  deps: Deps;
  published: Array<{ householdId: string; payload: unknown }>;
  close: () => Promise<void>;
}

let envP: Promise<TestEnv> | null = null;
export function testEnv(): Promise<TestEnv> {
  envP ??= (async () => {
    await runMigrations(TEST_URL);
    const { db, sql: conn } = createDb(TEST_URL, 4);
    await seedCatalog(db);
    // DELETE (et non TRUNCATE … CASCADE, qui viderait aussi le catalogue de recettes).
    await db.execute(sql`delete from household`);
    await db.execute(sql`delete from "user"`);
    await db.execute(sql`delete from rate_limit`);
    const published: TestEnv["published"] = [];
    const deps: Deps = {
      db,
      ring: parseKeyring(`k1:${randomBytes(32).toString("base64")}`),
      enqueue: async (jobId) => {
        await runGenerationJob(db, jobId, async (r) => fakePlanner(r));
      },
      publish: (householdId, payload) => published.push({ householdId, payload }),
      fetchPage: async (url) => ({ url, html: `<script type="application/ld+json">{"@type":"Recipe","name":"Soupe test","recipeYield":"2","recipeIngredient":["2 carottes","1 l d'eau","1 truc introuvable"],"recipeInstructions":"Cuire."}</script>` }),
      lookupEan: async () => ({ name: "Produit OFF", brand: "Marque", quantity: "500 g", allergens: ["gluten"] }),
      cookieSecure: false,
      plannerTimeLimitS: 5,
    };
    return { db, deps, published, close: () => conn.end() };
  })();
  return envP;
}

let ipCounter = 1;
export function anonCaller(env: TestEnv, cookies: string[] = []) {
  const ctx: Context = { ...env.deps, session: null, ip: `10.0.0.${ipCounter++ % 250}`, userAgent: "vitest", setCookie: (c) => cookies.push(c) };
  return createCaller(ctx);
}

/** Crée un compte et renvoie un appelant authentifié. */
export async function userCaller(env: TestEnv, email = `u${Date.now()}${Math.random().toString(16).slice(2)}@test.fr`) {
  const cookies: string[] = [];
  await anonCaller(env, cookies).auth.register({ email, password: "motdepasse-solide", displayName: "Test" });
  const token = readSessionToken(cookies[0]!.split(";")[0]!)!;
  const session = (await validateSession(env.db, token))!;
  const ctx: Context = { ...env.deps, session, ip: "10.1.0.1", userAgent: "vitest", setCookie: (c) => cookies.push(c) };
  return { caller: createCaller(ctx), email, token, cookies, userId: session.user.id };
}
