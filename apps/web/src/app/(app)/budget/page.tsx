"use client";
import { useQuery } from "@tanstack/react-query";
import { PiggyBank, TrendingDown, TrendingUp } from "lucide-react";
import { EmptyState, Skeleton, Stat } from "@mise/ui";
import { PageHeader } from "@/components/AppShell";
import { formatMoney } from "@/lib/i18n";
import { useTRPC } from "@/lib/trpc";

export default function BudgetPage() {
  const trpc = useTRPC();
  const s = useQuery(trpc.budget.summary.queryOptions({ weeks: 12 }));
  if (s.isLoading) return <Skeleton className="h-96" />;
  const weeks = s.data?.weeks ?? [];
  const budget = s.data?.budgetCents ?? null;
  const est = (w: (typeof weeks)[number]) => w.listCents ?? w.plannedCents;
  const max = Math.max(1, budget ?? 0, ...weeks.map((w) => Math.max(est(w) ?? 0, w.actualCents ?? 0)));
  const withEst = weeks.filter((w) => est(w) !== null);
  const avg = withEst.length ? Math.round(withEst.reduce((a, w) => a + (est(w) ?? 0), 0) / withEst.length) : null;
  const real = weeks.filter((w) => w.actualCents !== null);
  const realAvg = real.length ? Math.round(real.reduce((a, w) => a + (w.actualCents ?? 0), 0) / real.length) : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Budget" subtitle="Estimations du plan, et dépenses réelles saisies en mode magasin." />
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Chiffres clés">
        <Stat label="Budget hebdomadaire" icon={<PiggyBank className="h-4 w-4" aria-hidden />} value={budget !== null ? formatMoney(budget) : "—"} hint="modifiable dans Réglages" />
        <Stat label="Estimé en moyenne" icon={<TrendingDown className="h-4 w-4" aria-hidden />} value={avg !== null ? formatMoney(avg) : "—"} hint={budget && avg !== null ? (avg <= budget ? `${formatMoney(budget - avg)} sous le budget` : `${formatMoney(avg - budget)} au-dessus`) : undefined} />
        <Stat label="Dépensé en moyenne" icon={<TrendingUp className="h-4 w-4" aria-hidden />} value={realAvg !== null ? formatMoney(realAvg) : "—"} hint={realAvg === null ? "saisis les prix payés en magasin" : undefined} />
      </section>
      {!weeks.length ? (
        <EmptyState art="📈" title="Pas encore d'historique">Ton suivi apparaîtra ici semaine après semaine.</EmptyState>
      ) : (
        <section aria-labelledby="hist-h" className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
          <h2 id="hist-h" className="mb-4 font-display text-xl font-semibold">Semaine par semaine</h2>
          <div className="flex items-end gap-3 overflow-x-auto pb-2" role="img" aria-label="Graphique des dépenses estimées et réelles par semaine">
            {weeks.map((w) => (
              <div key={w.weekStart} className="flex min-w-14 flex-1 flex-col items-center gap-2">
                <div className="relative flex h-48 w-full items-end justify-center gap-1">
                  {budget ? <div className="absolute inset-x-0 border-t-2 border-dashed border-[var(--accent)]" style={{ bottom: `${(budget / max) * 100}%` }} aria-hidden /> : null}
                  <div className="w-1/3 rounded-t-md bg-[var(--primary-soft)]" style={{ height: `${((est(w) ?? 0) / max) * 100}%` }} />
                  <div className="w-1/3 rounded-t-md bg-[var(--primary)]" style={{ height: `${((w.actualCents ?? 0) / max) * 100}%` }} />
                </div>
                <span className="text-xs text-[var(--text-muted)]">{new Date(w.weekStart).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-[var(--text-muted)]">
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-[var(--primary-soft)]" aria-hidden />Estimé</span>
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-[var(--primary)]" aria-hidden />Réel</span>
            {budget ? <span className="flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-[var(--accent)]" aria-hidden />Budget</span> : null}
          </div>
          <table className="mt-6 w-full text-sm">
            <caption className="sr-only">Détail par semaine</caption>
            <thead><tr className="text-left text-[var(--text-muted)]"><th scope="col" className="py-2">Semaine du</th><th scope="col">Estimé</th><th scope="col">Réel</th><th scope="col">Écart</th></tr></thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.weekStart} className="border-t border-[var(--border)]">
                  <td className="py-2.5">{new Date(w.weekStart).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</td>
                  <td className="tabular-nums">{est(w) !== null ? formatMoney(est(w)!) : "—"}</td>
                  <td className="tabular-nums">{w.actualCents !== null ? formatMoney(w.actualCents) : "—"}</td>
                  <td className="tabular-nums">{est(w) !== null && w.actualCents !== null ? formatMoney(w.actualCents - est(w)!) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
