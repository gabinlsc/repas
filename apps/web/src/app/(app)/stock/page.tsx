"use client";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Chip, EmptyState, IconButton, Input, Segmented, Skeleton, cn, useToast } from "@mise/ui";
import { PageHeader } from "@/components/AppShell";
import { useTRPC, useTRPCClient } from "@/lib/trpc";

type Loc = "fridge" | "freezer" | "cupboard";
const LOC: Record<Loc, { label: string; emoji: string }> = { fridge: { label: "Frigo", emoji: "🧊" }, freezer: { label: "Congélateur", emoji: "❄️" }, cupboard: { label: "Placard", emoji: "🗄️" } };
const DLC_PRESETS = [{ label: "Pas de date", days: null }, { label: "2 jours", days: 2 }, { label: "1 semaine", days: 7 }, { label: "1 mois", days: 30 }] as const;

export default function PantryPage() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery(trpc.pantry.list.queryOptions());
  const [text, setText] = useState("");
  const [loc, setLoc] = useState<Loc | "auto">("auto");
  const [days, setDays] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | Loc>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: trpc.pantry.list.queryKey() });
  const restore = useMutation(trpc.pantry.restore.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(trpc.pantry.remove.mutationOptions({ onSuccess: (r) => { void refresh(); toast.show("Retiré du stock", { actionLabel: "Annuler", onAction: () => restore.mutate(r.removed) }); } }));

  /** Ajout en langage naturel : « 500 g de riz », « 6 œufs », « 1 l de lait ». */
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!text.trim()) return;
    setBusy(true);
    try {
      const p = await client.recipes.parseLine.query({ text });
      const ingredientId = p.ingredientId ?? (p.match === "ambiguous" ? p.candidates[0]?.ingredientId : null);
      if (!ingredientId) throw new Error(`Je ne reconnais pas « ${p.name} ». Essaie un nom plus courant.`);
      if (!p.quantity || !p.unit || p.fuzzy) throw new Error("Indique une quantité, par exemple « 500 g de riz » ou « 6 œufs ».");
      const bestBefore = days === null ? null : new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
      await client.pantry.add.mutate({ ingredientId, quantity: p.quantity, unit: p.unit, bestBefore, expiryKind: loc === "fridge" ? "dlc" : "ddm", location: loc });
      setLoc("auto");
      toast.show(`Ajouté : ${text}`);
      setText("");
      void refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rows = (list.data ?? []).filter((p) => filter === "all" || p.location === filter);
  const urgent = rows.filter((p) => p.alert);
  const rest = rows.filter((p) => !p.alert);

  const Row = ({ p }: { p: (typeof rows)[number] }) => (
    <li className="flex items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-sm)]">
      <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[var(--surface-2)] text-xl">{LOC[p.location].emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{p.name}</p>
        <p className="text-sm text-[var(--text-muted)]">{p.display}{p.bestBefore ? ` · ${p.expiryKind === "dlc" ? "à consommer avant" : "de préférence avant"} le ${new Date(p.bestBefore).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}</p>
      </div>
      {p.alert ? <Badge tone={p.alert.level === "soon" ? "warning" : "danger"}>{p.alert.level === "expired" ? "périmé" : p.alert.level === "today" ? "aujourd'hui" : `${p.alert.daysLeft} j`}</Badge> : null}
      <IconButton label={`Retirer ${p.name}`} onClick={() => remove.mutate({ id: p.id })}><Trash2 className="h-5 w-5" /></IconButton>
    </li>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Mon stock" subtitle="Ce que tu as déjà est utilisé en priorité dans tes prochaines semaines — surtout ce qui périme bientôt." />
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow)] md:p-5" aria-label="Ajouter au stock">
        <div className="flex gap-2">
          <label htmlFor="quick" className="sr-only">Ingrédient et quantité</label>
          <Input id="quick" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex. : 500 g de riz, 6 œufs, 1 l de lait" className="h-14 text-lg" />
          <Button type="submit" size="lg" loading={busy} icon={<Plus className="h-5 w-5" />} className="shrink-0">Ajouter</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="Emplacement" value={loc} onChange={setLoc} options={[{ value: "auto" as const, label: "✨ Auto" }, ...(Object.keys(LOC) as Loc[]).map((k) => ({ value: k, label: `${LOC[k].emoji} ${LOC[k].label}` }))]} />
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Date limite">
            <CalendarClock className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
            {DLC_PRESETS.map((d) => <Chip key={d.label} selected={days === d.days} onToggle={() => setDays(d.days)}>{d.label}</Chip>)}
          </div>
        </div>
        {error ? <p role="alert" className="text-sm font-medium text-[var(--danger)]">{error}</p> : null}
      </form>

      <div className="flex flex-wrap gap-2">
        <Chip selected={filter === "all"} onToggle={() => setFilter("all")}>Tout ({list.data?.length ?? 0})</Chip>
        {(Object.keys(LOC) as Loc[]).map((k) => <Chip key={k} selected={filter === k} onToggle={() => setFilter(k)}>{LOC[k].emoji} {LOC[k].label}</Chip>)}
      </div>

      {list.isLoading ? <Skeleton className="h-48" /> : !rows.length ? (
        <EmptyState art="🥫" title="Ton stock est vide">Ajoute ce que tu as déjà : on s&apos;en servira avant d&apos;acheter. Les courses terminées le remplissent aussi automatiquement.</EmptyState>
      ) : (
        <>
          {urgent.length ? (
            <section aria-labelledby="urgent-h" className="flex flex-col gap-2">
              <h2 id="urgent-h" className="font-display text-xl font-semibold text-[var(--accent)]">À consommer vite</h2>
              <ul className="grid gap-2 md:grid-cols-2">{urgent.map((p) => <Row key={p.id} p={p} />)}</ul>
            </section>
          ) : null}
          <section aria-labelledby="all-h" className={cn("flex flex-col gap-2")}>
            <h2 id="all-h" className="font-display text-xl font-semibold">Dans mes placards</h2>
            <ul className="grid gap-2 md:grid-cols-2">{rest.map((p) => <Row key={p.id} p={p} />)}</ul>
          </section>
        </>
      )}
    </div>
  );
}
