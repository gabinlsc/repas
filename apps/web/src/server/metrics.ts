import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

const g = globalThis as unknown as { __miseMetrics?: ReturnType<typeof create> };

function create() {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });
  return {
    registry,
    rpcDuration: new Histogram({ name: "mise_rpc_duration_seconds", help: "Durée des appels tRPC", labelNames: ["path", "status"], registers: [registry], buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5] }),
    plansGenerated: new Counter({ name: "mise_plans_generated_total", help: "Plans générés", labelNames: ["status"], registers: [registry] }),
    loginFailures: new Counter({ name: "mise_login_failures_total", help: "Échecs de connexion", registers: [registry] }),
  };
}

export function metrics() {
  g.__miseMetrics ??= create();
  return g.__miseMetrics;
}
