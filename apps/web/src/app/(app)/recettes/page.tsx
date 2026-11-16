"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Heart, Import, Leaf, Search } from "lucide-react";
import type { MealSlot } from "@mise/domain";
import { Badge, Button, Chip, EmptyState, Input, RecipeArt, Skeleton, cn, buttonClass } from "@mise/ui";
import { PageHeader } from "@/components/AppShell";
import { recipeVisual } from "@/lib/recipe-visual";
import { useTRPC } from "@/lib/trpc";

type Filter = "quick" | "veg" | "breakfast" | "dessert" | "fav" | "mine";
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "quick", label: "⚡ Rapide" },
  { id: "veg", label: "🌱 Végé" },
  { id: "breakfast", label: "☀️ Petit-déj" },
  { id: "dessert", label: "🍰 Douceurs" },
  { id: "fav", label: "♥ Favoris" },
  { id: "mine", label: "📥 Mes recettes" },
];
const PAGE = 48;

export default function RecipesPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filters, setFilters] = useState<Filter[]>([]);
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const has = (f: Filter) => filters.includes(f);
  const slot: MealSlot | undefined = has("breakfast") ? "breakfast" : has("dessert") ? "snack" : undefined;
  const list = useQuery({ ...trpc.recipes.list.queryOptions({ q: debounced || undefined, slot, diet: has("veg") ? "vegetarian" : undefined, mine: has("mine") || undefined, limit: 500, offset: 0 }), placeholderData: keepPreviousData });
  const fav = useMutation(trpc.recipes.feedback.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: trpc.recipes.list.queryKey() }) }));
  const rows = (list.data ?? []).filter((r) => (!has("quick") || r.prepMinutes + r.cookMinutes <= 30) && (!has("fav") || r.favorite));
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Recettes" subtitle="Plus de 350 recettes, du porridge du matin au curry du soir." actions={<Link href="/recettes/import" className={buttonClass("primary", "md", "gap-2")}><Import className="h-4 w-4" aria-hidden />Ajouter une recette</Link>} />
      <div className="flex flex-col gap-3">
        <Input icon={<Search className="h-5 w-5" />} aria-label="Rechercher une recette" placeholder="Rechercher : gratin, curry, poulet, sans four…" value={q} onChange={(e) => setQ(e.target.value)} className="h-14 text-lg" />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none md:mx-0 md:flex-wrap md:px-0">
          {FILTERS.map((f) => (
            <Chip key={f.id} selected={has(f.id)} onToggle={() => setFilters(has(f.id) ? filters.filter((x) => x !== f.id) : [...filters.filter((x) => !((f.id === "breakfast" && x === "dessert") || (f.id === "dessert" && x === "breakfast"))), f.id])}>
              {f.label}
            </Chip>
          ))}
        </div>
      </div>
      {list.isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState art="🔍" title="Aucune recette trouvée">Essaie un autre mot ou retire un filtre.</EmptyState>
      ) : (
        <>
          <p className="text-sm text-[var(--text-muted)]">{rows.length} recette(s)</p>
          <ul className={cn("grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4", list.isFetching && "opacity-70")}>
            {rows.slice(0, limit).map((r) => {
              const v = recipeVisual(r.title, r.tags);
              return (
                <li key={r.id} className="group relative">
                  <Link href={`/recettes/${r.id}`} className="flex h-full flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-2.5 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow)]">
                    <RecipeArt emoji={v.emoji} hue={v.hue} size="lg" />
                    <div className="flex flex-1 flex-col gap-2 px-1 pb-1">
                      <h2 className="line-clamp-2 font-semibold leading-snug">{r.title}</h2>
                      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-muted)]">
                        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden />{r.prepMinutes + r.cookMinutes} min</span>
                        {r.diets.includes("vegetarian") ? <span className="inline-flex items-center gap-1 text-[var(--success)]"><Leaf className="h-3.5 w-3.5" aria-hidden />végé</span> : null}
                        {r.cuisine ? <span className="capitalize">{r.cuisine}</span> : null}
                      </div>
                      {r.status !== "validated" ? <Badge tone="warning">à valider</Badge> : r.excluded ? <Badge tone="danger">jamais proposée</Badge> : null}
                    </div>
                  </Link>
                  <button
                    type="button"
                    aria-pressed={r.favorite}
                    aria-label={r.favorite ? `Retirer ${r.title} des favoris` : `Ajouter ${r.title} aux favoris`}
                    onClick={() => fav.mutate({ recipeId: r.id, favorite: !r.favorite })}
                    className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[var(--accent)] shadow-[var(--shadow-sm)] backdrop-blur hover:scale-105"
                  >
                    <Heart className={cn("h-5 w-5", r.favorite && "fill-current")} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
          {rows.length > limit ? <Button variant="secondary" className="self-center" onClick={() => setLimit(limit + PAGE)}>Voir plus de recettes</Button> : null}
        </>
      )}
    </div>
  );
}
