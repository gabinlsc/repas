import Dexie, { type Table } from "dexie";
import { encodeHlc, receiveHlc, tickHlc, type Hlc } from "@mise/domain";

/**
 * Stockage hors ligne du mode magasin : la dernière liste (instantané) et une file
 * d'opérations idempotentes rejouée à la reconnexion. Fonctionne 30 min (et plus)
 * sans réseau : rien n'est perdu tant que l'onglet ou le navigateur est rouvert.
 */
export interface CachedList {
  id: string;
  data: unknown;
  savedAt: number;
}
export interface PendingOp {
  id: string;
  op: Record<string, unknown>;
  createdAt: number;
}

class OfflineDb extends Dexie {
  lists!: Table<CachedList, string>;
  ops!: Table<PendingOp, string>;
  meta!: Table<{ key: string; value: string }, string>;
  constructor() {
    super("mise-offline");
    this.version(1).stores({ lists: "id", ops: "id, createdAt", meta: "key" });
  }
}

let instance: OfflineDb | null = null;
export const offlineDb = (): OfflineDb => (instance ??= new OfflineDb());

let clock: Hlc | null = null;
async function nodeId(): Promise<string> {
  const db = offlineDb();
  const found = await db.meta.get("node");
  if (found) return found.value;
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  await db.meta.put({ key: "node", value: id });
  return id;
}

export async function nextClock(): Promise<string> {
  clock = tickHlc(clock, Date.now(), await nodeId());
  return encodeHlc(clock);
}

export async function observeClock(remote: Hlc): Promise<void> {
  clock = receiveHlc(clock, remote, Date.now(), await nodeId());
}

export async function enqueueOp(op: Record<string, unknown> & { id: string }): Promise<void> {
  await offlineDb().ops.put({ id: op.id, op, createdAt: Date.now() });
}

/** Rejoue la file dans l'ordre ; une opération n'est retirée qu'une fois acquittée. */
export async function flushOps(send: (ops: Array<Record<string, unknown>>) => Promise<{ results: Array<{ id: string }> }>): Promise<number> {
  const db = offlineDb();
  const pending = await db.ops.orderBy("createdAt").toArray();
  if (pending.length === 0) return 0;
  const res = await send(pending.map((p) => p.op));
  await db.ops.bulkDelete(res.results.map((r) => r.id));
  return res.results.length;
}

export async function cacheList(id: string, data: unknown): Promise<void> {
  await offlineDb().lists.put({ id, data, savedAt: Date.now() });
}

export async function cachedList(): Promise<CachedList | undefined> {
  return (await offlineDb().lists.toArray()).sort((a, b) => b.savedAt - a.savedAt)[0];
}
