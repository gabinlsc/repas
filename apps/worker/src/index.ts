/**
 * Worker de génération de plans : consomme la file BullMQ « plan-generation »,
 * appelle le solveur et écrit le résultat. Les jobs sont idempotents (état en base) :
 * une nouvelle tentative après crash ne duplique rien.
 */
import { createServer } from "node:http";
import { Worker } from "bullmq";
import pino from "pino";
import { createDb, purgeOldRateLimits, runGenerationJob } from "./deps.js";

const log = pino({ level: process.env.LOG_LEVEL ?? "info", base: { service: "worker" } });
const required = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} manquant`);
  return v;
};
const redis = new URL(required("REDIS_URL"));
const plannerUrl = process.env.PLANNER_URL ?? "http://planner:8000";
const { db, sql } = createDb(required("DATABASE_URL"), 4);

async function callPlanner(req: { time_limit_s: number }): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), (req.time_limit_s * 2 + 15) * 1000);
  try {
    const res = await fetch(`${plannerUrl}/v1/plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req), signal: ctrl.signal });
    if (!res.ok) throw new Error(`Solveur HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const worker = new Worker<{ jobId: string }>(
  "plan-generation",
  async (job) => {
    const t0 = Date.now();
    const res = await runGenerationJob(db, job.data.jobId, (r) => callPlanner(r));
    log.info({ jobId: job.data.jobId, status: res?.status, ms: Date.now() - t0 }, "plan généré");
  },
  {
    connection: { host: redis.hostname, port: Number(redis.port || 6379), password: redis.password || undefined, maxRetriesPerRequest: null },
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
  },
);
worker.on("failed", (job, err) => log.error({ jobId: job?.data.jobId, err: err.message }, "job échoué"));

// Ménage périodique (fenêtres de limitation expirées).
const cleanup = setInterval(() => void purgeOldRateLimits(db).catch((e: unknown) => log.warn({ err: String(e) }, "ménage")), 3600_000);

// Sonde de santé pour Docker.
const health = createServer((_req, res) => {
  res.writeHead(worker.isRunning() ? 200 : 503, { "content-type": "application/json" });
  res.end(JSON.stringify({ status: worker.isRunning() ? "ok" : "down" }));
}).listen(Number(process.env.WORKER_HEALTH_PORT ?? 8090));

async function shutdown(): Promise<void> {
  log.info("arrêt");
  clearInterval(cleanup);
  health.close();
  await worker.close();
  await sql.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
log.info("worker démarré");
