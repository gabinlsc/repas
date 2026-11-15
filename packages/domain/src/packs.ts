import { add, cmp, div, mul, rat, roundToInt, sub, ZERO, type Rational } from "./rational.js";

export interface PackOption {
  readonly productId: string;
  readonly name: string;
  /** quantité totale du conditionnement en unité de base (lot de 6 œufs = 6). */
  readonly size: Rational;
  readonly priceCents: number | null;
}

export interface PackChoice {
  readonly productId: string;
  readonly name: string;
  readonly count: number;
  readonly size: Rational;
  readonly unitPriceCents: number | null;
}

export interface PackSolution {
  readonly choices: readonly PackChoice[];
  readonly totalQuantity: Rational;
  readonly costCents: number | null;
  readonly surplus: Rational;
}

const bigGcd = (a: bigint, b: bigint): bigint => {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) [x, y] = [y, x % y];
  return x;
};
const bigLcm = (a: bigint, b: bigint): bigint => (a / bigGcd(a, b)) * b;

/** Au-delà, la DP deviendrait coûteuse : on bascule sur une heuristique sûre (couverture garantie). */
const MAX_DP_STATES = 200_000;

/**
 * Couverture à coût minimal : choisir des quantités entières de conditionnements dont la
 * somme ≥ besoin, en minimisant le coût (puis le surplus, puis le nombre de paquets).
 * Résolu exactement par programmation dynamique sur une grille entière (PGCD des tailles).
 */
export function chooseCheapestPacks(need: Rational, options: readonly PackOption[]): PackSolution | null {
  const usable = options.filter((o) => o.size.n > 0n).slice().sort((a, b) => a.productId.localeCompare(b.productId));
  if (usable.length === 0) return null;
  if (cmp(need, ZERO) <= 0) return { choices: [], totalQuantity: ZERO, costCents: 0, surplus: ZERO };

  const priced = usable.filter((o) => o.priceCents !== null);
  // Sans prix connu, on minimise le surplus puis le nombre de paquets (coût inconnu).
  const pool = priced.length > 0 ? priced : usable;
  const costOf = (o: PackOption): number => o.priceCents ?? 1;

  // Grille : dénominateur commun puis PGCD des tailles entières.
  const den = pool.reduce((acc, o) => bigLcm(acc, o.size.d), need.d);
  const sizesInt = pool.map((o) => (o.size.n * den) / o.size.d);
  const grid = sizesInt.reduce((g, s) => bigGcd(g, s));
  const steps = sizesInt.map((s) => Number(s / grid));
  const needSteps = Number(roundToInt(div(mul(need, rat(den)), rat(grid)), "ceil"));

  if (needSteps > MAX_DP_STATES) return greedyCover(need, pool);

  // best[q] = coût minimal pour couvrir au moins q pas ; tie-break sur surplus puis nb de paquets.
  type Cell = { cost: number; total: number; packs: number; prev: number; opt: number };
  const best: Cell[] = new Array<Cell>(needSteps + 1);
  best[0] = { cost: 0, total: 0, packs: 0, prev: -1, opt: -1 };
  for (let q = 1; q <= needSteps; q++) {
    let cell: Cell | null = null;
    for (const [j, o] of pool.entries()) {
      const from = Math.max(0, q - steps[j]!);
      const b = best[from]!;
      const cand = { cost: b.cost + costOf(o), total: b.total + steps[j]!, packs: b.packs + 1, prev: from, opt: j };
      if (
        !cell ||
        cand.cost < cell.cost ||
        (cand.cost === cell.cost && (cand.total < cell.total || (cand.total === cell.total && cand.packs < cell.packs)))
      ) {
        cell = cand;
      }
    }
    best[q] = cell!;
  }
  const counts = new Map<number, number>();
  for (let q = needSteps; q > 0; q = best[q]!.prev) counts.set(best[q]!.opt, (counts.get(best[q]!.opt) ?? 0) + 1);
  return buildSolution(need, pool, counts, priced.length > 0);
}

function buildSolution(need: Rational, pool: readonly PackOption[], counts: Map<number, number>, hasPrices: boolean): PackSolution {
  const choices: PackChoice[] = [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([j, count]) => ({ productId: pool[j]!.productId, name: pool[j]!.name, count, size: pool[j]!.size, unitPriceCents: pool[j]!.priceCents }));
  const totalQuantity = choices.reduce((acc, c) => add(acc, mul(c.size, rat(c.count))), ZERO);
  const costCents = hasPrices ? choices.reduce((acc, c) => acc + (c.unitPriceCents ?? 0) * c.count, 0) : null;
  return { choices, totalQuantity, costCents, surplus: sub(totalQuantity, need) };
}

/** Repli : le plus grand conditionnement au meilleur prix unitaire, complété par le plus petit. */
function greedyCover(need: Rational, pool: readonly PackOption[]): PackSolution {
  const byUnit = pool.slice().sort((a, b) => cmp(div(rat(a.priceCents ?? 1), a.size), div(rat(b.priceCents ?? 1), b.size)));
  const main = byUnit[0]!;
  const idx = pool.indexOf(main);
  const count = Number(roundToInt(div(need, main.size), "ceil"));
  return buildSolution(need, pool, new Map([[idx, count]]), pool.some((p) => p.priceCents !== null));
}
