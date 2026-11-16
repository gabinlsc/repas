"use client";
import { use } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, ErrorState, Skeleton } from "@mise/ui";
import { translator } from "@/lib/i18n";
import { useTRPC } from "@/lib/trpc";

const t = translator();

export default function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const trpc = useTRPC();
  const qc = useQueryClient();
  const r = useQuery(trpc.recipes.get.queryOptions({ id }));
  const fb = useMutation(trpc.recipes.feedback.mutationOptions({ onSuccess: () => qc.invalidateQueries({ queryKey: trpc.recipes.get.queryKey({ id }) }) }));
  if (r.isLoading) return <Skeleton className="h-96" />;
  if (r.error || !r.data) return <ErrorState title={t("common.error")} detail={r.error?.message} retryLabel={t("common.retry")} onRetry={() => void r.refetch()} />;
  const d = r.data;
  return (
    <article className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{d.title}</h1>
      <div className="flex flex-wrap gap-2">
        <Badge>Préparation {d.prepMinutes} min</Badge>
        <Badge>Cuisson {d.cookMinutes} min</Badge>
        <Badge>{d.baseServings} portions</Badge>
        {d.freezes ? <Badge tone="success">se congèle</Badge> : null}
        {d.leftoverDays ? <Badge tone="success">restes {d.leftoverDays} j</Badge> : null}
        {d.allergens.map((a) => <Badge key={a} tone="danger">{a}</Badge>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => fb.mutate({ recipeId: d.id, favorite: !d.feedback?.favorite })}>{d.feedback?.favorite ? "★ Favori" : "☆ Ajouter aux favoris"}</Button>
        {[1, 2, 3, 4, 5].map((n) => <Button key={n} variant={d.feedback?.rating === n ? "primary" : "ghost"} size="sm" aria-label={`Noter ${n} sur 5`} onClick={() => fb.mutate({ recipeId: d.id, rating: n })}>{n}★</Button>)}
        <Button variant="ghost" size="sm" onClick={() => fb.mutate({ recipeId: d.id, excluded: !d.feedback?.excluded })}>{d.feedback?.excluded ? "Réautoriser dans les plans" : "Ne plus proposer"}</Button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <h2 className="mb-2 font-semibold">Ingrédients</h2>
          <ul className="flex flex-col gap-1 text-sm">{d.lines.map((l) => <li key={l.id}>{l.rawText}{l.optional ? " (facultatif)" : ""}{!l.ingredientId ? <Badge tone="warning" className="ml-1">non associé</Badge> : null}</li>)}</ul>
          <h2 className="mb-1 mt-4 font-semibold">Par portion</h2>
          <p className="text-sm text-[var(--text-muted)]">{d.nutrition.kcal} kcal · {d.nutrition.protein} g protéines · {d.nutrition.fiber} g fibres</p>
        </Card>
        <Card className="md:col-span-2">
          <h2 className="mb-2 font-semibold">Préparation</h2>
          <ol className="flex list-decimal flex-col gap-2 pl-5">{d.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          {d.sourceName ? <p className="mt-4 text-xs text-[var(--text-muted)]">Source : {d.sourceName}</p> : null}
        </Card>
      </div>
    </article>
  );
}
