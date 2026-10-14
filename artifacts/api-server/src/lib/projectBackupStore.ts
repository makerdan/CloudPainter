import { db, projectBackupsTable } from "@workspace/db";
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { ProjectBackupRow } from "@workspace/db/schema";

export const MAX_CLOUD_PROJECT_BACKUPS = 20;
export const MAX_CLOUD_PROJECT_BACKUP_BYTES = 2 * 1024 * 1024;
export const MAX_ACCOUNT_PROJECT_BACKUP_BYTES = 32 * 1024 * 1024;
export const MAX_GLOBAL_PROJECT_BACKUP_BYTES = 128 * 1024 * 1024;

export type ProjectBackupStoreLimits = {
  maxBackupsPerAccount: number;
  maxBytesPerAccount: number;
  maxBytesGlobal: number;
};

export type ProjectBackupSummary = Pick<
  ProjectBackupRow,
  "id" | "title" | "sizeBytes" | "createdAt"
>;

export type CreateProjectBackupResult =
  | { kind: "created"; backup: ProjectBackupRow }
  | { kind: "existing"; backup: ProjectBackupRow }
  | { kind: "request-mismatch" }
  | { kind: "account-quota" }
  | { kind: "global-quota" }
  | { kind: "invalid-size" };

export interface ProjectBackupStore {
  list(userId: string): Promise<{ backups: ProjectBackupSummary[]; totalBytes: number }>;
  exportAll(userId: string): Promise<ProjectBackupRow[]>;
  get(userId: string, id: string): Promise<ProjectBackupRow | null>;
  create(
    userId: string,
    requestId: string,
    title: string,
    backup: string,
  ): Promise<CreateProjectBackupResult>;
  delete(userId: string, id: string): Promise<boolean>;
}

const PROJECT_BACKUP_QUOTA_LOCK = 7_214_263;

export function createProjectBackupStore(
  database: Pick<typeof db, "select" | "insert" | "delete" | "transaction">,
  limits: ProjectBackupStoreLimits = {
    maxBackupsPerAccount: MAX_CLOUD_PROJECT_BACKUPS,
    maxBytesPerAccount: MAX_ACCOUNT_PROJECT_BACKUP_BYTES,
    maxBytesGlobal: MAX_GLOBAL_PROJECT_BACKUP_BYTES,
  },
): ProjectBackupStore {
  return {
    async list(userId) {
      const rows = await database.select({
        id: projectBackupsTable.id,
        title: projectBackupsTable.title,
        sizeBytes: projectBackupsTable.sizeBytes,
        createdAt: projectBackupsTable.createdAt,
      }).from(projectBackupsTable)
        .where(eq(projectBackupsTable.userId, userId))
        .orderBy(desc(projectBackupsTable.createdAt), desc(projectBackupsTable.id))
        .limit(MAX_CLOUD_PROJECT_BACKUPS);
      const [usage] = await database.select({
        totalBytes: sql<number>`coalesce(sum(${projectBackupsTable.sizeBytes}), 0)::int`,
      }).from(projectBackupsTable).where(eq(projectBackupsTable.userId, userId));
      return { backups: rows, totalBytes: usage?.totalBytes ?? 0 };
    },
    async exportAll(userId) {
      return database.select().from(projectBackupsTable)
        .where(eq(projectBackupsTable.userId, userId))
        .orderBy(desc(projectBackupsTable.createdAt), desc(projectBackupsTable.id))
        .limit(MAX_CLOUD_PROJECT_BACKUPS + 1);
    },
    async get(userId, id) {
      const [row] = await database.select().from(projectBackupsTable).where(and(
        eq(projectBackupsTable.userId, userId),
        eq(projectBackupsTable.id, id),
      )).limit(1);
      return row ?? null;
    },
    async create(userId, requestId, title, backup) {
      const sizeBytes = Buffer.byteLength(backup, "utf8");
      if (sizeBytes < 1 || sizeBytes > MAX_CLOUD_PROJECT_BACKUP_BYTES) return { kind: "invalid-size" };
      return database.transaction(async transaction => {
        // Serialize quota checks with other backup writes so concurrent clients
        // cannot collectively exceed either the account or global byte limit.
        await transaction.execute(sql`SELECT pg_advisory_xact_lock(${PROJECT_BACKUP_QUOTA_LOCK})`);

        const [existing] = await transaction.select().from(projectBackupsTable).where(and(
          eq(projectBackupsTable.userId, userId),
          eq(projectBackupsTable.requestId, requestId),
        )).limit(1);
        if (existing) {
          return existing.backup === backup
            ? { kind: "existing", backup: existing }
            : { kind: "request-mismatch" };
        }

        const [accountUsage] = await transaction.select({
          backupCount: count(),
          totalBytes: sql<number>`coalesce(sum(${projectBackupsTable.sizeBytes}), 0)::int`,
        }).from(projectBackupsTable).where(eq(projectBackupsTable.userId, userId));
        const [globalUsage] = await transaction.select({
          totalBytes: sql<number>`coalesce(sum(${projectBackupsTable.sizeBytes}), 0)::int`,
        }).from(projectBackupsTable);

        if ((accountUsage?.backupCount ?? 0) >= limits.maxBackupsPerAccount
          || (accountUsage?.totalBytes ?? 0) + sizeBytes > limits.maxBytesPerAccount) {
          return { kind: "account-quota" };
        }
        if ((globalUsage?.totalBytes ?? 0) + sizeBytes > limits.maxBytesGlobal) {
          return { kind: "global-quota" };
        }

        const [created] = await transaction.insert(projectBackupsTable).values({
          userId,
          requestId,
          title,
          backup,
          sizeBytes,
        }).returning();
        if (!created) throw new Error("Project backup insert did not return its new row.");
        return { kind: "created", backup: created };
      });
    },
    async delete(userId, id) {
      return database.transaction(async transaction => {
        await transaction.execute(sql`SELECT pg_advisory_xact_lock(${PROJECT_BACKUP_QUOTA_LOCK})`);
        const [deleted] = await transaction.delete(projectBackupsTable).where(and(
          eq(projectBackupsTable.userId, userId),
          eq(projectBackupsTable.id, id),
        )).returning({ id: projectBackupsTable.id });
        return Boolean(deleted);
      });
    },
  };
}

export const projectBackupStore = createProjectBackupStore(db);
