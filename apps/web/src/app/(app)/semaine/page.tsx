"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChefHat, ChevronLeft, ChevronRight, Clock, Euro, GripVertical, Leaf, ListPlus, Lock, MoreHorizontal, RefreshCw, Search, ShoppingBasket, Sparkles, Trash2, Unlock, Wand2 } from "lucide-react";
import type { MealSlot } from "@mise/domain";
import { Badge, Button, EmptyState, ErrorState, Menu, Progress, RecipeArt, Skeleton, Stat, cn, useToast } from "@mise/ui";
import { RecipePicker } from "@/components/RecipePicker";
import { useJob } from "@/components/useJob";
import { explain, REASON_PRIORITY } from "@/lib/explain";
import { formatMoney, mondayOf, shiftWeek } from "@/lib/i18n";
import { recipeVisual } from "@/lib/recipe-visual";
import { useTRPC } from "@/lib/trpc";

const DAY = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const SLOT_UI: Record<MealSlot, { label: string; emoji: string }> = {
  breakfast: { label: "Petit-déj", emoji: "☀️" },
  lunch: { label: "Déjeuner", emoji: "🥗" },
  snack: { label: "Goûter", emoji: "🍪" },
  dinner: { label: "Dîner", emoji: "🌙" },
};
const SLOT_ORDER: MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];
const LOADING = ["On cherche des recettes de saison…", "On équilibre la semaine…", "On vérifie les allergies de chacun…", "On optimise ton budget…", "On évite de manger la même chose…"];

function dateOf(week: string, day: number): Date {
  return new Date(Date.parse(`${week}T12:00:00Z`) + day * 86400_000);
}

function usePlan(week: string) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.plan.current.queryOptions({ weekStart: week }), refetchInterval: (q) => (q.state.data?.plan.status === "generating" ? 1500 : false) });
}
type Meal = NonNullable<ReturnType<typeof usePlan>["data"]>["meals"][number];

