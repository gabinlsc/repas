import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { baseToGrams, div, DomainError, eq, getUnit, mul, rat, toBase, UNITS } from "../src/index.js";
import { ING } from "./fixtures.js";

const exact = (r: ReturnType<typeof toBase>) => {
  if (r.kind !== "exact") throw new Error("attendu exact");
  return r.quantity;
};

describe("conversions d'unités", () => {
  it("masse → masse", () => {
    expect(exact(toBase(rat(1, 2), "kg", ING.farine!))).toEqual(rat(500));
    expect(exact(toBase(rat(500), "mg", ING.farine!))).toEqual(rat(1, 2));
  });
  it("1 tasse de farine ≠ 1 tasse d'eau (densité)", () => {
    const f = exact(toBase(rat(1), "tasse", ING.farine!));
    const e = exact(toBase(rat(1), "tasse", ING.eau!));
    expect(f).toEqual(rat(275, 2)); // 250 ml × 0,55
    expect(e).toEqual(rat(250));
  });
  it("cuillères et volumes vers ml", () => {
    expect(exact(toBase(rat(2), "cs", ING.huile_olive!))).toEqual(rat(30));
    expect(exact(toBase(rat(10), "cl", ING.lait!))).toEqual(rat(100));
    expect(exact(toBase(rat(1), "l", ING.lait!))).toEqual(rat(1000));
  });
  it("masse → ml via densité", () => {
    expect(exact(toBase(rat(103), "g", ING.lait!))).toEqual(rat(100));
  });
  it("pièces ↔ masse", () => {
    expect(exact(toBase(rat(2), "piece", ING.oignon!))).toEqual(rat(300));
    expect(exact(toBase(rat(110), "g", ING.oeuf!))).toEqual(rat(2));
    expect(exact(toBase(rat(1), "douzaine", ING.oeuf!))).toEqual(rat(12));
  });
  it("volume → pièces via densité et poids", () => {
    expect(() => toBase(rat(1), "ml", ING.oeuf!)).toThrow(DomainError);
  });
  it("conversion spécifique à l'ingrédient (gousse d'ail)", () => {
    expect(exact(toBase(rat(3), "gousse", ING.ail!))).toEqual(rat(15));
    expect(() => toBase(rat(1), "gousse", ING.oignon!)).toThrow(/conversion spécifique/);
  });
  it("unités floues", () => {
    expect(toBase(rat(1), "pincee", ING.sel!).kind).toBe("fuzzy");
  });
  it("erreurs explicites", () => {
    expect(() => toBase(rat(1), "boisseau", ING.sel!)).toThrow(DomainError);
    expect(() => toBase(rat(1), "piece", ING.sel!)).toThrow(/poids unitaire/);
    expect(() => toBase(rat(1), "ml", ING.sel!)).toThrow(/densité/);
    expect(() => getUnit("x")).toThrow(DomainError);
    expect(Object.keys(UNITS).length).toBeGreaterThan(20);
  });
  it("baseToGrams", () => {
    expect(baseToGrams(rat(100), ING.lait!)).toEqual(rat(103));
    expect(baseToGrams(rat(2), ING.oeuf!)).toEqual(rat(110));
    expect(baseToGrams(rat(5), ING.farine!)).toEqual(rat(5));
    expect(baseToGrams(rat(5), ING.eau!)).toEqual(rat(5));
    expect(baseToGrams(rat(1), { ...ING.oeuf!, pieceWeightG: null })).toBeNull();
    expect(baseToGrams(rat(1), { ...ING.lait!, densityGPerMl: null })).toBeNull();
  });
  it("propriété : linéarité de la conversion (k·q convertit en k·conv(q))", () => {
    const units = ["g", "kg", "ml", "cl", "cs", "cc", "tasse", "verre", "piece"];
    fc.assert(fc.property(fc.integer({ min: 1, max: 10_000 }), fc.integer({ min: 1, max: 50 }), fc.constantFrom(...units), (q, k, unit) => {
      const a = exact(toBase(rat(q, 10), unit, ING.oignon!.pieceWeightG ? { ...ING.oignon!, densityGPerMl: rat(6, 10) } : ING.oignon!));
      const b = exact(toBase(mul(rat(q, 10), rat(k)), unit, { ...ING.oignon!, densityGPerMl: rat(6, 10) }));
      expect(eq(mul(a, rat(k)), b)).toBe(true);
    }));
  });
  it("propriété : aller-retour masse → ml → masse exact", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 1_000_000 }), (g) => {
      const ml = exact(toBase(rat(g), "g", ING.lait!));
      expect(eq(mul(ml, ING.lait!.densityGPerMl!), rat(g))).toBe(true);
      expect(eq(div(mul(ml, rat(103)), rat(100)), rat(g))).toBe(true);
    }));
  });
});
