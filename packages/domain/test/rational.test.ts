import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  add, cmp, div, DomainError, eq, gt, isPositive, isZero, lt, lte, max, min, mul, neg, parseRational, rat, roundToInt, roundToStep,
  sub, sum, toDecimalString, toFixed, toNumberForDisplay, ZERO, ONE, gte, fromInt,
} from "../src/index.js";

const arbRat = fc.tuple(fc.bigInt({ min: -(10n ** 9n), max: 10n ** 9n }), fc.bigInt({ min: 1n, max: 10n ** 6n })).map(([n, d]) => rat(n, d));

describe("Rational", () => {
  it("normalise les fractions et le signe", () => {
    expect(rat(2, 4)).toEqual({ n: 1n, d: 2n });
    expect(rat(1, -2)).toEqual({ n: -1n, d: 2n });
    expect(rat(0, 5)).toEqual({ n: 0n, d: 1n });
  });
  it("refuse les dénominateurs nuls et les flottants", () => {
    expect(() => rat(1, 0)).toThrow(DomainError);
    expect(() => rat(0.1)).toThrow(/Entier attendu/);
    expect(() => div(ONE, ZERO)).toThrow(DomainError);
  });
  it("0,1 + 0,2 = 0,3 exactement", () => {
    expect(eq(add(parseRational("0,1"), parseRational("0.2")), parseRational("0.3"))).toBe(true);
  });
  it("parse décimaux, fractions et fractions mixtes", () => {
    expect(parseRational("1 1/2")).toEqual(rat(3, 2));
    expect(parseRational("3/4")).toEqual(rat(3, 4));
    expect(parseRational("-2,25")).toEqual(rat(-9, 4));
    expect(parseRational("-1/2")).toEqual(rat(-1, 2));
    expect(() => parseRational("abc")).toThrow(DomainError);
    expect(() => parseRational("1/0")).toThrow(DomainError);
  });
  it("arrondit dans la direction demandée", () => {
    expect(roundToInt(rat(7, 2), "ceil")).toBe(4n);
    expect(roundToInt(rat(7, 2), "floor")).toBe(3n);
    expect(roundToInt(rat(7, 2), "half-up")).toBe(4n);
    expect(roundToInt(rat(-7, 2), "half-up")).toBe(-4n);
    expect(roundToInt(rat(-7, 2), "floor")).toBe(-4n);
    expect(roundToInt(rat(-7, 2), "ceil")).toBe(-3n);
    expect(roundToInt(rat(13, 10), "half-up")).toBe(1n);
    expect(roundToInt(rat(-13, 10), "half-up")).toBe(-1n);
    expect(roundToInt(rat(6, 2), "ceil")).toBe(3n);
    expect(roundToStep(rat(1234, 1000), rat(1, 100), "ceil")).toEqual(rat(124, 100));
  });
  it("formate en décimal fixe", () => {
    expect(toFixed(rat(1, 3), 3)).toBe("0.333");
    expect(toFixed(rat(2, 3), 3, "ceil")).toBe("0.667");
    expect(toFixed(rat(-1, 8), 3)).toBe("-0.125");
    expect(toFixed(rat(5), 0)).toBe("5");
    expect(toDecimalString(rat(3, 2))).toBe("1.5");
    expect(toDecimalString(rat(2))).toBe("2");
    expect(toNumberForDisplay(rat(1, 4))).toBe(0.25);
  });
  it("comparateurs", () => {
    expect(lt(rat(1, 3), rat(1, 2))).toBe(true);
    expect(gt(rat(1, 2), rat(1, 3))).toBe(true);
    expect(lte(rat(1, 2), rat(2, 4))).toBe(true);
    expect(gte(rat(1, 2), rat(2, 4))).toBe(true);
    expect(min(rat(1), rat(2))).toEqual(rat(1));
    expect(max(rat(1), rat(2))).toEqual(rat(2));
    expect(isZero(ZERO) && isPositive(ONE)).toBe(true);
    expect(sum([rat(1, 2), rat(1, 3), rat(1, 6)])).toEqual(ONE);
    expect(neg(ONE)).toEqual(rat(-1));
    expect(fromInt(3)).toEqual(rat(3));
  });

  it("propriétés algébriques (commutativité, associativité, distributivité)", () => {
    fc.assert(fc.property(arbRat, arbRat, arbRat, (a, b, c) => {
      expect(add(a, b)).toEqual(add(b, a));
      expect(mul(a, b)).toEqual(mul(b, a));
      expect(add(add(a, b), c)).toEqual(add(a, add(b, c)));
      expect(mul(a, add(b, c))).toEqual(add(mul(a, b), mul(a, c)));
      expect(sub(add(a, b), b)).toEqual(a);
    }));
  });
  it("propriété : division inverse de la multiplication", () => {
    fc.assert(fc.property(arbRat, arbRat.filter((x) => !isZero(x)), (a, b) => {
      expect(div(mul(a, b), b)).toEqual(a);
    }));
  });
  it("propriété : toFixed puis parse ne s'écarte pas de plus d'un demi-pas", () => {
    fc.assert(fc.property(arbRat, (a) => {
      const back = parseRational(toFixed(a, 3));
      expect(lte(mul(sub(back, a), sub(back, a)), rat(1, 4_000_000))).toBe(true);
    }));
  });
  it("propriété : ceil ≥ valeur ≥ floor", () => {
    fc.assert(fc.property(arbRat, (a) => {
      expect(cmp(rat(roundToInt(a, "ceil")), a)).toBeGreaterThanOrEqual(0);
      expect(cmp(rat(roundToInt(a, "floor")), a)).toBeLessThanOrEqual(0);
    }));
  });
});
