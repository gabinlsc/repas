import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { sessions, users, type Db } from "@mise/db";
import { hashToken, newToken } from "./security";

export const SESSION_COOKIE = "mise_session";
const SESSION_DAYS = 30;
const ROTATE_AFTER_MS = 24 * 3600 * 1000;
/** Fenêtre de grâce de l'ancien jeton après rotation (requêtes parallèles d'un même onglet). */
const GRACE_MS = 60 * 1000;

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly locale: string;
}

export interface SessionResult {
  readonly user: SessionUser;
  readonly sessionId: string;
  /** nouveau jeton à poser en cookie si la session vient d'être tournée. */
  readonly rotatedToken: string | null;
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function readSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return v.join("=") || null;
  }
  return null;
}

export async function createSession(db: Db, userId: string, userAgent: string | null): Promise<string> {
  const token = newToken();
  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000), userAgent: userAgent?.slice(0, 200) ?? null });
  return token;
}

/**
 * Valide le jeton et applique la rotation : au-delà de 24 h, un nouveau jeton remplace
 * l'ancien (qui reste accepté 60 s). Un jeton volé devient ainsi vite inutilisable.
 */
export async function validateSession(db: Db, token: string): Promise<SessionResult | null> {
  const h = hashToken(token);
  const now = new Date();
  const rows = await db
    .select({ s: sessions, u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        gt(sessions.expiresAt, now),
        isNull(users.deletedAt),
        or(eq(sessions.tokenHash, h), and(eq(sessions.previousTokenHash, h), gt(sessions.rotatedAt, new Date(now.getTime() - GRACE_MS)))),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const user = { id: row.u.id, email: row.u.email, displayName: row.u.displayName, locale: row.u.locale };
  const isCurrent = row.s.tokenHash.equals(h);
  if (isCurrent && now.getTime() - row.s.rotatedAt.getTime() > ROTATE_AFTER_MS) {
    const fresh = newToken();
    await db
      .update(sessions)
      .set({ tokenHash: hashToken(fresh), previousTokenHash: h, rotatedAt: now, expiresAt: new Date(now.getTime() + SESSION_DAYS * 86400_000) })
      .where(eq(sessions.id, row.s.id));
    return { user, sessionId: row.s.id, rotatedToken: fresh };
  }
  return { user, sessionId: row.s.id, rotatedToken: null };
}

export async function destroySession(db: Db, sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function destroyAllSessions(db: Db, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function purgeExpiredSessions(db: Db): Promise<void> {
  await db.delete(sessions).where(sql`${sessions.expiresAt} < now()`);
}
