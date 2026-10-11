import { db, accountSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { StoredCloudPainterSettings } from "@workspace/db/schema";

export interface SettingsStore {
  read(userId: string): Promise<StoredCloudPainterSettings | null>;
  save(userId: string, settings: StoredCloudPainterSettings): Promise<StoredCloudPainterSettings>;
}

export function createSettingsStore(database: Pick<typeof db, "select" | "insert">): SettingsStore {
  return {
    async read(userId) {
      const [row] = await database.select().from(accountSettingsTable).where(
        // The authenticated Clerk subject is the only owner key.
        eq(accountSettingsTable.userId, userId),
      );
      return row?.settings ?? null;
    },
    async save(userId, settings) {
      const [row] = await database.insert(accountSettingsTable)
        .values({ userId, settings })
        .onConflictDoUpdate({
          target: accountSettingsTable.userId,
          set: { settings },
        })
        .returning();
      if (!row) throw new Error("Settings save did not return the stored row.");
      return row.settings;
    },
  };
}

export const settingsStore = createSettingsStore(db);
