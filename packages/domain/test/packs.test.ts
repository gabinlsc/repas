import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { add, chooseCheapestPacks, cmp, gte, mul, rat, ZERO, type PackOption } from "../src/index.js";

const opt = (productId: string, size: number, priceCents: number | null): PackOption => ({ productId, name: productId, size: rat(size), priceCents });

describe("conditionnements optimaux", () => {
  it("320 g de pâtes → 1 paquet de 500 g, surplus 180 g", () => {
    const s = chooseCheapestPacks(rat(320), [opt("p500", 500, 99), opt("p1000", 1000, 179)])!;
    expect(s.choices).toEqual([expect.objectContaining({ productId: "p500", count: 1 })]);
    expect(s.surplus).toEqual(rat(180));
    expect(s.costCents).toBe(99);
  });
  it("combine des tailles pour minimiser le coût", () => {
    const s = chooseCheapestPacks(rat(1400), [opt("p500", 500, 99), opt("p1000", 1000, 150)])!;
    expect(s.costCents).toBe(249);
    expect(s.choices.map((c) => [c.productId, c.count])).toEqual([["p1000", 1], ["p500", 1]]);
  });
  it("œufs : lot de 6 ou 12, jamais moins que le besoin (indivisible)", () => {
    const s = chooseCheapestPacks(rat(7), [opt("x6", 6, 189), opt("x12", 12, 319)])!;
    expect(s.costCents).toBe(319);
    expect(gte(s.totalQuantity, rat(7))).toBe(true);
    const one = chooseCheapestPacks(rat(1, 2), [opt("x6", 6, 189)])!;
    expect(one.choices[0]!.count).toBe(1);
  });
  it("besoin nul ou options absentes", () => {
    expect(chooseCheapestPacks(ZERO, [opt("a", 1, 1)])!.choices).toEqual([]);
    expect(chooseCheapestPacks(rat(1), [])).toBeNull();
  });
  it("sans prix : minimise le surplus", () => {
    const s = chooseCheapestPacks(rat(300), [opt("a", 250, null), opt("b", 400, null)])!;
    expect(s.costCents).toBeNull();
    expect(s.choices.map((c) => c.productId)).toEqual(["b"]);
  });
  it("ignore les options sans prix s'il en existe avec prix", () => {
    const s = chooseCheapestPacks(rat(300), [opt("a", 250, null), opt("b", 1000, 300)])!;
    expect(s.choices.map((c) => c.productId)).toEqual(["b"]);
  });
  it("tailles fractionnaires (litres)", () => {
    const s = chooseCheapestPacks(rat(1250), [{ productId: "l", name: "l", size: rat(1000), priceCents: 100 }, { productId: "h", name: "h", size: rat(1001, 2), priceCents: 60 }])!;
    expect(gte(s.totalQuantity, rat(1250))).toBe(true);
    expect(s.costCents).toBe(160);
  });
  it("grand besoin : repli glouton qui couvre toujours", () => {
    const s = chooseCheapestPacks(rat(10_000_000), [opt("a", 7, 3), opt("b", 11, 4)])!;
    expect(gte(s.totalQuantity, rat(10_000_000))).toBe(true);
  });

  const brute = (need: number, options: PackOption[]): number => {
    // Recherche exhaustive bornée pour vérifier l'optimalité de la DP.
    let best = Number.POSITIVE_INFINITY;
    const rec = (i: number, qty: number, cost: number): void => {
      if (qty >= need) { best = Math.min(best, cost); return; }
      if (i >= options.length) return;
      const o = options[i]!;
      const sz = Number(o.size.n);
      const maxK = Math.ceil((need - qty) / sz);
      for (let k = 0; k <= maxK; k++) rec(i + 1, qty + k * sz, cost + k * o.priceCents!);
    };
    rec(0, 0, 0);
    return best;
  };

  it("propriété : couvre le besoin et est optimal (comparé à la force brute)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3000 }),
        fc.array(fc.tuple(fc.integer({ min: 50, max: 1500 }), fc.integer({ min: 10, max: 900 })), { minLength: 1, maxLength: 3 }),
        (need, raw) => {
          const options = raw.map(([s, p], i) => opt(`o${i}`, s, p));
          const sol = chooseCheapestPacks(rat(need), options)!;
          expect(cmp(sol.totalQuantity, rat(need))).toBeGreaterThanOrEqual(0);
          const total = sol.choices.reduce((acc, c) => add(acc, mul(c.size, rat(c.count))), ZERO);
          expect(total).toEqual(sol.totalQuantity);
          expect(sol.costCents).toBe(brute(need, options));
        },
      ),
      { numRuns: 200 },
    );
  });
});
