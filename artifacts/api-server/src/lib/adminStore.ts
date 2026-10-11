import { count, desc, eq } from "drizzle-orm";
import { db, cloudPainterAdminAccounts, cloudPainterAdminAudit } from "@workspace/db";
import type { AdminStore } from "../routes/admin";

export function createAdminStore(database: Pick<typeof db, "select" | "insert" | "update">): AdminStore {
  return {
    async isEnabledAdmin(userId) {
      const [row] = await database.select({ enabled: cloudPainterAdminAccounts.enabled })
        .from(cloudPainterAdminAccounts)
        .where(eq(cloudPainterAdminAccounts.userId, userId));
      return row?.enabled === true;
    },
    async listAuditEvents({ limit, offset }) {
      const [eventRows, [countRow]] = await Promise.all([
        database.select({
          actorId: cloudPainterAdminAudit.actorUserId,
          targetId: cloudPainterAdminAudit.targetUserId,
          action: cloudPainterAdminAudit.action,
          outcome: cloudPainterAdminAudit.outcome,
          createdAt: cloudPainterAdminAudit.createdAt,
        }).from(cloudPainterAdminAudit)
          .orderBy(desc(cloudPainterAdminAudit.createdAt), desc(cloudPainterAdminAudit.id))
          .limit(limit)
          .offset(offset),
        database.select({ totalCount: count() }).from(cloudPainterAdminAudit),
      ]);
      return {
        events: eventRows.map(row => ({
          ...row,
          action: row.action as "suspend" | "reactivate",
          outcome: row.outcome as "pending" | "succeeded" | "failed",
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
