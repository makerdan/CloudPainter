import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const projectBackupsTable = pgTable("project_backups", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  requestId: uuid("request_id").notNull(),
  title: text("title").notNull(),
  backup: text("backup").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("project_backups_user_request_unique").on(table.userId, table.requestId),
  index("project_backups_user_created_idx").on(table.userId, table.createdAt),
  check("project_backups_size_check", sql`${table.sizeBytes} > 0 AND ${table.sizeBytes} <= 2097152`),
]);

export type ProjectBackupRow = typeof projectBackupsTable.$inferSelect;
