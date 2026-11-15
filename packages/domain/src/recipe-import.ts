import { foldText } from "./normalize.js";
import { parseIngredientLine, splitCompoundLine, type ParsedIngredientLine } from "./parser.js";

export interface ImportedRecipe {
  readonly title: string;
  readonly servings: number | null;
  readonly prepMinutes: number | null;
  readonly cookMinutes: number | null;
  readonly ingredients: readonly ParsedIngredientLine[];
  readonly steps: readonly string[];
  readonly sourceUrl: string | null;
  readonly sourceName: string | null;
  readonly imageUrl: string | null;
}

/** Durée ISO 8601 (PT1H20M) ou texte (« 1 h 20 », « 45 min ») → minutes. */
export function parseDurationMinutes(text: string | null | undefined): number | null {
  if (!text) return null;
  const iso = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(text.trim());
  if (iso && (iso[1] ?? iso[2] ?? iso[3]) !== undefined) {
    return Number(iso[1] ?? 0) * 1440 + Number(iso[2] ?? 0) * 60 + Number(iso[3] ?? 0);
  }
  const f = foldText(text);
  const h = /(\d+)\s*h/.exec(f);
  const m = /(\d+)\s*(min|mn|m\b)/.exec(f) ?? /h\s*(\d+)/.exec(f);
  if (!h && !m) {
    const n = /^(\d+)$/.exec(f);
    return n ? Number(n[1]) : null;
  }
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
}

function parseServings(v: unknown): number | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s === "number" && Number.isInteger(s) && s > 0) return s;
  if (typeof s === "string") {
    const m = /(\d+)/.exec(s);
    if (m) return Number(m[1]);
  }
  return null;
}

const parseLines = (lines: readonly string[]): ParsedIngredientLine[] =>
  lines.flatMap(splitCompoundLine).map(parseIngredientLine).filter((l) => l.name.length > 0);

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
const isObj = (v: Json | undefined): v is { [k: string]: Json } => typeof v === "object" && v !== null && !Array.isArray(v);

function isRecipeNode(n: { [k: string]: Json }): boolean {
  const t = n["@type"];
  return t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"));
}

function findRecipe(node: Json): { [k: string]: Json } | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n);
      if (r) return r;
    }
    return null;
  }
  if (!isObj(node)) return null;
  if (isRecipeNode(node)) return node;
  for (const key of ["@graph", "mainEntity", "itemListElement"]) {
    const r = node[key] !== undefined ? findRecipe(node[key]) : null;
    if (r) return r;
  }
  return null;
}

function text(v: Json | undefined): string | null {
  if (typeof v === "string") return decodeEntities(v).trim();
  if (Array.isArray(v)) return text(v[0]);
  if (isObj(v)) return text(v["name"] ?? v["text"] ?? v["url"]);
  return null;
}

function instructions(v: Json | undefined): string[] {
  if (typeof v === "string") return v.split(/\n+|(?<=\.)\s+(?=[A-ZÉÈÀ])/).map((s) => stripTags(s).trim()).filter(Boolean);
  if (Array.isArray(v)) return v.flatMap((x) => instructions(x));
  if (isObj(v)) {
    if (v["itemListElement"] !== undefined) return instructions(v["itemListElement"]);
    const t = text(v["text"] ?? v["name"]);
    return t ? [stripTags(t)] : [];
  }
  return [];
}

const ENTITIES: Readonly<Record<string, string>> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ", "&eacute;": "é", "&egrave;": "è", "&agrave;": "à", "&ccedil;": "ç", "&ocirc;": "ô", "&oelig;": "œ" };
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&[a-z]+;|&#39;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e);
}
const stripTags = (s: string): string => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/**
 * Extraction `schema.org/Recipe` depuis le JSON-LD d'une page. Fonction pure : le
 * téléchargement (avec timeout et limites de taille) est fait par l'appelant.
 */
