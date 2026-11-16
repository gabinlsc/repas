import { fetchWithRetry } from "./http";

/**
 * Open Food Facts (licence ODbL) : cache mémoire 24 h, délai court, et dégradation
 * gracieuse (null) si le service est indisponible. User-Agent identifiant l'application
 * comme le demandent leurs règles d'usage, sans donnée personnelle.
 */
const cache = new Map<string, { at: number; value: Awaited<ReturnType<ReturnType<typeof offClient>>> }>();

export function offClient(userAgent: string) {
  return async (ean: string): Promise<{ name: string; brand: string | null; quantity: string | null; allergens: string[] } | null> => {
    const hit = cache.get(ean);
    if (hit && Date.now() - hit.at < 86400_000) return hit.value;
    try {
      const res = await fetchWithRetry(`https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=product_name,product_name_fr,brands,quantity,allergens_tags`, {
        headers: { "user-agent": userAgent },
        timeoutMs: 4000,
        retries: 1,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { status?: number; product?: { product_name_fr?: string; product_name?: string; brands?: string; quantity?: string; allergens_tags?: string[] } };
      const p = data.product;
      const value = data.status === 1 && p ? { name: p.product_name_fr || p.product_name || ean, brand: p.brands ?? null, quantity: p.quantity ?? null, allergens: (p.allergens_tags ?? []).map((a) => a.replace(/^en:/, "")) } : null;
      cache.set(ean, { at: Date.now(), value });
      return value;
    } catch {
      return null;
    }
  };
}
