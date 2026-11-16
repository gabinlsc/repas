import { createDb, type Db } from "@mise/db";
import { env } from "./env";

const g = globalThis as unknown as { __miseDb?: { db: Db; sql: ReturnType<typeof createDb>["sql"] } };

/** Pool unique par processus (survit au rechargement à chaud en développement). */
export function db(): Db {
  g.__miseDb ??= createDb(env().DATABASE_URL, 10);
  return g.__miseDb.db;
}

export async function pingDb(): Promise<boolean> {
  try {
    g.__miseDb ??= createDb(env().DATABASE_URL, 10);
    await g.__miseDb.sql`select 1`;
    return true;
  } catch {
    return false;
  }
}
