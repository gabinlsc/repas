import type { Ingredient } from "./types.js";

/** Minuscule, sans accents ni ligatures : base commune pour comparer des libellés. */
export function foldText(s: string): string {
  return s
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[’`]/g, "'")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set(["de", "d", "du", "des", "la", "le", "les", "l", "a", "au", "aux", "en", "et", "un", "une"]);

/** Singulier naïf mais suffisant pour le français culinaire (oignons → oignon, choux → chou). */
function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("eaux")) return word.slice(0, -1);
  if (word.endsWith("aux")) return word.slice(0, -3) + "al";
  if (word.endsWith("s") || word.endsWith("x")) return word.slice(0, -1);
  return word;
}

export function tokens(s: string): string[] {
  return foldText(s)
    .replace(/[^a-z0-9' -]/g, " ")
    .split(/[\s'-]+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t))
    .map(singular);
}

export function canonicalKey(s: string): string {
  return tokens(s).join(" ");
}

export interface MatchCandidate {
  readonly ingredientId: string;
  readonly name: string;
  readonly score: number;
}

export type MatchResult =
  | { readonly status: "matched"; readonly ingredientId: string; readonly candidates: readonly MatchCandidate[] }
  | { readonly status: "ambiguous"; readonly candidates: readonly MatchCandidate[] }
  | { readonly status: "unknown"; readonly candidates: readonly MatchCandidate[] };

type IndexEntry = { readonly id: string; readonly name: string; readonly keys: readonly string[]; readonly tokenSets: readonly Set<string>[] };

export interface IngredientIndex {
  readonly entries: readonly IndexEntry[];
  readonly exact: ReadonlyMap<string, string>;
}

export function buildIngredientIndex(ingredients: readonly Pick<Ingredient, "id" | "name" | "synonyms">[]): IngredientIndex {
  const exact = new Map<string, string>();
  const entries = ingredients.map((ing) => {
    const keys = [ing.name, ...ing.synonyms].map(canonicalKey);
    for (const k of keys) if (!exact.has(k)) exact.set(k, ing.id);
    return { id: ing.id, name: ing.name, keys, tokenSets: keys.map((k) => new Set(k.split(" "))) };
  });
  return { entries, exact };
}

/**
 * Score de similarité : Jaccard sur les jetons, bonus si tous les jetons du nom catalogue
 * sont présents (« huile d'olive vierge extra » ⊃ « huile olive »).
 */
function similarity(query: Set<string>, target: Set<string>): number {
  let inter = 0;
  for (const t of query) if (target.has(t)) inter++;
  if (inter === 0) return 0;
  const jaccard = inter / (query.size + target.size - inter);
  return inter === target.size ? 0.7 + 0.3 * jaccard : 0.8 * jaccard;
}

/**
 * Rapproche un libellé libre d'un ingrédient canonique. Seuil volontairement prudent :
 * en cas de doute, l'UI demandera une validation plutôt que d'associer silencieusement
 * (un mauvais rapprochement pourrait masquer un allergène).
 */
export function matchIngredient(label: string, index: IngredientIndex, limit = 5): MatchResult {
  const key = canonicalKey(label);
  const exactId = index.exact.get(key);
  const q = new Set(key.split(" ").filter(Boolean));
  const scored: MatchCandidate[] = [];
  for (const e of index.entries) {
    let best = 0;
    for (const ts of e.tokenSets) best = Math.max(best, similarity(q, ts));
    if (best > 0) scored.push({ ingredientId: e.id, name: e.name, score: Math.round(best * 1000) / 1000 });
  }
  scored.sort((a, b) => b.score - a.score || a.ingredientId.localeCompare(b.ingredientId));
  const candidates = scored.slice(0, limit);
  if (exactId) return { status: "matched", ingredientId: exactId, candidates };
  const [first, second] = candidates;
  if (first && first.score >= 0.85 && (!second || first.score - second.score >= 0.2)) {
    return { status: "matched", ingredientId: first.ingredientId, candidates };
  }
  if (first && first.score >= 0.2) return { status: "ambiguous", candidates };
  return { status: "unknown", candidates };
}
