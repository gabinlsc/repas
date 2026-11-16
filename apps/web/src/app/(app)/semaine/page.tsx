"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MEAL_SLOTS, type MealSlot } from "@mise/domain";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, cn, useToast } from "@mise/ui";
import { useJob } from "@/components/useJob";
import { explain } from "@/lib/explain";
import { formatMoney, mondayOf, shiftWeek, translator, type MessageKey } from "@/lib/i18n";
import { useTRPC } from "@/lib/trpc";

const t = translator();

type Meal = NonNullable<ReturnType<typeof usePlan>["data"]>["meals"][number];

function usePlan(week: string) {
  const trpc = useTRPC();
  // Pendant une génération (lancée ici ou depuis l'onboarding), on rafraîchit jusqu'au résultat.
  return useQuery({ ...trpc.plan.current.queryOptions({ weekStart: week }), refetchInterval: (q) => (q.state.data?.plan.status === "generating" ? 1500 : false) });
}

function MealCard({ meal, week }: { meal: Meal; week: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const job = useJob();
  const [open, setOpen] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: trpc.plan.current.queryKey({ weekStart: week }) });
  const lock = useMutation(trpc.plan.setLocked.mutationOptions({ onSuccess: refresh }));
  const regen = useMutation(trpc.plan.regenerateSlot.mutationOptions({ onSuccess: (r) => job.start(r.jobId) }));
  const cooked = useMutation(trpc.plan.markCooked.mutationOptions({ onSuccess: (r) => { void refresh(); toast.show(`Repas cuisiné — ${r.decremented} article(s) déduit(s) du stock`); } }));
  const restore = useMutation(trpc.plan.restore.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(
    trpc.plan.remove.mutationOptions({
      onSuccess: (r) => {
        void refresh();
        toast.show("Repas retiré", { actionLabel: t("common.undo"), onAction: () => restore.mutate({ weekStart: week, ...r.removed }) });
      },
    }),
  );
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: meal.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const reasons = meal.explanations.map((e) => explain(e.code, e.params)).filter((x): x is string => !!x);
  return (
    <Card ref={setNodeRef} style={style} className={cn("flex flex-col gap-2 p-3", isDragging && "z-10 opacity-80 shadow-lg", meal.cookedAt && "opacity-60")} data-testid="meal-card">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/recettes/${meal.recipe.id}`} className="font-medium hover:underline">{meal.recipe.title}</Link>
        <button {...listeners} {...attributes} aria-label={`Déplacer ${meal.recipe.title} (espace puis flèches)`} className="cursor-grab rounded px-1 text-[var(--text-muted)]">⠿</button>
      </div>
      <div className="flex flex-wrap gap-1">
        <Badge>{meal.recipe.prepMinutes + meal.recipe.cookMinutes} min</Badge>
        {meal.locked ? <Badge tone="accent">🔒</Badge> : null}
        {meal.leftoverOfId ? <Badge tone="success">{t("week.leftover")}</Badge> : null}
        {meal.cookBig ? <Badge tone="warning">{t("week.batch")}</Badge> : null}
        {meal.cookedAt ? <Badge tone="success">✓</Badge> : null}
      </div>
      {reasons.length ? (
        <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer text-sm text-[var(--primary)]">{t("week.why")}</summary>
          <ul className="mt-1 list-disc pl-5 text-sm text-[var(--text-muted)]">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </details>
      ) : null}
      <div className="flex gap-1" role="group" aria-label={`Actions pour ${meal.recipe.title}`}>
        <Button size="sm" variant="ghost" className="px-2" title={meal.locked ? t("week.unlock") : t("week.lock")} aria-label={meal.locked ? t("week.unlock") : t("week.lock")} aria-pressed={meal.locked} onClick={() => lock.mutate({ mealId: meal.id, locked: !meal.locked })}>{meal.locked ? "🔓" : "🔒"}</Button>
        <Button size="sm" variant="ghost" className="px-2" title={t("week.swap")} aria-label={t("week.swap")} loading={regen.isPending || job.running} onClick={() => regen.mutate({ mealId: meal.id })}>↻</Button>
        {!meal.cookedAt ? <Button size="sm" variant="ghost" className="px-2" title={t("week.cooked")} aria-label={t("week.cooked")} onClick={() => cooked.mutate({ mealId: meal.id })}>✓</Button> : null}
        <Button size="sm" variant="ghost" className="px-2" title={`Retirer ${meal.recipe.title}`} aria-label={`Retirer ${meal.recipe.title}`} onClick={() => remove.mutate({ mealId: meal.id })}>✕</Button>
      </div>
    </Card>
  );
}

function Cell({ day, slot, children }: { day: number; slot: MealSlot; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${day}:${slot}` });
  return (
    <div ref={setNodeRef} className={cn("min-h-24 rounded-[var(--radius)] p-1", isOver && "bg-[var(--surface-2)] outline-2 outline-dashed outline-[var(--primary)]")} aria-label={`${t(`days.${day}` as MessageKey)} ${t(`slot.${slot}` as MessageKey)}`}>
      {children}
    </div>
  );
}

