"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Leaf, LogOut, PiggyBank, Plus, Refrigerator, Repeat, Shapes, Sun, Trash2, Heart, Salad } from "lucide-react";
import { MEAL_SLOTS, type Allergen, type Diet, type MealSlot } from "@mise/domain";
import { Button, Chip, Dialog, Field, Input, Segmented, Skeleton, Slider, Switch, useToast } from "@mise/ui";
import { PageHeader } from "@/components/AppShell";
import { MemberEditor, emptyMember, type MemberDraft } from "@/components/MemberEditor";
import { formatMoney } from "@/lib/i18n";
import { useTRPC, useTRPCClient } from "@/lib/trpc";

type WKey = "cost" | "diversity" | "pantry" | "seasonality" | "distinct_ingredients" | "nutrition" | "preferences";
const WEIGHTS: Array<{ key: WKey; label: string; description: string; icon: ReactNode }> = [
  { key: "cost", label: "Économiser", description: "Privilégier les recettes et ingrédients bon marché.", icon: <PiggyBank className="h-4 w-4" /> },
  { key: "diversity", label: "Varier", description: "Changer de protéines, de cuisines et de plats d'une semaine à l'autre.", icon: <Shapes className="h-4 w-4" /> },
  { key: "pantry", label: "Vider le frigo", description: "Utiliser d'abord ce que tu as, surtout ce qui périme.", icon: <Refrigerator className="h-4 w-4" /> },
  { key: "seasonality", label: "Manger de saison", description: "Fruits et légumes de saison en France.", icon: <Leaf className="h-4 w-4" /> },
  { key: "distinct_ingredients", label: "Liste courte", description: "Mutualiser les ingrédients entre les repas.", icon: <Salad className="h-4 w-4" /> },
  { key: "nutrition", label: "Équilibre", description: "Coller aux besoins énergétiques du foyer.", icon: <Sun className="h-4 w-4" /> },
  { key: "preferences", label: "Mes goûts", description: "Favoris et recettes bien notées plus souvent.", icon: <Heart className="h-4 w-4" /> },
];
const SLOT_LABEL: Record<MealSlot, string> = { breakfast: "☀️ Petit-déj", lunch: "🥗 Déjeuner", snack: "🍪 Goûter", dinner: "🌙 Dîner" };
const TIMES = [15, 20, 30, 45, 60, 90];

