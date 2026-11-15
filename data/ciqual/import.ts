/**
 * Import reproductible de la table Ciqual.
 * Usage : DATABASE_URL=... pnpm --filter @mise/db exec tsx ../../data/ciqual/import.ts <chemin/ciqual.csv> [version]
 * Le fichier officiel se télécharge sur https://ciqual.anses.fr (export CSV, séparateur « ; »).
 * Idempotent : chaque exécution remplace les valeurs des ingrédients listés dans mapping.json
 * et consigne la version importée dans `audit_event`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { auditEvents, createDb, ingredients } from "@mise/db";
import { parseCiqualCsv } from "@mise/db/ciqual";

const [file, version = "inconnue"] = process.argv.slice(2);
if (!file) throw new Error("Chemin du CSV Ciqual manquant");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL manquant");
const mapping = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "mapping.json"), "utf8")) as Record<string, string>;
const rows = new Map(parseCiqualCsv(readFileSync(file, "utf8")).map((r) => [r.code, r]));
const { db, sql } = createDb(url, 1);
let updated = 0;
const missing: string[] = [];
for (const [id, code] of Object.entries(mapping)) {
  if (id.startsWith("_")) continue;
  const row = rows.get(code);
  if (!row) {
    missing.push(`${id}→${code}`);
    continue;
  }
  await db.update(ingredients).set({ nutrition: row.nutrition, nutritionSource: "ciqual", ciqualCode: code }).where(eq(ingredients.id, id));
  updated++;
}
await db.insert(auditEvents).values({ action: "import", entity: "ciqual", meta: { version, updated, missing } });
await sql.end();
console.warn(`Ciqual ${version} : ${updated} ingrédients mis à jour ; codes absents : ${missing.join(", ") || "aucun"}`);
