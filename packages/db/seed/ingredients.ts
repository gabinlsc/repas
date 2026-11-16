/**
 * Catalogue d'ingrédients de départ.
 * Nutrition : approximations pour 100 g dans l'ordre de grandeur de la table Ciqual
 * (nutrition_source = "seed-approx"), remplacées par `data/ciqual/import.ts` (D-017).
 * Prix : indicatifs 2026, supermarché français (source "seed").
 * Format compact : n = [kcal, protéines, glucides, lipides, fibres] pour 100 g ;
 * p = conditionnements [quantité en unité de base, prix en centimes, libellé ?].
 */
import type { Aisle, Allergen, BaseUnit, IngredientTrait } from "@mise/domain";

export interface SeedIngredient {
  id: string;
  name: string;
  aisle: Aisle;
  base: BaseUnit;
  n?: [number, number, number, number, number];
  density?: string;
  piece?: string;
  syn?: string[];
  all?: Allergen[];
  tr?: IngredientTrait[];
  season?: number[];
  prot?: string;
  veg?: string;
  per?: number;
  conv?: Record<string, string>;
  p?: Array<[string, number, string?]>;
  canonical?: string;
  /** produits rangés dans un autre rayon (ex. version surgelée). */
  alt?: Array<[string, number, Aisle, string]>;
}

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const m = (...r: Array<[number, number]>): number[] => r.flatMap(([a, b]) => (a <= b ? range(a, b) : [...range(a, 12), ...range(1, b)]));
function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

