"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Plus, Sparkles } from "lucide-react";
import { EQUIPMENT, MEAL_SLOTS, type Allergen, type Diet, type Equipment, type MealSlot } from "@mise/domain";
import { Button, Chip, Progress, Skeleton, Switch, cn } from "@mise/ui";
import { Logo } from "@/components/AppShell";
import { emptyMember, MemberEditor, type MemberDraft } from "@/components/MemberEditor";
import { formatMoney, mondayOf } from "@/lib/i18n";
import { useTRPC } from "@/lib/trpc";

const EQUIP_FR: Record<Equipment, string> = { four: "Four", plaques: "Plaques", micro_ondes: "Micro-ondes", mixeur: "Mixeur", robot: "Robot", cocotte_minute: "Cocotte-minute", poele: "Poêle", wok: "Wok", barbecue: "Barbecue", friteuse_air: "Air fryer", mijoteuse: "Mijoteuse", gaufrier: "Gaufrier", appareil_raclette: "Raclette" };
const SLOT_UI: Record<MealSlot, { emoji: string; label: string; hint: string }> = {
  breakfast: { emoji: "☀️", label: "Petit-déjeuner", hint: "Porridge, tartines, œufs…" },
  lunch: { emoji: "🥗", label: "Déjeuner", hint: "À la maison ou en boîte" },
  dinner: { emoji: "🍽️", label: "Dîner", hint: "Le repas du soir" },
  snack: { emoji: "🍪", label: "Goûter", hint: "Collations et desserts" },
};
const TIMES = [15, 20, 30, 45, 60, 90];
const STEPS = ["Qui mange ?", "Quels repas ?", "Quel budget ?", "Ta cuisine"];
/** Coût moyen observé d'une portion maison (prix indicatifs) : base de la suggestion de budget. */
const EUROS_PER_SERVING = { breakfast: 1.3, lunch: 3.2, dinner: 3.4, snack: 1.0 } as const;

