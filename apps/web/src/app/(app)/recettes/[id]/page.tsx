"use client";
import Link from "next/link";
import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Clock, Flame, Heart, Snowflake, Star, Users } from "lucide-react";
import { div, mul, parseRational, rat, toDecimalString, UNITS } from "@mise/domain";
import { Badge, Button, ErrorState, RecipeArt, Skeleton, Stepper, cn, useToast } from "@mise/ui";
import { ALLERGEN_FR } from "@/components/MemberEditor";
import { recipeVisual } from "@/lib/recipe-visual";
import { useTRPC } from "@/lib/trpc";

/** Quantité mise à l'échelle, affichée lisiblement (« 1,5 c. à soupe », « 300 g »). */
function scaled(quantity: string | null, unit: string | null, factor: { n: bigint; d: bigint }): string | null {
  if (!quantity || !unit) return null;
  const q = mul(parseRational(quantity), factor);
  const txt = toDecimalString(q, unit === "piece" ? 1 : 2).replace(".", ",");
  const u = UNITS[unit];
  if (!u || unit === "piece") return txt;
  const plural = Number(txt.replace(",", ".")) >= 2;
  return `${txt} ${plural ? u.labelFrPlural : u.labelFr}`;
}

export default function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const r = useQuery(trpc.recipes.get.queryOptions({ id }));
  const [servings, setServings] = useState<number | null>(null);
  const [done, setDone] = useState<number[]>([]);
  const fb = useMutation(trpc.recipes.feedback.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: trpc.recipes.get.queryKey({ id }) }) }));
  if (r.isLoading) return <div className="flex flex-col gap-4"><Skeleton className="aspect-[16/7]" /><Skeleton className="h-64" /></div>;
  if (r.error || !r.data) return <ErrorState title="Recette introuvable" detail={r.error?.message} retryLabel="Réessayer" onRetry={() => void r.refetch()} />;
  const d = r.data;
  const n = servings ?? d.baseServings;
  const factor = div(rat(n), rat(d.baseServings));
  const v = recipeVisual(d.title, d.tags);
  const total = d.prepMinutes + d.cookMinutes;
  return (
    <article className="flex flex-col gap-8">
      <Link href="/recettes" className="inline-flex items-center gap-1 self-start text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"><ArrowLeft className="h-4 w-4" aria-hidden />Recettes</Link>
      <header className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-center">
        <RecipeArt emoji={v.emoji} hue={v.hue} size="xl" className="max-h-56 md:max-h-none" />
        <div className="flex flex-col gap-4">
          {d.cuisine ? <p className="text-sm font-semibold uppercase tracking-wider text-[var(--accent)]">Cuisine {d.cuisine}</p> : null}
          <h1 className="font-display text-3xl font-semibold leading-tight md:text-4xl">{d.title}</h1>
          <div className="flex flex-wrap gap-2">
            <Badge icon={<Clock className="h-3.5 w-3.5" />}>{total} min{d.cookMinutes ? ` dont ${d.cookMinutes} de cuisson` : ""}</Badge>
            <Badge icon={<Flame className="h-3.5 w-3.5" />}>{d.nutrition.kcal} kcal / portion</Badge>
            {d.diets.includes("vegetarian") ? <Badge tone="success">🌱 Végétarien</Badge> : null}
            {d.diets.includes("vegan") ? <Badge tone="success">Végan</Badge> : null}
            {d.freezes ? <Badge tone="primary" icon={<Snowflake className="h-3.5 w-3.5" />}>Se congèle</Badge> : null}
          </div>
          {d.allergens.length ? <p className="text-sm"><span className="font-semibold">Allergènes : </span>{d.allergens.map((a) => ALLERGEN_FR[a as keyof typeof ALLERGEN_FR] ?? a).join(", ")}</p> : <p className="text-sm text-[var(--success)]">Aucun des 14 allergènes réglementaires.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={d.feedback?.favorite ? "soft" : "secondary"} icon={<Heart className={cn("h-4 w-4", d.feedback?.favorite && "fill-current")} />} onClick={() => fb.mutate({ recipeId: d.id, favorite: !d.feedback?.favorite })}>{d.feedback?.favorite ? "Favori" : "Ajouter aux favoris"}</Button>
            <div className="flex items-center" role="radiogroup" aria-label="Ma note">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} type="button" role="radio" aria-checked={d.feedback?.rating === s} aria-label={`${s} étoile(s)`} onClick={() => fb.mutate({ recipeId: d.id, rating: s })} className="p-1.5 text-[var(--saffron)]">
                  <Star className={cn("h-6 w-6", (d.feedback?.rating ?? 0) >= s && "fill-current")} aria-hidden />
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" icon={<Ban className="h-4 w-4" />} onClick={() => { fb.mutate({ recipeId: d.id, excluded: !d.feedback?.excluded }); toast.show(d.feedback?.excluded ? "La recette pourra de nouveau être proposée" : "Cette recette ne sera plus proposée"); }}>
              {d.feedback?.excluded ? "Proposer à nouveau" : "Ne plus proposer"}
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <section aria-labelledby="ing-h" className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] lg:sticky lg:top-6 lg:self-start">
          <div className="flex items-center justify-between gap-3">
            <h2 id="ing-h" className="font-display text-xl font-semibold">Ingrédients</h2>
            <div className="flex items-center gap-2"><Users className="h-4 w-4 text-[var(--text-muted)]" aria-hidden /><Stepper label="Nombre de portions" value={n} onChange={setServings} min={1} max={24} /></div>
          </div>
          <ul className="flex flex-col divide-y divide-[var(--border)]">
            {d.lines.map((l) => {
              const q = scaled(l.quantity, l.unitCode, factor);
              return (
                <li key={l.id} className="flex items-baseline justify-between gap-3 py-2.5">
                  <span>{l.ingredientName ?? l.rawText}{l.optional ? <span className="text-[var(--text-muted)]"> (facultatif)</span> : null}{l.note ? <span className="block text-xs text-[var(--text-muted)]">{l.note}</span> : null}</span>
                  <span className="shrink-0 text-right font-semibold tabular-nums text-[var(--text-muted)]">{q ?? "à votre goût"}</span>
                </li>
              );
            })}
          </ul>
          <div className="grid grid-cols-3 gap-2 rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-3 text-center text-sm">
            <div><p className="font-semibold">{d.nutrition.protein} g</p><p className="text-[var(--text-muted)]">protéines</p></div>
            <div><p className="font-semibold">{d.nutrition.carbs} g</p><p className="text-[var(--text-muted)]">glucides</p></div>
            <div><p className="font-semibold">{d.nutrition.fiber} g</p><p className="text-[var(--text-muted)]">fibres</p></div>
          </div>
        </section>
        <section aria-labelledby="steps-h" className="flex flex-col gap-4">
          <h2 id="steps-h" className="font-display text-xl font-semibold">Préparation</h2>
          <ol className="flex flex-col gap-3">
            {d.steps.map((s, i) => {
              const ok = done.includes(i);
              return (
                <li key={i}>
                  <button type="button" aria-pressed={ok} onClick={() => setDone(ok ? done.filter((x) => x !== i) : [...done, i])} className={cn("flex w-full gap-4 rounded-[var(--radius)] border p-4 text-left transition-colors", ok ? "border-transparent bg-[var(--surface-2)] text-[var(--text-muted)]" : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]")}>
                    <span aria-hidden className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-lg font-semibold", ok ? "bg-[var(--primary)] text-[var(--primary-text)]" : "bg-[var(--primary-soft)] text-[var(--primary)]")}>{ok ? "✓" : i + 1}</span>
                    <span className={cn("pt-1.5 leading-relaxed", ok && "line-through")}>{s}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          {d.sourceName ? <p className="text-xs text-[var(--text-muted)]">Source : {d.sourceName}</p> : null}
        </section>
      </div>
    </article>
  );
}