export const SEED_INGREDIENTS: SeedIngredient[] = [
  // ---------------------------------------------------------------- fruits & légumes
  { id: "oignon", name: "Oignon", aisle: "fruits_legumes", base: "g", piece: "150", n: [40, 1.2, 7, 0.2, 1.7], syn: ["oignon jaune", "oignon blanc", "oignon rouge", "oignon nouveau"], season: ALL, veg: "allium", per: 60, p: [["1000", 189, "Filet 1 kg"], ["500", 129, "Filet 500 g"]] },
  { id: "echalote", name: "Échalote", aisle: "fruits_legumes", base: "g", piece: "30", n: [72, 2.5, 14, 0.1, 3], syn: ["echalotes"], season: ALL, veg: "allium", per: 60, p: [["250", 169, "Filet 250 g"], ["500", 279]] },
  { id: "ail", name: "Ail", aisle: "fruits_legumes", base: "g", piece: "40", n: [130, 6, 26, 0.5, 2], syn: ["gousse d'ail", "tete d'ail"], conv: { gousse: "5" }, season: ALL, veg: "allium", per: 90, p: [["100", 149, "Ail 3 têtes"], ["40", 69, "1 tête"]] },
  { id: "carotte", name: "Carotte", aisle: "fruits_legumes", base: "g", piece: "100", n: [36, 0.8, 7, 0.3, 2.7], season: ALL, veg: "racine", per: 21, p: [["1000", 149, "Sachet 1 kg"], ["2000", 249, "Sachet 2 kg"]] },
  { id: "pomme_de_terre", name: "Pomme de terre", aisle: "fruits_legumes", base: "g", piece: "150", n: [80, 2, 17, 0.1, 1.8], syn: ["patate", "pommes de terre a chair ferme", "grenaille"], season: ALL, veg: "tubercule", per: 60, p: [["2500", 349, "Sac 2,5 kg"], ["1000", 179, "Sac 1 kg"]] },
  { id: "patate_douce", name: "Patate douce", aisle: "fruits_legumes", base: "g", piece: "300", n: [86, 1.6, 20, 0.1, 3], season: m([10, 3]), veg: "tubercule", per: 30, p: [["1000", 299, "Patates douces 1 kg"]] },
  { id: "courgette", name: "Courgette", aisle: "fruits_legumes", base: "g", piece: "250", n: [17, 1.2, 2, 0.3, 1.1], season: m([6, 9]), veg: "courge", per: 7, p: [["1000", 249, "Courgettes 1 kg"], ["500", 149]] },
  { id: "aubergine", name: "Aubergine", aisle: "fruits_legumes", base: "g", piece: "300", n: [21, 1, 3, 0.2, 2.5], season: m([6, 9]), veg: "solanacee", per: 7, p: [["300", 119, "1 aubergine"]] },
  { id: "poivron", name: "Poivron", aisle: "fruits_legumes", base: "g", piece: "180", n: [27, 0.9, 5, 0.3, 1.8], syn: ["poivron rouge", "poivron vert", "poivron jaune"], season: m([7, 9]), veg: "solanacee", per: 10, p: [["540", 299, "Lot de 3 poivrons"], ["180", 119, "1 poivron"]] },
  { id: "tomate", name: "Tomate", aisle: "fruits_legumes", base: "g", piece: "120", n: [19, 0.8, 3, 0.3, 1.2], syn: ["tomates grappe"], season: m([6, 9]), veg: "tomate", per: 6, p: [["1000", 299, "Tomates 1 kg"], ["500", 179]] },
  { id: "tomate_cerise", name: "Tomate cerise", aisle: "fruits_legumes", base: "g", piece: "12", n: [22, 0.9, 3.5, 0.3, 1.3], season: m([6, 9]), veg: "tomate", per: 6, p: [["250", 199, "Barquette 250 g"]] },
  { id: "concombre", name: "Concombre", aisle: "fruits_legumes", base: "g", piece: "300", n: [12, 0.6, 2, 0.1, 0.6], season: m([5, 9]), veg: "courge", per: 7, p: [["300", 99, "1 concombre"]] },
  { id: "salade", name: "Salade verte", aisle: "fruits_legumes", base: "g", piece: "300", n: [15, 1.2, 1.5, 0.2, 1.3], syn: ["laitue", "batavia", "salade", "mesclun", "roquette", "mache"], conv: { feuille: "15" }, season: m([4, 10]), veg: "feuille", per: 4, p: [["300", 119, "1 laitue"], ["150", 189, "Sachet mesclun 150 g"]] },
  { id: "epinard", name: "Épinard", aisle: "fruits_legumes", base: "g", n: [23, 2.9, 1, 0.4, 2.2], syn: ["epinards", "pousses d'epinard", "jeunes pousses d'epinards"], season: m([3, 5], [9, 11]), veg: "feuille", per: 4, p: [["500", 299, "Épinards frais 500 g"]], alt: [["1000", 249, "surgeles", "Épinards hachés surgelés 1 kg"]] },
  { id: "champignon", name: "Champignon de Paris", aisle: "fruits_legumes", base: "g", piece: "20", n: [22, 3, 0.5, 0.3, 1.5], syn: ["champignons", "champignons de paris", "champignon"], season: ALL, veg: "champignon", per: 5, p: [["250", 179, "Barquette 250 g"], ["500", 299, "Barquette 500 g"]] },
  { id: "poireau", name: "Poireau", aisle: "fruits_legumes", base: "g", piece: "200", n: [30, 1.5, 4, 0.3, 2.5], syn: ["blanc de poireau"], season: m([9, 4]), veg: "allium", per: 10, p: [["1000", 279, "Botte de poireaux 1 kg"]] },
  { id: "brocoli", name: "Brocoli", aisle: "fruits_legumes", base: "g", piece: "400", n: [34, 3, 3, 0.4, 2.6], season: m([6, 11]), veg: "crucifere", per: 6, p: [["400", 199, "1 brocoli"]], alt: [["1000", 279, "surgeles", "Fleurettes de brocoli surgelées 1 kg"]] },
  { id: "chou_fleur", name: "Chou-fleur", aisle: "fruits_legumes", base: "g", piece: "800", n: [25, 2, 3, 0.3, 2], syn: ["chou fleur"], season: m([9, 4]), veg: "crucifere", per: 7, p: [["800", 249, "1 chou-fleur"]] },
  { id: "chou", name: "Chou", aisle: "fruits_legumes", base: "g", piece: "1000", n: [25, 1.3, 4, 0.1, 2.5], syn: ["chou vert", "chou blanc", "chou rouge", "chou frise"], season: m([10, 3]), veg: "crucifere", per: 14, p: [["1000", 199, "1 chou"]] },
  { id: "haricot_vert", name: "Haricot vert", aisle: "fruits_legumes", base: "g", n: [30, 1.8, 4, 0.2, 3.4], syn: ["haricots verts"], season: m([6, 9]), veg: "legume_vert", per: 5, p: [["500", 349, "Haricots verts 500 g"]], alt: [["1000", 299, "surgeles", "Haricots verts extra-fins surgelés 1 kg"]] },
  { id: "petits_pois", name: "Petits pois", aisle: "surgeles", base: "g", n: [70, 5, 9, 0.4, 5], syn: ["petit pois"], season: m([5, 7]), veg: "legume_vert", p: [["1000", 279, "Petits pois surgelés 1 kg"]] },
  { id: "courge", name: "Courge", aisle: "fruits_legumes", base: "g", piece: "1000", n: [26, 1, 5, 0.1, 1.5], syn: ["potiron", "butternut", "potimarron", "courge butternut", "citrouille"], season: m([9, 1]), veg: "courge", per: 30, p: [["1000", 249, "1 courge"]] },
  { id: "celeri", name: "Céleri branche", aisle: "fruits_legumes", base: "g", piece: "40", n: [16, 0.7, 1.5, 0.2, 1.6], syn: ["celeri", "branche de celeri", "celeri branche"], all: ["celeri"], conv: { branche: "40" }, season: m([9, 3]), veg: "tige", per: 10, p: [["500", 199, "Pied de céleri"]] },
  { id: "celeri_rave", name: "Céleri-rave", aisle: "fruits_legumes", base: "g", piece: "800", n: [24, 1.2, 2.5, 0.3, 4], syn: ["celeri rave"], all: ["celeri"], season: m([9, 3]), veg: "racine", per: 30, p: [["800", 249, "1 céleri-rave"]] },
  { id: "fenouil", name: "Fenouil", aisle: "fruits_legumes", base: "g", piece: "250", n: [20, 1.2, 3, 0.2, 2.2], season: m([6, 10]), veg: "tige", per: 10, p: [["250", 129, "1 bulbe"]] },
  { id: "navet", name: "Navet", aisle: "fruits_legumes", base: "g", piece: "150", n: [22, 0.9, 3.5, 0.1, 2], season: m([10, 3]), veg: "racine", per: 14, p: [["1000", 249, "Navets 1 kg"]] },
  { id: "radis", name: "Radis", aisle: "fruits_legumes", base: "g", piece: "15", n: [15, 0.8, 2, 0.1, 1.6], syn: ["botte de radis"], conv: { botte: "250" }, season: m([4, 7]), veg: "racine", per: 5, p: [["250", 129, "Botte de radis"]] },
  { id: "betterave", name: "Betterave cuite", aisle: "fruits_legumes", base: "g", piece: "100", n: [43, 1.6, 8, 0.1, 2.8], syn: ["betterave", "betteraves", "betterave rouge"], season: m([9, 3]), veg: "racine", per: 10, p: [["500", 159, "Betteraves cuites 500 g"]] },
  { id: "endive", name: "Endive", aisle: "fruits_legumes", base: "g", piece: "120", n: [15, 1, 2, 0.1, 1.5], syn: ["chicon"], season: m([10, 4]), veg: "feuille", per: 10, p: [["1000", 299, "Endives 1 kg"]] },
  { id: "asperge", name: "Asperge", aisle: "fruits_legumes", base: "g", piece: "25", n: [24, 2.4, 2, 0.2, 2], syn: ["asperges vertes", "asperges blanches"], season: m([4, 6]), veg: "tige", per: 4, p: [["500", 599, "Botte d'asperges 500 g"]] },
  { id: "avocat", name: "Avocat", aisle: "fruits_legumes", base: "g", piece: "200", n: [160, 2, 2, 15, 6.7], season: m([11, 4]), veg: "fruit_legume", per: 6, p: [["400", 249, "Lot de 2 avocats"], ["200", 139]] },
  { id: "citron", name: "Citron", aisle: "fruits_legumes", base: "g", piece: "120", n: [30, 0.7, 3, 0.3, 2.8], syn: ["citron jaune", "jus de citron", "zeste de citron"], season: ALL, per: 21, p: [["500", 229, "Filet de citrons 500 g"], ["120", 59, "1 citron"]] },
  { id: "citron_vert", name: "Citron vert", aisle: "fruits_legumes", base: "g", piece: "70", n: [30, 0.7, 3, 0.2, 2.8], syn: ["lime", "jus de citron vert"], season: ALL, per: 21, p: [["70", 49, "1 citron vert"], ["350", 199, "Filet 5 citrons verts"]] },
  { id: "orange", name: "Orange", aisle: "fruits_legumes", base: "g", piece: "200", n: [45, 0.9, 9, 0.2, 2], syn: ["jus d'orange", "zeste d'orange"], season: m([12, 4]), per: 21, p: [["2000", 399, "Filet d'oranges 2 kg"]] },
  { id: "pomme", name: "Pomme", aisle: "fruits_legumes", base: "g", piece: "150", n: [52, 0.3, 12, 0.2, 2], syn: ["pommes", "pomme golden", "pomme granny"], season: m([9, 4]), per: 30, p: [["1500", 299, "Sachet 1,5 kg"]] },
  { id: "poire", name: "Poire", aisle: "fruits_legumes", base: "g", piece: "160", n: [52, 0.4, 11, 0.2, 3], season: m([9, 2]), per: 10, p: [["1000", 299, "Poires 1 kg"]] },
  { id: "banane", name: "Banane", aisle: "fruits_legumes", base: "g", piece: "120", n: [90, 1.1, 20, 0.3, 2], season: ALL, per: 6, p: [["1000", 199, "Bananes 1 kg"]] },
  { id: "fraise", name: "Fraise", aisle: "fruits_legumes", base: "g", n: [32, 0.7, 6, 0.3, 2], syn: ["fraises"], season: m([5, 7]), per: 3, p: [["500", 399, "Barquette 500 g"]] },
  { id: "fruits_rouges", name: "Fruits rouges", aisle: "surgeles", base: "g", n: [40, 1, 7, 0.4, 4], syn: ["framboises", "myrtilles", "melange de fruits rouges"], season: m([6, 9]), p: [["500", 349, "Fruits rouges surgelés 500 g"]] },
  { id: "abricot", name: "Abricot", aisle: "fruits_legumes", base: "g", piece: "50", n: [44, 0.8, 9, 0.2, 2], season: m([6, 8]), per: 5, p: [["1000", 449, "Abricots 1 kg"]] },
  { id: "peche", name: "Pêche", aisle: "fruits_legumes", base: "g", piece: "150", n: [40, 0.8, 9, 0.2, 1.5], syn: ["nectarine", "brugnon"], season: m([6, 9]), per: 5, p: [["1000", 399, "Pêches 1 kg"]] },
  { id: "kiwi", name: "Kiwi", aisle: "fruits_legumes", base: "g", piece: "80", n: [58, 1, 11, 0.5, 3], season: m([11, 4]), per: 14, p: [["480", 249, "Barquette 6 kiwis"]] },
  { id: "melon", name: "Melon", aisle: "fruits_legumes", base: "g", piece: "1000", n: [34, 0.8, 7, 0.2, 0.9], season: m([6, 9]), per: 6, p: [["1000", 299, "1 melon"]] },
  { id: "rhubarbe", name: "Rhubarbe", aisle: "fruits_legumes", base: "g", n: [21, 0.9, 1.5, 0.2, 1.8], season: m([4, 6]), per: 7, p: [["500", 349, "Rhubarbe 500 g"]] },
  { id: "persil", name: "Persil", aisle: "fruits_legumes", base: "g", n: [36, 3, 1.5, 0.8, 3.3], syn: ["persil plat", "persil frisé", "persil hache"], conv: { botte: "50", brin: "2", branche: "2" }, season: ALL, per: 7, p: [["50", 99, "Botte de persil"]] },
  { id: "coriandre", name: "Coriandre", aisle: "fruits_legumes", base: "g", n: [23, 2, 1, 0.5, 2.8], syn: ["coriandre fraiche"], conv: { botte: "30", brin: "1", branche: "1" }, season: ALL, per: 5, p: [["30", 99, "Botte de coriandre"]] },
  { id: "basilic", name: "Basilic", aisle: "fruits_legumes", base: "g", n: [23, 3, 1, 0.6, 1.6], syn: ["basilic frais", "feuilles de basilic"], conv: { botte: "30", feuille: "0.5", brin: "3", branche: "3" }, season: m([5, 9]), per: 5, p: [["30", 129, "Pot de basilic"]] },
  { id: "ciboulette", name: "Ciboulette", aisle: "fruits_legumes", base: "g", n: [30, 3, 2, 0.7, 2.5], conv: { botte: "25", brin: "1" }, season: ALL, per: 5, p: [["25", 109, "Botte de ciboulette"]] },
  { id: "menthe", name: "Menthe", aisle: "fruits_legumes", base: "g", n: [44, 3.8, 5, 0.7, 8], syn: ["menthe fraiche", "feuilles de menthe"], conv: { botte: "30", feuille: "0.3", brin: "2", branche: "2" }, season: m([5, 10]), per: 5, p: [["30", 109, "Botte de menthe"]] },
  { id: "thym", name: "Thym", aisle: "condiments_epices", base: "g", n: [276, 9, 24, 7, 37], syn: ["thym seche", "thym frais"], conv: { branche: "1", brin: "1" }, season: ALL, p: [["15", 159, "Thym 15 g"]] },
  { id: "romarin", name: "Romarin", aisle: "condiments_epices", base: "g", n: [331, 5, 21, 15, 43], conv: { branche: "2", brin: "2" }, season: ALL, p: [["15", 159, "Romarin 15 g"]] },
  { id: "laurier", name: "Laurier", aisle: "condiments_epices", base: "g", n: [313, 8, 48, 8, 26], syn: ["feuille de laurier", "laurier sauce"], conv: { feuille: "0.2" }, season: ALL, p: [["5", 149, "Laurier 5 g"]] },
  { id: "gingembre", name: "Gingembre frais", aisle: "fruits_legumes", base: "g", piece: "50", n: [80, 1.8, 15, 0.8, 2], syn: ["gingembre"], season: ALL, per: 21, p: [["100", 149, "Racine 100 g"]] },
  { id: "piment", name: "Piment", aisle: "fruits_legumes", base: "g", piece: "10", n: [40, 2, 7, 0.4, 1.5], syn: ["piment rouge", "piment oiseau", "piment vert"], season: m([7, 10]), per: 10, p: [["50", 129, "Barquette de piments"]] },

  // ---------------------------------------------------------------- boulangerie
  { id: "pain", name: "Baguette", aisle: "boulangerie", base: "g", piece: "250", n: [270, 9, 55, 1.2, 3], syn: ["pain", "baguette", "pain de campagne", "pain rassis", "pain complet", "pain aux cereales"], all: ["gluten"], conv: { tranche: "30" }, per: 2, p: [["250", 110, "Baguette"], ["500", 249, "Pain de campagne 500 g"]] },
  { id: "pain_mie", name: "Pain de mie", aisle: "boulangerie", base: "g", n: [270, 8, 50, 4, 3], syn: ["pain de mie complet"], all: ["gluten"], conv: { tranche: "25" }, per: 7, p: [["500", 179, "Pain de mie 500 g"]] },
  { id: "pain_burger", name: "Pain à burger", aisle: "boulangerie", base: "piece", piece: "60", n: [270, 9, 48, 4, 2.5], syn: ["pain burger", "pains a hamburger", "bun"], all: ["gluten", "sesame"], per: 7, p: [["4", 189, "4 pains à burger"], ["6", 249, "6 pains à burger"]] },

  // ---------------------------------------------------------------- boucherie
  { id: "boeuf_hache", name: "Bœuf haché", aisle: "boucherie", base: "g", n: [215, 18, 0, 15, 0], syn: ["viande hachee", "boeuf hache", "steak hache", "steaks haches"], tr: ["meat"], conv: { piece: "100" }, prot: "boeuf", per: 2, p: [["400", 549, "Steaks hachés 4 × 100 g"], ["500", 649, "Bœuf haché 500 g"]] },
  { id: "boeuf_braiser", name: "Bœuf à braiser", aisle: "boucherie", base: "g", n: [180, 28, 0, 7, 0], syn: ["boeuf bourguignon", "paleron", "joue de boeuf", "macreuse", "boeuf a mijoter", "plat de cotes"], tr: ["meat"], prot: "boeuf", per: 3, p: [["1000", 1490, "Bœuf à braiser 1 kg"], ["500", 799]] },
  { id: "boeuf_steak", name: "Steak de bœuf", aisle: "boucherie", base: "g", n: [150, 26, 0, 5, 0], syn: ["steak", "bavette", "rumsteck", "entrecote", "boeuf en lanieres"], tr: ["meat"], conv: { piece: "150" }, prot: "boeuf", per: 2, p: [["300", 699, "2 steaks de bœuf"]] },
  { id: "poulet", name: "Blanc de poulet", aisle: "boucherie", base: "g", n: [120, 23, 0, 2, 0], syn: ["filet de poulet", "escalope de poulet", "escalopes de poulet", "blancs de poulet", "poulet"], tr: ["meat"], conv: { piece: "140" }, prot: "volaille", per: 3, p: [["600", 899, "Filets de poulet 600 g"], ["300", 489]] },
  { id: "cuisse_poulet", name: "Cuisse de poulet", aisle: "boucherie", base: "piece", piece: "250", n: [190, 18, 0, 13, 0], syn: ["cuisses de poulet", "haut de cuisse de poulet", "pilons de poulet"], tr: ["meat"], prot: "volaille", per: 3, p: [["4", 699, "4 cuisses de poulet"], ["2", 389]] },
  { id: "poulet_entier", name: "Poulet entier", aisle: "boucherie", base: "g", piece: "1400", n: [190, 19, 0, 12, 0], syn: ["poulet fermier"], tr: ["meat"], prot: "volaille", per: 3, p: [["1400", 899, "Poulet entier 1,4 kg"]] },
  { id: "dinde", name: "Escalope de dinde", aisle: "boucherie", base: "g", n: [110, 24, 0, 1.5, 0], syn: ["escalopes de dinde", "dinde", "filet de dinde"], tr: ["meat"], conv: { piece: "120" }, prot: "volaille", per: 3, p: [["500", 699, "Escalopes de dinde 500 g"]] },
  { id: "porc_filet", name: "Filet de porc", aisle: "boucherie", base: "g", n: [140, 22, 0, 5, 0], syn: ["filet mignon de porc", "filet mignon", "echine de porc", "porc", "cotes de porc", "rouelle de porc"], tr: ["meat", "pork"], conv: { piece: "150" }, prot: "porc", per: 3, p: [["600", 749, "Filet mignon 600 g"]] },
  { id: "agneau", name: "Épaule d'agneau", aisle: "boucherie", base: "g", n: [230, 18, 0, 17, 0], syn: ["agneau", "souris d'agneau", "gigot d'agneau", "collier d'agneau"], tr: ["meat"], prot: "agneau", per: 3, p: [["1000", 1690, "Agneau à braiser 1 kg"]] },
  { id: "veau", name: "Veau à blanquette", aisle: "boucherie", base: "g", n: [160, 20, 0, 9, 0], syn: ["veau", "tendron de veau", "epaule de veau"], tr: ["meat"], prot: "veau", per: 3, p: [["800", 1590, "Veau à blanquette 800 g"]] },

  // ---------------------------------------------------------------- charcuterie / traiteur
  { id: "lardons", name: "Lardons", aisle: "charcuterie_traiteur", base: "g", n: [270, 15, 0.5, 23, 0], syn: ["lardons fumes", "allumettes de bacon", "poitrine fumee", "bacon"], tr: ["meat", "pork"], prot: "porc", per: 14, p: [["200", 249, "Lardons fumés 2 × 100 g"], ["400", 449]] },
  { id: "jambon", name: "Jambon blanc", aisle: "charcuterie_traiteur", base: "g", n: [115, 20, 1, 3.5, 0], syn: ["jambon", "jambon de paris", "des de jambon", "tranches de jambon"], tr: ["meat", "pork"], conv: { tranche: "45" }, prot: "porc", per: 7, p: [["180", 279, "Jambon 4 tranches"], ["360", 499, "Jambon 8 tranches"]] },
  { id: "jambon_cru", name: "Jambon cru", aisle: "charcuterie_traiteur", base: "g", n: [240, 27, 0.5, 14, 0], syn: ["jambon de bayonne", "jambon de pays", "speck"], tr: ["meat", "pork"], conv: { tranche: "16" }, prot: "porc", per: 14, p: [["100", 299, "Jambon cru 6 tranches"]] },
  { id: "chorizo", name: "Chorizo", aisle: "charcuterie_traiteur", base: "g", n: [450, 24, 2, 38, 0], tr: ["meat", "pork"], prot: "porc", per: 30, p: [["200", 289, "Chorizo 200 g"]] },
  { id: "saucisse", name: "Saucisse de Toulouse", aisle: "charcuterie_traiteur", base: "g", piece: "110", n: [270, 15, 1, 23, 0], syn: ["saucisses", "saucisse", "saucisses de toulouse", "chipolatas", "saucisse de morteau", "saucisses fumees"], tr: ["meat", "pork"], prot: "porc", per: 4, p: [["440", 549, "4 saucisses de Toulouse"]] },

  // ---------------------------------------------------------------- poissonnerie
  { id: "saumon", name: "Pavé de saumon", aisle: "poissonnerie", base: "g", n: [200, 20, 0, 13, 0], syn: ["saumon", "paves de saumon", "filet de saumon"], all: ["poissons"], tr: ["fish"], conv: { pave: "125", piece: "125", filet_poisson: "125" }, prot: "poisson", per: 2, p: [["250", 699, "2 pavés de saumon"], ["500", 1290, "4 pavés de saumon"]] },
  { id: "saumon_fume", name: "Saumon fumé", aisle: "charcuterie_traiteur", base: "g", n: [180, 22, 0, 10, 0], all: ["poissons"], tr: ["fish"], conv: { tranche: "25" }, prot: "poisson", per: 14, p: [["150", 549, "Saumon fumé 6 tranches"]] },
  { id: "cabillaud", name: "Dos de cabillaud", aisle: "poissonnerie", base: "g", n: [80, 18, 0, 0.7, 0], syn: ["cabillaud", "colin", "lieu", "merlu", "filet de cabillaud", "poisson blanc", "filets de poisson blanc"], all: ["poissons"], tr: ["fish"], conv: { pave: "130", piece: "130", filet_poisson: "130" }, prot: "poisson", per: 2, p: [["520", 1190, "4 dos de cabillaud"]], alt: [["400", 599, "surgeles", "Filets de colin surgelés 400 g"]] },
  { id: "crevette", name: "Crevettes", aisle: "poissonnerie", base: "g", n: [95, 20, 0, 1.5, 0], syn: ["crevettes decortiquees", "gambas", "crevettes roses"], all: ["crustaces"], tr: ["seafood"], prot: "fruits_de_mer", per: 2, p: [["300", 699, "Crevettes cuites décortiquées 300 g"]] },
  { id: "moules", name: "Moules", aisle: "poissonnerie", base: "g", n: [70, 11, 3, 2, 0], syn: ["moules de bouchot"], all: ["mollusques"], tr: ["seafood"], prot: "fruits_de_mer", per: 2, p: [["1000", 449, "Moules de bouchot 1 kg"], ["2000", 849, "Moules 2 kg"]] },

  // ---------------------------------------------------------------- crèmerie
  { id: "lait", name: "Lait demi-écrémé", aisle: "cremerie", base: "ml", density: "1.03", n: [46, 3.3, 4.8, 1.6, 0], syn: ["lait", "lait entier", "lait demi ecreme"], all: ["lait"], tr: ["dairy", "lactose"], per: 7, p: [["1000", 105, "Lait 1 L"], ["6000", 599, "Lait 6 × 1 L"]] },
  { id: "beurre", name: "Beurre", aisle: "cremerie", base: "g", n: [745, 0.7, 0.6, 82, 0], syn: ["beurre doux", "beurre demi-sel", "beurre fondu", "beurre mou"], all: ["lait"], tr: ["dairy", "lactose"], conv: { noix: "10" }, density: "0.91", per: 60, p: [["250", 289, "Beurre doux 250 g"], ["500", 529]] },
  { id: "creme_fraiche", name: "Crème fraîche épaisse", aisle: "cremerie", base: "g", n: [290, 2.4, 3, 30, 0], syn: ["creme fraiche", "creme epaisse", "creme fraiche epaisse"], all: ["lait"], tr: ["dairy", "lactose"], density: "1.0", per: 14, p: [["200", 169, "Crème épaisse 20 cl"], ["400", 279]] },
  { id: "creme_liquide", name: "Crème liquide", aisle: "cremerie", base: "ml", density: "1.0", n: [300, 2.3, 3, 30, 0], syn: ["creme liquide entiere", "creme fleurette", "creme semi-epaisse", "creme"], all: ["lait"], tr: ["dairy", "lactose"], per: 14, p: [["200", 159, "Crème liquide 20 cl"], ["500", 309, "Crème liquide 50 cl"]] },
  { id: "oeuf", name: "Œuf", aisle: "cremerie", base: "piece", piece: "55", n: [140, 12.5, 0.7, 10, 0], syn: ["oeuf", "oeufs", "jaune d'oeuf", "jaunes d'oeufs", "blanc d'oeuf", "blancs d'oeufs", "oeufs frais"], all: ["oeufs"], tr: ["egg"], prot: "oeuf", per: 28, p: [["6", 189, "6 œufs plein air"], ["12", 329, "12 œufs plein air"]] },
  { id: "yaourt", name: "Yaourt nature", aisle: "cremerie", base: "piece", piece: "125", n: [60, 4, 5, 3, 0], syn: ["yaourt", "yaourts", "yaourt grec", "skyr"], all: ["lait"], tr: ["dairy", "lactose"], per: 21, p: [["4", 129, "4 yaourts nature"], ["8", 219, "8 yaourts nature"]] },
  { id: "fromage_blanc", name: "Fromage blanc", aisle: "cremerie", base: "g", density: "1.05", n: [75, 7, 4, 3, 0], syn: ["faisselle"], all: ["lait"], tr: ["dairy", "lactose"], per: 14, p: [["500", 199, "Fromage blanc 500 g"], ["1000", 349]] },
  { id: "mozzarella", name: "Mozzarella", aisle: "cremerie", base: "g", piece: "125", n: [250, 18, 1, 19, 0], syn: ["boule de mozzarella", "mozzarella di bufala"], all: ["lait"], tr: ["dairy", "lactose"], per: 14, p: [["125", 119, "Mozzarella 125 g"], ["250", 219]] },
  { id: "ricotta", name: "Ricotta", aisle: "cremerie", base: "g", n: [150, 8, 3, 11, 0], all: ["lait"], tr: ["dairy", "lactose"], per: 10, p: [["250", 249, "Ricotta 250 g"]] },
  { id: "pate_feuilletee", name: "Pâte feuilletée", aisle: "cremerie", base: "piece", piece: "230", n: [400, 5.5, 37, 25, 2], syn: ["rouleau de pate feuilletee"], all: ["gluten"], conv: { rouleau: "1" }, per: 21, p: [["1", 129, "Pâte feuilletée 230 g"], ["2", 229, "2 pâtes feuilletées"]] },
  { id: "pate_brisee", name: "Pâte brisée", aisle: "cremerie", base: "piece", piece: "230", n: [420, 6, 40, 26, 2], syn: ["rouleau de pate brisee", "pate a tarte", "pate sablee"], all: ["gluten"], conv: { rouleau: "1" }, per: 21, p: [["1", 119, "Pâte brisée 230 g"]] },
  { id: "pate_pizza", name: "Pâte à pizza", aisle: "cremerie", base: "piece", piece: "260", n: [270, 7, 45, 6, 2.5], syn: ["rouleau de pate a pizza"], all: ["gluten"], conv: { rouleau: "1" }, per: 21, p: [["1", 149, "Pâte à pizza 260 g"]] },

  // ---------------------------------------------------------------- fromagerie
  { id: "emmental", name: "Emmental râpé", aisle: "fromagerie", base: "g", n: [380, 28, 0, 29, 0], syn: ["emmental", "gruyere rape", "fromage rape", "gruyere", "fromage rape emmental"], all: ["lait"], tr: ["dairy"], per: 30, p: [["200", 219, "Emmental râpé 200 g"], ["500", 449]] },
  { id: "parmesan", name: "Parmesan", aisle: "fromagerie", base: "g", n: [400, 33, 0, 29, 0], syn: ["parmigiano", "parmesan rape", "grana padano", "pecorino"], all: ["lait"], tr: ["dairy"], per: 60, p: [["100", 299, "Parmesan râpé 100 g"], ["200", 549]] },
  { id: "comte", name: "Comté", aisle: "fromagerie", base: "g", n: [410, 28, 0, 33, 0], syn: ["comte rape", "beaufort"], all: ["lait"], tr: ["dairy"], per: 30, p: [["200", 399, "Comté 200 g"]] },
  { id: "chevre", name: "Bûche de chèvre", aisle: "fromagerie", base: "g", n: [300, 18, 1, 25, 0], syn: ["chevre", "fromage de chevre", "buche de chevre", "chevre frais"], all: ["lait"], tr: ["dairy", "lactose"], per: 21, p: [["180", 229, "Bûche de chèvre 180 g"]] },
  { id: "feta", name: "Feta", aisle: "fromagerie", base: "g", n: [265, 14, 1, 22, 0], all: ["lait"], tr: ["dairy", "lactose"], per: 21, p: [["200", 229, "Feta 200 g"]] },
  { id: "roquefort", name: "Roquefort", aisle: "fromagerie", base: "g", n: [360, 20, 0, 31, 0], syn: ["bleu", "fourme d'ambert", "gorgonzola"], all: ["lait"], tr: ["dairy"], per: 21, p: [["100", 279, "Roquefort 100 g"]] },
  { id: "reblochon", name: "Reblochon", aisle: "fromagerie", base: "g", piece: "450", n: [330, 20, 0, 27, 0], all: ["lait"], tr: ["dairy", "lactose"], per: 21, p: [["450", 549, "Reblochon 450 g"]] },
  { id: "fromage_raclette", name: "Fromage à raclette", aisle: "fromagerie", base: "g", n: [350, 23, 0, 28, 0], syn: ["raclette"], all: ["lait"], tr: ["dairy"], conv: { tranche: "30" }, per: 21, p: [["400", 599, "Raclette 400 g"], ["800", 1099]] },

  // ---------------------------------------------------------------- épicerie salée
  { id: "huile_olive", name: "Huile d'olive", aisle: "epicerie_salee", base: "ml", density: "0.92", n: [900, 0, 0, 100, 0], syn: ["huile d'olive vierge extra", "huile"], p: [["500", 549, "Huile d'olive 50 cl"], ["1000", 999, "Huile d'olive 1 L"]] },
  { id: "huile_tournesol", name: "Huile de tournesol", aisle: "epicerie_salee", base: "ml", density: "0.92", n: [900, 0, 0, 100, 0], syn: ["huile neutre", "huile de colza", "huile vegetale", "huile de friture"], p: [["1000", 279, "Huile de tournesol 1 L"]] },
  { id: "huile_sesame", name: "Huile de sésame", aisle: "monde", base: "ml", density: "0.92", n: [900, 0, 0, 100, 0], all: ["sesame"], p: [["250", 399, "Huile de sésame 25 cl"]] },
  { id: "vinaigre", name: "Vinaigre", aisle: "epicerie_salee", base: "ml", density: "1.01", n: [20, 0, 0.5, 0, 0], syn: ["vinaigre de vin", "vinaigre balsamique", "vinaigre de cidre", "vinaigre de xeres", "vinaigre de riz"], all: ["sulfites"], p: [["500", 159, "Vinaigre de vin 50 cl"]] },
  { id: "moutarde", name: "Moutarde de Dijon", aisle: "epicerie_salee", base: "g", density: "1.05", n: [150, 7, 4, 11, 4], syn: ["moutarde", "moutarde a l'ancienne", "moutarde forte"], all: ["moutarde"], p: [["210", 129, "Moutarde 210 g"]] },
  { id: "mayonnaise", name: "Mayonnaise", aisle: "epicerie_salee", base: "g", density: "0.95", n: [700, 1.5, 2, 77, 0], all: ["oeufs", "moutarde"], tr: ["egg"], p: [["235", 179, "Mayonnaise 235 g"]] },
  { id: "ketchup", name: "Ketchup", aisle: "epicerie_salee", base: "g", density: "1.1", n: [110, 1.2, 25, 0.1, 0.5], p: [["500", 229, "Ketchup 500 g"]] },
  { id: "sauce_soja", name: "Sauce soja", aisle: "monde", base: "ml", density: "1.15", n: [60, 8, 6, 0, 0.5], syn: ["sauce soja salee", "sauce soja sucree", "tamari"], all: ["soja", "gluten"], p: [["250", 249, "Sauce soja 25 cl"]] },
  { id: "bouillon", name: "Bouillon cube", aisle: "epicerie_salee", base: "piece", piece: "10", n: [240, 10, 20, 15, 1], syn: ["cube de bouillon", "bouillon de volaille", "bouillon de legumes", "bouillon de boeuf", "fond de veau", "bouillon"], all: ["celeri"], conv: { cube: "1" }, p: [["8", 159, "8 cubes de bouillon"]] },
  { id: "concentre_tomate", name: "Concentré de tomate", aisle: "conserves", base: "g", density: "1.1", n: [80, 4, 13, 0.5, 4], syn: ["double concentre de tomate", "concentre de tomates"], p: [["140", 99, "Concentré 140 g"]] },
  { id: "olive", name: "Olives", aisle: "epicerie_salee", base: "g", n: [150, 1, 1, 15, 3], syn: ["olives noires", "olives vertes", "olive noire"], p: [["150", 199, "Olives dénoyautées 150 g"]] },
  { id: "cornichon", name: "Cornichons", aisle: "epicerie_salee", base: "g", piece: "8", n: [20, 1, 2, 0.2, 1], syn: ["cornichon", "capres"], all: ["sulfites", "moutarde"], p: [["200", 179, "Cornichons 200 g"]] },
  { id: "chapelure", name: "Chapelure", aisle: "epicerie_salee", base: "g", n: [370, 12, 72, 3, 4], syn: ["panure"], all: ["gluten"], p: [["250", 129, "Chapelure 250 g"]] },
  { id: "pesto", name: "Pesto", aisle: "epicerie_salee", base: "g", density: "1.0", n: [450, 5, 5, 45, 2], syn: ["pesto vert", "pesto alla genovese"], all: ["lait", "fruits_a_coque"], tr: ["dairy"], p: [["190", 249, "Pesto 190 g"]] },

  // ---------------------------------------------------------------- féculents
  { id: "pates", name: "Pâtes sèches", aisle: "feculents", base: "g", n: [355, 12, 71, 1.5, 3], syn: ["pates", "spaghetti", "spaghettis", "penne", "tagliatelles", "fusilli", "coquillettes", "macaroni", "linguine", "farfalle", "pates seches", "rigatoni", "torsades", "orzo"], all: ["gluten"], p: [["500", 99, "Pâtes 500 g"], ["1000", 175, "Pâtes 1 kg"]] },
  { id: "lasagne", name: "Feuilles de lasagne", aisle: "feculents", base: "g", n: [355, 12, 71, 1.5, 3], syn: ["lasagnes", "plaques de lasagnes", "feuilles de lasagnes"], all: ["gluten"], conv: { feuille: "20" }, p: [["500", 179, "Lasagnes 500 g"]] },
  { id: "riz", name: "Riz", aisle: "feculents", base: "g", density: "0.85", n: [350, 7, 78, 0.6, 1.4], syn: ["riz basmati", "riz thai", "riz long", "riz blanc", "riz complet", "riz jasmin"], p: [["1000", 219, "Riz basmati 1 kg"], ["500", 139]] },
  { id: "riz_risotto", name: "Riz à risotto", aisle: "feculents", base: "g", density: "0.85", n: [350, 7, 78, 0.6, 1.4], syn: ["riz arborio", "riz carnaroli", "riz rond", "riz pour risotto"], p: [["500", 249, "Riz arborio 500 g"]] },
  { id: "semoule", name: "Semoule de blé", aisle: "feculents", base: "g", density: "0.7", n: [360, 12, 72, 1.5, 3.5], syn: ["semoule", "couscous", "graine de couscous", "semoule fine", "semoule moyenne"], all: ["gluten"], p: [["1000", 189, "Semoule moyenne 1 kg"], ["500", 119]] },
  { id: "boulgour", name: "Boulgour", aisle: "feculents", base: "g", density: "0.7", n: [350, 12, 70, 1.5, 8], syn: ["boulghour"], all: ["gluten"], p: [["500", 199, "Boulgour 500 g"]] },
  { id: "quinoa", name: "Quinoa", aisle: "feculents", base: "g", density: "0.75", n: [370, 14, 64, 6, 7], p: [["500", 349, "Quinoa 500 g"]] },
  { id: "lentilles", name: "Lentilles vertes", aisle: "feculents", base: "g", density: "0.8", n: [330, 24, 50, 1.5, 11], syn: ["lentilles", "lentilles vertes du puy", "lentilles seches"], prot: "legumineuse", p: [["500", 199, "Lentilles vertes 500 g"]] },
  { id: "lentilles_corail", name: "Lentilles corail", aisle: "feculents", base: "g", density: "0.8", n: [340, 24, 53, 1.5, 9], syn: ["lentilles rouges"], prot: "legumineuse", p: [["500", 229, "Lentilles corail 500 g"]] },
  { id: "nouilles", name: "Nouilles chinoises", aisle: "monde", base: "g", n: [360, 11, 70, 2, 3], syn: ["nouilles aux oeufs", "nouilles de ble", "nouilles udon", "ramen", "nouilles"], all: ["gluten", "oeufs"], tr: ["egg"], p: [["250", 199, "Nouilles aux œufs 250 g"]] },
  { id: "nouilles_riz", name: "Nouilles de riz", aisle: "monde", base: "g", n: [360, 6, 80, 0.5, 1.5], syn: ["vermicelles de riz", "pates de riz"], p: [["400", 249, "Nouilles de riz 400 g"]] },
  { id: "gnocchi", name: "Gnocchis", aisle: "feculents", base: "g", n: [150, 4, 32, 0.5, 2], syn: ["gnocchi", "gnocchis a poeler"], all: ["gluten"], per: 30, p: [["500", 199, "Gnocchis 500 g"]] },
  { id: "polenta", name: "Polenta", aisle: "feculents", base: "g", density: "0.75", n: [360, 8, 77, 1.5, 3], syn: ["semoule de mais"], p: [["500", 219, "Polenta 500 g"]] },
  { id: "flocons_avoine", name: "Flocons d'avoine", aisle: "epicerie_sucree", base: "g", density: "0.4", n: [370, 13, 59, 7, 10], syn: ["avoine", "porridge", "flocons d'avoine complets"], all: ["gluten"], p: [["500", 159, "Flocons d'avoine 500 g"]] },
  { id: "tortilla", name: "Tortilla de blé", aisle: "monde", base: "piece", piece: "40", n: [310, 8, 52, 7, 3], syn: ["tortillas", "wraps", "galettes de ble", "wrap"], all: ["gluten"], per: 30, p: [["8", 229, "8 tortillas"]] },

  // ---------------------------------------------------------------- conserves
  { id: "tomate_pelee", name: "Tomates pelées", aisle: "conserves", base: "g", n: [20, 1, 3, 0.2, 1], syn: ["tomates pelees", "tomates concassees", "pulpe de tomate", "tomates en des", "tomates pelees en conserve"], conv: { boite: "400" }, veg: "tomate", p: [["400", 89, "Tomates pelées 400 g"], ["800", 159]] },
  { id: "coulis_tomate", name: "Coulis de tomate", aisle: "conserves", base: "g", density: "1.03", n: [30, 1.5, 5, 0.2, 1.3], syn: ["passata", "sauce tomate", "coulis de tomates", "puree de tomate"], conv: { brique: "500" }, veg: "tomate", p: [["500", 109, "Coulis de tomate 500 g"], ["690", 149]] },
  { id: "pois_chiches", name: "Pois chiches cuits", aisle: "conserves", base: "g", n: [120, 7, 15, 2.5, 6], syn: ["pois chiches", "pois chiches en conserve"], conv: { boite: "265" }, prot: "legumineuse", p: [["265", 99, "Pois chiches 265 g égouttés"], ["530", 169]] },
  { id: "haricots_rouges", name: "Haricots rouges cuits", aisle: "conserves", base: "g", n: [110, 8, 14, 0.5, 7], syn: ["haricots rouges", "haricots rouges en conserve"], conv: { boite: "250" }, prot: "legumineuse", p: [["250", 99, "Haricots rouges 250 g égouttés"]] },
  { id: "haricots_blancs", name: "Haricots blancs cuits", aisle: "conserves", base: "g", n: [100, 7, 13, 0.5, 6], syn: ["haricots blancs", "lingots", "flageolets"], conv: { boite: "265" }, prot: "legumineuse", p: [["265", 109, "Haricots blancs 265 g égouttés"]] },
  { id: "mais", name: "Maïs doux", aisle: "conserves", base: "g", n: [85, 3, 15, 1.5, 3], syn: ["mais", "mais doux en grains"], conv: { boite: "285" }, veg: "cereale_legume", p: [["285", 109, "Maïs 285 g"]] },
  { id: "thon", name: "Thon au naturel", aisle: "conserves", base: "g", n: [110, 25, 0, 1, 0], syn: ["thon", "thon en boite", "thon au naturel"], all: ["poissons"], tr: ["fish"], conv: { boite: "140" }, prot: "poisson", p: [["140", 189, "Thon 140 g"], ["420", 499, "3 × 140 g"]] },
  { id: "sardine", name: "Sardines à l'huile", aisle: "conserves", base: "g", n: [220, 24, 0, 14, 0], syn: ["sardines"], all: ["poissons"], tr: ["fish"], conv: { boite: "115" }, prot: "poisson", p: [["115", 159, "Sardines 115 g"]] },
  { id: "lait_coco", name: "Lait de coco", aisle: "monde", base: "ml", density: "1.0", n: [180, 1.5, 3, 18, 0], syn: ["creme de coco"], conv: { boite: "400" }, p: [["400", 179, "Lait de coco 40 cl"]] },
  { id: "compote", name: "Compote de pommes", aisle: "epicerie_sucree", base: "g", n: [70, 0.3, 16, 0.1, 1.5], syn: ["compote"], p: [["400", 169, "4 × 100 g compote"], ["850", 249, "Compote 850 g"]] },

  // ---------------------------------------------------------------- condiments & épices
  { id: "sel", name: "Sel", aisle: "condiments_epices", base: "g", density: "1.2", syn: ["sel fin", "gros sel", "fleur de sel", "sel de guerande"], p: [["1000", 69, "Sel fin 1 kg"]] },
  { id: "poivre", name: "Poivre", aisle: "condiments_epices", base: "g", density: "0.5", n: [255, 10, 38, 3, 25], syn: ["poivre noir", "poivre du moulin", "poivre blanc"], p: [["50", 199, "Poivre noir 50 g"]] },
  { id: "cumin", name: "Cumin", aisle: "condiments_epices", base: "g", density: "0.45", n: [375, 18, 44, 22, 11], syn: ["cumin moulu"], p: [["40", 149, "Cumin 40 g"]] },
  { id: "paprika", name: "Paprika", aisle: "condiments_epices", base: "g", density: "0.45", n: [280, 14, 54, 13, 35], syn: ["paprika fume", "paprika doux"], p: [["40", 149, "Paprika 40 g"]] },
  { id: "curry", name: "Curry en poudre", aisle: "condiments_epices", base: "g", density: "0.45", n: [325, 14, 55, 14, 33], syn: ["curry", "garam masala", "colombo"], all: ["moutarde"], p: [["40", 159, "Curry 40 g"]] },
  { id: "curcuma", name: "Curcuma", aisle: "condiments_epices", base: "g", density: "0.45", n: [312, 10, 67, 3, 21], p: [["40", 159, "Curcuma 40 g"]] },
  { id: "ras_el_hanout", name: "Ras el hanout", aisle: "condiments_epices", base: "g", density: "0.45", n: [300, 12, 50, 10, 30], syn: ["epices a couscous", "epices tajine"], p: [["40", 179, "Ras el hanout 40 g"]] },
  { id: "muscade", name: "Noix de muscade", aisle: "condiments_epices", base: "g", density: "0.45", n: [525, 6, 49, 36, 21], syn: ["muscade", "noix de muscade rapee"], p: [["30", 189, "Muscade 30 g"]] },
  { id: "cannelle", name: "Cannelle", aisle: "condiments_epices", base: "g", density: "0.45", n: [247, 4, 81, 1, 53], syn: ["cannelle moulue", "baton de cannelle"], p: [["40", 159, "Cannelle 40 g"]] },
  { id: "herbes_provence", name: "Herbes de Provence", aisle: "condiments_epices", base: "g", density: "0.3", n: [260, 9, 40, 7, 37], syn: ["herbes de provence", "origan", "origan seche", "bouquet garni", "fines herbes", "estragon"], p: [["30", 149, "Herbes de Provence 30 g"]] },
  { id: "piment_espelette", name: "Piment d'Espelette", aisle: "condiments_epices", base: "g", density: "0.45", n: [300, 12, 50, 13, 30], syn: ["piment de cayenne", "piment en poudre", "chili en poudre"], p: [["30", 299, "Piment d'Espelette 30 g"]] },
  { id: "graines_sesame", name: "Graines de sésame", aisle: "monde", base: "g", density: "0.6", n: [600, 18, 12, 50, 12], syn: ["sesame"], all: ["sesame"], p: [["100", 179, "Sésame 100 g"]] },

  // ---------------------------------------------------------------- épicerie sucrée
  { id: "farine", name: "Farine de blé", aisle: "epicerie_sucree", base: "g", density: "0.55", n: [345, 10, 72, 1, 3], syn: ["farine", "farine t45", "farine t55", "farine de ble"], all: ["gluten"], p: [["1000", 99, "Farine T45 1 kg"]] },
  { id: "maizena", name: "Fécule de maïs", aisle: "epicerie_sucree", base: "g", density: "0.55", n: [350, 0.3, 87, 0.1, 1], syn: ["maizena", "fecule de mais", "fecule"], p: [["250", 179, "Maïzena 250 g"]] },
  { id: "sucre", name: "Sucre", aisle: "epicerie_sucree", base: "g", density: "0.85", n: [400, 0, 100, 0, 0], syn: ["sucre en poudre", "sucre blanc", "sucre roux", "cassonade", "sucre glace", "sucre de canne", "vergeoise"], p: [["1000", 119, "Sucre 1 kg"]] },
  { id: "sucre_vanille", name: "Sucre vanillé", aisle: "epicerie_sucree", base: "g", n: [400, 0, 100, 0, 0], syn: ["sucre vanille", "extrait de vanille", "gousse de vanille", "vanille"], conv: { sachet: "7.5", gousse: "3" }, p: [["75", 129, "10 sachets sucre vanillé"]] },
  { id: "miel", name: "Miel", aisle: "epicerie_sucree", base: "g", density: "1.4", n: [320, 0.4, 80, 0, 0], syn: ["miel liquide"], tr: ["honey"], p: [["500", 549, "Miel 500 g"]] },
  { id: "sirop_erable", name: "Sirop d'érable", aisle: "epicerie_sucree", base: "ml", density: "1.33", n: [260, 0, 67, 0, 0], syn: ["sirop d'agave"], p: [["250", 599, "Sirop d'érable 25 cl"]] },
  { id: "chocolat", name: "Chocolat noir", aisle: "epicerie_sucree", base: "g", n: [550, 7, 45, 35, 10], syn: ["chocolat", "chocolat patissier", "chocolat noir patissier", "pepites de chocolat", "chocolat au lait"], all: ["lait", "soja"], tr: ["dairy"], conv: { carre: "5" }, p: [["200", 249, "Chocolat pâtissier 200 g"]] },
  { id: "cacao", name: "Cacao en poudre", aisle: "epicerie_sucree", base: "g", density: "0.45", n: [380, 20, 15, 22, 30], syn: ["cacao", "cacao non sucre"], p: [["250", 349, "Cacao 250 g"]] },
  { id: "levure_chimique", name: "Levure chimique", aisle: "epicerie_sucree", base: "g", density: "0.9", syn: ["levure", "poudre a lever", "sachet de levure chimique"], conv: { sachet: "11" }, p: [["66", 119, "6 sachets de levure"]] },
  { id: "levure_boulanger", name: "Levure de boulanger", aisle: "epicerie_sucree", base: "g", density: "0.8", n: [320, 40, 40, 5, 25], syn: ["levure seche de boulanger", "levure boulangere"], conv: { sachet: "5.5" }, p: [["33", 149, "6 sachets levure boulanger"]] },
  { id: "amande", name: "Amandes", aisle: "epicerie_sucree", base: "g", density: "0.45", n: [600, 21, 6, 53, 12], syn: ["amandes effilees", "poudre d'amande", "amandes en poudre", "poudre d'amandes"], all: ["fruits_a_coque"], p: [["125", 259, "Poudre d'amande 125 g"]] },
  { id: "noix", name: "Cerneaux de noix", aisle: "epicerie_sucree", base: "g", density: "0.45", n: [700, 15, 7, 65, 6], syn: ["noix", "cerneaux de noix", "noisettes", "noix de cajou", "pistaches"], all: ["fruits_a_coque"], p: [["100", 299, "Cerneaux de noix 100 g"]] },
  { id: "pignons", name: "Pignons de pin", aisle: "epicerie_sucree", base: "g", density: "0.55", n: [670, 14, 4, 68, 4], all: ["fruits_a_coque"], p: [["50", 349, "Pignons 50 g"]] },
  { id: "cacahuete", name: "Cacahuètes", aisle: "epicerie_salee", base: "g", density: "0.5", n: [590, 25, 13, 49, 8], syn: ["arachides", "beurre de cacahuete", "cacahuetes grillees"], all: ["arachides"], p: [["200", 199, "Cacahuètes 200 g"]] },
  { id: "raisins_secs", name: "Raisins secs", aisle: "epicerie_sucree", base: "g", density: "0.6", n: [300, 3, 70, 0.5, 4], syn: ["raisins de corinthe"], all: ["sulfites"], p: [["250", 199, "Raisins secs 250 g"]] },
  { id: "confiture", name: "Confiture", aisle: "epicerie_sucree", base: "g", density: "1.3", n: [240, 0.4, 60, 0.1, 1], syn: ["confiture de fraise", "confiture d'abricot", "pate a tartiner"], p: [["370", 219, "Confiture 370 g"]] },
  { id: "pois_casses", name: "Pois cassés", aisle: "feculents", base: "g", density: "0.8", n: [340, 23, 50, 1.5, 15], prot: "legumineuse", p: [["500", 199, "Pois cassés 500 g"]] },
  { id: "tofu", name: "Tofu ferme", aisle: "monde", base: "g", n: [140, 14, 2, 8, 1], syn: ["tofu", "tofu nature", "tofu fume"], all: ["soja"], prot: "tofu", per: 21, p: [["250", 249, "Tofu 250 g"], ["400", 349]] },
  { id: "pate_curry", name: "Pâte de curry", aisle: "monde", base: "g", density: "1.1", n: [200, 3, 15, 15, 5], syn: ["pate de curry rouge", "pate de curry vert", "pate de curry jaune"], all: ["crustaces"], tr: ["seafood"], p: [["110", 299, "Pâte de curry 110 g"]] },
  { id: "tahini", name: "Tahini", aisle: "monde", base: "g", density: "1.0", n: [600, 17, 21, 54, 9], syn: ["creme de sesame", "puree de sesame"], all: ["sesame"], p: [["250", 399, "Tahini 250 g"]] },

  // ---------------------------------------------------------------- surgelés
  { id: "legumes_wok", name: "Mélange de légumes pour wok", aisle: "surgeles", base: "g", n: [35, 2, 5, 0.3, 2.5], syn: ["poelee de legumes", "legumes pour wok", "julienne de legumes"], veg: "melange", p: [["750", 299, "Légumes wok 750 g"]] },
  { id: "legumes_soupe", name: "Légumes pour soupe", aisle: "surgeles", base: "g", n: [30, 1.5, 5, 0.2, 2.5], syn: ["melange de legumes pour soupe", "macedoine", "macedoine de legumes", "jardiniere de legumes"], all: ["celeri"], veg: "melange", p: [["1000", 279, "Légumes pour soupe 1 kg"]] },

  // ---------------------------------------------------------------- boissons
  { id: "vin_blanc", name: "Vin blanc sec", aisle: "boissons", base: "ml", density: "0.99", n: [70, 0, 1, 0, 0], syn: ["vin blanc"], all: ["sulfites"], tr: ["alcohol"], p: [["750", 499, "Vin blanc 75 cl"]] },
  { id: "vin_rouge", name: "Vin rouge", aisle: "boissons", base: "ml", density: "0.99", n: [75, 0, 1, 0, 0], all: ["sulfites"], tr: ["alcohol"], p: [["750", 549, "Vin rouge 75 cl"]] },
  { id: "biere", name: "Bière", aisle: "boissons", base: "ml", density: "1.01", n: [40, 0.4, 3, 0, 0], syn: ["biere blonde", "biere brune"], all: ["gluten"], tr: ["alcohol"], p: [["330", 129, "Bière 33 cl"], ["1980", 599, "6 × 33 cl"]] },
  { id: "cidre", name: "Cidre", aisle: "boissons", base: "ml", density: "1.0", n: [40, 0, 4, 0, 0], syn: ["cidre brut"], all: ["sulfites"], tr: ["alcohol"], p: [["750", 349, "Cidre brut 75 cl"]] },
  { id: "eau", name: "Eau", aisle: "boissons", base: "ml", density: "1.0", n: [0, 0, 0, 0, 0], syn: ["eau froide", "eau chaude", "eau tiede", "eau bouillante"], p: [["6000", 199, "Eau 6 × 1 L"]] },
  { id: "lait_vegetal", name: "Boisson végétale", aisle: "cremerie", base: "ml", density: "1.0", n: [40, 1, 6, 1.5, 0.5], syn: ["lait d'amande", "lait d'avoine", "boisson d'avoine", "lait de soja", "boisson soja"], all: ["soja"], per: 7, p: [["1000", 189, "Boisson végétale 1 L"]] },

  // ---------------------------------------------------------------- ajouts (catalogue étendu)
  { id: "farine_sarrasin", name: "Farine de sarrasin", aisle: "epicerie_sucree", base: "g", density: "0.55", n: [340, 12, 68, 3, 6], syn: ["sarrasin", "farine de ble noir"], p: [["500", 249, "Farine de sarrasin 500 g"]] },
  { id: "halloumi", name: "Halloumi", aisle: "fromagerie", base: "g", n: [320, 22, 2, 25, 0], all: ["lait"], tr: ["dairy", "lactose"], per: 30, p: [["225", 349, "Halloumi 225 g"]] },
  { id: "mascarpone", name: "Mascarpone", aisle: "cremerie", base: "g", density: "1.0", n: [430, 5, 4, 44, 0], all: ["lait"], tr: ["dairy", "lactose"], per: 14, p: [["250", 229, "Mascarpone 250 g"]] },
  { id: "fromage_frais", name: "Fromage frais à tartiner", aisle: "cremerie", base: "g", density: "1.0", n: [250, 7, 3, 23, 0], syn: ["fromage frais", "saint moret", "philadelphia", "carre frais", "cream cheese"], all: ["lait"], tr: ["dairy", "lactose"], per: 21, p: [["150", 189, "Fromage frais 150 g"]] },
  { id: "mangue", name: "Mangue", aisle: "fruits_legumes", base: "g", piece: "350", n: [65, 0.6, 15, 0.3, 1.6], season: ALL, per: 7, p: [["350", 199, "1 mangue"]] },
  { id: "ananas", name: "Ananas", aisle: "fruits_legumes", base: "g", piece: "1000", n: [50, 0.5, 12, 0.1, 1.4], season: ALL, per: 7, p: [["1000", 249, "1 ananas"]] },
  { id: "noix_coco", name: "Noix de coco râpée", aisle: "epicerie_sucree", base: "g", density: "0.35", n: [650, 7, 7, 64, 15], syn: ["coco rapee", "noix de coco"], p: [["125", 199, "Coco râpée 125 g"]] },
  { id: "graines_chia", name: "Graines de chia", aisle: "epicerie_sucree", base: "g", density: "0.65", n: [490, 17, 8, 31, 34], syn: ["chia"], p: [["200", 349, "Graines de chia 200 g"]] },
  { id: "brioche", name: "Brioche", aisle: "boulangerie", base: "g", n: [370, 8, 52, 14, 2], syn: ["pain brioche", "brioche tranchee"], all: ["gluten", "oeufs", "lait"], tr: ["egg", "dairy"], conv: { tranche: "35" }, per: 7, p: [["400", 229, "Brioche tranchée 400 g"]] },
  { id: "cerise", name: "Cerises", aisle: "fruits_legumes", base: "g", n: [60, 1, 14, 0.3, 1.6], syn: ["cerise", "griottes"], season: m([5, 7]), per: 4, p: [["500", 449, "Cerises 500 g"]] },
  { id: "prune", name: "Prunes", aisle: "fruits_legumes", base: "g", piece: "40", n: [46, 0.7, 11, 0.3, 1.4], syn: ["prune", "mirabelles", "quetsches"], season: m([7, 9]), per: 5, p: [["500", 299, "Prunes 500 g"]] },
  { id: "raisin", name: "Raisin", aisle: "fruits_legumes", base: "g", n: [70, 0.7, 16, 0.2, 0.9], syn: ["raisin blanc", "raisin noir", "grappe de raisin"], season: m([8, 10]), per: 6, p: [["500", 299, "Raisin 500 g"]] },
  { id: "fruits_secs", name: "Fruits secs", aisle: "epicerie_sucree", base: "g", density: "0.6", n: [280, 3, 63, 0.5, 7], syn: ["dattes", "abricots secs", "figues seches", "pruneaux", "cranberries sechees"], all: ["sulfites"], p: [["250", 299, "Dattes 250 g"]] },
  { id: "panais", name: "Panais", aisle: "fruits_legumes", base: "g", piece: "200", n: [70, 1.5, 13, 0.3, 4], season: m([10, 3]), veg: "racine", per: 21, p: [["500", 199, "Panais 500 g"]] },
  { id: "chou_bruxelles", name: "Choux de Bruxelles", aisle: "fruits_legumes", base: "g", n: [40, 3.4, 5, 0.3, 3.8], syn: ["chou de bruxelles"], season: m([10, 2]), veg: "crucifere", per: 10, p: [["500", 249, "Choux de Bruxelles 500 g"]], alt: [["1000", 279, "surgeles", "Choux de Bruxelles surgelés 1 kg"]] },
  { id: "kale", name: "Chou kale", aisle: "fruits_legumes", base: "g", n: [35, 3, 4, 0.7, 4], syn: ["kale", "chou kale", "blettes"], season: m([10, 3]), veg: "feuille", per: 5, p: [["200", 249, "Kale 200 g"]] },
  { id: "merguez", name: "Merguez", aisle: "boucherie", base: "g", piece: "60", n: [300, 15, 2, 26, 0], tr: ["meat"], prot: "agneau", per: 4, p: [["360", 449, "6 merguez"]] },
  { id: "canard", name: "Magret de canard", aisle: "boucherie", base: "g", piece: "350", n: [200, 19, 0, 14, 0], syn: ["magret", "canard", "cuisses de canard"], tr: ["meat"], prot: "volaille", per: 4, p: [["350", 899, "1 magret 350 g"]] },
  { id: "maquereau", name: "Maquereau", aisle: "poissonnerie", base: "g", n: [200, 19, 0, 14, 0], syn: ["filets de maquereau", "maquereaux"], all: ["poissons"], tr: ["fish"], conv: { filet_poisson: "100", piece: "100" }, prot: "poisson", per: 2, p: [["400", 599, "Filets de maquereau 400 g"]], alt: [["176", 199, "conserves", "Maquereau à la moutarde (boîte)"]] },
  { id: "truite", name: "Truite", aisle: "poissonnerie", base: "g", n: [140, 20, 0, 6, 0], syn: ["filets de truite", "truite fumee"], all: ["poissons"], tr: ["fish"], conv: { filet_poisson: "120", pave: "120", piece: "120" }, prot: "poisson", per: 2, p: [["240", 649, "2 filets de truite"]] },
  { id: "calamar", name: "Calamars", aisle: "poissonnerie", base: "g", n: [90, 16, 3, 1.4, 0], syn: ["encornets", "seiche", "calamar"], all: ["mollusques"], tr: ["seafood"], prot: "fruits_de_mer", per: 2, p: [["500", 649, "Calamars 500 g"]], alt: [["500", 549, "surgeles", "Anneaux de calamar surgelés 500 g"]] },
  { id: "harissa", name: "Harissa", aisle: "monde", base: "g", density: "1.1", n: [100, 3, 12, 4, 6], syn: ["pate de piment"], p: [["70", 149, "Harissa 70 g"]] },
  { id: "nuoc_mam", name: "Sauce poisson (nuoc-mâm)", aisle: "monde", base: "ml", density: "1.2", n: [35, 5, 4, 0, 0], syn: ["nuoc mam", "sauce poisson"], all: ["poissons"], tr: ["fish"], p: [["200", 249, "Nuoc-mâm 20 cl"]] },
  { id: "citronnelle", name: "Citronnelle", aisle: "fruits_legumes", base: "g", piece: "20", n: [99, 2, 25, 0.5, 0], syn: ["baton de citronnelle"], conv: { branche: "20", brin: "20" }, season: ALL, per: 14, p: [["60", 179, "3 bâtons de citronnelle"]] },
  { id: "aneth", name: "Aneth", aisle: "fruits_legumes", base: "g", n: [43, 3.5, 7, 1, 2], syn: ["aneth frais"], conv: { botte: "25", brin: "1", branche: "1" }, season: ALL, per: 5, p: [["25", 119, "Botte d'aneth"]] },
  { id: "haricots_noirs", name: "Haricots noirs cuits", aisle: "conserves", base: "g", n: [110, 7.5, 15, 0.5, 7], syn: ["haricots noirs"], conv: { boite: "250" }, prot: "legumineuse", p: [["250", 129, "Haricots noirs 250 g égouttés"]] },
  { id: "edamame", name: "Edamame", aisle: "surgeles", base: "g", n: [120, 11, 9, 5, 5], syn: ["feves de soja"], all: ["soja"], veg: "legume_vert", p: [["400", 299, "Edamame surgelés 400 g"]] },
  { id: "pois_gourmands", name: "Pois gourmands", aisle: "fruits_legumes", base: "g", n: [40, 3, 7, 0.2, 2.6], syn: ["mange-tout", "pois mange-tout"], season: m([5, 8]), veg: "legume_vert", per: 5, p: [["250", 299, "Pois gourmands 250 g"]] },
  { id: "pain_pita", name: "Pain pita", aisle: "boulangerie", base: "piece", piece: "70", n: [270, 9, 55, 1.2, 2], syn: ["pitas", "pain libanais", "naan", "pains naan"], all: ["gluten"], per: 14, p: [["6", 199, "6 pains pita"]] },
  { id: "galette_riz", name: "Galettes de riz soufflé", aisle: "epicerie_sucree", base: "g", piece: "9", n: [380, 8, 80, 3, 3], syn: ["galettes de riz"], p: [["130", 149, "Galettes de riz 130 g"]] },
  { id: "pate_amande", name: "Purée d'amande", aisle: "epicerie_sucree", base: "g", density: "1.0", n: [630, 21, 7, 55, 8], syn: ["puree d'amandes", "beurre d'amande", "puree de noisette"], all: ["fruits_a_coque"], p: [["250", 549, "Purée d'amande 250 g"]] },
];