function Section({ title, description, children, id }: { title: string; description?: string; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="grid gap-4 border-t border-[var(--border)] pt-8 md:grid-cols-[16rem_1fr] md:gap-10">
      <div>
        <h2 id={id} className="font-display text-xl font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p> : null}
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const h = useQuery(trpc.household.get.queryOptions());
  const storesQ = useQuery(trpc.stores.list.queryOptions());
  const [weights, setWeights] = useState<Record<WKey, number> | null>(null);
  const [members, setMembers] = useState<MemberDraft[]>([]);
  const [budget, setBudget] = useState(0);
  const [slots, setSlots] = useState<MealSlot[]>([]);
  const [weekday, setWeekday] = useState(30);
  const [weekend, setWeekend] = useState(60);
  const [repeat, setRepeat] = useState("7");
  const [batch, setBatch] = useState(false);
  const [store, setStore] = useState<string | null>(null);
  const [del, setDel] = useState(false);
  const [pwd, setPwd] = useState("");
  const [theme, setTheme] = useState<"auto" | "light" | "dark">("auto");

  useEffect(() => {
    if (!h.data) return;
    const hh = h.data.household;
    setWeights(hh.weights as Record<WKey, number>);
    setBudget(hh.weeklyBudgetCents !== null ? Math.round(hh.weeklyBudgetCents / 100) : 0);
    setSlots(hh.mealSlots as MealSlot[]);
    setWeekday(hh.maxPrepMinutes[0] ?? 30);
    setWeekend(hh.maxPrepMinutes[5] ?? 60);
    setRepeat(String(hh.repeatWindowDays));
    setBatch(hh.batchCooking);
    setStore(hh.defaultStoreId);
    setMembers(h.data.members.map((m) => ({ id: m.id, name: m.name, portionFactor: m.portionFactor, presentDays: m.presentDays, sensitive: { ...m.sensitive, allergens: m.sensitive.allergens as Allergen[], diets: m.sensitive.diets as Diet[] } })));
  }, [h.data]);
  useEffect(() => {
    try {
      const v = localStorage.getItem("theme");
      if (v === "light" || v === "dark") setTheme(v);
    } catch {
      /* stockage indisponible : thème automatique */
    }
  }, []);

  const applyTheme = (v: "auto" | "light" | "dark") => {
    setTheme(v);
    if (v === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", v);
    try {
      localStorage.setItem("theme", v);
    } catch {
      /* ignoré */
    }
  };
  const saved = () => {
    toast.show("Réglages enregistrés — ils s'appliqueront à la prochaine proposition");
    void qc.invalidateQueries({ queryKey: trpc.household.get.queryKey() });
  };
  const update = useMutation(trpc.household.update.mutationOptions({ onSuccess: saved, onError: (e) => toast.show(e.message, { tone: "error" }) }));
  const saveMembers = useMutation(trpc.household.completeOnboarding.mutationOptions({ onSuccess: saved, onError: (e) => toast.show(e.message, { tone: "error" }) }));
  const logout = useMutation(trpc.auth.logout.mutationOptions({ onSuccess: () => router.replace("/connexion") }));
  const remove = useMutation(trpc.account.delete.mutationOptions({ onSuccess: () => router.replace("/inscription") }));

  if (h.isLoading || !weights) return <Skeleton className="h-[40rem]" />;
  const exportData = async () => {
    const data = await client.account.export.query();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "mise-mes-donnees.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const saveMeals = () =>
    update.mutate({ mealSlots: slots, maxPrepMinutes: [weekday, weekday, weekday, weekday, weekday, weekend, weekend], repeatWindowDays: Number(repeat), batchCooking: batch, weeklyBudgetCents: budget > 0 ? budget * 100 : null, defaultStoreId: store });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Réglages" subtitle="Ton foyer, tes repas et la façon dont la semaine est composée." />

      <Section id="s-meals" title="Repas et budget" description="Ce que l'on planifie et combien tu veux dépenser.">
        <fieldset>
          <legend className="mb-2 font-semibold">Repas planifiés</legend>
          <div className="flex flex-wrap gap-2">{MEAL_SLOTS.map((s) => <Chip key={s} selected={slots.includes(s)} onToggle={() => setSlots(slots.includes(s) ? slots.filter((x) => x !== s) : [...slots, s])}>{SLOT_LABEL[s]}</Chip>)}</div>
        </fieldset>
        {[["Temps max en semaine", weekday, setWeekday], ["Temps max le week-end", weekend, setWeekend]].map(([label, v, set]) => (
          <fieldset key={label as string}>
            <legend className="mb-2 font-semibold">{label as string}</legend>
            <div className="flex flex-wrap gap-2">{TIMES.map((t) => <Chip key={t} selected={v === t} onToggle={() => (set as (n: number) => void)(t)}>{t} min</Chip>)}</div>
          </fieldset>
        ))}
        <div className="flex flex-col gap-2">
          <label htmlFor="budget" className="font-semibold">Budget par semaine : <span className="text-[var(--primary)]">{budget > 0 ? formatMoney(budget * 100) : "sans limite"}</span></label>
          <input id="budget" type="range" min={0} max={400} step={5} value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="accent-[var(--primary)]" />
        </div>
        <fieldset>
          <legend className="mb-2 flex items-center gap-2 font-semibold"><Repeat className="h-4 w-4" aria-hidden />Ne pas reproposer une recette avant</legend>
          <Segmented label="Fenêtre sans répétition" value={repeat} onChange={setRepeat} options={[{ value: "3", label: "3 jours" }, { value: "7", label: "1 semaine" }, { value: "14", label: "2 semaines" }]} />
        </fieldset>
        <Switch checked={batch} onChange={setBatch} label="Cuisiner en double (restes)" description="Un plat cuisiné en double revient le lendemain : gain de temps, moins de variété." />
        <fieldset>
          <legend className="mb-2 font-semibold">Magasin habituel</legend>
          <div className="flex flex-wrap gap-2">
            <Chip selected={store === null} onToggle={() => setStore(null)}>Ordre par défaut</Chip>
            {storesQ.data?.map((s) => <Chip key={s.id} selected={store === s.id} onToggle={() => setStore(s.id)}>{s.name.replace(" (parcours type)", "")}</Chip>)}
          </div>
        </fieldset>
        <Button className="self-start" loading={update.isPending} onClick={saveMeals} disabled={slots.length === 0}>Enregistrer</Button>
      </Section>

      <Section id="s-weights" title="Priorités" description="Comment arbitrer quand tout n'est pas possible à la fois.">
        <div className="grid gap-6 lg:grid-cols-2">
          {WEIGHTS.map((w) => <Slider key={w.key} id={`w-${w.key}`} label={w.label} description={w.description} icon={w.icon} value={weights[w.key]} onChange={(v) => setWeights({ ...weights, [w.key]: v })} />)}
        </div>
        <Button className="self-start" loading={update.isPending} onClick={() => update.mutate({ weights })}>Enregistrer les priorités</Button>
      </Section>

      <Section id="s-members" title="Mon foyer" description="Portions, régimes et allergies de chacun (données chiffrées).">
        {members.map((m, i) => <MemberEditor key={m.id ?? `n${i}`} index={i} value={m} onChange={(v) => setMembers(members.map((x, j) => (j === i ? v : x)))} onRemove={i > 0 ? () => setMembers(members.filter((_, j) => j !== i)) : undefined} />)}
        <div className="flex flex-wrap gap-2">
          {members.length < 8 ? <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setMembers([...members, emptyMember()])}>Ajouter un membre</Button> : null}
          <Button loading={saveMembers.isPending} onClick={() => saveMembers.mutate({ settings: {}, members: members.map((m, i) => ({ ...m, name: m.name.trim() || `Membre ${i + 1}` })) })}>Enregistrer le foyer</Button>
        </div>
      </Section>

      <Section id="s-look" title="Apparence">
        <Segmented label="Thème" value={theme} onChange={applyTheme} options={[{ value: "auto", label: "Automatique" }, { value: "light", label: "Clair" }, { value: "dark", label: "Sombre" }]} />
      </Section>

      <Section id="s-account" title="Compte et données" description="Tes données t'appartiennent : export complet et suppression définitive.">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => void exportData()}>Exporter mes données</Button>
          <Button variant="secondary" icon={<LogOut className="h-4 w-4" />} onClick={() => logout.mutate()}>Se déconnecter</Button>
          <Button variant="ghost" className="text-[var(--danger)]" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDel(true)}>Supprimer mon compte</Button>
        </div>
      </Section>

      <Dialog open={del} onClose={() => setDel(false)} title="Supprimer mon compte">
        <p>Toutes tes données (foyer, plans, stock, recettes personnelles) seront supprimées définitivement.</p>
        <Field label="Mot de passe" htmlFor="delpwd"><Input id="delpwd" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} /></Field>
        {remove.error ? <p role="alert" className="text-sm text-[var(--danger)]">{remove.error.message}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDel(false)}>Annuler</Button>
          <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate({ password: pwd, confirm: "SUPPRIMER" })}>Supprimer définitivement</Button>
        </div>
      </Dialog>
    </div>
  );
}