function MealCard({ meal, week }: { meal: Meal; week: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const job = useJob();
  const [picker, setPicker] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: trpc.plan.current.queryKey({ weekStart: week }) });
  const onErr = { onError: (e: { message: string }) => toast.show(e.message, { tone: "error" }) };
  const lock = useMutation(trpc.plan.setLocked.mutationOptions({ onSuccess: refresh, ...onErr }));
  const regen = useMutation(trpc.plan.regenerateSlot.mutationOptions({ onSuccess: (r) => job.start(r.jobId), ...onErr }));
  const replace = useMutation(trpc.plan.replace.mutationOptions({ onSuccess: () => { void refresh(); setPicker(false); toast.show("Recette remplacée"); }, ...onErr }));
  const cooked = useMutation(trpc.plan.markCooked.mutationOptions({ onSuccess: (r) => { void refresh(); toast.show(r.decremented ? `Bon appétit ! ${r.decremented} article(s) retiré(s) du stock` : "Bon appétit !"); }, ...onErr }));
  const restore = useMutation(trpc.plan.restore.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(trpc.plan.remove.mutationOptions({ onSuccess: (r) => { void refresh(); toast.show("Repas retiré", { actionLabel: "Annuler", onAction: () => restore.mutate({ weekStart: week, ...r.removed }) }); }, ...onErr }));
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: meal.id });
  const v = recipeVisual(meal.recipe.title, meal.recipe.tags);
  const reasons = meal.explanations
    .filter((e) => REASON_PRIORITY.includes(e.code))
    .sort((a, b) => REASON_PRIORITY.indexOf(a.code) - REASON_PRIORITY.indexOf(b.code))
    .map((e) => explain(e.code, e.params))
    .filter((x): x is string => !!x);
  const cost = meal.explanations.find((e) => e.code === "cost_per_serving");
  const busy = regen.isPending || job.running;
  return (
    <article
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      data-testid="meal-card"
      className={cn(
        "group relative flex gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow)]",
        isDragging && "z-20 rotate-1 shadow-[var(--shadow-lg)]",
        meal.cookedAt && "opacity-70",
        busy && "animate-pulse",
      )}
    >
      <Link href={`/recettes/${meal.recipe.id}`} tabIndex={-1} aria-hidden className="shrink-0"><RecipeArt emoji={v.emoji} hue={v.hue} size="md" /></Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
          <span aria-hidden>{SLOT_UI[meal.slot].emoji}</span>{SLOT_UI[meal.slot].label}
          {meal.locked ? <Lock className="h-3.5 w-3.5 text-[var(--accent)]" aria-label="Verrouillé" /> : null}
          {meal.cookedAt ? <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" aria-label="Cuisiné" /> : null}
        </p>
        <Link href={`/recettes/${meal.recipe.id}`} className="line-clamp-2 font-semibold leading-snug hover:text-[var(--primary)]">{meal.recipe.title}</Link>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden />{meal.recipe.prepMinutes + meal.recipe.cookMinutes} min</span>
          {cost ? <span className="inline-flex items-center gap-1"><Euro className="h-3.5 w-3.5" aria-hidden />{formatMoney(Number(cost.params.cents))}/pers.</span> : null}
          {meal.recipe.diets.includes("vegetarian") ? <span className="inline-flex items-center gap-1 text-[var(--success)]"><Leaf className="h-3.5 w-3.5" aria-hidden />végé</span> : null}
          {meal.leftoverOfId ? <Badge tone="saffron">Restes</Badge> : null}
          {meal.cookBig ? <Badge tone="saffron">× 2</Badge> : null}
        </p>
        {reasons[0] ? <p className="mt-0.5 line-clamp-1 flex items-center gap-1 text-xs text-[var(--primary)]"><Sparkles className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{reasons[0]}</span></p> : null}
      </div>
      <div className="flex flex-col items-center gap-1">
        <Menu
          label={`Actions pour ${meal.recipe.title}`}
          trigger={<MoreHorizontal className="h-5 w-5" />}
          items={[
            { label: "Autre suggestion", icon: <Wand2 className="h-4 w-4" />, onSelect: () => regen.mutate({ mealId: meal.id }) },
            { label: "Choisir une recette…", icon: <Search className="h-4 w-4" />, onSelect: () => setPicker(true) },
            { label: meal.locked ? "Déverrouiller" : "Garder ce repas", icon: meal.locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />, onSelect: () => lock.mutate({ mealId: meal.id, locked: !meal.locked }) },
            { label: "C'est cuisiné", icon: <ChefHat className="h-4 w-4" />, onSelect: () => cooked.mutate({ mealId: meal.id }), disabled: !!meal.cookedAt },
            { label: "Retirer", icon: <Trash2 className="h-4 w-4" />, onSelect: () => remove.mutate({ mealId: meal.id }), danger: true },
          ]}
        />
        <button {...listeners} {...attributes} aria-label={`Déplacer ${meal.recipe.title} (espace, puis flèches)`} className="hidden h-9 w-9 cursor-grab items-center justify-center rounded-full text-[var(--text-subtle)] hover:bg-[var(--surface-2)] md:inline-flex">
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <RecipePicker open={picker} onClose={() => setPicker(false)} slot={meal.slot} title={`${DAY[meal.day]} · ${SLOT_UI[meal.slot].label}`} onPick={(recipeId) => replace.mutate({ mealId: meal.id, recipeId })} />
    </article>
  );
}

