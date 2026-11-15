import { DomainError } from "./errors.js";
import { add as addR, cmp, gt, isZero, min, sub, ZERO, type Rational } from "./rational.js";

export type ExpiryKind = "dlc" | "ddm";

export interface PantryLot {
  readonly id: string;
  readonly ingredientId: string;
  readonly quantity: Rational;
  /** date ISO AAAA-MM-JJ ; null = pas de date. */
  readonly bestBefore: string | null;
  /** DLC = date limite de consommation (sécurité) ; DDM = durabilité minimale (qualité). */
  readonly expiryKind: ExpiryKind;
}

export interface Use {
  readonly day: number;
  readonly quantity: Rational;
}

export interface Allocation {
  readonly fromPantry: Rational;
  readonly toBuy: Rational;
  readonly lotsUsed: ReadonlyArray<{ readonly lotId: string; readonly quantity: Rational }>;
  /** lots ignorés car périmés au moment de l'usage (DLC dépassée). */
  readonly expiredLotIds: readonly string[];
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(s: string): number {
  const m = ISO.exec(s);
  if (!m) throw new DomainError("INVALID_DATE", `Date invalide : ${s}`, { date: s });
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(t);
  if (d.getUTCDate() !== Number(m[3])) throw new DomainError("INVALID_DATE", `Date invalide : ${s}`, { date: s });
  return Math.round(t / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  return new Date((parseIsoDate(iso) + days) * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return parseIsoDate(toIso) - parseIsoDate(fromIso);
}

/** Dernier jour (index dans la semaine) où le lot est consommable ; +∞ si pas de DLC. */
function lastUsableDay(lot: PantryLot, weekStart: string): number {
  if (!lot.bestBefore || lot.expiryKind === "ddm") return Number.POSITIVE_INFINITY;
  return daysBetween(weekStart, lot.bestBefore);
}

/**
 * Affecte le stock aux usages (FEFO : premier périmé, premier sorti). Les usages sont
 * traités chronologiquement et chaque usage prend d'abord les lots valides qui expirent
 * le plus tôt — glouton optimal ici car chaque lot est utilisable sur un préfixe de jours.
 */
export function allocatePantry(uses: readonly Use[], lots: readonly PantryLot[], weekStart: string): Allocation {
  const remaining = new Map(lots.map((l) => [l.id, l.quantity]));
  const sortedLots = lots
    .slice()
    .sort((a, b) => lastUsableDay(a, weekStart) - lastUsableDay(b, weekStart) || a.id.localeCompare(b.id));
  const used = new Map<string, Rational>();
  let fromPantry = ZERO;
  let toBuy = ZERO;
  for (const use of uses.slice().sort((a, b) => a.day - b.day)) {
    let need = use.quantity;
    for (const lot of sortedLots) {
      if (isZero(need)) break;
      if (lastUsableDay(lot, weekStart) < use.day) continue;
      const avail = remaining.get(lot.id)!;
      if (!gt(avail, ZERO)) continue;
      const take = min(avail, need);
      remaining.set(lot.id, sub(avail, take));
      used.set(lot.id, addR(used.get(lot.id) ?? ZERO, take));
      fromPantry = addR(fromPantry, take);
      need = sub(need, take);
    }
    toBuy = addR(toBuy, need);
  }
  const firstUse = uses.length ? Math.min(...uses.map((u) => u.day)) : 0;
  const expiredLotIds = lots.filter((l) => lastUsableDay(l, weekStart) < firstUse).map((l) => l.id).sort();
  return {
    fromPantry,
    toBuy,
    lotsUsed: [...used.entries()].filter(([, q]) => cmp(q, ZERO) > 0).map(([lotId, quantity]) => ({ lotId, quantity })).sort((a, b) => a.lotId.localeCompare(b.lotId)),
    expiredLotIds,
  };
}



export interface ExpiryAlert {
  readonly lotId: string;
  readonly ingredientId: string;
  readonly daysLeft: number;
  readonly level: "expired" | "today" | "soon";
}

/** Alertes DLC/DDM : périmé, aujourd'hui, ou sous `soonDays` jours. */
export function expiryAlerts(lots: readonly PantryLot[], today: string, soonDays = 3): ExpiryAlert[] {
  return lots
    .filter((l) => l.bestBefore !== null && gt(l.quantity, ZERO))
    .map((l) => ({ lot: l, daysLeft: daysBetween(today, l.bestBefore!) }))
    .filter(({ daysLeft }) => daysLeft <= soonDays)
    .map(({ lot, daysLeft }) => ({
      lotId: lot.id,
      ingredientId: lot.ingredientId,
      daysLeft,
      level: (daysLeft < 0 ? "expired" : daysLeft === 0 ? "today" : "soon") as ExpiryAlert["level"],
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft || a.lotId.localeCompare(b.lotId));
}

/** Décrémente le stock (FEFO) quand un repas est cuisiné ; renvoie les nouvelles quantités par lot. */
export function consumeFromPantry(lots: readonly PantryLot[], quantity: Rational, today: string): { updates: Map<string, Rational>; missing: Rational } {
  const updates = new Map<string, Rational>();
  let need = quantity;
  const order = lots.slice().sort((a, b) => lastUsableDay(a, today) - lastUsableDay(b, today) || a.id.localeCompare(b.id));
  for (const lot of order) {
    if (isZero(need)) break;
    const take = min(lot.quantity, need);
    if (isZero(take)) continue;
    updates.set(lot.id, sub(lot.quantity, take));
    need = sub(need, take);
  }
  return { updates, missing: need };
}
