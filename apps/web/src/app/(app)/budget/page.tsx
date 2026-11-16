"use client";
import { useQuery } from "@tanstack/react-query";
import { Card, EmptyState, Skeleton } from "@mise/ui";
import { formatMoney, translator } from "@/lib/i18n";
import { useTRPC } from "@/lib/trpc";

const t = translator();

export default function BudgetPage() {
  const trpc = useTRPC();
  const s = useQuery(trpc.budget.summary.queryOptions({ weeks: 12 }));
  if (s.isLoading) return <Skeleton className="h-64" />;
  const weeks = s.data?.weeks ?? [];
  const max = Math.max(1, s.data?.budgetCents ?? 0, ...weeks.map((w) => Math.max(w.plannedCents ?? 0, w.actualCents ?? 0, w.listCents ?? 0)));
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("budget.title")}</h1>
      {s.data?.budgetCents ? <p>Budget hebdomadaire : <strong>{formatMoney(s.data.budgetCents)}</strong></p> : null}
      {!weeks.length ? <EmptyState title="Pas encore d'historique." /> : (
        <Card>
          <table className="w-full text-sm">
            <caption className="sr-only">Coût estimé et réel par semaine</caption>
            <thead><tr className="text-left text-[var(--text-muted)]"><th scope="col">Semaine</th><th scope="col">Estimé</th><th scope="col">Réel</th><th scope="col">Écart</th><th scope="col" aria-hidden /></tr></thead>
            <tbody>
              {weeks.map((w) => {
                const est = w.listCents ?? w.plannedCents;
                return (
                  <tr key={w.weekStart} className="border-t border-[var(--border)]">
                    <td className="py-2">{new Date(w.weekStart).toLocaleDateString("fr-FR")}</td>
                    <td>{est !== null ? formatMoney(est) : "—"}</td>
                    <td>{w.actualCents !== null ? formatMoney(w.actualCents) : "—"}</td>
                    <td>{est !== null && w.actualCents !== null ? formatMoney(w.actualCents - est) : "—"}</td>
                    <td className="w-1/3" aria-hidden>
                      <div className="h-2 rounded bg-[var(--surface-2)]"><div className="h-2 rounded bg-[var(--primary)]" style={{ width: `${Math.round(((w.actualCents ?? est ?? 0) / max) * 100)}%` }} /></div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
