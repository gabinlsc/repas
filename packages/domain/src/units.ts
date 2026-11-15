import { DomainError } from "./errors.js";
import { div, mul, rat, type Rational } from "./rational.js";
import type { BaseUnit, Ingredient } from "./types.js";

export type UnitKind = "mass" | "volume" | "count" | "fuzzy" | "ingredient";

export interface UnitDef {
  readonly code: string;
  readonly kind: UnitKind;
  /** facteur vers g (masse), ml (volume) ou pièce (compte). Null pour flou / spécifique. */
  readonly factor: Rational | null;
  readonly labelFr: string;
  readonly labelFrPlural: string;
}

const u = (code: string, kind: UnitKind, factor: Rational | null, labelFr: string, labelFrPlural = labelFr): UnitDef => ({
  code,
  kind,
  factor,
  labelFr,
  labelFrPlural,
});

/**
 * Catalogue des unités. Les cuillères sont des volumes normalisés (15 ml / 5 ml) :
 * la masse dépend ensuite de la densité de l'ingrédient (1 c. à s. de farine ≠ d'eau).
 * Les unités « ingredient » (gousse, tranche…) n'ont de sens qu'avec une conversion
 * propre à l'ingrédient.
 */
export const UNITS: Readonly<Record<string, UnitDef>> = Object.freeze({
  mg: u("mg", "mass", rat(1, 1000), "mg"),
  g: u("g", "mass", rat(1), "g"),
  kg: u("kg", "mass", rat(1000), "kg"),
  ml: u("ml", "volume", rat(1), "ml"),
  cl: u("cl", "volume", rat(10), "cl"),
  dl: u("dl", "volume", rat(100), "dl"),
  l: u("l", "volume", rat(1000), "l"),
  cs: u("cs", "volume", rat(15), "c. à soupe", "c. à soupe"),
  cc: u("cc", "volume", rat(5), "c. à café", "c. à café"),
  tasse: u("tasse", "volume", rat(250), "tasse", "tasses"),
  verre: u("verre", "volume", rat(200), "verre", "verres"),
  bol: u("bol", "volume", rat(350), "bol", "bols"),
  piece: u("piece", "count", rat(1), "pièce", "pièces"),
  douzaine: u("douzaine", "count", rat(12), "douzaine", "douzaines"),
  pincee: u("pincee", "fuzzy", null, "pincée", "pincées"),
  gout: u("gout", "fuzzy", null, "à votre goût"),
  filet: u("filet", "fuzzy", null, "filet", "filets"),
  poignee: u("poignee", "fuzzy", null, "poignée", "poignées"),
  noix: u("noix", "ingredient", null, "noix", "noix"),
  gousse: u("gousse", "ingredient", null, "gousse", "gousses"),
  tranche: u("tranche", "ingredient", null, "tranche", "tranches"),
  sachet: u("sachet", "ingredient", null, "sachet", "sachets"),
  boite: u("boite", "ingredient", null, "boîte", "boîtes"),
  botte: u("botte", "ingredient", null, "botte", "bottes"),
  brin: u("brin", "ingredient", null, "brin", "brins"),
  feuille: u("feuille", "ingredient", null, "feuille", "feuilles"),
  pot: u("pot", "ingredient", null, "pot", "pots"),
  brique: u("brique", "ingredient", null, "brique", "briques"),
  pave: u("pave", "ingredient", null, "pavé", "pavés"),
  filet_poisson: u("filet_poisson", "ingredient", null, "filet", "filets"),
  rouleau: u("rouleau", "ingredient", null, "rouleau", "rouleaux"),
  cube: u("cube", "ingredient", null, "cube", "cubes"),
  branche: u("branche", "ingredient", null, "branche", "branches"),
  carre: u("carre", "ingredient", null, "carré", "carrés"),
});

export function getUnit(code: string): UnitDef {
  const def = UNITS[code];
  if (!def) throw new DomainError("UNKNOWN_UNIT", `Unité inconnue : ${code}`, { unit: code });
  return def;
}

export type ToBaseResult =
  | { readonly kind: "exact"; readonly quantity: Rational; readonly baseUnit: BaseUnit }
  | { readonly kind: "fuzzy" };

type Ing = Pick<Ingredient, "id" | "baseUnit" | "densityGPerMl" | "pieceWeightG" | "conversions">;

function unconvertible(ing: Ing, unit: string, missing: string): never {
  throw new DomainError("UNCONVERTIBLE_UNIT", `Impossible de convertir ${unit} pour ${ing.id} : ${missing} manquant`, {
    ingredient: ing.id,
    unit,
    missing,
  });
}

/** Convertit une quantité de masse (g) vers l'unité de base de l'ingrédient. */
function fromGrams(g: Rational, ing: Ing, unit: string): Rational {
  switch (ing.baseUnit) {
    case "g":
      return g;
    case "ml":
      return div(g, ing.densityGPerMl ?? unconvertible(ing, unit, "densité"));
    case "piece":
      return div(g, ing.pieceWeightG ?? unconvertible(ing, unit, "poids unitaire"));
  }
}

function fromMl(ml: Rational, ing: Ing, unit: string): Rational {
  if (ing.baseUnit === "ml") return ml;
  return fromGrams(mul(ml, ing.densityGPerMl ?? unconvertible(ing, unit, "densité")), ing, unit);
}

function fromPieces(p: Rational, ing: Ing, unit: string): Rational {
  if (ing.baseUnit === "piece") return p;
  return fromGrams(mul(p, ing.pieceWeightG ?? unconvertible(ing, unit, "poids unitaire")), ing, unit);
}

/**
 * Normalise `quantity unit` dans l'unité de base de l'ingrédient.
 * Ordre de priorité : conversion propre à l'ingrédient, puis unité générique + densité/poids.
 */
export function toBase(quantity: Rational, unitCode: string, ing: Ing): ToBaseResult {
  const specific = ing.conversions[unitCode];
  if (specific) return { kind: "exact", quantity: mul(quantity, specific), baseUnit: ing.baseUnit };
  const unit = getUnit(unitCode);
  switch (unit.kind) {
    case "fuzzy":
      return { kind: "fuzzy" };
    case "ingredient":
      return unconvertible(ing, unitCode, "conversion spécifique");
    case "mass":
      return { kind: "exact", quantity: fromGrams(mul(quantity, unit.factor!), ing, unitCode), baseUnit: ing.baseUnit };
    case "volume":
      return { kind: "exact", quantity: fromMl(mul(quantity, unit.factor!), ing, unitCode), baseUnit: ing.baseUnit };
    case "count":
      return { kind: "exact", quantity: fromPieces(mul(quantity, unit.factor!), ing, unitCode), baseUnit: ing.baseUnit };
  }
}

/** Convertit une quantité en unité de base vers des grammes (nutrition). Null si impossible. */
export function baseToGrams(quantity: Rational, ing: Ing): Rational | null {
  switch (ing.baseUnit) {
    case "g":
      return quantity;
    case "ml":
      return ing.densityGPerMl ? mul(quantity, ing.densityGPerMl) : null;
    case "piece":
      return ing.pieceWeightG ? mul(quantity, ing.pieceWeightG) : null;
  }
}
