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
    await assert.rejects(
      client.query("INSERT INTO cloudpainter_admin_audit (actor_user_id, target_user_id, action) VALUES ('a', 'b', 'delete')"),
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
