import { add, mul, parseRational, rat, type Rational } from "./rational.js";
import { foldText } from "./normalize.js";

export interface ParsedIngredientLine {
  readonly raw: string;
  readonly quantity: Rational | null;
  readonly unit: string | null;
  readonly name: string;
  readonly note: string | null;
  readonly optional: boolean;
  /** « sel », « à votre goût », « une pincée »… : exclu du calcul des quantités. */
  readonly fuzzy: boolean;
}

/** Alias (forme repliée, sans accents) → code d'unité. Ordre : du plus long au plus court. */
const UNIT_ALIASES: ReadonlyArray<readonly [string, string]> = (
  [
    ["cuilleres a soupe", "cs"],
    ["cuillere a soupe", "cs"],
    ["cuil. a soupe", "cs"],
    ["cuill. a soupe", "cs"],
    ["c. a soupe", "cs"],
    ["c.a.s.", "cs"],
    ["c.a.s", "cs"],
    ["c. a s.", "cs"],
    ["cas", "cs"],
    ["cs", "cs"],
    ["cuilleres a cafe", "cc"],
    ["cuillere a cafe", "cc"],
    ["cuil. a cafe", "cc"],
    ["cuill. a cafe", "cc"],
    ["c. a cafe", "cc"],
    ["c.a.c.", "cc"],
    ["c.a.c", "cc"],
    ["c. a c.", "cc"],
    ["cac", "cc"],
    ["cc", "cc"],
    ["kilogrammes", "kg"],
    ["kilogramme", "kg"],
    ["kilos", "kg"],
    ["kilo", "kg"],
    ["kg", "kg"],
    ["grammes", "g"],
    ["gramme", "g"],
    ["gr", "g"],
    ["g", "g"],
    ["mg", "mg"],
    ["millilitres", "ml"],
    ["millilitre", "ml"],
    ["ml", "ml"],
    ["centilitres", "cl"],
    ["centilitre", "cl"],
    ["cl", "cl"],
    ["decilitres", "dl"],
    ["decilitre", "dl"],
    ["dl", "dl"],
    ["litres", "l"],
    ["litre", "l"],
    ["l", "l"],
    ["tasses", "tasse"],
    ["tasse", "tasse"],
    ["verres", "verre"],
    ["verre", "verre"],
    ["bols", "bol"],
    ["bol", "bol"],
    ["pincees", "pincee"],
    ["pincee", "pincee"],
    ["poignees", "poignee"],
    ["poignee", "poignee"],
    ["gousses", "gousse"],
    ["gousse", "gousse"],
    ["tranches", "tranche"],
    ["tranche", "tranche"],
    ["sachets", "sachet"],
    ["sachet", "sachet"],
    ["boites", "boite"],
    ["boite", "boite"],
    ["bottes", "botte"],
    ["botte", "botte"],
    ["brins", "brin"],
    ["brin", "brin"],
    ["branches", "branche"],
    ["branche", "branche"],
    ["feuilles", "feuille"],
    ["feuille", "feuille"],
    ["pots", "pot"],
    ["pot", "pot"],
    ["briques", "brique"],
    ["brique", "brique"],
    ["paves", "pave"],
    ["pave", "pave"],
    ["rouleaux", "rouleau"],
    ["rouleau", "rouleau"],
    ["cubes", "cube"],
    ["cube", "cube"],
    ["douzaines", "douzaine"],
    ["douzaine", "douzaine"],
    ["noix", "noix"],
    ["carres", "carre"],
    ["carre", "carre"],
    ["filets", "filet"],
    ["filet", "filet"],
  ] as const
)
  .slice()
  .sort((a, b) => b[0].length - a[0].length);

const WORD_NUMBERS: Readonly<Record<string, number>> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12, demi: 0, demie: 0,
};

const UNICODE_FRACTIONS: Readonly<Record<string, string>> = { "½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3" };

const FUZZY_PATTERNS = [/\ba votre gout\b/, /\bselon (votre |vos )?gouts?\b/, /\bau gout\b/, /\bfacultatif\b.*\bgout\b/, /^quelques? /];

/**
 * Une ligne d'ingrédient en français : « 200 g de farine », « 2 oignons émincés »,
 * « 1 c. à soupe d'huile d'olive », « 1/2 citron », « sel, poivre », « 2 à 3 carottes ».
 * Pour les fourchettes, on retient la borne haute : mieux vaut un léger surplus
 * (qui retourne au stock) qu'un manque.
 */
