import { pgTable, text, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Clerk owns accounts; this row contains no project or photo data.
export const palettesTable = pgTable("account_palettes", {
  userId: text("user_id").primaryKey(),
  revision: integer("revision").notNull().default(0),
  colors: jsonb("colors").$type<{ id: string; name: string; hex: string }[]>().notNull().default([]),
});
export const insertPaletteSchema = createInsertSchema(palettesTable);
export type InsertPalette = z.infer<typeof insertPaletteSchema>;
export type StoredPalette = typeof palettesTable.$inferSelect;
