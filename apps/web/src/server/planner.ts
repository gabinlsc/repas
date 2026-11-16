import type { PlanRequest } from "@mise/domain";
import { fetchWithRetry } from "./http";

/** Client du solveur : délai = limite de résolution + marge réseau. */
export function plannerClient(baseUrl: string) {
  return async (req: PlanRequest): Promise<unknown> => {
    const res = await fetchWithRetry(`${baseUrl}/v1/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      timeoutMs: (req.time_limit_s * 2 + 10) * 1000,
      retries: 1,
    });
    if (!res.ok) throw new Error(`Solveur : HTTP ${res.status} ${(await res.text()).slice(0, 500)}`);
    return res.json();
  };
}