export default function Onboarding() {
  const trpc = useTRPC();
  const router = useRouter();
  const qc = useQueryClient();
  const h = useQuery(trpc.household.get.queryOptions());
  const storesQ = useQuery(trpc.stores.list.queryOptions());
  const [step, setStep] = useState(0);
  const [members, setMembers] = useState<MemberDraft[]>([]);
  const [slots, setSlots] = useState<MealSlot[]>(["lunch", "dinner"]);
  const [weekday, setWeekday] = useState(30);
  const [weekend, setWeekend] = useState(60);
  const [budget, setBudget] = useState<number | null>(null);
  const [store, setStore] = useState<string>("");
  const [equipment, setEquipment] = useState<Equipment[]>(["plaques", "four", "poele", "mixeur"]);
  const [batch, setBatch] = useState(false);

  useEffect(() => {
    if (h.data && members.length === 0) {
      setMembers(h.data.members.map((m) => ({ id: m.id, name: m.name, portionFactor: m.portionFactor, presentDays: m.presentDays, sensitive: { ...m.sensitive, allergens: m.sensitive.allergens as Allergen[], diets: m.sensitive.diets as Diet[] } })));
    }
  }, [h.data, members.length]);

  const people = members.reduce((s, m) => s + Number(m.portionFactor), 0) || 1;
  // Petit foyer : les conditionnements ne se partagent pas, la portion revient plus cher.
  const suggested = useMemo(() => Math.max(20, Math.round((slots.reduce((s, x) => s + EUROS_PER_SERVING[x], 0) * 7 * people * (people < 2 ? 1.3 : 1)) / 5) * 5), [slots, people]);
  const value = budget ?? suggested;

  const generate = useMutation(trpc.plan.generate.mutationOptions({ onSuccess: () => router.replace("/semaine") }));
  const save = useMutation(
    trpc.household.completeOnboarding.mutationOptions({
      onSuccess: async () => {
        await qc.invalidateQueries({ queryKey: trpc.household.get.queryKey() });
        generate.mutate({ weekStart: mondayOf() });
      },
    }),
  );
  const finish = () =>
    save.mutate({
      settings: { weeklyBudgetCents: value * 100, mealSlots: slots, maxPrepMinutes: [weekday, weekday, weekday, weekday, weekday, weekend, weekend], equipment, defaultStoreId: store || null, repeatWindowDays: 7, batchCooking: batch },
      members: members.map((m, i) => ({ ...m, name: m.name.trim() || `Membre ${i + 1}` })),
    });

  if (h.isLoading) return <div className="mx-auto max-w-2xl p-6"><Skeleton className="h-96" /></div>;
  const canNext = step !== 1 || slots.length > 0;

  return (
    <div className="min-h-dvh bg-[var(--bg)]">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-5 pt-6"><Logo /><span className="text-sm font-semibold text-[var(--text-muted)]">Étape {step + 1} sur {STEPS.length}</span></header>
      <main id="main" className="mx-auto flex max-w-2xl flex-col gap-6 px-5 pb-32 pt-6">
        <Progress value={step + 1} max={STEPS.length} label="Progression de la configuration" />
        <h1 className="font-display text-4xl font-semibold">{STEPS[step]}</h1>

        {step === 0 ? (
          <section className="flex flex-col gap-4" aria-label="Membres du foyer">
            <p className="text-[var(--text-muted)]">Les portions, régimes et allergies de chacun sont pris en compte à chaque repas. Les allergies sont chiffrées et ne quittent jamais ton serveur.</p>
            {members.map((m, i) => (
              <MemberEditor key={m.id ?? `n${i}`} index={i} value={m} onChange={(v) => setMembers(members.map((x, j) => (j === i ? v : x)))} onRemove={i > 0 ? () => setMembers(members.filter((_, j) => j !== i)) : undefined} />
            ))}
            {members.length < 8 ? <Button variant="secondary" icon={<Plus className="h-5 w-5" />} onClick={() => setMembers([...members, emptyMember()])}>Ajouter un membre</Button> : null}
          </section>
        ) : null}

        {step === 1 ? (
          <section className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3">
              {MEAL_SLOTS.map((s) => {
                const on = slots.includes(s);
                return (
                  <button key={s} type="button" aria-pressed={on} onClick={() => setSlots(on ? slots.filter((x) => x !== s) : [...slots, s])} className={cn("flex flex-col items-start gap-1 rounded-[var(--radius)] border-2 p-4 text-left transition-all", on ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]")}>
                    <span className="text-3xl" aria-hidden>{SLOT_UI[s].emoji}</span>
                    <span className="font-semibold">{SLOT_UI[s].label}</span>
                    <span className="text-sm text-[var(--text-muted)]">{SLOT_UI[s].hint}</span>
                  </button>
                );
              })}
            </div>
            {[["En semaine", weekday, setWeekday], ["Le week-end", weekend, setWeekend]].map(([label, v, set]) => (
              <fieldset key={label as string}>
                <legend className="mb-2 font-semibold">Temps de cuisine max {String(label).toLowerCase()}</legend>
                <div className="flex flex-wrap gap-2">{TIMES.map((t) => <Chip key={t} selected={v === t} onToggle={() => (set as (n: number) => void)(t)}>{t} min</Chip>)}</div>
              </fieldset>
            ))}
          </section>
        ) : null}

        {step === 2 ? (
          <section className="flex flex-col gap-6">
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 text-center shadow-[var(--shadow)]">
              <label htmlFor="budget" className="text-sm font-semibold text-[var(--text-muted)]">Budget courses par semaine</label>
              <p className="font-display text-6xl font-semibold tabular-nums text-[var(--primary)]">{formatMoney(value * 100).replace(",00", "")}</p>
              <input id="budget" type="range" min={20} max={400} step={5} value={value} onChange={(e) => setBudget(Number(e.target.value))} className="mt-4 w-full accent-[var(--primary)]" />
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                Pour {String(people).replace(".", ",")} personne(s) et {slots.length} repas par jour, on conseille environ <button type="button" className="font-semibold text-[var(--primary)] underline" onClick={() => setBudget(suggested)}>{formatMoney(suggested * 100).replace(",00", "")}</button>.
                {value < suggested * 0.8 ? <span className="mt-2 block font-medium text-[var(--warning)]">Budget serré : la semaine fera la part belle aux recettes économiques, sans garantie de tenir pile.</span> : null}
              </p>
            </div>
            <fieldset>
              <legend className="mb-2 font-semibold">Où fais-tu tes courses ?</legend>
              <p className="mb-3 text-sm text-[var(--text-muted)]">La liste suivra l&apos;ordre des rayons.</p>
              <div className="flex flex-wrap gap-2">
                <Chip selected={store === ""} onToggle={() => setStore("")}>Peu importe</Chip>
                {storesQ.data?.map((s) => <Chip key={s.id} selected={store === s.id} onToggle={() => setStore(s.id)}>{s.name.replace(" (parcours type)", "")}</Chip>)}
              </div>
            </fieldset>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="flex flex-col gap-6">
            <fieldset>
              <legend className="mb-2 font-semibold">Ton matériel</legend>
              <div className="flex flex-wrap gap-2">{EQUIPMENT.map((e) => <Chip key={e} selected={equipment.includes(e)} onToggle={() => setEquipment(equipment.includes(e) ? equipment.filter((x) => x !== e) : [...equipment, e])}>{EQUIP_FR[e]}</Chip>)}</div>
            </fieldset>
            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5">
              <Switch checked={batch} onChange={setBatch} label="Cuisiner en double pour avoir des restes" description="Pratique pour gagner du temps, mais le même plat revient le lendemain. Désactivé par défaut." />
            </div>
          </section>
        ) : null}

        {save.error || generate.error ? <p role="alert" className="rounded-[var(--radius-sm)] bg-[var(--danger-soft)] p-4 text-[var(--danger)]">{(save.error ?? generate.error)!.message}</p> : null}
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-[var(--border)] bg-[var(--bg-elevated)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 py-4">
          <Button variant="ghost" icon={<ArrowLeft className="h-5 w-5" />} onClick={() => setStep(step - 1)} disabled={step === 0}>Retour</Button>
          {step < STEPS.length - 1 ? (
            <Button size="lg" onClick={() => setStep(step + 1)} disabled={!canNext}>Continuer <ArrowRight className="h-5 w-5" aria-hidden /></Button>
          ) : (
            <Button size="lg" icon={<Sparkles className="h-5 w-5" />} onClick={finish} loading={save.isPending || generate.isPending}>Créer ma semaine</Button>
          )}
        </div>
      </footer>
    </div>
  );
}
