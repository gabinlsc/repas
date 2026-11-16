import { formatMoney } from "./i18n";

type P = Record<string, string | number>;
const PROTEIN: Record<string, string> = { boeuf: "bœuf", volaille: "volaille", porc: "porc", poisson: "poisson", oeuf: "œufs", legumineuse: "légumineuses", tofu: "tofu", agneau: "agneau", veau: "veau", fruits_de_mer: "fruits de mer" };
const days = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

/** Traduit les codes d'explication du solveur en phrases. */
export function explain(code: string, p: P): string | null {
  switch (code) {
    case "locked": return "Repas verrouillé par vous";
    case "uses_pantry": return `Utilise ${p.ingredient} de votre stock${p.expiry_day !== undefined ? ` (à consommer avant ${days[Number(p.expiry_day)] ?? "bientôt"})` : ""}`;
    case "in_season": return "Légumes et fruits de saison";
    case "favorite": return "Vous aimez cette recette";
    case "fits_time": return `${p.minutes} min, dans votre limite de ${p.limit} min`;
    case "protein_variety": return `Change d'hier : ${PROTEIN[String(p.protein)] ?? p.protein} après ${PROTEIN[String(p.previous)] ?? p.previous}`;
    case "shared_ingredients": return `Partage ${p.count} ingrédients avec d'autres repas`;
    case "cost_per_serving": return `≈ ${formatMoney(Number(p.cents))} par portion`;
    case "batch_cook": return `Cuisinez double : les restes servent ${days[Number(p.for_day)]}`;
    case "leftover": return "Restes d'un plat cuisiné en double";
    case "kcal": return `≈ ${p.per_serving} kcal par portion`;
    case "manual": return "Choisi par vous";
    default: return null;
  }
}

/** Ordre d'intérêt des raisons affichées en premier sur une carte de repas. */
export const REASON_PRIORITY = ["locked", "leftover", "uses_pantry", "favorite", "in_season", "batch_cook", "protein_variety", "manual", "shared_ingredients"];
