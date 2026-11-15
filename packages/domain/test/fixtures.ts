import { rat, type Ingredient, type Nutrition100g } from "../src/index.js";

const nut = (kcal: number, protein: number, carbs: number, fat: number, fiber: number): Nutrition100g => ({
  kcal: rat(kcal), protein: rat(protein), carbs: rat(carbs), fat: rat(fat), fiber: rat(fiber), sugar: rat(0), salt: rat(0),
});

const base = {
  synonyms: [] as string[], densityGPerMl: null, pieceWeightG: null, conversions: {}, allergens: [], traits: [], nutrition: null,
  seasonMonths: [] as number[], proteinType: null, vegetableType: null, perishableDays: null,
} satisfies Partial<Ingredient>;

export const ING: Record<string, Ingredient> = {
  farine: { ...base, id: "farine", name: "Farine de blé", synonyms: ["farine"], aisle: "epicerie_sucree", baseUnit: "g", densityGPerMl: rat(55, 100), allergens: ["gluten"], nutrition: nut(350, 10, 72, 1, 3) },
  eau: { ...base, id: "eau", name: "Eau", aisle: "boissons", baseUnit: "ml", densityGPerMl: rat(1) },
  oignon: { ...base, id: "oignon", name: "Oignon", synonyms: ["oignon jaune"], aisle: "fruits_legumes", baseUnit: "g", pieceWeightG: rat(150), nutrition: nut(40, 1, 7, 0, 2), seasonMonths: [1,2,3,4,5,6,7,8,9,10,11,12], vegetableType: "allium" },
  oeuf: { ...base, id: "oeuf", name: "Œuf", synonyms: ["oeufs"], aisle: "cremerie", baseUnit: "piece", pieceWeightG: rat(55), allergens: ["oeufs"], traits: ["egg"], nutrition: nut(140, 13, 1, 10, 0), proteinType: "oeuf", perishableDays: 28 },
  lait: { ...base, id: "lait", name: "Lait demi-écrémé", synonyms: ["lait"], aisle: "cremerie", baseUnit: "ml", densityGPerMl: rat(103, 100), allergens: ["lait"], traits: ["dairy", "lactose"], nutrition: nut(46, 3, 5, 2, 0) },
  huile_olive: { ...base, id: "huile_olive", name: "Huile d'olive", aisle: "condiments_epices", baseUnit: "ml", densityGPerMl: rat(92, 100), nutrition: nut(900, 0, 0, 100, 0) },
  ail: { ...base, id: "ail", name: "Ail", aisle: "fruits_legumes", baseUnit: "g", pieceWeightG: rat(40), conversions: { gousse: rat(5) }, vegetableType: "allium" },
  sel: { ...base, id: "sel", name: "Sel", aisle: "condiments_epices", baseUnit: "g" },
  poulet: { ...base, id: "poulet", name: "Blanc de poulet", synonyms: ["escalope de poulet"], aisle: "boucherie", baseUnit: "g", traits: ["meat"], nutrition: nut(120, 23, 0, 2, 0), proteinType: "volaille", perishableDays: 3 },
  courgette: { ...base, id: "courgette", name: "Courgette", aisle: "fruits_legumes", baseUnit: "g", pieceWeightG: rat(250), nutrition: nut(17, 1, 2, 0, 1), seasonMonths: [6,7,8,9], vegetableType: "courge" },
  tomate_pelee: { ...base, id: "tomate_pelee", name: "Tomates pelées", aisle: "conserves", baseUnit: "g", vegetableType: "tomate" },
  saumon: { ...base, id: "saumon", name: "Pavé de saumon", aisle: "poissonnerie", baseUnit: "g", allergens: ["poissons"], traits: ["fish"], conversions: { pave: rat(125) }, proteinType: "poisson" },
  lardons: { ...base, id: "lardons", name: "Lardons", aisle: "charcuterie_traiteur", baseUnit: "g", traits: ["meat", "pork"], proteinType: "porc" },
  pates: { ...base, id: "pates", name: "Pâtes sèches", synonyms: ["spaghetti", "penne"], aisle: "feculents", baseUnit: "g", allergens: ["gluten"], nutrition: nut(355, 12, 70, 2, 3) },
};

export const ingredientMap = new Map(Object.values(ING).map((i) => [i.id, i]));
