import { createDb } from "../src/client.js";
import { runMigrations } from "../src/migrate.js";
import { seedCatalog } from "./index.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL manquant");
await runMigrations(url);
const { db, sql } = createDb(url, 2);
try {
  const r = await seedCatalog(db);
  console.warn(`seed : ${r.ingredients} ingrédients, ${r.products} produits, ${r.recipes} recettes`);
} finally {
  await sql.end();
}
