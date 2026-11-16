import { sql } from "drizzle-orm";
import { createDb, runGenerationJob, type Db } from "@mise/db";

export { createDb, runGenerationJob };

export async function purgeOldRateLimits(db: Db): Promise<void> {
  await db.execute(sql`delete from rate_limit where reset_at < now() - interval '1 day'`);
  await db.execute(sql`delete from session where expires_at < now()`);
  await db.execute(sql`delete from sync_op where applied_at < now() - interval '30 days'`);
}
