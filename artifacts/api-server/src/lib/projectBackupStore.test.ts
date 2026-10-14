import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import { pool } from "@workspace/db";
import * as dbSchema from "@workspace/db/schema";
import { createProjectBackupStore } from "./projectBackupStore";

async function withDisposableStore<T>(
  limits: { maxBackupsPerAccount: number; maxBytesPerAccount: number; maxBytesGlobal: number },
  run: (store: ReturnType<typeof createProjectBackupStore>) => Promise<T>,
): Promise<T> {
  const schema = `project_backup_test_${randomUUID().replaceAll("-", "")}`;
  const bootstrap = await pool.connect();
  let isolatedPool: PgPool | undefined;
  try {
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);
    isolatedPool = new PgPool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}`,
    });
    await isolatedPool.query(`
      CREATE TABLE project_backups (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL,
        request_id uuid NOT NULL,
        title text NOT NULL,
        backup text NOT NULL,
        size_bytes integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT project_backups_size_check CHECK (size_bytes > 0 AND size_bytes <= 2097152),
        CONSTRAINT project_backups_user_request_unique UNIQUE (user_id, request_id)
      )
    `);
    await isolatedPool.query("CREATE INDEX project_backups_user_created_idx ON project_backups (user_id, created_at)");
    return await run(createProjectBackupStore(drizzle(isolatedPool, { schema: dbSchema }), limits));
  } finally {
    await isolatedPool?.end();
    await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    bootstrap.release();
  }
}

test("project backups are owner-scoped, idempotent, and quota-bounded", { timeout: 60000 }, async () => {
  await withDisposableStore({
    maxBackupsPerAccount: 3,
    maxBytesPerAccount: 10,
    maxBytesGlobal: 12,
  }, async store => {
    const firstRequest = randomUUID();
    const first = await store.create("user_a", firstRequest, "First sketch", "one");
    assert.equal(first.kind, "created");
    if (first.kind !== "created") return;
    const retry = await store.create("user_a", firstRequest, "First sketch", "one");
    assert.equal(retry.kind, "existing");
    const reusedRequest = await store.create("user_a", firstRequest, "Other sketch", "two");
    assert.equal(reusedRequest.kind, "request-mismatch");

    const second = await store.create("user_a", randomUUID(), "Second sketch", "two");
    const third = await store.create("user_a", randomUUID(), "Third sketch", "tri");
    assert.equal(second.kind, "created");
    assert.equal(third.kind, "created");
    assert.equal((await store.create("user_a", randomUUID(), "Fourth sketch", "four")).kind, "account-quota");

    const userBFirst = await store.create("user_b", randomUUID(), "Other account", "one");
    assert.equal(userBFirst.kind, "created");
    assert.equal((await store.create("user_b", randomUUID(), "Over global limit", "two")).kind, "global-quota");
    assert.equal((await store.get("user_b", first.backup.id)), null);
    assert.equal(await store.delete("user_b", first.backup.id), false);
    assert.equal(await store.delete("user_a", first.backup.id), true);
    assert.equal((await store.create("user_b", randomUUID(), "Room after delete", "two")).kind, "created");

    const listA = await store.list("user_a");
    assert.equal(listA.backups.length, 2);
    assert.equal(listA.totalBytes, 6);
    const listB = await store.list("user_b");
    assert.equal(listB.backups.length, 2);
    assert.equal(listB.totalBytes, 6);
  });
});

test("concurrent account saves cannot exceed the shared byte quota", { timeout: 60000 }, async () => {
  await withDisposableStore({
    maxBackupsPerAccount: 3,
    maxBytesPerAccount: 10,
    maxBytesGlobal: 5,
  }, async store => {
    const results = await Promise.all([
      store.create("user_a", randomUUID(), "A", "one"),
      store.create("user_b", randomUUID(), "B", "two"),
    ]);
    assert.deepEqual(results.map(result => result.kind).sort(), ["created", "global-quota"]);
    assert.equal((await store.list("user_a")).totalBytes + (await store.list("user_b")).totalBytes, 3);
  });
});
