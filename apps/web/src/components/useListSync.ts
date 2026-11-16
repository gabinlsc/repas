"use client";
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { decodeHlc, mergeLww } from "@mise/domain";
import { cacheList, cachedList, enqueueOp, flushOps, nextClock, observeClock } from "@/lib/offline";
import { useTRPC, useTRPCClient } from "@/lib/trpc";

type ListData = NonNullable<Awaited<ReturnType<ReturnType<typeof useTRPCClient>["shopping"]["latest"]["query"]>>>;
type Item = ListData["items"][number];
type Patch = { checked?: boolean; purchasedQuantity?: string | null; actualPriceCents?: number | null };

/**
 * Liste de courses « offline-first » : affichage depuis IndexedDB, modifications
 * appliquées localement puis mises en file ; synchronisation à la reconnexion et
 * à chaque notification SSE d'un autre membre.
 */
export function useListSync() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const qc = useQueryClient();
  const remote = useQuery({ ...trpc.shopping.latest.queryOptions(), retry: false });
  const [local, setLocal] = useState<ListData | null>(null);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    void cachedList().then((c) => {
      if (c && !local) setLocal(c.data as ListData);
    });
  }, [local]);

  useEffect(() => {
    if (!remote.data) return;
    setLocal((prev) => {
      // Fusion LWW : un changement local non encore synchronisé n'est pas écrasé.
      if (!prev || prev.list.id !== remote.data!.list.id) return remote.data!;
      const items = remote.data!.items.map((ri) => {
        const li = prev.items.find((x) => x.id === ri.id);
        if (!li) return ri;
        const merged = mergeLww({ value: pick(li), clocks: li.fieldClocks }, { value: pick(ri), clocks: ri.fieldClocks });
        return { ...ri, ...merged.value, fieldClocks: merged.clocks };
      });
      const extrasLocal = prev.items.filter((li) => li.isExtra && !remote.data!.items.some((r) => r.id === li.id));
      return { ...remote.data!, items: [...items, ...extrasLocal] };
    });
    for (const i of remote.data.items) for (const c of Object.values(i.fieldClocks)) if (c) void observeClock(decodeHlc(c));
  }, [remote.data]);

  useEffect(() => {
    if (local) void cacheList(local.list.id, local);
  }, [local]);

  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      await flushOps((ops) => client.shopping.sync.mutate({ ops: ops as never }));
      await qc.invalidateQueries({ queryKey: trpc.shopping.latest.queryKey() });
    } finally {
      const { offlineDb } = await import("@/lib/offline");
      setPending(await offlineDb().ops.count());
    }
  }, [client, qc, trpc]);

  useEffect(() => {
    void flush();
    window.addEventListener("online", flush);
    let es: EventSource | null = null;
    if (typeof EventSource !== "undefined") {
      es = new EventSource("/api/events");
      es.onmessage = () => void qc.invalidateQueries({ queryKey: trpc.shopping.latest.queryKey() });
    }
    return () => {
      window.removeEventListener("online", flush);
      es?.close();
    };
  }, [flush, qc, trpc]);

  const patch = useCallback(
    async (item: Item, p: Patch) => {
      // Mise à jour optimiste immédiate (retour visuel instantané), horloge ensuite.
      setLocal((prev) => prev && { ...prev, items: prev.items.map((i) => (i.id === item.id ? { ...i, ...p } : i)) });
      const clock = await nextClock();
      setLocal((prev) => prev && { ...prev, items: prev.items.map((i) => (i.id === item.id ? { ...i, fieldClocks: { ...i.fieldClocks, ...Object.fromEntries(Object.keys(p).map((k) => [k, clock])) } } : i)) });
      await enqueueOp({ id: crypto.randomUUID(), type: "patch", itemId: item.id, patch: p, clock });
      void flush();
    },
    [flush],
  );

  const addExtra = useCallback(
    async (label: string) => {
      if (!local) return;
      const clock = await nextClock();
      const itemId = crypto.randomUUID();
      const fake = { ...local.items[0]!, id: itemId, label, aisle: "epicerie_salee" as const, isExtra: true, checked: false, ingredientId: null, packs: [], display: null, surplusDisplay: null, estimatedCents: null, actualPriceCents: null, purchasedQuantity: null, fieldClocks: {} };
      setLocal({ ...local, items: [...local.items, fake] });
      await enqueueOp({ id: crypto.randomUUID(), type: "add", itemId, listId: local.list.id, label, aisle: "epicerie_salee", clock });
      void flush();
    },
    [local, flush],
  );

  return { data: local, loading: remote.isLoading && !local, error: remote.error && !local ? remote.error : null, patch, addExtra, pending, refetch: remote.refetch };
}

function pick(i: Item): Required<Patch> {
  return { checked: i.checked, purchasedQuantity: i.purchasedQuantity, actualPriceCents: i.actualPriceCents };
}
