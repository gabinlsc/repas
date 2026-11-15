import { rat, toDecimalString, div, gte, type Rational } from "./rational.js";
import type { BaseUnit } from "./types.js";

/** Affiche une quantité en unité de base de façon lisible (1 500 g → 1,5 kg). */
export function formatQuantity(q: Rational, unit: BaseUnit, locale = "fr-FR"): string {
  const dec = (r: Rational, scale: number): string => {
    const s = toDecimalString(r, scale);
    return locale.startsWith("fr") ? s.replace(".", ",") : s;
  };
  if (unit === "g") return gte(q, rat(1000)) ? `${dec(div(q, rat(1000)), 2)} kg` : `${dec(q, 0)} g`;
  if (unit === "ml") return gte(q, rat(1000)) ? `${dec(div(q, rat(1000)), 2)} l` : gte(q, rat(100)) ? `${dec(div(q, rat(10)), 1)} cl` : `${dec(q, 0)} ml`;
  const s = dec(q, 1);
  return `${s} ${locale.startsWith("fr") ? (gte(q, rat(2)) ? "pièces" : "pièce") : gte(q, rat(2)) ? "pieces" : "piece"}`;
}
