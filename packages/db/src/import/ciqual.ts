/**
 * Import de la table de composition Ciqual (ANSES). Format attendu : export CSV
 * officiel (séparateur « ; », décimales à virgule). Les valeurs « traces », « < x »
 * et « - » sont interprétées de façon prudente (traces/inférieur → borne, absent → 0).
 */
export interface CiqualRow {
  readonly code: string;
  readonly name: string;
  readonly nutrition: Record<"kcal" | "protein" | "carbs" | "fat" | "fiber" | "sugar" | "salt", string>;
}

const COLUMNS: Record<keyof CiqualRow["nutrition"], RegExp> = {
  kcal: /^energie,\s*r[eè]glement ue.*kcal/i,
  protein: /^prot[eé]ines,\s*n x facteur de jones/i,
  carbs: /^glucides \(g/i,
  fat: /^lipides \(g/i,
  fiber: /^fibres alimentaires/i,
  sugar: /^sucres \(g/i,
  salt: /^sel chlorure de sodium/i,
};

export class CiqualFormatError extends Error {}

/** Valeur Ciqual → décimal en chaîne (jamais de flottant). */
export function parseCiqualValue(raw: string | undefined): string {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "" || v === "-") return "0";
  if (v === "traces") return "0";
  const m = /^<?\s*(\d+)(?:,(\d+))?$/.exec(v);
  if (!m) return "0";
  return m[2] ? `${m[1]}.${m[2]}` : m[1]!;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ";" && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseCiqualCsv(text: string): CiqualRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new CiqualFormatError("Fichier Ciqual vide");
  const header = splitCsvLine(lines[0]!).map((h) => h.trim());
  const codeIdx = header.findIndex((h) => h === "alim_code");
  const nameIdx = header.findIndex((h) => h === "alim_nom_fr");
  if (codeIdx < 0 || nameIdx < 0) throw new CiqualFormatError("Colonnes alim_code / alim_nom_fr absentes");
  const idx = Object.fromEntries(
    Object.entries(COLUMNS).map(([k, re]) => {
      const i = header.findIndex((h) => re.test(h));
      if (i < 0) throw new CiqualFormatError(`Colonne nutritionnelle absente : ${k}`);
      return [k, i];
    }),
  ) as Record<keyof CiqualRow["nutrition"], number>;
  return lines.slice(1).map((l) => {
    const c = splitCsvLine(l);
    const nutrition = Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, parseCiqualValue(c[i])])) as CiqualRow["nutrition"];
    return { code: c[codeIdx]!.trim(), name: c[nameIdx]!.trim(), nutrition };
  });
}
