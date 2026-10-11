import { boolean, check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// General dashboard access is independent from paid image-generation entitlements.
export const cloudPainterAdminAccounts = pgTable("cloudpainter_admin_accounts", {
  userId: text("user_id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
});

// Keep only the actor, target, operation and database timestamp.
export const cloudPainterAdminAudit = pgTable("cloudpainter_admin_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: text("actor_user_id").notNull(),
  targetUserId: text("target_user_id").notNull(),
  action: text("action").notNull(),
  outcome: text("outcome").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  check("cloudpainter_admin_audit_action", sql`${table.action} in ('suspend', 'reactivate')`),
  check("cloudpainter_admin_audit_outcome", sql`${table.outcome} in ('pending', 'succeeded', 'failed')`),
]);

export const insertCloudPainterAdminAccountSchema = createInsertSchema(cloudPainterAdminAccounts);
export type CloudPainterAdminAccount = typeof cloudPainterAdminAccounts.$inferSelect;
export type InsertCloudPainterAdminAccount = z.infer<typeof insertCloudPainterAdminAccountSchema>;
export type CloudPainterAdminAudit = typeof cloudPainterAdminAudit.$inferSelect;
