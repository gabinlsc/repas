import { describe, expect, it } from "vitest";
import { __test, fetchPublicPage } from "@/server/http";
import { isSameOrigin, readSessionTokenSafe } from "./shims";

describe("protection SSRF", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "224.0.0.1"])("%s est privée", (ip) => {
    expect(__test.isPrivateIp(ip)).toBe(true);
  });
  it.each(["8.8.8.8", "172.32.0.1", "2a01:4f8::1"])("%s est publique", (ip) => expect(__test.isPrivateIp(ip)).toBe(false));
  it("refuse schémas, identifiants et hôtes internes", async () => {
    await expect(fetchPublicPage("file:///etc/passwd")).rejects.toThrow(/http/);
    await expect(fetchPublicPage("http://user:pw@exemple.fr")).rejects.toThrow(/Identifiants/);
    await expect(fetchPublicPage("http://127.0.0.1:5432/")).rejects.toThrow(/non autorisé/);
    await expect(fetchPublicPage("http://[::1]/")).rejects.toThrow(/non autorisé/);
    await expect(fetchPublicPage("pas une url")).rejects.toThrow(/invalide/);
  });
});

describe("CSRF et cookies", () => {
  const req = (h: Record<string, string>) => new Request("http://localhost:3000/api/trpc/x", { method: "POST", headers: h });
  it("même origine uniquement", () => {
    expect(isSameOrigin(req({ origin: "http://localhost:3000" }), "http://localhost:3000")).toBe(true);
    expect(isSameOrigin(req({ origin: "https://evil.example" }), "http://localhost:3000")).toBe(false);
    expect(isSameOrigin(req({}), "http://localhost:3000")).toBe(false);
    expect(isSameOrigin(req({ "sec-fetch-site": "same-origin" }), "http://localhost:3000")).toBe(true);
    expect(isSameOrigin(req({ origin: "https://repas.fr", host: "repas.fr" }), "http://localhost:3000")).toBe(true);
    expect(isSameOrigin(req({ origin: "nimporte" }), "http://localhost:3000")).toBe(false);
  });
  it("lecture du cookie de session", () => {
    expect(readSessionTokenSafe("a=1; mise_session=abc; b=2")).toBe("abc");
    expect(readSessionTokenSafe(null)).toBeNull();
    expect(readSessionTokenSafe("a=1")).toBeNull();
  });
});
