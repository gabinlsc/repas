"use client";
import { useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { DIETS, EU_ALLERGENS, type Allergen, type Diet } from "@mise/domain";
import { Avatar, Chip, IconButton, Input, Segmented, cn } from "@mise/ui";

export interface MemberDraft {
  id?: string;
  name: string;
  portionFactor: string;
  presentDays: number[];
  sensitive: { allergens: Allergen[]; diets: Diet[]; aversions: string[]; kcalTarget: number | null };
}

export const ALLERGEN_FR: Record<Allergen, string> = {
  gluten: "Gluten", crustaces: "Crustacés", oeufs: "Œufs", poissons: "Poissons", arachides: "Arachides", soja: "Soja", lait: "Lait",
  fruits_a_coque: "Fruits à coque", celeri: "Céleri", moutarde: "Moutarde", sesame: "Sésame", sulfites: "Sulfites", lupin: "Lupin", mollusques: "Mollusques",
};
export const DIET_FR: Record<Diet, string> = { vegetarian: "Végétarien", vegan: "Végan", pescatarian: "Pescétarien", gluten_free: "Sans gluten", lactose_free: "Sans lactose", pork_free: "Sans porc", alcohol_free: "Sans alcool" };
const DAYS = ["L", "M", "M", "J", "V", "S", "D"];
const PORTIONS = [
  { value: "0.5", label: "Enfant" },
  { value: "0.75", label: "Petit appétit" },
  { value: "1", label: "Adulte" },
  { value: "1.5", label: "Gros appétit" },
];

export const emptyMember = (name = ""): MemberDraft => ({ name, portionFactor: "1", presentDays: [0, 1, 2, 3, 4, 5, 6], sensitive: { allergens: [], diets: [], aversions: [], kcalTarget: null } });

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function MemberEditor({ value, onChange, onRemove, index }: { value: MemberDraft; onChange: (m: MemberDraft) => void; onRemove?: () => void; index: number }) {
  const [open, setOpen] = useState(value.sensitive.allergens.length > 0 || value.sensitive.diets.length > 0);
  const p = `m${index}`;
  const portion = PORTIONS.some((x) => Number(x.value) === Number(value.portionFactor)) ? String(Number(value.portionFactor)) : "1";
  const constraints = [...value.sensitive.diets.map((d) => DIET_FR[d]), ...value.sensitive.allergens.map((a) => `sans ${ALLERGEN_FR[a].toLowerCase()}`)];
  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] md:p-5">
      <div className="flex items-center gap-3">
        <Avatar name={value.name || "?"} />
        <label htmlFor={`${p}-name`} className="sr-only">Prénom</label>
        <Input id={`${p}-name`} value={value.name} placeholder="Prénom" onChange={(e) => onChange({ ...value, name: e.target.value })} className="h-11 flex-1" />
        {onRemove ? <IconButton label={`Retirer ${value.name || "ce membre"}`} onClick={onRemove}><Trash2 className="h-5 w-5" /></IconButton> : null}
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Appétit</span>
        <div className="overflow-x-auto scrollbar-none">
          <Segmented label={`Appétit de ${value.name || "ce membre"}`} value={portion} onChange={(v) => onChange({ ...value, portionFactor: v })} options={PORTIONS} />
        </div>
      </div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex items-center justify-between rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-4 py-3 text-left">
        <span>
          <span className="block font-semibold">Régime et allergies</span>
          <span className="block text-sm text-[var(--text-muted)]">{constraints.length ? constraints.join(" · ") : "Aucune restriction"}</span>
        </span>
        <ChevronDown className={cn("h-5 w-5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="flex flex-col gap-4">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Régime</legend>
            <div className="flex flex-wrap gap-2">
              {DIETS.map((d) => <Chip key={d} selected={value.sensitive.diets.includes(d)} onToggle={() => onChange({ ...value, sensitive: { ...value.sensitive, diets: toggle(value.sensitive.diets, d) } })}>{DIET_FR[d]}</Chip>)}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">Allergies</legend>
            <p className="mb-2 text-xs text-[var(--text-muted)]">Exclues strictement : aucune recette contenant ces allergènes ne sera proposée.</p>
            <div className="flex flex-wrap gap-2">
              {EU_ALLERGENS.map((a) => <Chip key={a} selected={value.sensitive.allergens.includes(a)} onToggle={() => onChange({ ...value, sensitive: { ...value.sensitive, allergens: toggle(value.sensitive.allergens, a) } })}>{ALLERGEN_FR[a]}</Chip>)}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Présent aux repas</legend>
            <div className="flex gap-1.5">
              {DAYS.map((d, i) => (
                <button key={i} type="button" aria-pressed={value.presentDays.includes(i)} aria-label={["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"][i]} onClick={() => onChange({ ...value, presentDays: toggle(value.presentDays, i).sort() })} className={cn("h-10 w-10 rounded-full text-sm font-bold", value.presentDays.includes(i) ? "bg-[var(--primary)] text-[var(--primary-text)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]")}>
                  {d}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}
