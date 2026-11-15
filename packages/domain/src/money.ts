import { div, mul, rat, roundToInt, type Rational } from "./rational.js";

export function formatCents(cents: number, locale = "fr-FR", currency = "EUR"): string {
  // Intl reçoit un nombre décimal à 2 chiffres exact (centimes entiers / 100 est représentable à l'affichage).
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

/** Prix unitaire en centimes par unité de base, exact. */
export function unitPrice(priceCents: number, quantity: Rational): Rational {
  return div(rat(priceCents), quantity);
}

/** Coût d'une quantité au prix unitaire, arrondi au centime supérieur (estimation prudente). */
export function costOf(quantity: Rational, unitPriceCents: Rational): number {
  return Number(roundToInt(mul(quantity, unitPriceCents), "ceil"));
}

/** Parse « 3,49 » / « 3.49 € » → 349 ; null si illisible. */
export function parseEuroToCents(text: string): number | null {
  const m = /^\s*(\d{1,7})(?:[.,](\d{1,2}))?\s*€?\s*$/.exec(text);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}
