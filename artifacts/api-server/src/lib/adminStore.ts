import { and, count, desc, eq, sql } from "drizzle-orm";
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
    async listAuditEvents({ limit, cursor, action, outcome }) {
      const filters = [
        ...(action ? [eq(cloudPainterAdminAudit.action, action)] : []),
        ...(outcome ? [eq(cloudPainterAdminAudit.outcome, outcome)] : []),
      ];
      const cursorConditionFor = (createdAt: string, id: string) =>
        sql`(${cloudPainterAdminAudit.createdAt}, ${cloudPainterAdminAudit.id}) < (${createdAt}::timestamptz, ${id}::uuid)`;
      const cursorCondition = cursor
        ? cursorConditionFor(cursor.createdAt, cursor.id)
        : undefined;
      const where = and(...filters, ...(cursorCondition ? [cursorCondition] : []));
      const filterWhere = and(...filters);
      const [eventRows, [countRow]] = await Promise.all([
        database.select({
          id: cloudPainterAdminAudit.id,
          actorId: cloudPainterAdminAudit.actorUserId,
          targetId: cloudPainterAdminAudit.targetUserId,
          action: cloudPainterAdminAudit.action,
          outcome: cloudPainterAdminAudit.outcome,
          createdAt: cloudPainterAdminAudit.createdAt,
          cursorCreatedAt: sql<string>`to_char(${cloudPainterAdminAudit.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        }).from(cloudPainterAdminAudit)
          .where(where)
          .orderBy(desc(cloudPainterAdminAudit.createdAt), desc(cloudPainterAdminAudit.id))
          .limit(limit),
        database.select({ totalCount: count() }).from(cloudPainterAdminAudit).where(filterWhere),
      ]);
      const lastEvent = eventRows.at(-1);
      const hasMore = lastEvent
        ? (await database.select({ id: cloudPainterAdminAudit.id })
          .from(cloudPainterAdminAudit)
          .where(and(...filters, cursorConditionFor(lastEvent.cursorCreatedAt, lastEvent.id)))
          .limit(1)).length > 0
        : false;
      return {
        events: eventRows.map(({ id: _id, cursorCreatedAt: _cursorCreatedAt, ...row }) => ({
          ...row,
          action: row.action as "suspend" | "reactivate",
          outcome: row.outcome as "pending" | "succeeded" | "failed",
        })),
        totalCount: countRow?.totalCount ?? 0,
        ...(hasMore && lastEvent ? { nextCursor: { createdAt: lastEvent.cursorCreatedAt, id: lastEvent.id } } : {}),
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
