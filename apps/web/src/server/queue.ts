import { Queue } from "bullmq";
import { runGenerationJob, type Db } from "@mise/db";
import { env } from "./env";
import { logger } from "./logger";
import { metrics } from "./metrics";
import { plannerClient } from "./planner";

export const PLAN_QUEUE = "plan-generation";

export type Enqueue = (jobId: string) => Promise<void>;

const g = globalThis as unknown as { __miseQueue?: Queue };

function redisConnection(url: string) {
  const u = new URL(url);
  return { host: u.hostname, port: Number(u.port || 6379), password: u.password || undefined, db: Number(u.pathname.slice(1) || 0), maxRetriesPerRequest: null };
}

/**
 * File BullMQ si Redis est configuré ; sinon exécution en tâche de fond dans le processus
 * web (installation minimale). Le job est en base dans les deux cas : l'état est suivi
 * de la même façon par l'interface.
 */
export function defaultEnqueue(dbi: Db): Enqueue {
  const e = env();
  if (e.REDIS_URL) {
    g.__miseQueue ??= new Queue(PLAN_QUEUE, { connection: redisConnection(e.REDIS_URL) });
    const q = g.__miseQueue;
    return async (jobId) => {
      await q.add("generate", { jobId }, { jobId, attempts: 2, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: 1000, removeOnFail: 1000 });
    };
  }
  const call = plannerClient(e.PLANNER_URL);
  return async (jobId) => {
    void runGenerationJob(dbi, jobId, call)
      .then((r) => metrics().plansGenerated.inc({ status: r?.status ?? "unknown" }))
      .catch((err: unknown) => {
        metrics().plansGenerated.inc({ status: "error" });
        logger.error({ jobId, err: (err as Error).message }, "génération échouée");
      });
  };
}
