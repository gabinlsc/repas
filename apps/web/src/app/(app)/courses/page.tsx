"use client";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, useToast } from "@mise/ui";
import { useListSync } from "@/components/useListSync";
import { formatMoney, translator } from "@/lib/i18n";
import { useTRPC } from "@/lib/trpc";
import { AISLE_FR } from "@/lib/labels";

const t = translator();
const REASON_FR: Record<string, string> = { fuzzy: "quantité libre", unresolved: "ingrédient à préciser", unconvertible: "unité à vérifier", no_product: "prix inconnu", optional: "optionnel" };

export default function ShoppingPage() {
  const trpc = useTRPC();
  const toast = useToast();
  const { data, loading, error, patch, refetch } = useListSync();
  const md = useQuery({ ...trpc.shopping.markdown.queryOptions({ listId: data?.list.id ?? "00000000-0000-0000-0000-000000000000" }), enabled: false });
  const close = useMutation(trpc.shopping.close.mutationOptions({ onSuccess: (r) => { toast.show(`${r.addedToPantry} article(s) ajouté(s) au stock`); void refetch(); } }));
  if (loading) return <Skeleton className="h-96" />;
  if (error) return <ErrorState title={t("common.error")} detail={error.message} onRetry={() => void refetch()} retryLabel={t("common.retry")} />;
  if (!data) return <EmptyState title={t("shopping.empty")} action={<Link className="underline" href="/semaine">{t("nav.week")}</Link>} />;
  const groups = new Map<string, typeof data.items>();
  for (const i of data.items) groups.set(i.aisle, [...(groups.get(i.aisle) ?? []), i]);
  const surplus = data.items.filter((i) => i.surplusDisplay);
  const copy = async () => {
    const r = await md.refetch();
    if (r.data) {
      await navigator.clipboard.writeText(r.data);
      toast.show("Liste copiée au format Markdown");
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t("shopping.title")}</h1>
        <div className="no-print flex flex-wrap gap-2">
          <Link href="/courses/magasin" className="inline-flex h-11 items-center rounded-[var(--radius)] bg-[var(--primary)] px-4 font-medium text-[var(--primary-text)]">{t("shopping.store")}</Link>
          <Button variant="secondary" onClick={() => void copy()}>{t("shopping.export")}</Button>
          <Button variant="secondary" onClick={() => window.print()}>{t("shopping.print")}</Button>
        </div>
      </div>
      <Card className="flex flex-wrap items-center gap-3">
        <span className="text-lg font-semibold">{t("shopping.total")} : {formatMoney(data.list.estimatedCents)}</span>
        {data.list.totalIsPartial ? <Badge tone="warning">{t("shopping.partial")}</Badge> : null}
      </Card>
      <div className="print-cols flex flex-col gap-4">
        {[...groups.entries()].map(([aisle, items]) => (
          <section key={aisle} aria-labelledby={`a-${aisle}`}>
            <h2 id={`a-${aisle}`} className="mb-2 font-semibold">{AISLE_FR[aisle] ?? aisle}</h2>
            <ul className="flex flex-col gap-1">
              {items.map((i) => (
                <li key={i.id} className="flex items-start gap-3 rounded-lg px-2 py-1 hover:bg-[var(--surface-2)]">
                  <input id={`c-${i.id}`} type="checkbox" className="mt-1 h-5 w-5" checked={i.checked} onChange={(e) => void patch(i, { checked: e.target.checked })} />
                  <label htmlFor={`c-${i.id}`} className="flex flex-1 flex-col">
                    <span className={i.checked ? "line-through opacity-60" : ""}>{i.label} {i.display ? <span className="text-[var(--text-muted)]">— {i.display}</span> : null}</span>
                    {i.packs.length ? <span className="text-sm text-[var(--text-muted)]">{i.packs.map((p) => `${p.count} × ${p.name}`).join(" + ")}{i.estimatedCents !== null ? ` · ${formatMoney(i.estimatedCents)}` : ""}</span> : null}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {data.list.toCheck.length ? (
        <Card>
          <h2 className="mb-2 font-semibold">{t("shopping.toCheck")}</h2>
          <ul className="flex flex-wrap gap-2">{data.list.toCheck.map((x) => <li key={x.label + x.reason}><Badge>{x.label} · {REASON_FR[x.reason] ?? x.reason}</Badge></li>)}</ul>
        </Card>
      ) : null}
      {surplus.length ? (
        <Card>
          <h2 className="mb-2 font-semibold">{t("shopping.surplus")}</h2>
          <ul className="text-sm text-[var(--text-muted)]">{surplus.map((s) => <li key={s.id}>{s.label} : {s.surplusDisplay}</li>)}</ul>
        </Card>
      ) : null}
      <Button className="no-print self-start" variant="secondary" loading={close.isPending} onClick={() => close.mutate({ listId: data.list.id })}>{t("shopping.close")}</Button>
    </div>
  );
}
