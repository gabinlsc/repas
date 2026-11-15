import { DomainError } from "./errors.js";

/**
 * Horloge logique hybride (HLC) : ordre total robuste aux horloges désynchronisées.
 * Encodage lexicographiquement triable : 15 chiffres de ms, 6 de compteur, id de nœud.
 */
export interface Hlc {
  readonly wall: number;
  readonly counter: number;
  readonly node: string;
}

export function encodeHlc(h: Hlc): string {
  return `${h.wall.toString().padStart(15, "0")}:${h.counter.toString().padStart(6, "0")}:${h.node}`;
}

export function decodeHlc(s: string): Hlc {
  const m = /^(\d{15}):(\d{6}):([A-Za-z0-9_-]{1,64})$/.exec(s);
  if (!m) throw new DomainError("INVALID_CLOCK", `Horloge invalide : ${s}`);
  return { wall: Number(m[1]), counter: Number(m[2]), node: m[3]! };
}

/** Nouvel événement local. */
export function tickHlc(prev: Hlc | null, nowMs: number, node: string): Hlc {
  if (!prev || nowMs > prev.wall) return { wall: nowMs, counter: 0, node };
  return { wall: prev.wall, counter: prev.counter + 1, node };
}

/** Réception d'une horloge distante : on avance au-delà des deux. */
export function receiveHlc(local: Hlc | null, remote: Hlc, nowMs: number, node: string): Hlc {
  const wall = Math.max(nowMs, local?.wall ?? 0, remote.wall);
  let counter = 0;
  if (local && wall === local.wall && wall === remote.wall) counter = Math.max(local.counter, remote.counter) + 1;
  else if (local && wall === local.wall) counter = local.counter + 1;
  else if (wall === remote.wall) counter = remote.counter + 1;
  return { wall, counter, node };
}

export type FieldClocks = Readonly<Record<string, string>>;

export interface LwwRecord<T extends Record<string, unknown>> {
  readonly value: T;
  readonly clocks: FieldClocks;
}

/**
 * Fusion « dernier écrivain gagne » champ par champ : commutative, associative,
 * idempotente (testé par propriétés) — deux membres cochant des articles différents
 * hors ligne ne s'écrasent jamais mutuellement.
 */
export function mergeLww<T extends Record<string, unknown>>(a: LwwRecord<T>, b: LwwRecord<T>): LwwRecord<T> {
  const value: Record<string, unknown> = { ...a.value };
  const clocks: Record<string, string> = { ...a.clocks };
  const keys = new Set([...Object.keys(a.value), ...Object.keys(b.value)]);
  for (const k of keys) {
    const ca = a.clocks[k] ?? "";
    const cb = b.clocks[k] ?? "";
    const takeB = cb > ca || (cb === ca && stableStringify(b.value[k]) > stableStringify(a.value[k]));
    if (takeB && k in b.value) {
      value[k] = b.value[k];
      if (cb) clocks[k] = cb;
    }
  }
  return { value: value as T, clocks };
}

/** Applique un patch horodaté : chaque champ du patch porte la même horloge. */
export function applyPatch<T extends Record<string, unknown>>(rec: LwwRecord<T>, patch: Partial<T>, clock: string): LwwRecord<T> {
  const clocks: Record<string, string> = {};
  for (const k of Object.keys(patch)) clocks[k] = clock;
  return mergeLww(rec, { value: patch as T, clocks });
}

function stableStringify(v: unknown): string {
  return JSON.stringify(v) ?? "undefined";
}
