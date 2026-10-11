import { and, count, desc, eq } from "drizzle-orm";
import { db, cloudPainterAdminAccounts, cloudPainterAdminAudit } from "@workspace/db";
import type { AdminAction, AdminAuditOutcome, AdminStore } from "../routes/admin";

export function createAdminStore(database: Pick<typeof db, "select" | "insert" | "update">): AdminStore {
  return {
    async isEnabledAdmin(userId) {
      const [row] = await database.select({ enabled: cloudPainterAdminAccounts.enabled })
        .from(cloudPainterAdminAccounts)
        .where(eq(cloudPainterAdminAccounts.userId, userId));
      return row?.enabled === true;
    },
    async listAuditEvents({ limit, offset, action, outcome }) {
      const filters = [
        ...(action ? [eq(cloudPainterAdminAudit.action, action)] : []),
        ...(outcome ? [eq(cloudPainterAdminAudit.outcome, outcome)] : []),
      ];
      const where = filters.length > 0 ? and(...filters) : undefined;
      const [eventRows, [countRow]] = await Promise.all([
        database.select({
          actorId: cloudPainterAdminAudit.actorUserId,
          targetId: cloudPainterAdminAudit.targetUserId,
          action: cloudPainterAdminAudit.action,
          outcome: cloudPainterAdminAudit.outcome,
          createdAt: cloudPainterAdminAudit.createdAt,
        }).from(cloudPainterAdminAudit)
          .where(where)
          .orderBy(desc(cloudPainterAdminAudit.createdAt), desc(cloudPainterAdminAudit.id))
          .limit(limit)
          .offset(offset),
        database.select({ totalCount: count() }).from(cloudPainterAdminAudit).where(where),
      ]);
      return {
        events: eventRows.map(row => ({
          ...row,
          action: row.action as AdminAction,
          outcome: row.outcome as AdminAuditOutcome,
        })),
        totalCount: countRow?.totalCount ?? 0,
      };
    },
    async startAction(actorUserId, targetUserId, action) {
      const [row] = await database.insert(cloudPainterAdminAudit)
        .values({ actorUserId, targetUserId, action })
        .returning({ id: cloudPainterAdminAudit.id });
      if (!row) throw new Error("Audit row was not returned after insert.");
      return row.id;
    },
    async finishAction(auditId, outcome) {
      await database.update(cloudPainterAdminAudit)
        .set({ outcome })
        .where(eq(cloudPainterAdminAudit.id, auditId));
    },
  };
}

export const adminStore = createAdminStore(db);
