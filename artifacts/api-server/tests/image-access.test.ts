import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";
import sharp from "sharp";
import { drizzle } from "drizzle-orm/node-postgres";
import { pool } from "@workspace/db";
import * as dbSchema from "@workspace/db/schema";
import { createAdminStore } from "../src/lib/adminStore";
import { createImageBudget, dailyLimit, checkBudget, ImageAccessError } from "../src/lib/image-budget";
import { createImagesRouter } from "../src/routes/images";
import { createLogoImagesRouter } from "../src/routes/logo-images";
import { createImageUpscaleRouter } from "../src/routes/image-upscale";
import { createOutlineRouter } from "../src/routes/outline";
import { PoeImageError } from "@workspace/integrations-openai-ai-server/poe";

// A private schema isolates test usage/membership from real accounts and budgets.
const schema = `image_test_${randomUUID().replaceAll("-", "")}`;
const database = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}` });
const budget = createImageBudget(database);
const administration = createAdminStore(drizzle(database, { schema: dbSchema }));
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

test("generation role changes preserve enabled access, revocation, and every account's attempt history", async () => {
  await database.query(`
    INSERT INTO image_generation_accounts (user_id, role, enabled) VALUES
      ('role-changed-enabled', 'normal', true),
      ('role-changed-revoked', 'normal', false),
      ('role-change-unrelated', 'admin', true)
  `);
  await seed("role-changed-enabled", 2);
  await seed("role-changed-revoked", 3);
  await seed("role-change-unrelated", 1);

  const attemptIds = async (userId: string) => (await database.query(
    "SELECT id FROM image_generation_attempts WHERE user_id = $1 ORDER BY id",
    [userId],
  )).rows.map(row => row.id);
  const enabledBeforeIds = await attemptIds("role-changed-enabled");
  const revokedBeforeIds = await attemptIds("role-changed-revoked");
  const unrelatedBeforeIds = await attemptIds("role-change-unrelated");
  assert.equal(enabledBeforeIds.length, 2);
  assert.equal(revokedBeforeIds.length, 3);
  assert.equal(unrelatedBeforeIds.length, 1);

  await administration.setGenerationAccess("role-changed-enabled", "admin", true);
  const promoted = await budget.status("role-changed-enabled");
  assert.equal(promoted.dailyLimit, 15);
  assert.equal(promoted.remaining, 13);
  assert.deepEqual((await database.query(
    "SELECT role, enabled FROM image_generation_accounts WHERE user_id = 'role-changed-enabled'",
  )).rows, [{ role: "admin", enabled: true }]);
  assert.deepEqual(await attemptIds("role-changed-enabled"), enabledBeforeIds);

  await administration.setGenerationAccess("role-changed-revoked", "admin", false);
  await assert.rejects(budget.status("role-changed-revoked"), { code: "authorization_denied" });
  await assert.rejects(budget.reserve("role-changed-revoked"), { code: "authorization_denied" });
  assert.deepEqual((await database.query(
    "SELECT role, enabled FROM image_generation_accounts WHERE user_id = 'role-changed-revoked'",
  )).rows, [{ role: "admin", enabled: false }]);
  assert.deepEqual(await attemptIds("role-changed-revoked"), revokedBeforeIds);

  await administration.setGenerationAccess("role-changed-revoked", "normal", false);
  await assert.rejects(budget.status("role-changed-revoked"), { code: "authorization_denied" });
  assert.deepEqual(await attemptIds("role-changed-revoked"), revokedBeforeIds);

  assert.deepEqual((await database.query(
    "SELECT role, enabled FROM image_generation_accounts WHERE user_id = 'role-change-unrelated'",
  )).rows, [{ role: "admin", enabled: true }]);
  assert.deepEqual(await attemptIds("role-change-unrelated"), unrelatedBeforeIds);
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

const sharedRouteInputs = {
  image: { prompt: "Clouds", model: "Nano-Banana-Pro" },
  logo: { prompt: "A cloud mark" },
  upscale: {
    pngBase64: (await sharp({ create: { width: 1, height: 1, channels: 4, background: "#315d4d" } }).png().toBuffer()).toString("base64"),
    scale: 4,
  },
  outline: {
    imageBase64: Buffer.alloc(64).toString("base64"),
    consent: true,
    subject: "cloud",
    sensitivity: 0.5,
  },
} as const;
const sharedRouteOrder = ["image", "logo", "upscale", "outline"] as const;
type SharedRoute = typeof sharedRouteOrder[number];

async function sharedRouteFixture(userId: string) {
  const transports: Record<SharedRoute, number> = { image: 0, logo: 0, upscale: 0, outline: 0 };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { info() {}, warn() {}, error() {} } as never;
    next();
  });
  app.use("/api", createImagesRouter({
    userId: () => userId,
    configured: () => true,
    budget,
    generate: async () => {
      transports.image++;
      return { mime: "image/png", b64_json: "stub" };
    },
  }));
  app.use("/api", createLogoImagesRouter({
    auth: () => ({ userId, sessionId: "shared-route-session" }),
    configured: () => true,
    budget,
    provider: async () => {
      transports.logo++;
      const png = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#ffffff" } }).png().toBuffer();
      return { data: [{ b64_json: png.toString("base64") }] };
    },
  }));
  app.use("/api", createImageUpscaleRouter({
    userId: () => userId,
    configured: () => true,
    budget,
    upscale: async () => {
      transports.upscale++;
      return { b64_json: "stub", mime: "image/png", width: 4, height: 4 };
    },
  }));
  app.use("/api", createOutlineRouter({
    auth: () => ({ userId, sessionId: "shared-route-session" }),
    configured: () => true,
    budget,
    prepare: async () => ({ png: Buffer.alloc(0), width: 512, height: 512, left: 0, top: 0 }),
    generate: async () => {
      transports.outline++;
      return {
        model: "GPT-Image-2",
        candidates: [{ label: "Cloud", points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.5, y: 0.9 }] }],
      };
    },
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    transports,
    async post(route: SharedRoute) {
      const paths = {
        image: "/api/images/generate",
        logo: "/api/logo-images",
        upscale: "/api/images/upscale",
        outline: "/api/outlines",
      } as const;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Origin: origin,
        ...(route === "logo" ? { "X-Logo-Session": "shared-route-session" } : {}),
        ...(route === "outline" ? { "X-Outline-Session": "shared-route-session" } : {}),
      };
      const response = await fetch(`${origin}${paths[route]}`, {
        method: "POST",
        headers,
        body: JSON.stringify(sharedRouteInputs[route]),
      });
      return { status: response.status, data: await response.json() as Record<string, unknown> };
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
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

test("each Poe route spends the same final normal-account request across route types", async () => {
  for (let i = 0; i < sharedRouteOrder.length; i++) {
    await database.query("TRUNCATE image_generation_attempts");
    await seed("normal", 1);
    const first = sharedRouteOrder[i];
    const second = sharedRouteOrder[(i + 1) % sharedRouteOrder.length];
    const fixture = await sharedRouteFixture("normal");
    try {
      const allowed = await fixture.post(first);
      assert.equal(allowed.status, 200, `${first} should use the remaining normal request`);
      assert.equal(fixture.transports[first], 1);
      const denied = await fixture.post(second);
      assert.equal(denied.status, 429, `${second} should see the shared normal-account limit`);
      assert.equal(denied.data.code, "quota_exhausted");
      assert.equal(fixture.transports[second], 0);
      assert.equal((await budget.status("normal")).remaining, 0);
    } finally {
      await fixture.close();
    }
  }
});

test("all Poe routes deny disabled accounts before provider transport", async () => {
  await database.query("INSERT INTO image_generation_accounts (user_id, role, enabled) VALUES ('disabled-shared-route', 'normal', false)");
  for (const route of sharedRouteOrder) {
    const fixture = await sharedRouteFixture("disabled-shared-route");
    try {
      const result = await fixture.post(route);
      assert.equal(result.status, 403, route);
      assert.equal(fixture.transports[route], 0, route);
    } finally {
      await fixture.close();
    }
  }
  assert.deepEqual(
    (await database.query("SELECT role, enabled FROM image_generation_accounts WHERE user_id = 'disabled-shared-route'")).rows,
    [{ role: "normal", enabled: false }],
  );
  assert.equal(Number((await database.query("SELECT count(*) FROM image_generation_attempts WHERE user_id = 'disabled-shared-route'")).rows[0].count), 0);
});

test("all Poe routes enforce the shared global daily budget without changing admin role or history", async () => {
  await seed("admin", 4);
  await seed("other-account", 16);
  for (const route of sharedRouteOrder) {
    const fixture = await sharedRouteFixture("admin");
    try {
      const result = await fixture.post(route);
      assert.equal(result.status, 429, route);
      assert.equal(result.data.code, "quota_exhausted");
      assert.equal(fixture.transports[route], 0, route);
    } finally {
      await fixture.close();
    }
  }
  assert.deepEqual(
    (await database.query("SELECT role, enabled FROM image_generation_accounts WHERE user_id = 'admin'")).rows,
    [{ role: "admin", enabled: true }],
  );
  assert.equal(Number((await database.query("SELECT count(*) FROM image_generation_attempts WHERE user_id = 'admin'")).rows[0].count), 4);
  assert.equal((await budget.status("admin")).remaining, 11);
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
