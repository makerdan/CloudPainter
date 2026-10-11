import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";
import { pool } from "@workspace/db";
import { createImageBudget, dailyLimit, checkBudget, ImageAccessError } from "../src/lib/image-budget";
import { createImagesRouter } from "../src/routes/images";
import { createLogoImagesRouter } from "../src/routes/logo-images";
import { PoeImageError } from "@workspace/integrations-openai-ai-server/poe";

// A private schema isolates test usage/membership from real accounts and budgets.
const schema = `image_test_${randomUUID().replaceAll("-", "")}`;
const database = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}` });
const budget = createImageBudget(database);
before(async () => {
  await pool.query(`CREATE SCHEMA ${schema}`);
  await database.query(`
    CREATE TABLE image_generation_accounts (user_id text PRIMARY KEY, role text NOT NULL CHECK (role IN ('normal', 'admin')), enabled boolean NOT NULL DEFAULT true);
    CREATE TABLE image_generation_attempts (id uuid PRIMARY KEY, user_id text NOT NULL,
      started_at timestamptz NOT NULL DEFAULT now(), active_until timestamptz);`);
});
beforeEach(async () => {
  await database.query("TRUNCATE image_generation_accounts, image_generation_attempts");
  await database.query("INSERT INTO image_generation_accounts (user_id, role) VALUES ('normal', 'normal'), ('admin', 'admin')");
});
after(async () => {
  await database.end();
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
});

async function seed(userId: string, count: number, age = "1 hour", active = false) {
  for (let i = 0; i < count; i++) {
    await database.query(`INSERT INTO image_generation_attempts VALUES ($1, $2,
      greatest(now() - $3::interval, date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),
      CASE WHEN $4 THEN now() + interval '3 minutes' ELSE NULL END)`,
    [randomUUID(), userId, age, active]);
  }
}

test("only application-owned normal and admin roles have spending limits", () => {
  assert.equal(dailyLimit("normal"), 2);
  assert.equal(dailyLimit("admin"), 15);
  assert.throws(() => dailyLimit("superadmin"), ImageAccessError);
});

test("explicitly revoked identities are denied by both status and reservation", async () => {
  await database.query("INSERT INTO image_generation_accounts (user_id, role, enabled) VALUES ('revoked', 'normal', false)");
  await assert.rejects(budget.status("revoked"), { code: "authorization_denied" });
  await assert.rejects(budget.reserve("revoked"), { code: "authorization_denied" });
});

test("a first verified identity gets only the normal allowance and existing elevated history is preserved", async () => {
  const status = await budget.status("newly-signed-in");
  assert.equal(status.dailyLimit, 2);
  assert.equal(status.remaining, 2);
  const provisioned = await database.query(
    "SELECT role, enabled FROM image_generation_accounts WHERE user_id = 'newly-signed-in'",
  );
  assert.deepEqual(provisioned.rows, [{ role: "normal", enabled: true }]);

  await seed("admin", 1);
  await budget.status("admin");
  const elevated = await database.query(
    "SELECT role, enabled FROM image_generation_accounts WHERE user_id = 'admin'",
  );
  assert.deepEqual(elevated.rows, [{ role: "admin", enabled: true }]);
  assert.equal(Number((await database.query(
    "SELECT count(*) FROM image_generation_attempts WHERE user_id = 'admin'",
  )).rows[0].count), 1);
  assert.equal((await budget.status("admin")).remaining, 14);
});

test("automatic provisioning never re-enables an explicitly disabled account", async () => {
  await database.query(
    "INSERT INTO image_generation_accounts (user_id, role, enabled) VALUES ('disabled-first-use', 'normal', false)",
  );
  await assert.rejects(budget.status("disabled-first-use"), { code: "authorization_denied" });
  await assert.rejects(budget.reserve("disabled-first-use"), { code: "authorization_denied" });
  const account = await database.query(
    "SELECT role, enabled FROM image_generation_accounts WHERE user_id = 'disabled-first-use'",
  );
  assert.deepEqual(account.rows, [{ role: "normal", enabled: false }]);
});

test("normal daily limit is shared across newly constructed worker instances", async () => {
  const id = await budget.reserve("normal");
  await budget.release(id);
  const other = createImageBudget(database);
  await other.release(await other.reserve("normal"));
  await assert.rejects(other.reserve("normal"), { code: "quota_exhausted" });
  assert.equal((await other.status("normal")).remaining, 0);
});

test("admin daily limit is 15 and cannot be bypassed by a fresh instance", async () => {
  // Pure boundary check avoids dependence on how recently UTC midnight passed.
  checkBudget({ account: 14, total: 14, burst: 0, active: 0 }, dailyLimit("admin"), 60);
  await seed("admin", 15);
  await assert.rejects(createImageBudget(database).reserve("admin"), { code: "quota_exhausted" });
});

test("global daily budget applies across accounts", async () => {
  await seed("some-other-account", 20);
  await assert.rejects(budget.reserve("admin"), { code: "quota_exhausted" });
  assert.equal((await budget.status("normal")).globalRemaining, 0);
});

test("the five attempts per ten minutes cap is durable", async () => {
  await seed("other", 5, "1 minute");
  await assert.rejects(budget.reserve("admin"), { code: "rate_limited", retryAfter: 600 });
});

test("parallel workers cannot reserve more than two slots", async () => {
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => budget.reserve("admin")));
  const accepted = results.filter(r => r.status === "fulfilled");
  assert.equal(accepted.length, 2);
  assert.equal(Number((await database.query("SELECT count(*) FROM image_generation_attempts")).rows[0].count), 2);
  for (const result of accepted) if (result.status === "fulfilled") await budget.release(result.value);
  await budget.release(await budget.reserve("admin"));
});

test("expired crash leases free concurrency but do not refund daily budgets", async () => {
  await seed("normal", 2, "1 minute", true);
  await database.query("UPDATE image_generation_attempts SET active_until = now() - interval '1 second'");
  await assert.rejects(budget.reserve("normal"), { code: "quota_exhausted" });
  await budget.release(await budget.reserve("admin"));
});

test("UTC midnight starts a new daily budget while rolling burst remains separate", async () => {
  await database.query(`INSERT INTO image_generation_attempts VALUES ($1, 'normal',
    (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') - interval '1 hour', NULL)`, [randomUUID()]);
  assert.equal((await budget.status("normal")).remaining, 2);
});

