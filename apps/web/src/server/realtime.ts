import { Redis } from "ioredis";
import { EventEmitter } from "node:events";
import { env } from "./env";

/**
 * Diffusion des changements de liste de courses aux autres membres du foyer (SSE).
 * Redis pub/sub si disponible (plusieurs instances), sinon émetteur en mémoire.
 */
type Listener = (msg: string) => void;
const g = globalThis as unknown as { __miseBus?: { publish: (ch: string, msg: string) => void; subscribe: (ch: string, l: Listener) => () => void } };

export function bus() {
  if (g.__miseBus) return g.__miseBus;
  const url = env().REDIS_URL;
  if (url) {
    const pub = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
    const sub = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
    const local = new EventEmitter();
    local.setMaxListeners(1000);
    sub.on("message", (ch: string, msg: string) => local.emit(ch, msg));
    g.__miseBus = {
      publish: (ch, msg) => void pub.publish(ch, msg),
      subscribe: (ch, l) => {
        if (local.listenerCount(ch) === 0) void sub.subscribe(ch);
        local.on(ch, l);
        return () => {
          local.off(ch, l);
          if (local.listenerCount(ch) === 0) void sub.unsubscribe(ch);
        };
      },
    };
  } else {
    const local = new EventEmitter();
    local.setMaxListeners(1000);
    g.__miseBus = {
      publish: (ch, msg) => void local.emit(ch, msg),
      subscribe: (ch, l) => {
        local.on(ch, l);
        return () => void local.off(ch, l);
      },
    };
  }
  return g.__miseBus;
}

export const listChannel = (householdId: string) => `household:${householdId}:shopping`;
