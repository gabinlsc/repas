"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Euro, Plus, Wifi, WifiOff } from "lucide-react";
import { parseEuroToCents } from "@mise/domain";
import { BigCheckbox, Button, EmptyState, IconButton, Input, Progress, Skeleton } from "@mise/ui";
import { useOnline } from "@/components/AppShell";
import { useListSync } from "@/components/useListSync";
import { formatMoney } from "@/lib/i18n";
import { AISLE_FR } from "@/lib/labels";
import { AISLE_EMOJI } from "@/lib/recipe-visual";

/** Mode magasin : gros boutons, un tap pour cocher, écran maintenu allumé, hors ligne complet. */
export default function StoreMode() {
  const { data, loading, patch, addExtra, pending } = useListSync();
  const online = useOnline();
  const [extra, setExtra] = useState("");
  const [priceFor, setPriceFor] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    void nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => undefined);
    return () => void lock?.release();
  }, []);
  if (loading) return <Skeleton className="h-96" />;
  if (!data) return <EmptyState art="🛒" title="Pas de liste disponible" />;
  const left = data.items.filter((i) => !i.checked).length;
  const spent = data.items.reduce((s, i) => s + (i.actualPriceCents ?? 0), 0);
  const aisles = [...new Set(data.items.map((i) => i.aisle))];
  const submitExtra = (e: FormEvent) => {
    e.preventDefault();
    if (extra.trim()) void addExtra(extra.trim());
    setExtra("");
  };
  return (
    <div className="flex flex-col gap-5 pb-24">
      <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--bg)]/95 px-4 pb-3 pt-2 backdrop-blur md:top-0">
        <div className="flex items-center gap-2">
          <Link href="/courses" aria-label="Retour à la liste" className="rounded-full p-2 hover:bg-[var(--surface-2)]"><ArrowLeft className="h-5 w-5" /></Link>
          <h1 className="font-display text-2xl font-semibold">Mode magasin</h1>
          <span className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-[var(--text-muted)]">
            {online ? <Wifi className="h-4 w-4" aria-hidden /> : <WifiOff className="h-4 w-4 text-[var(--warning)]" aria-hidden />}
            {pending ? <span className="text-[var(--warning)]">{pending} modification(s) en attente</span> : online ? "synchronisé" : "hors ligne"}
          </span>
        </div>
        <p role="status" className="text-lg"><strong>{left}</strong> article(s) restant(s) · payé <strong>{formatMoney(spent)}</strong></p>
        <Progress value={data.items.length - left} max={Math.max(1, data.items.length)} label="Progression des courses" />
        <nav aria-label="Rayons" className="-mx-1 flex gap-2 overflow-x-auto px-1 scrollbar-none">
          {aisles.map((a) => (
            <a key={a} href={`#s-${a}`} className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium">{AISLE_EMOJI[a]} {AISLE_FR[a] ?? a}</a>
          ))}
        </nav>
      </div>
      {left === 0 && data.items.length ? <div className="rounded-[var(--radius-lg)] bg-[var(--primary)] p-5 text-center text-[var(--primary-text)]"><p className="text-3xl" aria-hidden>🎉</p><p className="font-display text-xl font-semibold">Tout est dans le panier !</p></div> : null}
      {aisles.map((aisle) => (
        <section key={aisle} id={`s-${aisle}`} aria-labelledby={`h-${aisle}`} className="flex scroll-mt-48 flex-col gap-2">
          <h2 id={`h-${aisle}`} className="flex items-center gap-2 font-display text-xl font-semibold"><span aria-hidden>{AISLE_EMOJI[aisle]}</span>{AISLE_FR[aisle] ?? aisle}</h2>
          {data.items.filter((i) => i.aisle === aisle).map((i) => (
            <div key={i.id} className="flex flex-col gap-1">
              <BigCheckbox
                id={`b-${i.id}`}
                checked={i.checked}
                onChange={(v) => void patch(i, { checked: v })}
                label={i.label}
                sublabel={[i.display, i.packs.map((p) => `${p.count} × ${p.name}`).join(" + "), i.actualPriceCents !== null ? `payé ${formatMoney(i.actualPriceCents)}` : null].filter(Boolean).join(" · ")}
                trailing={<IconButton label={`Saisir le prix payé pour ${i.label}`} variant="soft" size="sm" onClick={() => setPriceFor(priceFor === i.id ? null : i.id)}><Euro className="h-4 w-4" /></IconButton>}
              />
              {priceFor === i.id ? (
                <form className="mise-pop flex gap-2 pl-14" onSubmit={(e) => { e.preventDefault(); void patch(i, { actualPriceCents: parseEuroToCents(price) }); setPriceFor(null); setPrice(""); }}>
                  <Input aria-label={`Prix payé pour ${i.label} (€)`} inputMode="decimal" autoFocus value={price} onChange={(e) => setPrice(e.target.value)} placeholder="3,49" />
                  <Button type="submit">OK</Button>
                </form>
              ) : null}
            </div>
          ))}
        </section>
      ))}
      <form onSubmit={submitExtra} className="sticky bottom-20 flex gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] p-1.5 shadow-[var(--shadow-lg)] md:bottom-4">
        <label htmlFor="extra" className="sr-only">Ajouter un article</label>
        <input id="extra" placeholder="Ajouter un article (ex. éponges)" value={extra} onChange={(e) => setExtra(e.target.value)} className="h-11 min-w-0 flex-1 rounded-full bg-transparent px-4" />
        <Button type="submit" className="shrink-0" icon={<Plus className="h-4 w-4" />}>Ajouter</Button>
      </form>
    </div>
  );
}
