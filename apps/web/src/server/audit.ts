import { auditEvents, type Db } from "@mise/db";

/** Journal des écritures sensibles. Jamais de donnée personnelle dans `meta`. */
export async function audit(db: Db, e: { householdId?: string | null; userId?: string | null; action: string; entity: string; entityId?: string | null; meta?: Record<string, unknown> }): Promise<void> {
  await db.insert(auditEvents).values({ householdId: e.householdId ?? null, userId: e.userId ?? null, action: e.action, entity: e.entity, entityId: e.entityId ?? null, meta: e.meta ?? {} });
}
