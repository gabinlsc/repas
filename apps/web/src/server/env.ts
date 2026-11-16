import { z } from "zod";
import { parseKeyring, type Keyring } from "@mise/db";

/**
 * Configuration validée au démarrage : une variable manquante ou malformée arrête le
 * processus avec un message clair plutôt que de produire une erreur obscure plus tard.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  PLANNER_URL: z.string().url().default("http://localhost:8000"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATA_ENCRYPTION_KEYS: z.string().min(10),
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  PLANNER_TIME_LIMIT_S: z.coerce.number().int().min(1).max(60).default(10),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  OFF_USER_AGENT: z.string().default("Mise/1.0 (auto-hébergé)"),
  METRICS_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof schema> & { keyring: Keyring; cookieSecure: boolean };

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuration invalide : ${issues}`);
  }
  const e = parsed.data;
  cached = { ...e, keyring: parseKeyring(e.DATA_ENCRYPTION_KEYS), cookieSecure: e.COOKIE_SECURE ? e.COOKIE_SECURE === "true" : e.APP_URL.startsWith("https://") };
  return cached;
}

export function resetEnvForTests(): void {
  cached = null;
}
