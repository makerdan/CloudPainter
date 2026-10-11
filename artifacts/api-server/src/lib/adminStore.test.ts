import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { pool } from "@workspace/db";
import * as dbSchema from "@workspace/db/schema";
import { createAdminStore } from "./adminStore";

test("PostgreSQL admin permissions deny missing or disabled rows and retain minimal audit events", { timeout: 30000 }, async () => {
  const client = await pool.connect();
  const schemaName = `admin_test_${randomUUID().replaceAll("-", "")}`;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET LOCAL search_path TO "${schemaName}"`);
    await client.query(`
      CREATE TABLE cloudpainter_admin_accounts (
        user_id text PRIMARY KEY,
        enabled boolean NOT NULL DEFAULT true
      );
      CREATE TABLE cloudpainter_admin_audit (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_user_id text NOT NULL,
        target_user_id text NOT NULL,
        action text NOT NULL CHECK (action IN ('suspend', 'reactivate')),
        outcome text NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending', 'succeeded', 'failed')),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX cloudpainter_admin_audit_created_id_idx
        ON cloudpainter_admin_audit (created_at, id);
    `);
    await client.query("INSERT INTO cloudpainter_admin_accounts (user_id, enabled) VALUES ('disabled-admin', false), ('active-admin', true)");
    const store = createAdminStore(drizzle(client, { schema: dbSchema }));

    assert.equal(await store.isEnabledAdmin("missing-admin"), false);
    assert.equal(await store.isEnabledAdmin("disabled-admin"), false);
    assert.equal(await store.isEnabledAdmin("active-admin"), true);

    const auditId = await store.startAction("active-admin", "target-account", "suspend");
    const [pending] = (await client.query(
      "SELECT actor_user_id, target_user_id, action, outcome, created_at FROM cloudpainter_admin_audit WHERE id = $1",
      [auditId],
    )).rows;
    assert.deepEqual(
      { actor: pending.actor_user_id, target: pending.target_user_id, action: pending.action, outcome: pending.outcome },
      { actor: "active-admin", target: "target-account", action: "suspend", outcome: "pending" },
    );
    assert.ok(pending.created_at instanceof Date);

    await store.finishAction(auditId, "succeeded");
    const completed = await client.query("SELECT outcome FROM cloudpainter_admin_audit WHERE id = $1", [auditId]);
    assert.equal(completed.rows[0]?.outcome, "succeeded");
    const secondAuditId = await store.startAction("active-admin", "another-target", "reactivate");
    await store.finishAction(secondAuditId, "failed");
    const expectedOrder = (await client.query(
      "SELECT target_user_id, action, outcome FROM cloudpainter_admin_audit ORDER BY created_at DESC, id DESC",
    )).rows;
    const latestPage = await store.listAuditEvents({ limit: 1 });
    assert.equal(latestPage.totalCount, 2);
    assert.deepEqual(latestPage.events, [{
      actorId: "active-admin",
      targetId: expectedOrder[0]?.target_user_id,
      action: expectedOrder[0]?.action,
      outcome: expectedOrder[0]?.outcome,
      createdAt: latestPage.events[0]?.createdAt,
    }]);
    assert.deepEqual(Object.keys(latestPage.events[0] ?? {}).sort(), ["action", "actorId", "createdAt", "outcome", "targetId"]);
    assert.ok(latestPage.nextCursor);
    const previousPage = await store.listAuditEvents({ limit: 1, cursor: latestPage.nextCursor });
    assert.equal(previousPage.events[0]?.targetId, expectedOrder[1]?.target_user_id);
    assert.equal(previousPage.events[0]?.outcome, expectedOrder[1]?.outcome);
    assert.equal(previousPage.nextCursor, undefined);

    const failedSuspendId = await store.startAction("another-admin", "failed-suspend-target", "suspend");
    await store.finishAction(failedSuspendId, "failed");
    const pendingReactivateId = await store.startAction("third-admin", "pending-reactivate-target", "reactivate");
    const failedSuspends = await store.listAuditEvents({ limit: 25, action: "suspend", outcome: "failed" });
    assert.equal(failedSuspends.totalCount, 1);
    assert.equal(failedSuspends.events[0]?.targetId, "failed-suspend-target");
    const pendingReactivations = await store.listAuditEvents({ limit: 25, action: "reactivate", outcome: "pending" });
    assert.equal(pendingReactivations.totalCount, 1);
    assert.equal(pendingReactivations.events[0]?.targetId, "pending-reactivate-target");
    await store.finishAction(pendingReactivateId, "failed");
    const firstFilteredPage = await store.listAuditEvents({ limit: 1, action: "suspend" });
    assert.equal(firstFilteredPage.totalCount, 2);
    assert.ok(firstFilteredPage.nextCursor);
    const secondFilteredPage = await store.listAuditEvents({
      limit: 1,
      action: "suspend",
      cursor: firstFilteredPage.nextCursor,
    });
    assert.equal(secondFilteredPage.totalCount, 2);
    assert.equal(secondFilteredPage.events.length, 1);
    assert.equal(secondFilteredPage.nextCursor, undefined);

    await client.query(`
      INSERT INTO cloudpainter_admin_audit (id, actor_user_id, target_user_id, action, outcome, created_at)
      SELECT
        ('00000000-0000-4000-8000-' || lpad(to_hex(event_number), 12, '0'))::uuid,
        'archive-admin',
        'archived-' || event_number::text,
        'suspend',
        'succeeded',
        '2020-01-01T00:00:00.000Z'::timestamptz
      FROM generate_series(1, 10050) AS event_number
    `);
    const deepPage = await store.listAuditEvents({
      limit: 50,
      cursor: {
        createdAt: "2020-01-01T00:00:00.000000Z",
        id: "00000000-0000-4000-8000-000000000032",
      },
    });
    assert.equal(deepPage.totalCount, 10_054);
    assert.equal(deepPage.events.length, 49);
    assert.equal(deepPage.events[0]?.targetId, "archived-49");
    assert.equal(deepPage.events.at(-1)?.targetId, "archived-1");
    assert.equal(deepPage.nextCursor, undefined);
    await assert.rejects(
      client.query("INSERT INTO cloudpainter_admin_audit (actor_user_id, target_user_id, action) VALUES ('a', 'b', 'delete')"),
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
