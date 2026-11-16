"use client";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, EmptyState, Field, Input, Select, Skeleton, useToast } from "@mise/ui";
import { translator } from "@/lib/i18n";
import { useTRPC } from "@/lib/trpc";

const t = translator();
const LOC = { fridge: "Frigo", freezer: "Congélateur", cupboard: "Placard" } as const;

export default function PantryPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery(trpc.pantry.list.queryOptions());
  const [q, setQ] = useState("");
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("g");
  const [bestBefore, setBestBefore] = useState("");
  const [location, setLocation] = useState<keyof typeof LOC>("cupboard");
  const suggestions = useQuery({ ...trpc.recipes.ingredients.queryOptions({ q }), enabled: q.length > 1 });
  const refresh = () => qc.invalidateQueries({ queryKey: trpc.pantry.list.queryKey() });
  const add = useMutation(trpc.pantry.add.mutationOptions({ onSuccess: () => { void refresh(); setQuantity(""); setQ(""); setIngredientId(""); } }));
  const restore = useMutation(trpc.pantry.restore.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(trpc.pantry.remove.mutationOptions({ onSuccess: (r) => { void refresh(); toast.show(t("pantry.removed"), { actionLabel: t("common.undo"), onAction: () => restore.mutate(r.removed) }); } }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate({ ingredientId, quantity, unit, bestBefore: bestBefore || null, expiryKind: location === "fridge" ? "dlc" : "ddm", location });
  };
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("pantry.title")}</h1>
      <Card>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3 md:grid-cols-6" aria-label={t("pantry.add")}>
          <div className="col-span-2">
            <Field label="Ingrédient" htmlFor="ing">
              <Input id="ing" list="ing-list" value={q} onChange={(e) => { setQ(e.target.value); const m = suggestions.data?.find((s) => s.name === e.target.value); if (m) { setIngredientId(m.id); setUnit(m.baseUnit); } }} />
            </Field>
            <datalist id="ing-list">{suggestions.data?.map((s) => <option key={s.id} value={s.name} />)}</datalist>
          </div>
          <Field label="Quantité" htmlFor="qty"><Input id="qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
          <Field label="Unité" htmlFor="unit">
            <Select id="unit" value={unit} onChange={(e) => setUnit(e.target.value)}>{["g", "kg", "ml", "cl", "l", "piece"].map((u) => <option key={u} value={u}>{u === "piece" ? "pièce(s)" : u}</option>)}</Select>
          </Field>
          <Field label="Date limite" htmlFor="bb"><Input id="bb" type="date" value={bestBefore} onChange={(e) => setBestBefore(e.target.value)} /></Field>
          <Field label="Où ?" htmlFor="loc">
            <Select id="loc" value={location} onChange={(e) => setLocation(e.target.value as keyof typeof LOC)}>{Object.entries(LOC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          </Field>
          <Button type="submit" className="col-span-2 md:col-span-6 md:justify-self-start" disabled={!ingredientId || !quantity} loading={add.isPending}>{t("common.add")}</Button>
          {add.error ? <p role="alert" className="col-span-2 text-sm text-[var(--danger)]">{add.error.message}</p> : null}
        </form>
      </Card>
      {list.isLoading ? <Skeleton className="h-48" /> : !list.data?.length ? <EmptyState title={t("pantry.empty")} /> : (
        <ul className="flex flex-col gap-2">
          {list.data.map((p) => (
            <li key={p.id}>
              <Card className="flex items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-medium">{p.name} <span className="text-[var(--text-muted)]">— {p.display}</span></p>
                  <p className="text-sm text-[var(--text-muted)]">{LOC[p.location]}{p.bestBefore ? ` · ${p.expiryKind.toUpperCase()} ${new Date(p.bestBefore).toLocaleDateString("fr-FR")}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  {p.alert ? <Badge tone={p.alert.level === "soon" ? "warning" : "danger"}>{p.alert.level === "expired" ? "périmé" : p.alert.level === "today" ? "aujourd'hui" : `${p.alert.daysLeft} j`}</Badge> : null}
                  <Button size="sm" variant="ghost" aria-label={`Retirer ${p.name}`} onClick={() => remove.mutate({ id: p.id })}>✕</Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
