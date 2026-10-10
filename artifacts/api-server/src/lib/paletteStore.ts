import { and, eq } from "drizzle-orm";
import { db, palettesTable } from "@workspace/db";
import type { PaletteStore } from "../routes/palettes";

export function createPaletteStore(database: Pick<typeof db, "select" | "insert" | "update">): PaletteStore {
  return {
    async read(userId) {
      const [row] = await database.select().from(palettesTable).where(eq(palettesTable.userId, userId));
      return row ? { colors: row.colors, revision: row.revision } : { colors: [], revision: 0 };
    },
    async save(userId, palette) {
      const values = { colors: palette.colors, revision: palette.revision + 1 };
      // Compare-and-swap also protects simultaneous saves from other devices.
      const [row] = palette.revision === 0
        ? await database.insert(palettesTable).values({ userId, ...values }).onConflictDoNothing().returning()
        : await database.update(palettesTable).set(values).where(and(
            eq(palettesTable.userId, userId), eq(palettesTable.revision, palette.revision),
          )).returning();
      return row ? { colors: row.colors, revision: row.revision } : null;
    },
  };
}
export const paletteStore = createPaletteStore(db);
