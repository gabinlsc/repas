import { describe, expect, it } from "vitest";
import { addDays, allocatePantry, consumeFromPantry, daysBetween, DomainError, expiryAlerts, parseIsoDate, rat, type PantryLot } from "../src/index.js";

const lot = (id: string, q: number, bestBefore: string | null, expiryKind: "dlc" | "ddm" = "dlc"): PantryLot => ({ id, ingredientId: "x", quantity: rat(q), bestBefore, expiryKind });

describe("dates", () => {
  it("parse, ajoute, différence", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(daysBetween("2026-11-16", "2026-11-20")).toBe(4);
    expect(() => parseIsoDate("2026-02-30")).toThrow(DomainError);
    expect(() => parseIsoDate("16/11/2026")).toThrow(DomainError);
  });
});

describe("allocation FEFO du stock", () => {
  const week = "2026-11-16";
  it("déduit le stock valide et n'utilise pas un lot périmé au jour d'usage", () => {
    const a = allocatePantry([{ day: 0, quantity: rat(100) }, { day: 4, quantity: rat(200) }], [lot("a", 150, "2026-11-17"), lot("b", 50, null)], week);
    // jour 0 : 100 pris sur a (expire le 17) ; jour 4 : a est périmé → 50 de b, 150 à acheter
    expect(a.fromPantry).toEqual(rat(150));
    expect(a.toBuy).toEqual(rat(150));
    expect(a.lotsUsed).toEqual([{ lotId: "a", quantity: rat(100) }, { lotId: "b", quantity: rat(50) }]);
  });
  it("DDM dépassée reste utilisable (qualité, pas sécurité)", () => {
    const a = allocatePantry([{ day: 3, quantity: rat(100) }], [lot("a", 100, "2026-11-01", "ddm")], week);
    expect(a.toBuy).toEqual(rat(0));
  });
  it("signale les lots déjà périmés", () => {
    const a = allocatePantry([{ day: 0, quantity: rat(10) }], [lot("old", 100, "2026-11-10")], week);
    expect(a.expiredLotIds).toEqual(["old"]);
    expect(a.toBuy).toEqual(rat(10));
  });
  it("alertes DLC", () => {
    const alerts = expiryAlerts([lot("a", 1, "2026-11-14"), lot("b", 1, "2026-11-15"), lot("c", 1, "2026-11-17"), lot("d", 1, "2026-12-30"), lot("e", 0, "2026-11-15"), lot("f", 1, null)], "2026-11-15");
    expect(alerts.map((x) => [x.lotId, x.level])).toEqual([["a", "expired"], ["b", "today"], ["c", "soon"]]);
  });
  it("décrément à la cuisson (FEFO)", () => {
    const r = consumeFromPantry([lot("late", 100, "2026-12-01"), lot("soon", 50, "2026-11-16"), lot("z", 0, null)], rat(120), "2026-11-15");
    expect(r.updates.get("soon")).toEqual(rat(0));
    expect(r.updates.get("late")).toEqual(rat(30));
    expect(r.missing).toEqual(rat(0));
    expect(consumeFromPantry([lot("a", 10, null)], rat(15), "2026-11-15").missing).toEqual(rat(5));
  });
});