test("revocation between status and reserve is enforced", async () => {
  await budget.status("admin");
  await database.query("UPDATE image_generation_accounts SET enabled = false WHERE user_id = 'admin'");
  await assert.rejects(budget.reserve("admin"), { code: "authorization_denied" });
  await assert.rejects(budget.status("admin"), { code: "authorization_denied" });
  // The initial setup's conflict policy preserves explicit revocation.
  await database.query("INSERT INTO image_generation_accounts (user_id, role) VALUES ('admin', 'admin') ON CONFLICT (user_id) DO NOTHING");
  await assert.rejects(budget.reserve("admin"), { code: "authorization_denied" });
});

async function routeRequest(userId: string | null, options: {
  path?: string; method?: string; origin?: string; input?: unknown;
  store?: typeof budget; failProvider?: boolean; configured?: boolean;
} = {}) {
  let transports = 0;
  let released!: () => void;
  const releaseDone = new Promise<void>(resolve => { released = resolve; });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { info() {}, warn() {}, error() {} } as never;
    next();
  });
  app.use("/api", createImagesRouter({
    userId: () => userId,
    configured: () => options.configured ?? true,
    budget: {
      ...(options.store ?? budget),
      release: async id => {
        try { await (options.store ?? budget).release(id); }
        finally { released(); }
      },
    },
    generate: async () => {
      transports++;
      if (options.failProvider) throw new PoeImageError("upstream_timeout", "Ambiguous timeout; not retried.");
      return { mime: "image/png", b64_json: "stub" };
    },
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.on("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const method = options.method ?? "POST";
    const response = await fetch(`${base}${options.path ?? "/api/images/generate"}`, {
      method,
      headers: { "Content-Type": "application/json", Origin: options.origin ?? base },
      body: method === "POST" ? JSON.stringify(options.input ?? { prompt: "Clouds", model: "Nano-Banana-Pro" }) : undefined,
    });
    const data = await response.json();
    if (transports) await releaseDone;
    return { status: response.status, data, transports };
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function logoRouteRequest(userId: string) {
  let transports = 0;
  const app = express().use("/api", createLogoImagesRouter({
    auth: () => ({ userId, sessionId: "logo-test-session" }),
    configured: () => true,
    budget,
    provider: async () => {
      transports++;
      throw new Error("Provider should not run when shared account budget is exhausted");
    },
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(`${base}/api/logo-images`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: base,
        "X-Logo-Session": "logo-test-session",
      },
      body: JSON.stringify({ prompt: "cloud" }),
    });
    return { status: response.status, data: await response.json(), transports };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test("anonymous and explicitly revoked route requests never contact the provider", async () => {
  await database.query("INSERT INTO image_generation_accounts (user_id, role, enabled) VALUES ('revoked-route', 'normal', false)");
  for (const [user, status] of [[null, 401], ["revoked-route", 403]] as const) {
    const result = await routeRequest(user);
    assert.equal(result.status, status);
    assert.equal(result.transports, 0);
  }
});

test("a first authenticated generation request creates and uses only normal access", async () => {
  const result = await routeRequest("new-route-user");
  assert.equal(result.status, 200);
  assert.equal(result.transports, 1);
  assert.deepEqual(
    (await database.query("SELECT role, enabled FROM image_generation_accounts WHERE user_id = 'new-route-user'")).rows,
    [{ role: "normal", enabled: true }],
  );
  assert.equal(Number((await database.query(
    "SELECT count(*) FROM image_generation_attempts WHERE user_id = 'new-route-user'",
  )).rows[0].count), 1);
});

test("logo generation shares the same durable account quota as image generation", async () => {
  await seed("normal", 1);
  const image = await routeRequest("normal");
  assert.equal(image.status, 200);
  assert.equal(image.transports, 1);
  const logo = await logoRouteRequest("normal");
  assert.equal(logo.status, 429);
  assert.equal(logo.data.code, "quota_exhausted");
  assert.equal(logo.transports, 0);
  assert.equal((await budget.status("normal")).remaining, 0);
});

test("account, global, burst, and concurrency exhaustion happen before provider transport", async () => {
  for (const [user, count, age, active] of [
    ["admin", 15, "1 hour", false], ["other", 20, "1 hour", false],
    ["other", 5, "1 minute", false], ["other", 2, "1 minute", true],
  ] as const) {
    await database.query("TRUNCATE image_generation_attempts");
    await seed(user, count, age, active);
    const result = await routeRequest("admin");
    assert.equal(result.status, 429);
    assert.equal(result.transports, 0);
  }
});

test("invalid input and cross-origin requests do not consume budget or contact Poe", async () => {
  const requests = [
    { origin: "https://evil.example" }, { input: { prompt: "test", model: "unapproved" } },
    { input: { prompt: " ", model: "Nano-Banana-Pro" } },
  ];
  for (const options of requests) {
    const result = await routeRequest("admin", options);
    assert.ok([400, 403].includes(result.status));
    assert.equal(result.transports, 0);
  }
  assert.equal((await budget.status("admin")).remaining, 15);
});

test("database failure fails closed before provider transport", async () => {
  const result = await routeRequest("admin", { store: { ...budget, reserve: async () => { throw new Error("database down"); } } });
  assert.equal(result.status, 503);
  assert.equal(result.transports, 0);
});

test("missing Poe configuration does not reserve budget", async () => {
  const result = await routeRequest("admin", { configured: false });
  assert.equal(result.status, 503);
  assert.equal(result.transports, 0);
  assert.equal((await budget.status("admin")).remaining, 15);
});

test("ambiguous provider failure spends exactly one attempt and never retries", async () => {
  const result = await routeRequest("normal", { failProvider: true });
  assert.equal(result.transports, 1);
  assert.equal(result.status, 502);
  assert.equal((await budget.status("normal")).remaining, 1);
  assert.equal(Number((await database.query("SELECT count(*) FROM image_generation_attempts WHERE active_until IS NOT NULL")).rows[0].count), 0);
});

test("successful stub generation consumes one durable attempt", async () => {
  const result = await routeRequest("normal");
  assert.equal(result.status, 200);
  assert.equal(result.transports, 1);
  assert.equal((await budget.status("normal")).remaining, 1);
});

test("config provisions signed-in users and distinguishes anonymous from revoked access", async () => {
  await database.query("INSERT INTO image_generation_accounts (user_id, role, enabled) VALUES ('revoked-config', 'normal', false)");
  for (const user of [null, "revoked-config", "new-config-user", "normal"]) {
    const result = await routeRequest(user, { method: "GET", path: "/api/images/config" });
    assert.equal(result.status, 200);
    assert.equal(result.data.allowed, user === "normal" || user === "new-config-user");
    assert.equal(result.data.signedIn, Boolean(user));
    assert.equal(result.transports, 0);
  }
  assert.deepEqual(
    (await database.query("SELECT role, enabled FROM image_generation_accounts WHERE user_id = 'new-config-user'")).rows,
    [{ role: "normal", enabled: true }],
  );
  assert.deepEqual(
    (await database.query("SELECT role, enabled FROM image_generation_accounts WHERE user_id = 'revoked-config'")).rows,
    [{ role: "normal", enabled: false }],
  );
});
