import { randomBytes } from "node:crypto";
import { createDb, encryptJson, parseKeyring, runMigrations, type Db } from "../src/index.js";
import { seedCatalog } from "../seed/index.js";
import * as s from "../src/schema.js";
import { sql } from "drizzle-orm";

export const TEST_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/mise_test";
export const ring = parseKeyring(`k1:${randomBytes(32).toString("base64")}`);

let ready: Promise<{ db: Db; close: () => Promise<void> }> | null = null;
export function testDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  ready ??= (async () => {
    await runMigrations(TEST_URL);
    const { db, sql: conn } = createDb(TEST_URL, 4);
    await seedCatalog(db);
    return { db, close: () => conn.end() };
  })();
  return ready;
}

export async function makeHousehold(db: Db, opts: { allergens?: string[]; diets?: string[]; budget?: number | null; slots?: Array<"breakfast" | "lunch" | "dinner" | "snack"> } = {}) {
  const [h] = await db
    .insert(s.households)
    .values({ name: "Test", weeklyBudgetCents: opts.budget ?? null, mealSlots: opts.slots ?? ["dinner"] })
    .returning();
  await db.insert(s.householdMembers).values([
    { householdId: h!.id, name: "A", role: "owner", portionFactor: "1.00", sensitive: encryptJson({ allergens: opts.allergens ?? [], diets: opts.diets ?? [], aversions: [], kcalTarget: 2000 }, ring) },
    { householdId: h!.id, name: "B", role: "member", portionFactor: "0.50", sensitive: null },
  ]);
  return h!;
}

export async function truncateHouseholds(db: Db): Promise<void> {
  await db.execute(sql`truncate household cascade`);
}
