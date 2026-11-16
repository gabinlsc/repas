"use client";
import { DIETS, EU_ALLERGENS, type Allergen, type Diet } from "@mise/domain";
import { Button, Card, Field, Input, Select } from "@mise/ui";

export interface MemberDraft {
  id?: string;
  name: string;
  portionFactor: string;
  presentDays: number[];
  sensitive: { allergens: Allergen[]; diets: Diet[]; aversions: string[]; kcalTarget: number | null };
}

const ALLERGEN_FR: Record<Allergen, string> = {
  gluten: "Gluten", crustaces: "Crustacés", oeufs: "Œufs", poissons: "Poissons", arachides: "Arachides", soja: "Soja", lait: "Lait",
  fruits_a_coque: "Fruits à coque", celeri: "Céleri", moutarde: "Moutarde", sesame: "Sésame", sulfites: "Sulfites", lupin: "Lupin", mollusques: "Mollusques",
};
const DIET_FR: Record<Diet, string> = { vegetarian: "Végétarien", vegan: "Végan", pescatarian: "Pescétarien", gluten_free: "Sans gluten", lactose_free: "Sans lactose", pork_free: "Sans porc", alcohol_free: "Sans alcool" };
const DAYS = ["L", "M", "M", "J", "V", "S", "D"];

export const emptyMember = (name = ""): MemberDraft => ({ name, portionFactor: "1", presentDays: [0, 1, 2, 3, 4, 5, 6], sensitive: { allergens: [], diets: [], aversions: [], kcalTarget: null } });

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function MemberEditor({ value, onChange, onRemove, index }: { value: MemberDraft; onChange: (m: MemberDraft) => void; onRemove?: () => void; index: number }) {
  const p = `m${index}`;
  return (
    <Card className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Prénom" htmlFor={`${p}-name`}>
          <Input id={`${p}-name`} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
        </Field>
        <Field label="Portion" htmlFor={`${p}-portion`} hint="1 = adulte, 0,5 = jeune enfant">
          <Select id={`${p}-portion`} value={value.portionFactor} onChange={(e) => onChange({ ...value, portionFactor: e.target.value })}>
            {["0.5", "0.75", "1", "1.25", "1.5"].map((v) => <option key={v} value={v}>{v.replace(".", ",")}</option>)}
          </Select>
        </Field>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Allergies (exclues strictement)</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {EU_ALLERGENS.map((a) => (
            <label key={a} className="flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1 text-sm">
              <input type="checkbox" checked={value.sensitive.allergens.includes(a)} onChange={() => onChange({ ...value, sensitive: { ...value.sensitive, allergens: toggle(value.sensitive.allergens, a) } })} />
              {ALLERGEN_FR[a]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium">Régime</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {DIETS.map((d) => (
            <label key={d} className="flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1 text-sm">
              <input type="checkbox" checked={value.sensitive.diets.includes(d)} onChange={() => onChange({ ...value, sensitive: { ...value.sensitive, diets: toggle(value.sensitive.diets, d) } })} />
              {DIET_FR[d]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium">Présent aux repas</legend>
        <div className="mt-2 flex gap-1">
          {DAYS.map((d, i) => (
            <label key={i} className="flex flex-col items-center text-xs">
              <input type="checkbox" aria-label={`Jour ${i + 1}`} checked={value.presentDays.includes(i)} onChange={() => onChange({ ...value, presentDays: toggle(value.presentDays, i).sort() })} />
              {d}
            </label>
          ))}
        </div>
      </fieldset>
      {onRemove ? <Button variant="ghost" size="sm" className="self-start" onClick={onRemove}>Retirer ce membre</Button> : null}
    </Card>
  );
}
