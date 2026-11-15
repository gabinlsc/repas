import { describe, expect, it } from "vitest";
import { ingredientFitsDiet, recipeAllergens, recipeDiets, recipeIsSafeFor } from "../src/index.js";
import { ING } from "./fixtures.js";

describe("régimes et allergènes par règles", () => {
  it("allergènes = union ordonnée", () => {
    expect(recipeAllergens([ING.pates!, ING.oeuf!, ING.lait!, ING.farine!])).toEqual(["gluten", "oeufs", "lait"]);
  });
  it("régimes déduits", () => {
    expect(recipeDiets([ING.pates!, ING.courgette!])).toEqual(["vegetarian", "vegan", "pescatarian", "lactose_free", "pork_free", "alcohol_free"]);
    expect(recipeDiets([ING.lardons!])).not.toContain("pork_free");
    expect(recipeDiets([ING.saumon!])).toContain("pescatarian");
    expect(recipeDiets([ING.saumon!])).not.toContain("vegetarian");
    expect(recipeDiets([ING.oeuf!])).toContain("vegetarian");
    expect(recipeDiets([ING.oeuf!])).not.toContain("vegan");
    expect(ingredientFitsDiet(ING.farine!, "gluten_free")).toBe(false);
  });
  it("sécurité pour un ensemble de convives", () => {
    const r = { allergens: recipeAllergens([ING.oeuf!]), diets: recipeDiets([ING.oeuf!]) };
    expect(recipeIsSafeFor(r, [{ allergens: [], diets: ["vegetarian"] }])).toBe(true);
    expect(recipeIsSafeFor(r, [{ allergens: [], diets: [] }, { allergens: ["oeufs"], diets: [] }])).toBe(false);
    expect(recipeIsSafeFor(r, [{ allergens: [], diets: ["vegan"] }])).toBe(false);
  });
});
