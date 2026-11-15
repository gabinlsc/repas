import type { Rational } from "./rational.js";

export const BASE_UNITS = ["g", "ml", "piece"] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];

/** Les 14 allergènes à déclaration obligatoire (règlement UE 1169/2011, annexe II). */
export const EU_ALLERGENS = [
  "gluten",
  "crustaces",
  "oeufs",
  "poissons",
  "arachides",
  "soja",
  "lait",
  "fruits_a_coque",
  "celeri",
  "moutarde",
  "sesame",
  "sulfites",
  "lupin",
  "mollusques",
] as const;
export type Allergen = (typeof EU_ALLERGENS)[number];

/** Caractéristiques d'un ingrédient dont on déduit, par règles, la compatibilité aux régimes. */
export const INGREDIENT_TRAITS = ["meat", "pork", "fish", "seafood", "dairy", "lactose", "egg", "honey", "alcohol", "gelatin"] as const;
export type IngredientTrait = (typeof INGREDIENT_TRAITS)[number];

export const DIETS = ["vegetarian", "vegan", "pescatarian", "gluten_free", "lactose_free", "pork_free", "alcohol_free"] as const;
export type Diet = (typeof DIETS)[number];

export const AISLES = [
  "fruits_legumes",
  "boulangerie",
  "boucherie",
  "poissonnerie",
  "charcuterie_traiteur",
  "cremerie",
  "fromagerie",
  "epicerie_salee",
  "feculents",
  "conserves",
  "condiments_epices",
  "epicerie_sucree",
  "monde",
  "surgeles",
  "boissons",
] as const;
export type Aisle = (typeof AISLES)[number];

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const EQUIPMENT = ["four", "plaques", "micro_ondes", "mixeur", "robot", "cocotte_minute", "poele", "wok", "barbecue", "friteuse_air", "mijoteuse", "gaufrier", "appareil_raclette"] as const;
export type Equipment = (typeof EQUIPMENT)[number];

/** Nutrition pour 100 g (Ciqual). Valeurs exactes en Rational, unités : kcal et grammes. */
export interface Nutrition100g {
  readonly kcal: Rational;
  readonly protein: Rational;
  readonly carbs: Rational;
  readonly fat: Rational;
  readonly fiber: Rational;
  readonly sugar: Rational;
  readonly salt: Rational;
}

export interface Ingredient {
  readonly id: string;
  readonly name: string;
  readonly synonyms: readonly string[];
  readonly aisle: Aisle;
  readonly baseUnit: BaseUnit;
  /** g par ml ; nécessaire pour convertir volume ↔ masse. */
  readonly densityGPerMl: Rational | null;
  /** masse d'une pièce moyenne (ex. 1 oignon ≈ 150 g). */
  readonly pieceWeightG: Rational | null;
  /** conversions propres à l'ingrédient : code d'unité → quantité en unité de base. */
  readonly conversions: Readonly<Record<string, Rational>>;
  readonly allergens: readonly Allergen[];
  readonly traits: readonly IngredientTrait[];
  readonly nutrition: Nutrition100g | null;
  readonly seasonMonths: readonly number[];
  readonly proteinType: string | null;
  readonly vegetableType: string | null;
  /** durée de conservation typique après achat (jours) ; null = non périssable. */
  readonly perishableDays: number | null;
}
