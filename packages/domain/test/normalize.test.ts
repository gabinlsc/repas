import { describe, expect, it } from "vitest";
import { buildIngredientIndex, canonicalKey, foldText, matchIngredient, tokens } from "../src/index.js";
import { ING } from "./fixtures.js";

const index = buildIngredientIndex(Object.values(ING));

describe("normalisation", () => {
  it("replie accents et ligatures", () => {
    expect(foldText("Œufs  Brouillés")).toBe("oeufs brouilles");
    expect(tokens("Les Pommes de terre")).toEqual(["pomme", "terre"]);
    expect(canonicalKey("Choux")).toBe("chou");
    expect(canonicalKey("chevaux")).toBe("cheval");
    expect(canonicalKey("gâteaux")).toBe("gateau");
  });
  it("correspondance exacte via synonyme", () => {
    const r = matchIngredient("oeufs", index);
    expect(r.status).toBe("matched");
    if (r.status === "matched") expect(r.ingredientId).toBe("oeuf");
    expect(matchIngredient("spaghetti", index)).toMatchObject({ status: "matched", ingredientId: "pates" });
    expect(matchIngredient("Oignons jaunes", index)).toMatchObject({ status: "matched", ingredientId: "oignon" });
  });
  it("correspondance approchée nette", () => {
    expect(matchIngredient("huile d'olive vierge extra", index)).toMatchObject({ status: "matched", ingredientId: "huile_olive" });
  });
  it("ambiguïté → validation humaine", () => {
    const r = matchIngredient("poulet saumon", index);
    expect(r.status).toBe("ambiguous");
    expect(r.candidates.length).toBeGreaterThan(1);
  });
  it("inconnu", () => {
    expect(matchIngredient("xyzzy", index).status).toBe("unknown");
  });
});
