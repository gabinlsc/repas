import { parseRational, rat, type Ingredient } from "@mise/domain";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_INGREDIENTS, type SeedIngredient } from "./ingredients.js";
import { parseSeedRecipes, type SeedRecipe } from "./parse-recipes.js";

export function toDomainIngredient(s: SeedIngredient): Ingredient {
  const [kcal, protein, carbs, fat, fiber] = s.n ?? [0, 0, 0, 0, 0];
  const r = (x: number) => parseRational(String(x));
  return {
    id: s.id,
    name: s.name,
    synonyms: s.syn ?? [],
    aisle: s.aisle,
    baseUnit: s.base,
    densityGPerMl: s.density ? parseRational(s.density) : null,
    pieceWeightG: s.piece ? parseRational(s.piece) : null,
    conversions: Object.fromEntries(Object.entries(s.conv ?? {}).map(([k, v]) => [k, parseRational(v)])),
    allergens: s.all ?? [],
    traits: s.tr ?? [],
    nutrition: s.n ? { kcal: r(kcal), protein: r(protein), carbs: r(carbs), fat: r(fat), fiber: r(fiber), sugar: rat(0), salt: rat(0) } : null,
    seasonMonths: s.season ?? [],
    proteinType: s.prot ?? null,
    vegetableType: s.veg ?? null,
    perishableDays: s.per ?? null,
  };
}

export const CATALOG: Ingredient[] = SEED_INGREDIENTS.map(toDomainIngredient);

function recipesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Depuis dist/seed, les fichiers texte restent dans le dossier source.
  return here.includes("/dist/") ? join(here, "../../seed/recipes") : join(here, "recipes");
}

export function loadSeedRecipes(dir = recipesDir()): SeedRecipe[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .flatMap((f) => parseSeedRecipes(readFileSync(join(dir, f), "utf8"), CATALOG));
}
