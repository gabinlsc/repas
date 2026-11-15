import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Db = PostgresJsDatabase<typeof schema>;

/** Une seule pool par processus ; `numeric` reste en chaîne (jamais converti en flottant). */
export function createDb(url: string, max = 10): { db: Db; sql: postgres.Sql } {
  const sql = postgres(url, { max, prepare: true, onnotice: () => undefined });
  return { db: drizzle(sql, { schema }), sql };
}
