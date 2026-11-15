import { DomainError } from "./errors.js";

/**
 * Nombre rationnel exact (n/d, d > 0, fraction irréductible).
 * Pourquoi : les quantités métier ne doivent jamais subir les erreurs d'arrondi des
 * flottants binaires (0,1 + 0,2 ≠ 0,3). On n'arrondit qu'aux frontières, avec une
 * direction explicite.
 */
export interface Rational {
  readonly n: bigint;
  readonly d: bigint;
}

export type RoundingMode = "ceil" | "floor" | "half-up";

const abs = (x: bigint): bigint => (x < 0n ? -x : x);

function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

export function rat(n: bigint | number, d: bigint | number = 1n): Rational {
  const nn = toBig(n);
  const dd = toBig(d);
  if (dd === 0n) throw new DomainError("DIVISION_BY_ZERO", "Dénominateur nul");
  const sign = dd < 0n ? -1n : 1n;
  const g = gcd(nn, dd) || 1n;
  return { n: (sign * nn) / g, d: (sign * dd) / g };
}

function toBig(x: bigint | number): bigint {
  if (typeof x === "bigint") return x;
  // On n'accepte que des entiers sûrs : un flottant ici serait déjà une perte d'exactitude.
  if (!Number.isSafeInteger(x)) throw new DomainError("INVALID_RATIONAL", `Entier attendu : ${x}`);
  return BigInt(x);
}

export const ZERO = rat(0);
export const ONE = rat(1);

export const add = (a: Rational, b: Rational): Rational => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Rational, b: Rational): Rational => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Rational, b: Rational): Rational => rat(a.n * b.n, a.d * b.d);
export function div(a: Rational, b: Rational): Rational {
  if (b.n === 0n) throw new DomainError("DIVISION_BY_ZERO", "Division par zéro");
  return rat(a.n * b.d, a.d * b.n);
}
export const neg = (a: Rational): Rational => rat(-a.n, a.d);
export const cmp = (a: Rational, b: Rational): -1 | 0 | 1 => {
  const x = a.n * b.d - b.n * a.d;
  return x < 0n ? -1 : x > 0n ? 1 : 0;
};
export const eq = (a: Rational, b: Rational): boolean => cmp(a, b) === 0;
export const lt = (a: Rational, b: Rational): boolean => cmp(a, b) < 0;
export const lte = (a: Rational, b: Rational): boolean => cmp(a, b) <= 0;
export const gt = (a: Rational, b: Rational): boolean => cmp(a, b) > 0;
export const gte = (a: Rational, b: Rational): boolean => cmp(a, b) >= 0;
export const isZero = (a: Rational): boolean => a.n === 0n;
export const isPositive = (a: Rational): boolean => a.n > 0n;
export const min = (a: Rational, b: Rational): Rational => (lte(a, b) ? a : b);
export const max = (a: Rational, b: Rational): Rational => (gte(a, b) ? a : b);
export const sum = (xs: readonly Rational[]): Rational => xs.reduce(add, ZERO);

/** Partie entière arrondie selon `mode`. */
export function roundToInt(a: Rational, mode: RoundingMode): bigint {
  const q = a.n / a.d; // troncature vers zéro
  const r = a.n % a.d;
  if (r === 0n) return q;
  if (mode === "floor") return a.n < 0n ? q - 1n : q;
  if (mode === "ceil") return a.n > 0n ? q + 1n : q;
  // half-up : on compare 2|r| à d (arrondi au plus proche, ex aequo loin de zéro)
  const twice = 2n * abs(r);
  if (twice >= a.d) return a.n > 0n ? q + 1n : q - 1n;
  return q;
}

/** Arrondit à un multiple de `step` (ex. 0,001 pour le stockage `numeric(14,3)`). */
export function roundToStep(a: Rational, step: Rational, mode: RoundingMode): Rational {
  const k = roundToInt(div(a, step), mode);
  return mul(rat(k), step);
}

const DECIMAL_RE = /^([+-]?)(\d+)(?:[.,](\d+))?$/;
const FRACTION_RE = /^([+-]?)(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/;

/** Accepte « 12 », « 1,5 », « 1.5 », « 3/4 », « 1 1/2 ». */
export function parseRational(text: string): Rational {
  const s = text.trim();
  const dm = DECIMAL_RE.exec(s);
  if (dm) {
    const [, sign, intPart, frac = ""] = dm;
    const scale = 10n ** BigInt(frac.length);
    const value = rat(BigInt(intPart!) * scale + (frac ? BigInt(frac) : 0n), scale);
    return sign === "-" ? neg(value) : value;
  }
  const fm = FRACTION_RE.exec(s);
  if (fm) {
    const [, sign, whole, num, den] = fm;
    if (BigInt(den!) === 0n) throw new DomainError("DIVISION_BY_ZERO", "Fraction de dénominateur nul");
    const value = add(rat(BigInt(whole ?? "0")), rat(BigInt(num!), BigInt(den!)));
    return sign === "-" ? neg(value) : value;
  }
  throw new DomainError("INVALID_RATIONAL", `Nombre illisible : « ${text} »`, { text });
}

/** Représentation décimale fixe (ex. stockage SQL `numeric`). */
export function toFixed(a: Rational, scale: number, mode: RoundingMode = "half-up"): string {
  const factor = 10n ** BigInt(scale);
  const k = roundToInt(mul(a, rat(factor)), mode);
  const negative = k < 0n;
  const digits = abs(k).toString().padStart(scale + 1, "0");
  const intPart = digits.slice(0, digits.length - scale);
  const frac = scale > 0 ? "." + digits.slice(digits.length - scale) : "";
  return (negative ? "-" : "") + intPart + frac;
}

/** Décimal minimal sans zéros inutiles (affichage). */
export function toDecimalString(a: Rational, maxScale = 3, mode: RoundingMode = "half-up"): string {
  const s = toFixed(a, maxScale, mode);
  if (!s.includes(".")) return s;
  return s.replace(/0+$/, "").replace(/\.$/, "");
}

/** Conversion volontairement explicite vers `number` pour l'affichage/les graphes uniquement. */
export function toNumberForDisplay(a: Rational): number {
  return Number(toFixed(a, 6));
}

/** Entier `bigint` → Rational, pratique pour les centimes. */
export const fromInt = (x: number | bigint): Rational => rat(x);
