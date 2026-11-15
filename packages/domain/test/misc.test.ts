import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applyPatch, costOf, decodeHlc, DomainError, encodeHlc, formatCents, formatQuantity, mergeLww, parseEuroToCents, rat, receiveHlc,
  recipeNutritionPerServing, seasonalityScore, tickHlc, toNumberForDisplay, unitPrice, weeklyNutritionScore, EMPTY_NUTRITION, type LwwRecord,
} from "../src/index.js";
import { ING } from "./fixtures.js";

describe("nutrition", () => {
  it("par portion, en ignorant les lignes floues et sans données", () => {
    const { perServing, missing } = recipeNutritionPerServing(
      [
        { ingredient: ING.pates!, quantity: rat(400), unit: "g" },
        { ingredient: ING.oeuf!, quantity: rat(2), unit: "piece" },
        { ingredient: ING.sel!, quantity: null, unit: "pincee" },
        { ingredient: ING.ail!, quantity: rat(1), unit: "gousse" },
        { ingredient: ING.lait!, quantity: rat(1), unit: "pincee" },
        { ingredient: ING.oignon!, quantity: rat(1), unit: "ml" },
        { ingredient: { ...ING.oeuf!, pieceWeightG: null }, quantity: rat(1), unit: "piece" },
      ],
      4,
    );
    // pâtes 400 g → 1420 kcal ; 2 œufs (110 g) → 154 kcal ; total 1574 / 4
    expect(toNumberForDisplay(perServing.kcal)).toBe(393.5);
    expect(missing).toBe(3);
  });
  it("score hebdomadaire et alertes", () => {
    const low = weeklyNutritionScore({ days: 7, people: 2, total: EMPTY_NUTRITION, distinctVegetables: 1, kcalTargetPerPersonDay: 2000 });
    expect(low.alerts).toEqual(["nutrition.lowEnergy", "nutrition.lowFiber", "nutrition.lowProtein", "nutrition.lowVegetableDiversity"]);
    const good = weeklyNutritionScore({
      days: 1, people: 1, distinctVegetables: 12, kcalTargetPerPersonDay: 2000,
      total: { ...EMPTY_NUTRITION, kcal: rat(2000), fiber: rat(35), protein: rat(70) },
    });
    expect(good.score).toBe(100);
    const high = weeklyNutritionScore({ days: 1, people: 1, distinctVegetables: 12, kcalTargetPerPersonDay: 0, total: { ...EMPTY_NUTRITION, kcal: rat(5000) } });
    expect(high.alerts).not.toContain("nutrition.highEnergy");
    expect(weeklyNutritionScore({ days: 1, people: 1, distinctVegetables: 12, kcalTargetPerPersonDay: 1000, total: { ...EMPTY_NUTRITION, kcal: rat(2000) } }).alerts).toContain("nutrition.highEnergy");
  });
});

describe("saisonnalité", () => {
  it("part pondérée de saison ; neutre sans légumes", () => {
    expect(seasonalityScore([{ seasonMonths: [7], weight: rat(300), isProduce: true }, { seasonMonths: [1], weight: rat(100), isProduce: true }], 7)).toBe(75);
    expect(seasonalityScore([{ seasonMonths: [], weight: rat(300), isProduce: false }], 7)).toBe(50);
  });
});

describe("HLC et LWW", () => {
  it("encode/décode et ordonne", () => {
    const a = tickHlc(null, 1000, "n1");
    const b = tickHlc(a, 1000, "n1");
    const c = tickHlc(b, 2000, "n1");
    expect(b.counter).toBe(1);
    expect(c).toEqual({ wall: 2000, counter: 0, node: "n1" });
    expect(encodeHlc(a) < encodeHlc(b)).toBe(true);
    expect(decodeHlc(encodeHlc(b))).toEqual(b);
    expect(() => decodeHlc("x")).toThrow(DomainError);
  });
  it("réception d'horloge distante", () => {
    const local = { wall: 5000, counter: 2, node: "a" };
    expect(receiveHlc(local, { wall: 5000, counter: 7, node: "b" }, 4000, "a")).toEqual({ wall: 5000, counter: 8, node: "a" });
    expect(receiveHlc(local, { wall: 3000, counter: 7, node: "b" }, 4000, "a")).toEqual({ wall: 5000, counter: 3, node: "a" });
    expect(receiveHlc(local, { wall: 9000, counter: 1, node: "b" }, 4000, "a")).toEqual({ wall: 9000, counter: 2, node: "a" });
    expect(receiveHlc(null, { wall: 1, counter: 1, node: "b" }, 4000, "a")).toEqual({ wall: 4000, counter: 0, node: "a" });
  });
  it("patchs concurrents sur des champs différents convergent", () => {
    const base: LwwRecord<{ checked: boolean; price: number | null }> = { value: { checked: false, price: null }, clocks: {} };
    const a = applyPatch(base, { checked: true }, "000000000001000:000000:a");
    const b = applyPatch(base, { price: 349 }, "000000000001001:000000:b");
    expect(mergeLww(a, b).value).toEqual({ checked: true, price: 349 });
    expect(mergeLww(b, a).value).toEqual({ checked: true, price: 349 });
    const older = applyPatch(a, { checked: false }, "000000000000500:000000:c");
    expect(older.value.checked).toBe(true);
  });

  const arbRec = fc.record({
    value: fc.record({ checked: fc.boolean(), qty: fc.integer({ min: 0, max: 5 }) }),
    clocks: fc.record({ checked: fc.integer({ min: 0, max: 9 }).map((n) => `00000000000000${n}:000000:x`), qty: fc.integer({ min: 0, max: 9 }).map((n) => `00000000000000${n}:000000:y`) }),
  });
  it("propriétés : fusion commutative, associative, idempotente", () => {
    fc.assert(fc.property(arbRec, arbRec, arbRec, (a, b, c) => {
      expect(mergeLww(a, b)).toEqual(mergeLww(b, a));
      expect(mergeLww(mergeLww(a, b), c)).toEqual(mergeLww(a, mergeLww(b, c)));
      expect(mergeLww(a, a)).toEqual(a);
    }));
  });
});

describe("argent et formats", () => {
  it("centimes", () => {
    expect(formatCents(12345).replace(/\s/g, " ")).toBe("123,45 €");
    expect(parseEuroToCents("3,4")).toBe(340);
    expect(parseEuroToCents("3.49 €")).toBe(349);
    expect(parseEuroToCents("12")).toBe(1200);
    expect(parseEuroToCents("abc")).toBeNull();
    expect(costOf(rat(320), unitPrice(99, rat(500)))).toBe(64);
  });
  it("quantités lisibles", () => {
    expect(formatQuantity(rat(1500), "g")).toBe("1,5 kg");
    expect(formatQuantity(rat(250), "g")).toBe("250 g");
    expect(formatQuantity(rat(1250), "ml")).toBe("1,25 l");
    expect(formatQuantity(rat(250), "ml")).toBe("25 cl");
    expect(formatQuantity(rat(50), "ml")).toBe("50 ml");
    expect(formatQuantity(rat(3), "piece")).toBe("3 pièces");
    expect(formatQuantity(rat(1), "piece")).toBe("1 pièce");
    expect(formatQuantity(rat(3), "piece", "en-GB")).toBe("3 pieces");
    expect(formatQuantity(rat(1), "piece", "en-GB")).toBe("1 piece");
  });
});
