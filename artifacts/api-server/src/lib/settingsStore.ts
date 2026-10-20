import { db, accountSettingsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { StoredCloudPainterSettings } from "@workspace/db/schema";

export type AccountSettingsSnapshot = {
  revision: number;
  settings: StoredCloudPainterSettings;
};

export interface SettingsStore {
  read(userId: string): Promise<AccountSettingsSnapshot>;
  save(userId: string, snapshot: AccountSettingsSnapshot): Promise<AccountSettingsSnapshot | null>;
}

const defaults = { textSize: 100, drawingTool: "brush", brushStyle: "round", brushSize: 8 } as const;

export function createSettingsStore(database: Pick<typeof db, "select" | "insert" | "update">): SettingsStore {
  return {
    async read(userId) {
      const [row] = await database.select().from(accountSettingsTable).where(
        // The authenticated Clerk subject is the only owner key.
        eq(accountSettingsTable.userId, userId),
      );
      return row
        ? { revision: row.revision, settings: row.settings }
        : { revision: 0, settings: defaults };
    },
    async save(userId, snapshot) {
      if (snapshot.revision >= 2147483647) throw new Error("Settings revision limit reached.");
      const values = { revision: snapshot.revision + 1, settings: snapshot.settings };
      // Revision zero is both the initial value for existing rows and the
      // missing-row version. Try creation first, then compare-and-swap row 0.
      const [inserted] = snapshot.revision === 0
        ? await database.insert(accountSettingsTable)
            .values({ userId, ...values })
            .onConflictDoNothing()
            .returning()
        : [];
      const [updated] = inserted
        ? [inserted]
        : await database.update(accountSettingsTable).set(values).where(and(
            eq(accountSettingsTable.userId, userId),
            eq(accountSettingsTable.revision, snapshot.revision),
          )).returning();
      return updated ? { revision: updated.revision, settings: updated.settings } : null;
    },
  };
}

export const settingsStore = createSettingsStore(db);
