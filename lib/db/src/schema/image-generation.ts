import { pgTable, text, boolean, timestamp, uuid, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Membership and role are application-owned, never taken from browser input
// or user-editable Clerk metadata. Absence means access is denied.
export const imageGenerationAccounts = pgTable("image_generation_accounts", {
  userId: text("user_id").primaryKey(),
  role: text("role").notNull(),
  enabled: boolean("enabled").notNull().default(true),
}, table => [check("image_generation_role", sql`${table.role} in ('normal', 'admin')`)]);

export const imageGenerationAttempts = pgTable("image_generation_attempts", {
  id: uuid("id").primaryKey(),
  userId: text("user_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  activeUntil: timestamp("active_until", { withTimezone: true }),
}, table => [
  index("image_attempts_started").on(table.startedAt),
  index("image_attempts_user_started").on(table.userId, table.startedAt),
]);

export const insertImageGenerationAccountSchema = createInsertSchema(imageGenerationAccounts);
export type ImageGenerationAccount = typeof imageGenerationAccounts.$inferSelect;
export type InsertImageGenerationAccount = z.infer<typeof insertImageGenerationAccountSchema>;
export const insertImageGenerationAttemptSchema = createInsertSchema(imageGenerationAttempts);
export type ImageGenerationAttempt = typeof imageGenerationAttempts.$inferSelect;
