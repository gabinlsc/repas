import { pingDb } from "@/server/db";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

/** Santé : base obligatoire ; le solveur est signalé mais non bloquant (dégradation). */
export async function GET(): Promise<Response> {
  const dbOk = await pingDb();
  let planner = "unknown";
  try {
    const r = await fetch(`${env().PLANNER_URL}/health`, { signal: AbortSignal.timeout(1500) });
    planner = r.ok ? "ok" : "down";
  } catch {
    planner = "down";
  }
  return Response.json({ status: dbOk ? "ok" : "degraded", db: dbOk ? "ok" : "down", planner }, { status: dbOk ? 200 : 503 });
}
