import "fake-indexeddb/auto";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { decodeHlc } from "@mise/domain";
import { explain } from "@/lib/explain";
import { formatMoney, mondayOf, shiftWeek, translator, en, fr } from "@/lib/i18n";
import { cacheList, cachedList, enqueueOp, flushOps, nextClock, observeClock, offlineDb } from "@/lib/offline";
import { env, resetEnvForTests } from "@/server/env";
import { ExternalError, fetchWithRetry } from "@/server/http";
import { offClient } from "@/server/off";
import { plannerClient } from "@/server/planner";
import { bus, listChannel } from "@/server/realtime";
import { metrics } from "@/server/metrics";

let server: Server;
let base = "";
let hits = 0;
beforeAll(async () => {
  server = createServer((req, res) => {
    hits++;
    if (req.url === "/flaky" && hits % 2 === 1) return void res.writeHead(503).end();
    if (req.url?.startsWith("/always500")) return void res.writeHead(500).end("boom");
    if (req.url === "/bad/v1/plan") return void res.writeHead(422).end("invalide");
    if (req.url === "/slow") return void setTimeout(() => res.end("late"), 500);
    if (req.url === "/v1/plan") return void res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
    res.writeHead(200).end("ok");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(() => server.close());

describe("explications et i18n", () => {
  it("traduit chaque code connu, ignore les inconnus", () => {
    for (const [code, p] of [
      ["locked", {}], ["uses_pantry", { ingredient: "Riz", expiry_day: 2 }], ["uses_pantry", { ingredient: "Riz" }], ["in_season", {}], ["favorite", {}],
      ["fits_time", { minutes: 20, limit: 30 }], ["protein_variety", { protein: "poisson", previous: "boeuf" }], ["shared_ingredients", { count: 3 }],
      ["cost_per_serving", { cents: 250 }], ["batch_cook", { for_day: 3 }], ["leftover", {}], ["kcal", { per_serving: 500 }], ["manual", {}],
    ] as const) expect(explain(code, p)).toBeTruthy();
    expect(explain("inconnu", {})).toBeNull();
    expect(explain("uses_pantry", { ingredient: "Riz", expiry_day: 2 })).toContain("mercredi");
  });
  it("dictionnaires, monnaie, semaines", () => {
    expect(Object.keys(en)).toEqual(Object.keys(fr));
    expect(translator("en-GB")("nav.week")).toBe("Week");
    expect(translator()("nav.week")).toBe("Semaine");
    expect(formatMoney(1234).replace(/\s/g, " ")).toBe("12,34 €");
    expect(mondayOf(new Date(2026, 10, 19))).toBe("2026-11-16");
    expect(mondayOf(new Date(2026, 10, 22))).toBe("2026-11-16");
    expect(shiftWeek("2026-11-16", 1)).toBe("2026-11-23");
  });
});

describe("configuration", () => {
  it("valide l'environnement et échoue clairement", () => {
    const saved = { ...process.env };
    process.env.DATABASE_URL = "postgres://u:p@localhost/db";
    process.env.DATA_ENCRYPTION_KEYS = `k1:${Buffer.alloc(32).toString("base64")}`;
    process.env.APP_URL = "https://repas.example.fr";
    resetEnvForTests();
    expect(env().cookieSecure).toBe(true);
    expect(env()).toBe(env());
    process.env.DATABASE_URL = "pas-une-url";
    resetEnvForTests();
    expect(() => env()).toThrow(/Configuration invalide/);
    process.env = saved;
    resetEnvForTests();
  });
});

describe("appels externes robustes", () => {
  it("réessaie sur 5xx puis réussit", async () => {
    hits = 0;
    expect((await fetchWithRetry(`${base}/flaky`, { retries: 2 })).status).toBe(200);
  });
  it("délai dépassé et erreurs persistantes typés", async () => {
    await expect(fetchWithRetry(`${base}/slow`, { timeoutMs: 50, retries: 0 })).rejects.toBeInstanceOf(ExternalError);
    await expect(fetchWithRetry(`${base}/always500`, { retries: 1 })).rejects.toThrow(/HTTP 500/);
    await expect(fetchWithRetry("http://127.0.0.1:1/", { retries: 0, timeoutMs: 500 })).rejects.toBeInstanceOf(ExternalError);
  });
  it("client du solveur", async () => {
    const call = plannerClient(base);
    expect(await call({ time_limit_s: 1 } as never)).toEqual({ ok: true });
    await expect(plannerClient(`${base}/bad`)({ time_limit_s: 1 } as never)).rejects.toThrow(/Solveur : HTTP 422/);
  });
  it("Open Food Facts : cache et dégradation gracieuse", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    spy.mockResolvedValueOnce(new Response(JSON.stringify({ status: 1, product: { product_name_fr: "Pâte à tartiner", brands: "X", quantity: "400 g", allergens_tags: ["en:milk"] } })));
    const off = offClient("test");
    expect(await off("3017620422003")).toEqual({ name: "Pâte à tartiner", brand: "X", quantity: "400 g", allergens: ["milk"] });
    expect(await off("3017620422003")).not.toBeNull(); // servi par le cache
    spy.mockRejectedValueOnce(new Error("réseau"));
    spy.mockRejectedValueOnce(new Error("réseau"));
    expect(await off("0000000000000")).toBeNull();
    spy.mockResolvedValueOnce(new Response("", { status: 404 }));
    expect(await off("1111111111111")).toBeNull();
    spy.mockRestore();
  });
});

describe("temps réel et métriques", () => {
  it("bus en mémoire sans Redis", () => {
    const saved = { ...process.env };
    process.env.DATABASE_URL = "postgres://u:p@localhost/db";
    process.env.DATA_ENCRYPTION_KEYS = `k1:${Buffer.alloc(32).toString("base64")}`;
    delete process.env.REDIS_URL;
    resetEnvForTests();
    const got: string[] = [];
    const off = bus().subscribe(listChannel("h1"), (m) => got.push(m));
    bus().publish(listChannel("h1"), "x");
    bus().publish(listChannel("h2"), "y");
    off();
    bus().publish(listChannel("h1"), "z");
    expect(got).toEqual(["x"]);
    process.env = saved;
    resetEnvForTests();
  });
  it("registre Prometheus", async () => {
    metrics().plansGenerated.inc({ status: "ok" });
    expect(await metrics().registry.metrics()).toContain("mise_plans_generated_total");
  });
});

describe("file hors ligne (IndexedDB)", () => {
  it("horloges monotones, file rejouée et acquittée, instantané de liste", async () => {
    const a = await nextClock();
    const b = await nextClock();
    expect(b > a).toBe(true);
    await observeClock({ wall: Date.now() + 60_000, counter: 5, node: "autre" });
    expect(decodeHlc(await nextClock()).wall).toBeGreaterThanOrEqual(Date.now() + 59_000);
    await enqueueOp({ id: "op1", type: "patch" });
    await enqueueOp({ id: "op2", type: "patch" });
    await enqueueOp({ id: "op1", type: "patch" }); // idempotent
    const sent: unknown[][] = [];
    expect(await flushOps(async (ops) => { sent.push(ops); return { results: [{ id: "op1" }] }; })).toBe(1);
    expect(sent[0]).toHaveLength(2);
    expect(await offlineDb().ops.count()).toBe(1);
    expect(await flushOps(async () => ({ results: [{ id: "op2" }] }))).toBe(1);
    expect(await flushOps(async () => ({ results: [] }))).toBe(0);
    await cacheList("l1", { a: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await cacheList("l2", { a: 2 });
    expect((await cachedList())!.data).toEqual({ a: 2 });
  });
});
