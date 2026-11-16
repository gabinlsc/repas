"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Search } from "lucide-react";
import type { MealSlot } from "@mise/domain";
import { Chip, Dialog, Input, RecipeArt, Skeleton } from "@mise/ui";
import { recipeVisual } from "@/lib/recipe-visual";
import { useTRPC } from "@/lib/trpc";

/** Choisir soi-même une recette pour un créneau (recherche + filtres rapides). */
export function RecipePicker({ open, onClose, slot, onPick, title }: { open: boolean; onClose: () => void; slot: MealSlot; onPick: (recipeId: string) => void; title: string }) {
  const trpc = useTRPC();
  const [q, setQ] = useState("");
  const [quick, setQuick] = useState(false);
  const [veg, setVeg] = useState(false);
  const list = useQuery({ ...trpc.recipes.list.queryOptions({ q: q || undefined, slot, diet: veg ? "vegetarian" : undefined, limit: 120 }), enabled: open });
  const rows = (list.data ?? []).filter((r) => r.status === "validated" && !r.excluded && (!quick || r.prepMinutes + r.cookMinutes <= 30));
  return (
    <Dialog open={open} onClose={onClose} title={title} wide>
      <Input icon={<Search className="h-5 w-5" />} aria-label="Rechercher une recette" placeholder="Rechercher (ex. curry, gratin, salade…)" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="flex flex-wrap gap-2">
        <Chip selected={quick} onToggle={() => setQuick(!quick)}>⚡ 30 min max</Chip>
        <Chip selected={veg} onToggle={() => setVeg(!veg)}>🌱 Végétarien</Chip>
      </div>
      {list.isLoading ? (
        <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-[var(--text-muted)]">Aucune recette ne correspond.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((r) => {
            const v = recipeVisual(r.title, r.tags);
            return (
              <li key={r.id}>
                <button type="button" onClick={() => onPick(r.id)} className="flex w-full items-center gap-3 rounded-[var(--radius-sm)] p-2 text-left hover:bg-[var(--surface-2)]">
                  <RecipeArt emoji={v.emoji} hue={v.hue} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.favorite ? "★ " : ""}{r.title}</span>
                    <span className="flex items-center gap-1 text-sm text-[var(--text-muted)]"><Clock className="h-3.5 w-3.5" aria-hidden />{r.prepMinutes + r.cookMinutes} min{r.diets.includes("vegetarian") ? " · végé" : ""}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
