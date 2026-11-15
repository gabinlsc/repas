import {
  buildIngredientIndex, DIETS, EQUIPMENT, matchIngredient, MEAL_SLOTS, parseIngredientLine, splitCompoundLine, toBase,
  type Diet, type Equipment, type Ingredient, type MealSlot, type ParsedIngredientLine,
} from "@mise/domain";

export interface SeedRecipeLine extends ParsedIngredientLine {
  readonly ingredientId: string;
}

export interface SeedRecipe {
  readonly title: string;
  readonly slug: string;
  readonly servings: number;
  readonly prep: number;
  readonly cook: number;
  readonly slots: MealSlot[];
  readonly cuisine: string;
  readonly equipment: Equipment[];
  readonly tags: string[];
  readonly leftoverDays: number;
  readonly freezes: boolean;
  readonly difficulty: number;
  readonly lines: SeedRecipeLine[];
  readonly steps: string[];
}

export class SeedError extends Error {}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/œ/g, "oe")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const HEADER = /^p(\d+) t(\d+)\+(\d+) \[([a-z,]+)\] \(([^)]+)\) \{([a-z_,]*)\}((?: #[\w-]+)*) r(\d) f([01]) d([123])$/;

/**
 * Lit le format compact des recettes de départ. Chaque ingrédient doit se rapprocher
 * sans ambiguïté du catalogue (ou porter « {id} ») : un seed qui associerait mal un
 * ingrédient pourrait masquer un allergène, donc toute ambiguïté est une erreur.
 */
export function parseSeedRecipes(text: string, catalog: readonly Ingredient[]): SeedRecipe[] {
  const index = buildIngredientIndex(catalog);
  const byId = new Map(catalog.map((i) => [i.id, i]));
  const body = text.split("\n").filter((l) => !l.startsWith("//")).join("\n");
  const blocks = body.split(/\n(?=# )/).map((b) => b.trim()).filter((b) => b.startsWith("# "));
  return blocks.flatMap((block) => {
    const lines = block.split("\n");
    const title = lines[0]!.slice(2).trim();
    const header = HEADER.exec(lines[1] ?? "");
    if (!header) throw new SeedError(`En-tête invalide pour « ${title} » : ${lines[1]}`);
    const [, servings, prep, cook, slots, cuisine, equipment, tags, r, f, d] = header;
    const slotList = slots!.split(",") as MealSlot[];
    for (const s of slotList) if (!MEAL_SLOTS.includes(s)) throw new SeedError(`Créneau inconnu ${s} (${title})`);
    const eq = equipment ? (equipment.split(",") as Equipment[]) : [];
    for (const e of eq) if (!EQUIPMENT.includes(e)) throw new SeedError(`Matériel inconnu ${e} (${title})`);
    const parsed: SeedRecipeLine[] = [];
    for (const raw of lines.filter((l) => l.startsWith("- "))) {
      const forced = /\{([a-z0-9_]+)\}\s*$/.exec(raw);
      const clean = raw.slice(2).replace(/\{[a-z0-9_]+\}\s*$/, "").trim();
      for (const part of forced ? [clean] : splitCompoundLine(clean)) {
        const p = parseIngredientLine(part);
        let id = forced?.[1];
        if (!id) {
          const m = matchIngredient(p.name, index);
          if (m.status !== "matched") {
            throw new SeedError(`Ingrédient non résolu « ${p.name} » dans « ${title} » (${m.status} : ${m.candidates.map((c) => `${c.ingredientId}=${c.score}`).join(", ")})`);
          }
          id = m.ingredientId;
        }
        const ing = byId.get(id);
        if (!ing) throw new SeedError(`Ingrédient inconnu {${id}} dans « ${title} »`);
        if (!p.fuzzy && p.quantity && p.unit) {
          try {
            toBase(p.quantity, p.unit, ing);
          } catch (e) {
            throw new SeedError(`Conversion impossible « ${part} » dans « ${title} » : ${(e as Error).message}`);
          }
        }
        parsed.push({ ...p, ingredientId: id });
      }
    }
    const steps = lines.filter((l) => l.startsWith("> ")).map((l) => l.slice(2).trim());
    if (parsed.length === 0 || steps.length === 0) throw new SeedError(`Recette incomplète « ${title} »`);
    return [
      {
        title,
        slug: slugify(title),
        servings: Number(servings),
        prep: Number(prep),
        cook: Number(cook),
        slots: slotList,
        cuisine: cuisine!,
        equipment: eq,
        tags: (tags ?? "").trim().split(/\s+/).filter(Boolean).map((t) => t.slice(1)),
        leftoverDays: Number(r),
        freezes: f === "1",
        difficulty: Number(d),
        lines: parsed,
        steps,
      },
    ];
  });
}

export const isDiet = (s: string): s is Diet => (DIETS as readonly string[]).includes(s);
