import { eq } from "drizzle-orm";
import { householdMembers } from "@mise/db";
import { sessionFromCookieHeader, productionDeps } from "@/server/context";
import { bus, listChannel } from "@/server/realtime";

export const dynamic = "force-dynamic";

/** Flux SSE des changements de la liste du foyer (synchronisation temps réel). */
export async function GET(req: Request): Promise<Response> {
  const session = await sessionFromCookieHeader(req.headers.get("cookie"));
  if (!session) return new Response("unauthorized", { status: 401 });
  const [m] = await productionDeps().db.select({ h: householdMembers.householdId }).from(householdMembers).where(eq(householdMembers.userId, session.user.id)).limit(1);
  if (!m) return new Response("forbidden", { status: 403 });
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let ping: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (data: string) => controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      send(JSON.stringify({ type: "hello" }));
      unsubscribe = bus().subscribe(listChannel(m.h), send);
      ping = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 25_000);
      req.signal.addEventListener("abort", () => {
        unsubscribe();
        clearInterval(ping);
        controller.close();
      });
    },
    cancel() {
      unsubscribe();
      clearInterval(ping);
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
}
