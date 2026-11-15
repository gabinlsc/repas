import { AISLES, recipeAllergens, recipeDiets, toFixed, UNITS, type Aisle } from "@mise/domain";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Db } from "../src/client.js";
import * as s from "../src/schema.js";
import { CATALOG, loadSeedRecipes } from "./catalog.js";
import { SEED_INGREDIENTS } from "./ingredients.js";

/** UUID déterministe (format v5) : le seed est rejouable sans doublons ni FK cassées. */
export function stableUuid(...parts: string[]): string {
  const h = createHash("sha1").update(parts.join("|")).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

const UNIT_EN: Record<string, string> = { cs: "tbsp", cc: "tsp", tasse: "cup", verre: "glass", piece: "piece", pincee: "pinch", gout: "to taste", gousse: "clove", tranche: "slice", botte: "bunch", boite: "can", sachet: "sachet", feuille: "leaf", brin: "sprig", branche: "stalk" };

export const STORE_LAYOUTS: Array<{ id: string; name: string; chain: string; order: Aisle[] }> = [
  { id: stableUuid("store", "supermarche"), name: "Supermarché (parcours type)", chain: "generique", order: [...AISLES] },
  {
    id: stableUuid("store", "discount"),
    name: "Hard-discount (parcours type)",
    chain: "discount",
    order: ["boulangerie", "epicerie_sucree", "epicerie_salee", "feculents", "conserves", "condiments_epices", "monde", "boissons", "cremerie", "fromagerie", "charcuterie_traiteur", "boucherie", "poissonnerie", "fruits_legumes", "surgeles"],
  },
];

export async function seedCatalog(db: Db): Promise<{ ingredients: number; recipes: number; products: number }> {
  return db.transaction(async (tx) => {
    for (const u of Object.values(UNITS)) {
      await tx
        .insert(s.units)
        .values({ code: u.code, kind: u.kind, factor: u.factor ? toFixed(u.factor, 6) : null, labelFr: u.labelFr, labelEn: UNIT_EN[u.code] ?? u.code })
        .onConflictDoUpdate({ target: s.units.code, set: { kind: u.kind, labelFr: u.labelFr } });
    }
    for (const i of SEED_INGREDIENTS) {
      const d = CATALOG.find((c) => c.id === i.id)!;
      const values = {
        id: i.id,
        name: i.name,
        synonyms: i.syn ?? [],
        aisle: i.aisle,
        baseUnit: i.base,
        densityGPerMl: i.density ?? null,
        pieceWeightG: i.piece ?? null,
        nutrition: i.n ? { kcal: String(i.n[0]), protein: String(i.n[1]), carbs: String(i.n[2]), fat: String(i.n[3]), fiber: String(i.n[4]), sugar: "0", salt: "0" } : null,
        nutritionSource: i.n ? "seed-approx" : null,
        allergens: [...d.allergens],
        traits: [...d.traits],
        seasonMonths: [...d.seasonMonths],
        proteinType: i.prot ?? null,
        vegetableType: i.veg ?? null,
        perishableDays: i.per ?? null,
        canonicalId: i.canonical ?? null,
      };
      // Les valeurs nutritionnelles importées de Ciqual ne sont pas écrasées par le seed.
      await tx.insert(s.ingredients).values(values).onConflictDoUpdate({
        target: s.ingredients.id,
        set: { ...values, nutrition: sql`case when ${s.ingredients.nutritionSource} = 'ciqual' then ${s.ingredients.nutrition} else excluded.nutrition end`, nutritionSource: sql`case when ${s.ingredients.nutritionSource} = 'ciqual' then 'ciqual' else excluded.nutrition_source end` },
      });
      for (const [unit, toBase] of Object.entries(i.conv ?? {})) {
        await tx.insert(s.unitConversions).values({ ingredientId: i.id, unitCode: unit, toBase }).onConflictDoUpdate({ target: [s.unitConversions.ingredientId, s.unitConversions.unitCode], set: { toBase } });
      }
    }
    let products = 0;
    for (const i of SEED_INGREDIENTS) {
      const all: Array<[string, number, Aisle | null, string]> = [
        ...(i.p ?? []).map(([q, price, label]): [string, number, Aisle | null, string] => [q, price, null, label ?? i.name]),
        ...(i.alt ?? []).map(([q, price, aisle, label]): [string, number, Aisle | null, string] => [q, price, aisle, label]),
      ];
      for (const [q, price, aisle, label] of all) {
        const id = stableUuid("product", i.id, q, label);
        await tx.insert(s.products).values({ id, ingredientId: i.id, name: label, packageQuantity: q, aisle }).onConflictDoUpdate({ target: s.products.id, set: { name: label, packageQuantity: q, aisle } });
        await tx
          .insert(s.priceObservations)
          .values({ id: stableUuid("price", id), productId: id, priceCents: price, source: "seed", observedAt: new Date("2026-01-01T00:00:00Z") })
          .onConflictDoUpdate({ target: s.priceObservations.id, set: { priceCents: price } });
        products++;
      }
    }
    for (const st of STORE_LAYOUTS) {
      await tx.insert(s.stores).values({ id: st.id, name: st.name, chain: st.chain }).onConflictDoUpdate({ target: s.stores.id, set: { name: st.name } });
      await tx.delete(s.storeLayouts).where(sql`${s.storeLayouts.storeId} = ${st.id}`);
      await tx.insert(s.storeLayouts).values(st.order.map((aisle, position) => ({ storeId: st.id, aisle, position })));
    }
    const recipes = loadSeedRecipes();
    const byId = new Map(CATALOG.map((c) => [c.id, c]));
    for (const r of recipes) {
      const id = stableUuid("recipe", r.slug);
      const ings = r.lines.map((l) => byId.get(l.ingredientId)!);
      const values = {
        id,
        slug: r.slug,
        title: r.title,
        sourceName: "Mise",
        license: "Licence du dépôt Mise",
        prepMinutes: r.prep,
        cookMinutes: r.cook,
        difficulty: r.difficulty,
        equipment: r.equipment,
        baseServings: r.servings,
        steps: r.steps,
        tags: r.tags,
        mealSlots: r.slots,
        cuisine: r.cuisine,
        leftoverDays: r.leftoverDays,
        freezes: r.freezes,
        status: "validated" as const,
        allergens: recipeAllergens(ings),
        diets: recipeDiets(ings),
      };
      await tx.insert(s.recipes).values(values).onConflictDoUpdate({ target: s.recipes.id, set: { ...values, updatedAt: new Date() } });
      await tx.delete(s.recipeIngredients).where(sql`${s.recipeIngredients.recipeId} = ${id}`);
      await tx.insert(s.recipeIngredients).values(
        r.lines.map((l, position) => ({
          recipeId: id,
          position,
          ingredientId: l.ingredientId,
          rawText: l.raw,
          quantity: l.quantity ? toFixed(l.quantity, 3, "ceil") : null,
          unitCode: l.unit,
          note: l.note,
          optional: l.optional,
          fuzzy: l.fuzzy,
        })),
      );
    }
    return { ingredients: SEED_INGREDIENTS.length, recipes: recipes.length, products };
  });
}