export function extractRecipeFromHtml(html: string, sourceUrl: string | null = null): ImportedRecipe | null {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const s of scripts) {
    let data: Json;
    try {
      data = JSON.parse(s[1]!.trim()) as Json;
    } catch {
      continue; // JSON-LD invalide : on tente le bloc suivant puis le repli HTML
    }
    const r = findRecipe(data);
    if (!r) continue;
    const ingr = r["recipeIngredient"] ?? r["ingredients"];
    const lines = Array.isArray(ingr) ? ingr.map((x) => text(x) ?? "").filter(Boolean) : [];
    return {
      title: text(r["name"]) ?? "Recette importée",
      servings: parseServings(r["recipeYield"]),
      prepMinutes: parseDurationMinutes(text(r["prepTime"])),
      cookMinutes: parseDurationMinutes(text(r["cookTime"])),
      ingredients: parseLines(lines),
      steps: instructions(r["recipeInstructions"]),
      sourceUrl,
      sourceName: text(r["author"]) ?? (sourceUrl ? safeHost(sourceUrl) : null),
      imageUrl: text(r["image"]),
    };
  }
  return extractRecipeFromHtmlFallback(html, sourceUrl);
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Repli : microdonnées `itemprop` puis listes à puces après un titre « Ingrédients ». */
function extractRecipeFromHtmlFallback(html: string, sourceUrl: string | null): ImportedRecipe | null {
  const items = [...html.matchAll(/itemprop=["'](?:recipeIngredient|ingredients)["'][^>]*>([\s\S]*?)<\//gi)].map((m) => stripTags(m[1]!));
  let lines = items;
  if (lines.length === 0) {
    const sec = /<h[1-4][^>]*>[^<]*ingr[ée]dients?[^<]*<\/h[1-4]>([\s\S]*?)<\/(ul|ol)>/i.exec(html);
    if (sec) lines = [...sec[1]!.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => stripTags(m[1]!));
  }
  if (lines.length === 0) return null;
  const title = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) ?? /<title>([\s\S]*?)<\/title>/i.exec(html);
  const stepsSec = /<h[1-4][^>]*>[^<]*(pr[ée]paration|[ée]tapes|instructions)[^<]*<\/h[1-4]>([\s\S]*?)<\/(ol|ul)>/i.exec(html);
  return {
    title: title ? stripTags(title[1]!) : "Recette importée",
    servings: null,
    prepMinutes: null,
    cookMinutes: null,
    ingredients: parseLines(lines),
    steps: stepsSec ? [...stepsSec[2]!.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => stripTags(m[1]!)) : [],
    sourceUrl,
    sourceName: sourceUrl ? safeHost(sourceUrl) : null,
    imageUrl: null,
  };
}

/**
 * Texte collé (copie d'un livre, d'un message…). Heuristique par sections :
 * titre = première ligne, « Ingrédients » / « Préparation » délimitent les blocs,
 * « Pour 4 personnes », « Préparation : 15 min », « Cuisson : 30 min » sont reconnus.
 */
export function parseRecipeText(input: string): ImportedRecipe {
  const lines = input.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  let title = lines[0] ?? "Recette";
  let servings: number | null = null;
  let prep: number | null = null;
  let cook: number | null = null;
  const ingr: string[] = [];
  const steps: string[] = [];
  let section: "head" | "ingredients" | "steps" = "head";
  for (const [i, line] of lines.entries()) {
    const f = foldText(line);
    const sv = /pour\s+(\d+)\s*(personnes?|pers\.?|parts?|portions?)/.exec(f) ?? /^(?:portions|parts|personnes)\s*:?\s*(\d+)/.exec(f);
    if (sv) servings = Number(sv[1]);
    if (/^(temps de )?preparation\s*:\s*\d/.test(f)) {
      prep = parseDurationMinutes(f.split(":")[1]);
      continue;
    }
    if (/^(temps de )?cuisson\s*:\s*\d/.test(f)) {
      cook = parseDurationMinutes(f.split(":")[1]);
      continue;
    }
    if (/^ingredients?\s*:?$/.test(f) || /^ingredients? \(/.test(f)) {
      section = "ingredients";
      continue;
    }
    if (/^(preparation|etapes|instructions|recette)\s*:?$/.test(f)) {
      section = "steps";
      continue;
    }
    if (i === 0) {
      title = line.replace(/^#+\s*/, "");
      continue;
    }
    if (sv) continue;
    if (section === "ingredients") ingr.push(line);
    else if (section === "steps") steps.push(line.replace(/^(\d+[.)]|[-•*])\s*/, ""));
  }
  return { title, servings, prepMinutes: prep, cookMinutes: cook, ingredients: parseLines(ingr), steps, sourceUrl: null, sourceName: null, imageUrl: null };
}
