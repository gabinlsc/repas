"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { parseEuroToCents } from "@mise/domain";
import { BigCheckbox, Button, EmptyState, Input, Skeleton } from "@mise/ui";
import { useOnline } from "@/components/AppShell";
import { useListSync } from "@/components/useListSync";
import { formatMoney, translator } from "@/lib/i18n";
import { AISLE_FR } from "@/lib/labels";

const t = translator();

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
  if (!data) return <EmptyState title={t("shopping.empty")} />;
  const left = data.items.filter((i) => !i.checked).length;
  const spent = data.items.reduce((s, i) => s + (i.actualPriceCents ?? 0), 0);
  const submitExtra = (e: FormEvent) => {
    e.preventDefault();
    if (extra.trim()) void addExtra(extra.trim());
    setExtra("");
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("shopping.store")}</h1>
        <Link href="/courses" className="underline">Liste</Link>
      </div>
      <p role="status" className="text-lg">{left} article(s) restant(s) · payé : {formatMoney(spent)} {!online || pending ? <span className="text-sm text-[var(--warning)]">· {pending} modification(s) en attente</span> : null}</p>
      {[...new Set(data.items.map((i) => i.aisle))].map((aisle) => (
        <section key={aisle} aria-labelledby={`s-${aisle}`} className="flex flex-col gap-2">
          <h2 id={`s-${aisle}`} className="sticky top-14 bg-[var(--bg)] py-1 text-lg font-semibold">{AISLE_FR[aisle] ?? aisle}</h2>
          {data.items.filter((i) => i.aisle === aisle).map((i) => (
            <div key={i.id} className="flex flex-col gap-1">
              <BigCheckbox id={`b-${i.id}`} checked={i.checked} onChange={(v) => void patch(i, { checked: v })} label={i.label} sublabel={[i.display, i.packs.map((p) => `${p.count} × ${p.name}`).join(" + "), i.actualPriceCents !== null ? `payé ${formatMoney(i.actualPriceCents)}` : null].filter(Boolean).join(" · ")} />
              {priceFor === i.id ? (
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void patch(i, { actualPriceCents: parseEuroToCents(price) }); setPriceFor(null); setPrice(""); }}>
                  <Input aria-label={t("shopping.price")} inputMode="decimal" autoFocus value={price} onChange={(e) => setPrice(e.target.value)} placeholder="3,49" />
                  <Button type="submit">OK</Button>
                </form>
              ) : (
                <Button size="sm" variant="ghost" className="self-end" onClick={() => setPriceFor(i.id)}>{t("shopping.price")}</Button>
              )}
            </div>
          ))}
        </section>
      ))}
      <form onSubmit={submitExtra} className="flex gap-2">
        <Input aria-label={t("shopping.addExtra")} placeholder={t("shopping.addExtra")} value={extra} onChange={(e) => setExtra(e.target.value)} />
        <Button type="submit">{t("common.add")}</Button>
      </form>
    </div>
  );
}