export function parseIngredientLine(rawLine: string): ParsedIngredientLine {
  const raw = rawLine.replace(/^[\s\-•*·–]+/, "").trim();
  let rest = raw;
  for (const [k, v] of Object.entries(UNICODE_FRACTIONS)) rest = rest.replaceAll(k, ` ${v}`);
  rest = rest.trim();

  let optional = false;
  let note: string | null = null;
  const paren = /\(([^)]*)\)/g;
  const notes: string[] = [];
  rest = rest.replace(paren, (_m, inner: string) => {
    const f = foldText(inner);
    if (f.includes("facultatif") || f.includes("optionnel")) optional = true;
    else notes.push(inner.trim());
    return " ";
  });
  if (/\b(facultatif|optionnel)\b/i.test(foldText(rest))) {
    optional = true;
    rest = rest.replace(/,?\s*\b(facultatif|facultative|optionnel)\b/gi, " ");
  }

  let fuzzy = FUZZY_PATTERNS.some((re) => re.test(foldText(rest)));
  rest = rest.replace(/,?\s*(a|à) votre go[uû]t/gi, " ").replace(/,?\s*selon (vos |votre )?go[uû]ts?/gi, " ");

  // Quantité
  let quantity: Rational | null = null;
  const qtyRe = /^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)(?:\s*(?:à|a|-|–|ou)\s*(\d+(?:[.,]\d+)?))?\s*/i;
  const qm = qtyRe.exec(rest);
  if (qm) {
    quantity = parseRational(qm[2] ?? qm[1]!);
    rest = rest.slice(qm[0].length);
    // « 1 demi-baguette »
    const half = /^demi(e)?[- ]/i.exec(rest);
    if (half) {
      quantity = mul(quantity, rat(1, 2));
      rest = rest.slice(half[0].length);
    }
  } else {
    const wm = /^(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|douze)\s+(et\s+(demi|demie)\s+)?/i.exec(rest);
    if (wm) {
      quantity = rat(WORD_NUMBERS[foldText(wm[1]!)]!);
      if (wm[2]) quantity = add(quantity, rat(1, 2));
      rest = rest.slice(wm[0].length);
    } else {
      const dm = /^(un |une )?demi(e)?[- ]/i.exec(rest);
      if (dm) {
        quantity = rat(1, 2);
        rest = rest.slice(dm[0].length);
      }
    }
  }

  // Unité : comparée sur la forme repliée, mais on découpe le texte original à la même longueur
  let unit: string | null = null;
  const folded = foldText(rest);
  for (const [alias, code] of UNIT_ALIASES) {
    if (folded.startsWith(alias) && /^($|[\s.'’]|d'|de )/.test(folded.slice(alias.length))) {
      unit = code;
      rest = rest.slice(alias.length).replace(/^\.?\s*/, "");
      break;
    }
  }
  rest = rest.replace(/^(de |d'|d’|du |des )/i, "").trim();

  // Note après la virgule : « oignons, émincés »
  const comma = rest.indexOf(",");
  let name = rest;
  if (comma > 0) {
    notes.push(rest.slice(comma + 1).trim());
    name = rest.slice(0, comma);
  }
  name = name.replace(/\s+/g, " ").replace(/[.;:]+$/, "").trim();
  const cleanNotes = notes.filter((n) => n.length > 0);
  note = cleanNotes.length ? cleanNotes.join(", ") : null;

  if (unit && ["pincee", "gout", "filet", "poignee"].includes(unit)) fuzzy = true;
  if (quantity === null && unit === null) fuzzy = true;
  if (unit === null && quantity !== null) unit = "piece";
  if (quantity === null && unit !== null && !fuzzy) quantity = rat(1);

  return { raw, quantity: fuzzy ? null : quantity, unit: fuzzy ? (unit ?? "gout") : unit, name, note, optional, fuzzy };
}

/** « sel, poivre » / « sel et poivre » → plusieurs lignes floues. */
export function splitCompoundLine(line: string): string[] {
  const f = foldText(line);
  if (/^\s*[a-z ]+(,| et )\s*[a-z ]+$/.test(f) && !/\d/.test(f) && f.split(/,| et /).every((p) => p.trim().split(" ").length <= 2)) {
    return line.split(/,|\set\s/).map((p) => p.trim()).filter(Boolean);
  }
  return [line];
}
