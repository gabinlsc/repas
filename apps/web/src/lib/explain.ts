import { formatMoney } from "./i18n";

type P = Record<string, string | number>;
const days = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

/** Traduit les codes d'explication du solveur en phrases. */
export function explain(code: string, p: P): string | null {
  switch (code) {
    case "locked": return "Repas verrouillé par vous";
    case "uses_pantry": return `Utilise ${p.ingredient} de votre stock${p.expiry_day !== undefined ? ` (à consommer avant ${days[Number(p.expiry_day)] ?? "bientôt"})` : ""}`;
    case "in_season": return "Légumes et fruits de saison";
    case "favorite": return "Vous aimez cette recette";
    case "fits_time": return `${p.minutes} min, dans votre limite de ${p.limit} min`;
    case "protein_variety": return `Change de la veille (${p.previous} → ${p.protein})`;
    case "shared_ingredients": return `${p.count} ingrédients partagés avec d'autres repas (moins d'achats)`;
    case "cost_per_serving": return `≈ ${formatMoney(Number(p.cents))} par portion`;
    case "batch_cook": return `Cuisinez double : les restes servent ${days[Number(p.for_day)]}`;
    case "leftover": return "Restes d'un plat cuisiné en double";
    case "kcal": return `≈ ${p.per_serving} kcal par portion`;
    case "manual": return "Choisi par vous";
    default: return null;
  }
}
