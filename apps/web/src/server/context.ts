import { readSessionToken, sessionCookie, validateSession } from "./auth";
import { db } from "./db";
import { env } from "./env";
import { fetchPublicPage } from "./http";
import { offClient } from "./off";
import { defaultEnqueue } from "./queue";
import { bus, listChannel } from "./realtime";
import { clientIp } from "./security";
import type { Context, Deps } from "./trpc";

let deps: Deps | null = null;

export function productionDeps(): Deps {
  if (deps) return deps;
  const e = env();
  const d = db();
  deps = {
    db: d,
    ring: e.keyring,
    enqueue: defaultEnqueue(d),
    publish: (householdId, payload) => bus().publish(listChannel(householdId), JSON.stringify(payload)),
    fetchPage: (url) => fetchPublicPage(url),
    lookupEan: offClient(e.OFF_USER_AGENT),
    cookieSecure: e.cookieSecure,
    plannerTimeLimitS: e.PLANNER_TIME_LIMIT_S,
  };
  return deps;
}

export async function createContext(req: Request, resHeaders: Headers, base: Deps = productionDeps()): Promise<Context> {
  const token = readSessionToken(req.headers.get("cookie"));
  const session = token ? await validateSession(base.db, token) : null;
  if (session?.rotatedToken) resHeaders.append("set-cookie", sessionCookie(session.rotatedToken, base.cookieSecure));
  return {
    ...base,
    session,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
    setCookie: (c) => resHeaders.append("set-cookie", c),
  };
}

/** Session côté composants serveur (redirections d'accès). */
export async function sessionFromCookieHeader(cookie: string | null) {
  const token = readSessionToken(cookie);
  return token ? validateSession(productionDeps().db, token) : null;
}
