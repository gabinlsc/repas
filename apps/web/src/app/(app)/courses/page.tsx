"use client";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCheck, ChevronDown, Copy, PackageOpen, Printer, Store } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Progress, Skeleton, cn, useToast, buttonClass } from "@mise/ui";
import { PageHeader } from "@/components/AppShell";
import { useListSync } from "@/components/useListSync";
import { formatMoney } from "@/lib/i18n";
import { AISLE_FR } from "@/lib/labels";
import { AISLE_EMOJI } from "@/lib/recipe-visual";
import { useTRPC } from "@/lib/trpc";

const REASON_FR: Record<string, string> = { fuzzy: "selon ton goût", unresolved: "à préciser", unconvertible: "unité à vérifier", no_product: "prix inconnu", optional: "facultatif" };

export default function ShoppingPage() {
  const trpc = useTRPC();
  const toast = useToast();
  const { data, loading, error, patch, refetch } = useListSync();
  const [openCheck, setOpenCheck] = useState(false);
  const md = useQuery({ ...trpc.shopping.markdown.queryOptions({ listId: data?.list.id ?? "00000000-0000-0000-0000-000000000000" }), enabled: false });
  const close = useMutation(trpc.shopping.close.mutationOptions({ onSuccess: (r) => { toast.show(`Courses terminées : ${r.addedToPantry} article(s) rangé(s) dans le stock`); void refetch(); } }));
  if (loading) return <div className="flex flex-col gap-4"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>;
  if (error) return <ErrorState title="Impossible de charger la liste" detail={error.message} onRetry={() => void refetch()} retryLabel="Réessayer" />;
  if (!data) return <EmptyState art="🛒" title="Pas encore de liste" action={<Link href="/semaine" className={buttonClass()}>Voir ma semaine</Link>}>Génère ta semaine puis « Liste de courses » : tout est calculé pour toi.</EmptyState>;

  const groups = new Map<string, typeof data.items>();
  for (const i of data.items) groups.set(i.aisle, [...(groups.get(i.aisle) ?? []), i]);
  const done = data.items.filter((i) => i.checked).length;
  const surplus = data.items.filter((i) => i.surplusDisplay);
  const copy = async () => {
    const r = await md.refetch();
    if (r.data) {
      await navigator.clipboard.writeText(r.data);
      toast.show("Liste copiée : colle-la dans un message ou une note");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Liste de courses"
        subtitle={`${data.items.length} articles · rangés dans l'ordre des rayons`}
        actions={
          <>
            <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => void copy()}>Copier</Button>
            <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Imprimer</Button>
            <Link href="/courses/magasin" className={buttonClass("primary", "md", "gap-2")}><Store className="h-4 w-4" aria-hidden />Mode magasin</Link>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-[1fr_auto]" aria-label="Résumé">
        <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text-muted)]">Total estimé</p>
              <p className="font-display text-4xl font-semibold tabular-nums">{formatMoney(data.list.estimatedCents)}</p>
            </div>
            <p className="text-right text-sm text-[var(--text-muted)]"><span className="font-display text-2xl font-semibold text-[var(--text)]">{done}</span> / {data.items.length} dans le panier</p>
          </div>
          <Progress value={done} max={Math.max(1, data.items.length)} label="Articles cochés" />
          {data.list.totalIsPartial ? <p className="text-xs text-[var(--text-muted)]">Certains prix sont inconnus : le total est une estimation basse.</p> : null}
        </div>
      </section>

      <div className="print-cols grid gap-4 lg:grid-cols-2">
        {[...groups.entries()].map(([aisle, items]) => (
          <section key={aisle} aria-labelledby={`a-${aisle}`} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
            <h2 id={`a-${aisle}`} className="mb-2 flex items-center gap-2 font-display text-lg font-semibold">
              <span aria-hidden>{AISLE_EMOJI[aisle] ?? "🛍️"}</span>{AISLE_FR[aisle] ?? aisle}
              <span className="ml-auto font-sans text-sm font-medium text-[var(--text-muted)]">{items.filter((i) => i.checked).length}/{items.length}</span>
            </h2>
            <ul className="flex flex-col">
              {items.map((i) => (
                <li key={i.id}>
                  <label htmlFor={`c-${i.id}`} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2 hover:bg-[var(--surface-2)]">
                    <input id={`c-${i.id}`} type="checkbox" className="h-6 w-6 shrink-0 cursor-pointer rounded-full accent-[var(--primary)]" checked={i.checked} onChange={(e) => void patch(i, { checked: e.target.checked })} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={cn("font-medium", i.checked && "text-[var(--text-subtle)] line-through")}>{i.label}</span>
                      {i.packs.length ? <span className="truncate text-sm text-[var(--text-muted)]">{i.packs.map((p) => `${p.count} × ${p.name}`).join(" + ")}</span> : null}
                    </span>
                    <span className="flex shrink-0 flex-col items-end text-sm">
                      {i.display ? <span className="font-semibold tabular-nums">{i.display}</span> : null}
                      {i.estimatedCents !== null ? <span className="text-[var(--text-muted)] tabular-nums">{formatMoney(i.estimatedCents)}</span> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {data.list.toCheck.length ? (
        <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <button type="button" aria-expanded={openCheck} onClick={() => setOpenCheck(!openCheck)} className="flex w-full items-center justify-between text-left">
            <span><span className="font-display text-lg font-semibold">Basiques à vérifier</span><span className="block text-sm text-[var(--text-muted)]">Sel, épices, herbes… vérifie que tu en as encore ({data.list.toCheck.length}).</span></span>
            <ChevronDown className={cn("h-5 w-5 transition-transform", openCheck && "rotate-180")} aria-hidden />
          </button>
          {openCheck ? <ul className="mt-3 flex flex-wrap gap-2">{data.list.toCheck.map((x) => <li key={x.label + x.reason}><Badge>{x.label} · {REASON_FR[x.reason] ?? x.reason}</Badge></li>)}</ul> : null}
        </section>
      ) : null}

      {surplus.length ? (
        <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><PackageOpen className="h-5 w-5" aria-hidden />Ce qui restera dans tes placards</h2>
          <p className="text-sm text-[var(--text-muted)]">Les paquets vendus sont plus grands que le besoin : ce surplus rejoindra ton stock et sera utilisé en priorité la semaine prochaine.</p>
          <ul className="mt-2 flex flex-wrap gap-2">{surplus.map((s) => <li key={s.id}><Badge tone="primary">{s.label} · {s.surplusDisplay}</Badge></li>)}</ul>
        </section>
      ) : null}

      <Button className="no-print self-start" variant="soft" size="lg" icon={<CheckCheck className="h-5 w-5" />} loading={close.isPending} onClick={() => close.mutate({ listId: data.list.id })}>J&apos;ai fini mes courses</Button>
    </div>
  );
}
