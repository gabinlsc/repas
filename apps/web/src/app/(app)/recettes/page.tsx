"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MEAL_SLOTS, type MealSlot } from "@mise/domain";
import { Badge, Card, EmptyState, Input, Select, Skeleton } from "@mise/ui";
import { translator, type MessageKey } from "@/lib/i18n";
import { useTRPC } from "@/lib/trpc";

const t = translator();

export default function RecipesPage() {
  const trpc = useTRPC();
  const [q, setQ] = useState("");
  const [slot, setSlot] = useState<MealSlot | "">("");
  const [veg, setVeg] = useState(false);
  const list = useQuery(trpc.recipes.list.queryOptions({ q: q || undefined, slot: slot || undefined, diet: veg ? "vegetarian" : undefined, limit: 100 }));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t("recipes.title")}</h1>
        <Link href="/recettes/import" className="inline-flex h-11 items-center rounded-[var(--radius)] bg-[var(--primary)] px-4 font-medium text-[var(--primary-text)]">{t("recipes.import")}</Link>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Input aria-label={t("recipes.search")} placeholder={t("recipes.search")} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="Repas" value={slot} onChange={(e) => setSlot(e.target.value as MealSlot | "")}>
          <option value="">Tous les repas</option>
          {MEAL_SLOTS.map((s) => <option key={s} value={s}>{t(`slot.${s}` as MessageKey)}</option>)}
        </Select>
        <label className="flex items-center gap-2"><input type="checkbox" checked={veg} onChange={(e) => setVeg(e.target.checked)} /> Végétarien</label>
      </div>
      {list.isLoading ? <Skeleton className="h-64" /> : !list.data?.length ? <EmptyState title="Aucune recette ne correspond." /> : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.map((r) => (
            <li key={r.id}>
              <Card className="flex h-full flex-col gap-2">
                <Link href={`/recettes/${r.id}`} className="font-medium hover:underline">{r.favorite ? "★ " : ""}{r.title}</Link>
                <div className="flex flex-wrap gap-1">
                  <Badge>{r.prepMinutes + r.cookMinutes} min</Badge>
                  {r.diets.includes("vegetarian") ? <Badge tone="success">végé</Badge> : null}
                  {r.status !== "validated" ? <Badge tone="warning">à valider</Badge> : null}
                  {r.excluded ? <Badge tone="danger">exclue</Badge> : null}
                </div>
                {r.allergens.length ? <p className="text-xs text-[var(--text-muted)]">Allergènes : {r.allergens.join(", ")}</p> : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
