import { pgTable, text, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type StoredCloudPainterSettings = {
  textSize: number;
  drawingTool: "brush" | "pencil" | "pen";
  brushStyle: "round" | "chisel" | "soft" | "dry";
  brushSize: number;
};

// Account preferences are separate from browser-local projects, drawings, and photos.
export const accountSettingsTable = pgTable("account_settings", {
  userId: text("user_id").primaryKey(),
  revision: integer("revision").notNull().default(0),
  settings: jsonb("settings").$type<StoredCloudPainterSettings>().notNull(),
});
export const insertAccountSettingsSchema = createInsertSchema(accountSettingsTable);
export type InsertAccountSettings = z.infer<typeof insertAccountSettingsSchema>;
export type StoredAccountSettings = typeof accountSettingsTable.$inferSelect;
