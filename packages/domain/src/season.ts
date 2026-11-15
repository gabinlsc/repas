import { add, div, gt, mul, rat, roundToInt, ZERO, type Rational } from "./rational.js";

export interface SeasonLine {
  readonly seasonMonths: readonly number[];
  /** masse (ou quantité de base) de l'ingrédient dans la recette ; sert de pondération. */
  readonly weight: Rational;
  readonly isProduce: boolean;
}

/**
 * Score de saisonnalité (0–100) = part pondérée des fruits et légumes de saison pour le
 * mois donné. Une recette sans fruit ni légume est neutre (50) pour ne pas la pénaliser.
 */
export function seasonalityScore(lines: readonly SeasonLine[], month: number): number {
  let total = ZERO;
  let inSeason = ZERO;
  for (const l of lines) {
    if (!l.isProduce) continue;
    total = add(total, l.weight);
    if (l.seasonMonths.includes(month)) inSeason = add(inSeason, l.weight);
  }
  if (!gt(total, ZERO)) return 50;
  return Number(roundToInt(mul(div(inSeason, total), rat(100)), "half-up"));
}
