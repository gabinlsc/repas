"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EQUIPMENT, MEAL_SLOTS, type Allergen, type Diet, type Equipment, type MealSlot } from "@mise/domain";
import { Button, Card, Field, Input, Select, Skeleton } from "@mise/ui";
import { emptyMember, MemberEditor, type MemberDraft } from "@/components/MemberEditor";
import { mondayOf, translator } from "@/lib/i18n";
import { useTRPC } from "@/lib/trpc";

const t = translator();
const EQUIP_FR: Record<Equipment, string> = { four: "Four", plaques: "Plaques", micro_ondes: "Micro-ondes", mixeur: "Mixeur", robot: "Robot", cocotte_minute: "Cocotte-minute", poele: "Poêle", wok: "Wok", barbecue: "Barbecue", friteuse_air: "Friteuse à air", mijoteuse: "Mijoteuse", gaufrier: "Gaufrier", appareil_raclette: "Appareil à raclette" };

export default function Onboarding() {
  const trpc = useTRPC();
  const router = useRouter();
  const qc = useQueryClient();
  const h = useQuery(trpc.household.get.queryOptions());
  const storesQ = useQuery(trpc.stores.list.queryOptions());
  const [budget, setBudget] = useState("80");
  const [slots, setSlots] = useState<MealSlot[]>(["lunch", "dinner"]);
  const [weekday, setWeekday] = useState("30");
  const [weekend, setWeekend] = useState("60");
  const [equipment, setEquipment] = useState<Equipment[]>(["plaques", "four", "poele"]);
  const [store, setStore] = useState<string>("");
  const [members, setMembers] = useState<MemberDraft[]>([]);
  useEffect(() => {
    if (h.data && members.length === 0) {
      setMembers(h.data.members.map((m) => ({ id: m.id, name: m.name, portionFactor: m.portionFactor, presentDays: m.presentDays, sensitive: { ...m.sensitive, allergens: m.sensitive.allergens as Allergen[], diets: m.sensitive.diets as Diet[] } })));
    }
  }, [h.data, members.length]);
  const generate = useMutation(trpc.plan.generate.mutationOptions({ onSuccess: () => router.replace("/semaine") }));
  const save = useMutation(trpc.household.completeOnboarding.mutationOptions({ onSuccess: async () => {
    // Le cache « foyer non configuré » renverrait sinon vers l'onboarding.
    await qc.invalidateQueries({ queryKey: trpc.household.get.queryKey() });
    generate.mutate({ weekStart: mondayOf() });
  } }));

  if (h.isLoading) return <Skeleton className="m-6 h-96" />;
  const submit = () => {
    const wd = Number(weekday);
    const we = Number(weekend);
    save.mutate({
      settings: {
        weeklyBudgetCents: budget ? Math.round(Number(budget.replace(",", ".")) * 100) : null,
        mealSlots: slots,
        maxPrepMinutes: [wd, wd, wd, wd, wd, we, we],
        equipment,
        defaultStoreId: store || null,
        repeatWindowDays: 7,
      },
      members: members.map((m) => ({ ...m, name: m.name || "Membre" })),
    });
  };
  return (
    <main id="main" className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold">{t("onboarding.title")}</h1>
      <Card className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Budget courses par semaine (€)" htmlFor="budget">
          <Input id="budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </Field>
        <Field label="Magasin habituel" htmlFor="store">
          <Select id="store" value={store} onChange={(e) => setStore(e.target.value)}>
            <option value="">Ordre de rayons par défaut</option>
            {storesQ.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Temps de cuisine max en semaine (min)" htmlFor="wd">
          <Input id="wd" inputMode="numeric" value={weekday} onChange={(e) => setWeekday(e.target.value)} />
        </Field>
        <Field label="Temps de cuisine max le week-end (min)" htmlFor="we">
          <Input id="we" inputMode="numeric" value={weekend} onChange={(e) => setWeekend(e.target.value)} />
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium">Repas à planifier chaque jour</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {MEAL_SLOTS.map((s) => (
              <label key={s} className="flex items-center gap-2">
                <input type="checkbox" checked={slots.includes(s)} onChange={() => setSlots(slots.includes(s) ? slots.filter((x) => x !== s) : [...slots, s])} />
                {t(`slot.${s}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium">Matériel disponible</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {EQUIPMENT.map((e) => (
              <label key={e} className="flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1 text-sm">
                <input type="checkbox" checked={equipment.includes(e)} onChange={() => setEquipment(equipment.includes(e) ? equipment.filter((x) => x !== e) : [...equipment, e])} />
                {EQUIP_FR[e]}
              </label>
            ))}
          </div>
        </fieldset>
      </Card>
      <section className="flex flex-col gap-3" aria-labelledby="members-h">
        <h2 id="members-h" className="text-lg font-semibold">Membres du foyer ({members.length}/8)</h2>
        {members.map((m, i) => (
          <MemberEditor key={m.id ?? i} index={i} value={m} onChange={(v) => setMembers(members.map((x, j) => (j === i ? v : x)))} onRemove={i > 0 ? () => setMembers(members.filter((_, j) => j !== i)) : undefined} />
        ))}
        {members.length < 8 ? <Button variant="secondary" onClick={() => setMembers([...members, emptyMember()])}>+ Ajouter un membre</Button> : null}
      </section>
      {save.error || generate.error ? <p role="alert" className="text-[var(--danger)]">{(save.error ?? generate.error)!.message}</p> : null}
      <Button size="lg" onClick={submit} loading={save.isPending || generate.isPending} disabled={slots.length === 0}>{t("onboarding.finish")}</Button>
    </main>
  );
}
