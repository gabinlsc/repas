"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Allergen, type Diet } from "@mise/domain";
import { Button, Card, Dialog, Field, Input, Skeleton, Slider, useToast } from "@mise/ui";
import { MemberEditor, emptyMember, type MemberDraft } from "@/components/MemberEditor";
import { translator } from "@/lib/i18n";
import { useTRPC, useTRPCClient } from "@/lib/trpc";

const t = translator();
const WEIGHT_FR = { cost: "Économiser", diversity: "Varier", pantry: "Vider le frigo", seasonality: "Saison", distinct_ingredients: "Moins d'ingrédients", nutrition: "Équilibre", preferences: "Mes goûts" } as const;
type WKey = keyof typeof WEIGHT_FR;

export default function SettingsPage() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const h = useQuery(trpc.household.get.queryOptions());
  const [weights, setWeights] = useState<Record<WKey, number> | null>(null);
  const [members, setMembers] = useState<MemberDraft[]>([]);
  const [budget, setBudget] = useState("");
  const [del, setDel] = useState(false);
  const [pwd, setPwd] = useState("");
  const [theme, setTheme] = useState<"auto" | "light" | "dark">("auto");
  useEffect(() => {
    if (!h.data) return;
    setWeights(h.data.household.weights as Record<WKey, number>);
    setBudget(h.data.household.weeklyBudgetCents !== null ? String(h.data.household.weeklyBudgetCents / 100) : "");
    setMembers(h.data.members.map((m) => ({ id: m.id, name: m.name, portionFactor: m.portionFactor, presentDays: m.presentDays, sensitive: { ...m.sensitive, allergens: m.sensitive.allergens as Allergen[], diets: m.sensitive.diets as Diet[] } })));
  }, [h.data]);
  useEffect(() => {
    try {
      const v = localStorage.getItem("theme");
      if (v === "light" || v === "dark") setTheme(v);
    } catch { /* stockage indisponible : thème automatique */ }
  }, []);
  const applyTheme = (v: "auto" | "light" | "dark") => {
    setTheme(v);
    if (v === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", v);
    try { localStorage.setItem("theme", v); } catch { /* ignoré */ }
  };
  const saved = () => { toast.show("Enregistré"); void qc.invalidateQueries({ queryKey: trpc.household.get.queryKey() }); };
  const update = useMutation(trpc.household.update.mutationOptions({ onSuccess: saved }));
  const saveMembers = useMutation(trpc.household.completeOnboarding.mutationOptions({ onSuccess: saved }));
  const logout = useMutation(trpc.auth.logout.mutationOptions({ onSuccess: () => router.replace("/connexion") }));
  const remove = useMutation(trpc.account.delete.mutationOptions({ onSuccess: () => router.replace("/inscription") }));
  if (h.isLoading || !weights) return <Skeleton className="h-96" />;
  const exportData = async () => {
    const data = await client.account.export.query();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "mise-export.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">{t("settings.weights")}</h2>
        {(Object.keys(WEIGHT_FR) as WKey[]).map((k) => <Slider key={k} id={`w-${k}`} label={WEIGHT_FR[k]} value={weights[k]} onChange={(v) => setWeights({ ...weights, [k]: v })} />)}
        <Field label="Budget hebdomadaire (€)" htmlFor="budget"><Input id="budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} /></Field>
        <Button className="self-start" loading={update.isPending} onClick={() => update.mutate({ weights, weeklyBudgetCents: budget ? Math.round(Number(budget.replace(",", ".")) * 100) : null })}>{t("common.save")}</Button>
      </Card>
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Membres</h2>
        {members.map((m, i) => <MemberEditor key={m.id ?? i} index={i} value={m} onChange={(v) => setMembers(members.map((x, j) => (j === i ? v : x)))} onRemove={i > 0 ? () => setMembers(members.filter((_, j) => j !== i)) : undefined} />)}
        <div className="flex gap-2">
          {members.length < 8 ? <Button variant="secondary" onClick={() => setMembers([...members, emptyMember()])}>+ Membre</Button> : null}
          <Button loading={saveMembers.isPending} onClick={() => saveMembers.mutate({ settings: {}, members })}>{t("common.save")}</Button>
        </div>
      </section>
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">Apparence</h2>
        <div role="radiogroup" aria-label="Thème" className="flex gap-2">
          {(["auto", "light", "dark"] as const).map((v) => <Button key={v} role="radio" aria-checked={theme === v} variant={theme === v ? "primary" : "secondary"} size="sm" onClick={() => applyTheme(v)}>{v === "auto" ? "Automatique" : v === "light" ? "Clair" : "Sombre"}</Button>)}
        </div>
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">Compte et données</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void exportData()}>{t("settings.export")}</Button>
          <Button variant="secondary" onClick={() => logout.mutate()}>{t("auth.logout")}</Button>
          <Button variant="danger" onClick={() => setDel(true)}>{t("settings.delete")}</Button>
        </div>
      </Card>
      <Dialog open={del} onClose={() => setDel(false)} title={t("settings.delete")}>
        <p>Toutes vos données (foyer, plans, stock, recettes privées) seront supprimées définitivement.</p>
        <Field label={t("auth.password")} htmlFor="delpwd"><Input id="delpwd" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} /></Field>
        {remove.error ? <p role="alert" className="text-sm text-[var(--danger)]">{remove.error.message}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDel(false)}>{t("common.cancel")}</Button>
          <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate({ password: pwd, confirm: "SUPPRIMER" })}>{t("common.delete")}</Button>
        </div>
      </Dialog>
    </div>
  );
}
