import { env } from "@/server/env";
import { metrics } from "@/server/metrics";

export const dynamic = "force-dynamic";

/** Prometheus. Protégé par jeton si METRICS_TOKEN est défini (sinon à restreindre au proxy). */
export async function GET(req: Request): Promise<Response> {
  const token = env().METRICS_TOKEN;
  if (token && req.headers.get("authorization") !== `Bearer ${token}`) return new Response("forbidden", { status: 403 });
  const m = metrics();
  return new Response(await m.registry.metrics(), { headers: { "content-type": m.registry.contentType } });
}
