import { NextResponse, type NextRequest } from "next/server";

/**
 * CSP stricte avec nonce par requête : aucun script inline non signé ne s'exécute.
 * `strict-dynamic` laisse les scripts chargés par Next (signés) charger leurs morceaux.
 */
export function proxy(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://images.openfoodfacts.org",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    // Seulement derrière HTTPS : en local (http) cela casserait le chargement des ressources.
    process.env.APP_URL?.startsWith("https://") ? "upgrade-insecure-requests" : "",
  ]
    .filter(Boolean)
    .join("; ");
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("content-security-policy", csp);
  return res;
}

export const config = {
  matcher: [{ source: "/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js).*)", missing: [{ type: "header", key: "next-router-prefetch" }] }],
};
