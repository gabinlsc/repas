import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Db } from "@mise/db";

/** Paramètres Argon2id recommandés par l'OWASP (m = 19 MiB, t = 2, p = 1). */
const ARGON = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string): Promise<string> => argonHash(password, ARGON);

export async function verifyPassword(hashed: string | null, password: string): Promise<boolean> {
  if (!hashed) {
    // Compte sans mot de passe (OAuth) ou inexistant : on calcule quand même un hash
    // pour ne pas révéler l'existence du compte par le temps de réponse.
    await argonHash(password, ARGON);
    return false;
  }
  try {
    return await argonVerify(hashed, password);
  } catch {
    return false;
  }
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

export function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export class RateLimitError extends Error {
  constructor(readonly retryAfterS: number) {
    super("Trop de tentatives, réessayez plus tard.");
  }
}

/**
 * Limitation de débit à fenêtre fixe, stockée en base (fonctionne sur plusieurs
 * instances sans dépendance supplémentaire). Une seule requête atomique par appel.
 */
export async function rateLimit(db: Db, key: string, limit: number, windowS: number): Promise<void> {
  const rows = await db.execute<{ count: number; reset_at: Date }>(sql`
    insert into rate_limit (key, count, reset_at) values (${key}, 1, now() + make_interval(secs => ${windowS}))
    on conflict (key) do update set
      count = case when rate_limit.reset_at < now() then 1 else rate_limit.count + 1 end,
      reset_at = case when rate_limit.reset_at < now() then now() + make_interval(secs => ${windowS}) else rate_limit.reset_at end
    returning count, reset_at`);
  const row = rows[0];
  if (row && row.count > limit) throw new RateLimitError(Math.max(1, Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000)));
}

/** Protection CSRF : toute mutation doit venir de notre propre origine. */
export function isSameOrigin(req: Request, appUrl: string): boolean {
  const origin = req.headers.get("origin");
  if (!origin) {
    // Les navigateurs envoient Origin sur les POST ; son absence = client non navigateur.
    return req.headers.get("sec-fetch-site") === "same-origin";
  }
  try {
    const o = new URL(origin);
    const a = new URL(appUrl);
    if (o.host === a.host && o.protocol === a.protocol) return true;
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return host !== null && o.host === host;
  } catch {
    return false;
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}
