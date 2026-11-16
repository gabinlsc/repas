import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "@/server/context";
import { env } from "@/server/env";
import { logger } from "@/server/logger";
import { appRouter } from "@/server/routers/_app";
import { isSameOrigin } from "@/server/security";

async function handler(req: Request): Promise<Response> {
  // CSRF : les mutations (POST) doivent provenir de notre origine.
  if (req.method === "POST" && !isSameOrigin(req, env().APP_URL)) {
    return new Response(JSON.stringify({ error: "Origine refusée" }), { status: 403, headers: { "content-type": "application/json" } });
  }
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: ({ resHeaders }) => createContext(req, resHeaders),
    onError({ error, path }) {
      if (error.code === "INTERNAL_SERVER_ERROR") logger.error({ path, err: error.message }, "erreur tRPC");
    },
    responseMeta() {
      return { headers: { "cache-control": "no-store" } };
    },
  });
}

export { handler as GET, handler as POST };
