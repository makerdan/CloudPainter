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
    `);
    await client.query("INSERT INTO cloudpainter_admin_accounts (user_id, enabled) VALUES ('disabled-admin', false), ('active-admin', true)");
    const store = createAdminStore(drizzle(client, { schema: dbSchema }));

    assert.equal(await store.isEnabledAdmin("missing-admin"), false);
    assert.equal(await store.isEnabledAdmin("disabled-admin"), false);
    assert.equal(await store.isEnabledAdmin("active-admin"), true);

    const auditId = await store.startAction("active-admin", "target-account", "suspend");
    await client.query("UPDATE cloudpainter_admin_audit SET created_at = $2 WHERE id = $1", [auditId, new Date("2025-01-01T00:00:00.000Z")]);
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
    await client.query("UPDATE cloudpainter_admin_audit SET created_at = $2 WHERE id = $1", [secondAuditId, new Date("2025-01-02T00:00:00.000Z")]);
    const thirdAuditId = await store.startAction("another-admin", "failed-suspend-target", "suspend");
    await store.finishAction(thirdAuditId, "failed");
    await client.query("UPDATE cloudpainter_admin_audit SET created_at = $2 WHERE id = $1", [thirdAuditId, new Date("2025-01-03T00:00:00.000Z")]);
    const fourthAuditId = await store.startAction("third-admin", "pending-reactivate-target", "reactivate");
    await client.query("UPDATE cloudpainter_admin_audit SET created_at = $2 WHERE id = $1", [fourthAuditId, new Date("2025-01-04T00:00:00.000Z")]);
    const latestPage = await store.listAuditEvents({ limit: 1, offset: 0 });
    assert.equal(latestPage.totalCount, 4);
    assert.deepEqual(latestPage.events, [{
      actorId: "third-admin",
      targetId: "pending-reactivate-target",
      action: "reactivate",
      outcome: "pending",
      createdAt: latestPage.events[0]?.createdAt,
    }]);
    assert.deepEqual(Object.keys(latestPage.events[0] ?? {}).sort(), ["action", "actorId", "createdAt", "outcome", "targetId"]);
    const previousPage = await store.listAuditEvents({ limit: 1, offset: 1 });
    assert.equal(previousPage.events[0]?.targetId, "failed-suspend-target");
    assert.equal(previousPage.events[0]?.outcome, "failed");
    const filteredPage = await store.listAuditEvents({
      limit: 10, offset: 0, action: "suspend", outcome: "succeeded",
    });
    assert.equal(filteredPage.totalCount, 1, "the total count uses the same combined filters as the page");
    assert.equal(filteredPage.events[0]?.targetId, "target-account");
    assert.deepEqual(Object.keys(filteredPage.events[0] ?? {}).sort(), ["action", "actorId", "createdAt", "outcome", "targetId"]);
    const filteredActionPage = await store.listAuditEvents({ limit: 10, offset: 0, action: "reactivate" });
    assert.equal(filteredActionPage.totalCount, 2);
    const filteredOutcomePage = await store.listAuditEvents({ limit: 10, offset: 0, outcome: "failed" });
    assert.equal(filteredOutcomePage.totalCount, 2);
    const boundedFilteredPage = await store.listAuditEvents({ limit: 1, offset: 1, action: "suspend" });
    assert.equal(boundedFilteredPage.totalCount, 2);
    assert.equal(boundedFilteredPage.events[0]?.targetId, "target-account");
    await assert.rejects(
      client.query("INSERT INTO cloudpainter_admin_audit (actor_user_id, target_user_id, action) VALUES ('a', 'b', 'delete')"),
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
