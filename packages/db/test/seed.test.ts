import { recipeAllergens, recipeDiets, UNITS } from "@mise/domain";
import { describe, expect, it } from "vitest";
import { CATALOG, loadSeedRecipes } from "../seed/catalog.js";
import { SEED_INGREDIENTS } from "../seed/ingredients.js";
import { parseSeedRecipes, SeedError } from "../seed/parse-recipes.js";

describe("données de départ", () => {
  const recipes = loadSeedRecipes();
  it("au moins 150 recettes, toutes résolues", () => {
    expect(recipes.length).toBeGreaterThanOrEqual(150);
    expect(new Set(recipes.map((r) => r.slug)).size).toBe(recipes.length);
  });
  it("chaque créneau a des recettes (dont végétariennes)", () => {
    const byId = new Map(CATALOG.map((i) => [i.id, i]));
    for (const slot of ["breakfast", "lunch", "dinner", "snack"] as const) {
      const rs = recipes.filter((r) => r.slots.includes(slot));
      expect(rs.length).toBeGreaterThan(8);
      expect(rs.filter((r) => recipeDiets(r.lines.map((l) => byId.get(l.ingredientId)!)).includes("vegetarian")).length).toBeGreaterThan(3);
    }
  });
  it("allergènes recalculés cohérents", () => {
    const byId = new Map(CATALOG.map((i) => [i.id, i]));
    const carbo = recipes.find((r) => r.slug === "spaghetti-carbonara")!;
    expect(recipeAllergens(carbo.lines.map((l) => byId.get(l.ingredientId)!))).toEqual(["gluten", "oeufs", "lait"]);
  });
  it("ingrédients : identifiants uniques, unités de conversion connues, prix positifs", () => {
    expect(new Set(SEED_INGREDIENTS.map((i) => i.id)).size).toBe(SEED_INGREDIENTS.length);
    for (const i of SEED_INGREDIENTS) {
      for (const u of Object.keys(i.conv ?? {})) expect(UNITS[u], `${i.id}:${u}`).toBeDefined();
      for (const [, price] of i.p ?? []) expect(price).toBeGreaterThan(0);
    }
  });
  it("refuse un ingrédient ambigu ou inconnu", () => {
    const head = "p2 t1+1 [lunch] (x) {} r0 f0 d1";
    expect(() => parseSeedRecipes(`# T\n${head}\n- 1 kg de licorne\n> x`, CATALOG)).toThrow(SeedError);
    expect(() => parseSeedRecipes(`# T\nmauvais\n- 1 kg de riz\n> x`, CATALOG)).toThrow(/En-tête/);
    expect(() => parseSeedRecipes(`# T\n${head}\n- 1 kg de riz {zzz}\n> x`, CATALOG)).toThrow(/inconnu/);
    expect(() => parseSeedRecipes(`# T\n${head}\n- 1 gousse de riz\n> x`, CATALOG)).toThrow(/Conversion/);
    expect(() => parseSeedRecipes(`# T\n${head}\n- 1 kg de riz`, CATALOG)).toThrow(/incomplète/);
    expect(() => parseSeedRecipes(`# T\np2 t1+1 [brunch] (x) {} r0 f0 d1\n- 1 kg de riz\n> x`, CATALOG)).toThrow(/Créneau/);
    expect(() => parseSeedRecipes(`# T\np2 t1+1 [lunch] (x) {laser} r0 f0 d1\n- 1 kg de riz\n> x`, CATALOG)).toThrow(/Matériel/);
  });
});