export default function WeekPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const [week, setWeek] = useState(mondayOf());
  const plan = usePlan(week);
  const household = useQuery(trpc.household.get.queryOptions());
  const job = useJob();
  const generate = useMutation(trpc.plan.generate.mutationOptions({ onSuccess: (r) => job.start(r.jobId) }));
  const move = useMutation(trpc.plan.move.mutationOptions({ onSettled: () => qc.invalidateQueries({ queryKey: trpc.plan.current.queryKey({ weekStart: week }) }), onError: (e) => toast.show(e.message, { tone: "error" }) }));
  const shopping = useMutation(trpc.shopping.generate.mutationOptions({ onSuccess: () => router.push("/courses") }));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  useEffect(() => {
    if (household.data && !household.isFetching && !household.data.household.onboardedAt) router.replace("/onboarding");
  }, [household.data, household.isFetching, router]);
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const [day, slot] = String(e.over.id).split(":");
    move.mutate({ mealId: String(e.active.id), day: Number(day), slot: slot as MealSlot });
  };
  const slots = (household.data?.household.mealSlots ?? ["dinner"]) as MealSlot[];
  const meals = plan.data?.meals ?? [];
  const busy = generate.isPending || job.running || plan.data?.plan.status === "generating";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" aria-label={t("week.prev")} onClick={() => setWeek(shiftWeek(week, -1))}>←</Button>
          <h1 className="text-2xl font-bold">{t("week.title")} <span className="text-base font-normal text-[var(--text-muted)]">du {new Date(`${week}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</span></h1>
          <Button variant="ghost" size="sm" aria-label={t("week.next")} onClick={() => setWeek(shiftWeek(week, 1))}>→</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => generate.mutate({ weekStart: week })} loading={busy}>{meals.length ? t("week.regenerate") : t("week.generate")}</Button>
          {meals.length && plan.data ? <Button variant="secondary" loading={shopping.isPending} onClick={() => shopping.mutate({ mealPlanId: plan.data!.plan.id })}>{t("week.shopping")}</Button> : null}
          {meals.length ? <a className="inline-flex h-11 items-center px-3 text-sm underline" href={`/api/ics?week=${week}`}>Exporter (ICS)</a> : null}
        </div>
      </div>
      {busy ? <p role="status" className="text-[var(--text-muted)]">{t("week.generating")}</p> : null}
      {plan.data?.plan.diagnostics.length ? (
        <Card role="alert" className="border-[var(--warning)]">
          <ul className="list-disc pl-5 text-sm">{plan.data.plan.diagnostics.map((d) => <li key={d.code + d.message}>{d.message}</li>)}</ul>
        </Card>
      ) : null}
      {plan.data && meals.length ? (
        <div className="flex flex-wrap gap-2">
          {plan.data.plan.estimatedCostCents !== null ? <Badge>{t("week.cost")} : {formatMoney(plan.data.plan.estimatedCostCents)}{household.data?.household.weeklyBudgetCents ? ` / ${formatMoney(household.data.household.weeklyBudgetCents)}` : ""}</Badge> : null}
          <Badge tone={plan.data.nutrition.score >= 60 ? "success" : "warning"}>{t("week.nutrition")} : {plan.data.nutrition.score}/100</Badge>
          {plan.data.nutrition.alerts.map((a) => <Badge key={a} tone="warning">{t(a as MessageKey)}</Badge>)}
        </div>
      ) : null}
      {plan.isLoading ? <Skeleton className="h-96" /> : plan.error ? <ErrorState title={t("common.error")} detail={plan.error.message} onRetry={() => void plan.refetch()} retryLabel={t("common.retry")} /> : meals.length === 0 && !busy ? (
        <EmptyState title={t("week.empty")} action={<Button onClick={() => generate.mutate({ weekStart: week })}>{t("week.generate")}</Button>} />
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd} accessibility={{ screenReaderInstructions: { draggable: "Appuyez sur espace pour saisir le repas, flèches pour le déplacer, espace pour le déposer." } }}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {[0, 1, 2, 3, 4, 5, 6].map((day) => (
              <section key={day} aria-labelledby={`day-${day}`} className="flex flex-col gap-1">
                <h2 id={`day-${day}`} className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t(`days.${day}` as MessageKey)}</h2>
                {slots.sort((a, b) => MEAL_SLOTS.indexOf(a) - MEAL_SLOTS.indexOf(b)).map((slot) => {
                  const m = meals.find((x) => x.day === day && x.slot === slot);
                  return (
                    <Cell key={slot} day={day} slot={slot}>
                      <p className="mb-1 text-xs text-[var(--text-muted)]">{t(`slot.${slot}` as MessageKey)}</p>
                      {m ? <MealCard meal={m} week={week} /> : <p className="text-sm text-[var(--text-muted)]">—</p>}
                    </Cell>
                  );
                })}
              </section>
            ))}
          </div>
        </DndContext>
      )}
    </div>
  );
}