function Cell({ day, slot, children }: { day: number; slot: MealSlot; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${day}:${slot}` });
  return (
    <div ref={setNodeRef} className={cn("min-h-[92px] rounded-[var(--radius)] transition-colors", isOver && "bg-[var(--primary-soft)] outline-2 outline-dashed outline-[var(--primary)]")} aria-label={`${DAY[day]} ${SLOT_UI[slot].label}`}>
      {children}
    </div>
  );
}

function GeneratingCard() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % LOADING.length), 1600);
    return () => clearInterval(t);
  }, []);
  return (
    <div role="status" className="mise-pop flex items-center gap-4 rounded-[var(--radius-lg)] bg-[var(--primary)] p-5 text-[var(--primary-text)] shadow-[var(--shadow-lg)]">
      <span aria-hidden className="text-3xl motion-safe:animate-bounce">🧑‍🍳</span>
      <div>
        <p className="font-display text-lg font-semibold">Ta semaine se prépare</p>
        <p className="opacity-90">{LOADING[i]}</p>
      </div>
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
  const generate = useMutation(trpc.plan.generate.mutationOptions({ onSuccess: (r) => job.start(r.jobId), onError: (e) => toast.show(e.message, { tone: "error" }) }));
  const move = useMutation(trpc.plan.move.mutationOptions({ onSettled: () => qc.invalidateQueries({ queryKey: trpc.plan.current.queryKey({ weekStart: week }) }), onError: (e) => toast.show(e.message, { tone: "error" }) }));
  const shopping = useMutation(trpc.shopping.generate.mutationOptions({ onSuccess: () => router.push("/courses") }));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor));

  useEffect(() => {
    if (household.data && !household.isFetching && !household.data.household.onboardedAt) router.replace("/onboarding");
  }, [household.data, household.isFetching, router]);

  const slots = useMemo(() => [...((household.data?.household.mealSlots ?? ["dinner"]) as MealSlot[])].sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b)), [household.data]);
  const meals = plan.data?.meals ?? [];
  const busy = generate.isPending || job.running || plan.data?.plan.status === "generating";
  const budget = household.data?.household.weeklyBudgetCents ?? null;
  const cost = plan.data?.plan.estimatedCostCents ?? null;
  const distinct = new Set(meals.map((m) => m.recipeId)).size;
  const today = new Date().toISOString().slice(0, 10);
  const firstName = household.data?.members.find((m) => m.isMe)?.name;
  const range = `du ${dateOf(week, 0).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" })} au ${dateOf(week, 6).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" })}`;
  const warnings = (plan.data?.plan.diagnostics ?? []).filter((d) => d.code !== "partial_prices");

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const [day, slot] = String(e.over.id).split(":");
    move.mutate({ mealId: String(e.active.id), day: Number(day), slot: slot as MealSlot });
  };
  const scrollTo = (d: number) => document.getElementById(`day-${d}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-[var(--accent)]">{firstName ? `Bonjour ${firstName}` : "Ma semaine"}</p>
          <h1 className="font-display text-3xl font-semibold md:text-4xl">Ma semaine</h1>
          <div className="mt-1 flex items-center gap-1 text-[var(--text-muted)]">
            <button type="button" aria-label="Semaine précédente" onClick={() => setWeek(shiftWeek(week, -1))} className="rounded-full p-1.5 hover:bg-[var(--surface-2)]"><ChevronLeft className="h-5 w-5" /></button>
            <span className="font-medium">{range}</span>
            <button type="button" aria-label="Semaine suivante" onClick={() => setWeek(shiftWeek(week, 1))} className="rounded-full p-1.5 hover:bg-[var(--surface-2)]"><ChevronRight className="h-5 w-5" /></button>
          </div>
        </div>
        {meals.length ? (
          <div className="no-print flex gap-2">
            <Button variant="secondary" className="flex-1 md:flex-none" icon={<RefreshCw className="h-4 w-4" />} loading={busy} onClick={() => generate.mutate({ weekStart: week })}>Nouvelle proposition</Button>
            <Button className="flex-1 md:flex-none" icon={<ShoppingBasket className="h-4 w-4" />} loading={shopping.isPending} onClick={() => plan.data && shopping.mutate({ mealPlanId: plan.data.plan.id })}>Courses</Button>
          </div>
        ) : null}
      </header>

      {busy ? <GeneratingCard /> : null}

      {warnings.length && meals.length ? (
        <div role="alert" className="flex gap-3 rounded-[var(--radius)] border border-[var(--warning)]/40 bg-[var(--warning-soft)] p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warning)]" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold">Meilleur compromis trouvé</p>
            <ul className="mt-1 list-disc pl-5">{warnings.map((d) => <li key={d.code + d.message}>{d.message}</li>)}</ul>
            {warnings.some((d) => d.code === "budget_too_low") ? <Link href="/reglages" className="mt-2 inline-block font-semibold text-[var(--primary)] underline">Ajuster le budget</Link> : null}
          </div>
        </div>
      ) : null}

      {plan.isLoading ? (
        <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : plan.error ? (
        <ErrorState title="Impossible de charger la semaine" detail={plan.error.message} onRetry={() => void plan.refetch()} retryLabel="Réessayer" />
      ) : meals.length === 0 && !busy ? (
        <EmptyState art="🍽️" title="Rien de prévu cette semaine" action={<Button size="lg" icon={<Sparkles className="h-5 w-5" />} onClick={() => generate.mutate({ weekStart: week })}>Créer ma semaine</Button>}>
          {warnings.length ? warnings.map((d) => <p key={d.message} className="text-[var(--danger)]">{d.message}</p>) : "En un clic : des repas variés, de saison et adaptés à ton foyer."}
        </EmptyState>
      ) : (
        <>
          <section aria-label="Résumé de la semaine" className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 scrollbar-none md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 [&>*]:min-w-[44%] [&>*]:snap-start md:[&>*]:min-w-0">
            <Stat label="Budget" icon={<Euro className="h-4 w-4" aria-hidden />} value={cost !== null ? formatMoney(cost) : "—"} hint={budget ? `sur ${formatMoney(budget)} prévus` : "aucun budget fixé"}>
              {budget && cost !== null ? <Progress value={cost} max={budget} tone={cost > budget ? "danger" : "primary"} label="Part du budget utilisée" /> : null}
            </Stat>
            <Stat label="Repas" icon={<ChefHat className="h-4 w-4" aria-hidden />} value={meals.length} hint={`${meals.filter((m) => m.cookedAt).length} déjà cuisiné(s)`} />
            <Stat label="Variété" icon={<Sparkles className="h-4 w-4" aria-hidden />} value={`${distinct} recettes`} hint={distinct === meals.length ? "aucune répétition" : `${meals.length - distinct} répétition(s)`} />
            <Stat label="Équilibre" icon={<Leaf className="h-4 w-4" aria-hidden />} value={`${plan.data?.nutrition.score ?? 0}/100`} hint={plan.data?.nutrition.alerts.length ? "voir les conseils" : "bel équilibre"}>
              <Progress value={plan.data?.nutrition.score ?? 0} tone={(plan.data?.nutrition.score ?? 0) >= 60 ? "primary" : "warning"} label="Score nutrition" />
            </Stat>
          </section>

          <nav aria-label="Jours" className="no-print -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none md:mx-0 md:px-0">
            {DAY.map((d, i) => {
              const iso = dateOf(week, i).toISOString().slice(0, 10);
              return (
                <button key={d} type="button" onClick={() => scrollTo(i)} className={cn("flex min-w-16 flex-col items-center rounded-[var(--radius)] border px-3 py-2 transition-colors", iso === today ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-text)]" : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]")}>
                  <span className="text-xs font-semibold uppercase">{d.slice(0, 3)}</span>
                  <span className="font-display text-xl font-semibold">{dateOf(week, i).getUTCDate()}</span>
                </button>
              );
            })}
          </nav>

          <DndContext sensors={sensors} onDragEnd={onDragEnd} accessibility={{ screenReaderInstructions: { draggable: "Espace pour saisir le repas, flèches pour le déplacer, espace pour le déposer." } }}>
            <div className="flex flex-col gap-6">
              {DAY.map((d, day) => {
                const iso = dateOf(week, day).toISOString().slice(0, 10);
                return (
                  <section key={d} id={`day-${day}`} aria-labelledby={`h-day-${day}`} className="scroll-mt-24">
                    <h2 id={`h-day-${day}`} className="mb-3 flex items-center gap-2 font-display text-xl font-semibold">
                      {d} <span className="font-sans text-base font-normal text-[var(--text-muted)]">{dateOf(week, day).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</span>
                      {iso === today ? <Badge tone="primary">Aujourd&apos;hui</Badge> : null}
                    </h2>
                    <div className={cn("grid gap-3", slots.length >= 3 ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2")}>
                      {slots.map((slot) => {
                        const m = meals.find((x) => x.day === day && x.slot === slot);
                        return (
                          <Cell key={slot} day={day} slot={slot}>
                            {m ? (
                              <MealCard meal={m} week={week} />
                            ) : (
                              <div className="flex h-full min-h-[92px] items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] text-sm text-[var(--text-muted)]">
                                <ListPlus className="h-4 w-4" aria-hidden /> {SLOT_UI[slot].label} libre
                              </div>
                            )}
                          </Cell>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </DndContext>

          {plan.data?.nutrition.alerts.length ? (
            <aside className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
              <h2 className="font-display text-lg font-semibold">Conseils d&apos;équilibre</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {plan.data.nutrition.alerts.map((a) => <li key={a}><Badge tone="saffron">{{ "nutrition.lowEnergy": "Repas plutôt légers", "nutrition.highEnergy": "Repas copieux", "nutrition.lowFiber": "Ajoute des légumes ou légumineuses", "nutrition.lowProtein": "Un peu juste en protéines", "nutrition.lowVegetableDiversity": "Varie les légumes" }[a] ?? a}</Badge></li>)}
              </ul>
              <p className="mt-3 text-xs text-[var(--text-muted)]">Indicatif, calculé sur les recettes de la semaine — pas un conseil médical.</p>
            </aside>
          ) : null}
          <p className="no-print text-sm text-[var(--text-muted)]">Astuce : glisse un repas vers un autre créneau pour l&apos;échanger · <a className="underline" href={`/api/ics?week=${week}`}>Exporter vers mon agenda</a></p>
        </>
      )}
    </div>
  );
}
