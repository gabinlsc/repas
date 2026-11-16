import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class ExternalError extends Error {
  constructor(readonly code: "TIMEOUT" | "HTTP" | "TOO_LARGE" | "FORBIDDEN_HOST" | "NETWORK", message: string) {
    super(message);
  }
}

/**
 * Appel HTTP externe robuste : délai maximal, nouvelles tentatives avec attente
 * exponentielle (+ gigue) sur erreurs réseau et 5xx/429, jamais sur 4xx.
 */
export async function fetchWithRetry(url: string, init: RequestInit & { timeoutMs?: number; retries?: number } = {}): Promise<Response> {
  const { timeoutMs = 8000, retries = 2, ...rest } = init;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...rest, signal: ctrl.signal, redirect: rest.redirect ?? "follow" });
      if (res.status >= 500 || res.status === 429) {
        lastErr = new ExternalError("HTTP", `HTTP ${res.status}`);
      } else {
        return res;
      }
    } catch (e) {
      lastErr = (e as Error).name === "AbortError" ? new ExternalError("TIMEOUT", "Délai dépassé") : new ExternalError("NETWORK", (e as Error).message);
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 200 * 2 ** attempt + Math.random() * 100));
  }
  throw lastErr;
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const l = ip.toLowerCase();
    if (l === "::1" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l === "::") return true;
    if (l.startsWith("::ffff:")) return isPrivateIp(l.slice(7));
    return false;
  }
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/**
 * Téléchargement d'une page tierce (import de recette par URL) protégé contre le SSRF :
 * http(s) uniquement, résolution DNS vérifiée (pas d'IP privée), pas de redirection
 * automatique, taille et durée bornées.
 */
export async function fetchPublicPage(raw: string, maxBytes = 3_000_000, hops = 3): Promise<{ url: string; html: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ExternalError("FORBIDDEN_HOST", "URL invalide");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ExternalError("FORBIDDEN_HOST", "Seules les URL http(s) sont acceptées");
  if (url.username || url.password) throw new ExternalError("FORBIDDEN_HOST", "Identifiants interdits dans l'URL");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) throw new ExternalError("FORBIDDEN_HOST", "Hôte non autorisé");
  const res = await fetchWithRetry(url.toString(), { redirect: "manual", retries: 1, timeoutMs: 8000, headers: { "user-agent": "MiseRecipeImporter/1.0", accept: "text/html" } });
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (!loc || hops === 0) throw new ExternalError("HTTP", "Trop de redirections");
    return fetchPublicPage(new URL(loc, url).toString(), maxBytes, hops - 1);
  }
  if (!res.ok) throw new ExternalError("HTTP", `HTTP ${res.status}`);
  const reader = res.body?.getReader();
  if (!reader) return { url: url.toString(), html: "" };
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new ExternalError("TOO_LARGE", "Page trop volumineuse");
    }
    chunks.push(value);
  }
  return { url: url.toString(), html: new TextDecoder().decode(Buffer.concat(chunks)) };
}

export const __test = { isPrivateIp };
