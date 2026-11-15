import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDb } from "./client.js";

/** Applique les migrations SQL versionnées (idempotent). */
export async function runMigrations(url: string): Promise<void> {
  const { db, sql } = createDb(url, 1);
  const here = dirname(fileURLToPath(import.meta.url));
  const folder = join(here, here.endsWith("dist/src") ? "../../drizzle" : "../drizzle");
  try {
    await migrate(db, { migrationsFolder: folder });
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  await runMigrations(url);
  console.warn("migrations appliquées");
}
