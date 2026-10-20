import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign, randomUUID } from "node:crypto";
import express from "express";
import { clerkMiddleware } from "@clerk/express";
import { drizzle } from "drizzle-orm/node-postgres";
import { pool } from "@workspace/db";
import * as dbSchema from "@workspace/db/schema";
import { createSettingsRouter } from "./settings";
import { createSettingsStore } from "../lib/settingsStore";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwtKey = publicKey.export({ type: "spki", format: "pem" }).toString();
const issuer = "https://settings-test.clerk.accounts.dev";
function token(user: string, session: string, expired = false) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode({ alg: "RS256", typ: "JWT", kid: "test" })}.${encode({
    sub: user, sid: session, iss: issuer, iat: now - 60, nbf: now - 60,
    exp: expired ? now - 30 : now + 120, azp: "http://localhost",
  })}`;
  return `${body}.${sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url")}`;
}

test("settings are strictly validated, authenticated, isolated, and durable", { timeout: 60000 }, async () => {
  const client = await pool.connect();
  const schema = `settings_test_${randomUUID().replaceAll("-", "")}`;
  let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query("CREATE TABLE account_settings (user_id text PRIMARY KEY, revision integer NOT NULL DEFAULT 0, settings jsonb NOT NULL)");
    const database = drizzle(client, { schema: dbSchema });
    const app = express();
    app.use(express.json());
    app.use(clerkMiddleware({
      jwtKey,
      publishableKey: `pk_test_${Buffer.from("settings-test.clerk.accounts.dev$").toString("base64")}`,
      secretKey: "sk_test_fixture",
    }));
    app.use("/api", createSettingsRouter(createSettingsStore(database)));
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server!.once("listening", resolve));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/settings`;
    const request = (user?: string, session = "sess_a", body?: unknown, extra: Record<string, string> = {}) => fetch(url, {
      method: body === undefined ? "GET" : "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Settings-Session": session,
        ...(user ? { Authorization: `Bearer ${token(user, session)}` } : {}),
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const defaults = { textSize: 100, drawingTool: "brush", brushStyle: "round", brushSize: 8 };
    const preferred = { textSize: 130, drawingTool: "pen", brushStyle: "dry", brushSize: 37 };

    assert.equal((await request()).status, 401);
    assert.deepEqual(await (await request("user_a", "sess_a")).json(), { revision: 0, settings: defaults });
    assert.equal((await request("user_a", "sess_a", undefined, { "X-Settings-Session": "sess_b" })).status, 401);
    assert.equal((await request("user_a", "sess_a", undefined, {
      Authorization: `Bearer ${token("user_a", "sess_a", true)}`,
    })).status, 401);

    const saved = await request("user_a", "sess_a", { revision: 0, settings: preferred });
    assert.equal(saved.status, 200, await saved.clone().text());
    assert.deepEqual(await saved.json(), { revision: 1, settings: preferred });
    assert.deepEqual(await (await request("user_b", "sess_b")).json(), { revision: 0, settings: defaults });

    for (const invalid of [
      { revision: 1, settings: { ...preferred, textSize: 85 } },
      { revision: 1, settings: { ...preferred, textSize: 150 } },
      { revision: 1, settings: { ...preferred, drawingTool: "eraser" } },
      { revision: 1, settings: { ...preferred, brushStyle: "marker" } },
      { revision: 1, settings: { ...preferred, brushSize: 0 } },
      { revision: 1, settings: { ...preferred, brushSize: 49 } },
      { revision: 1, settings: { ...preferred, photo: "private" } },
      { revision: 1, settings: { ...preferred, project: { image: "private", strokes: [] } } },
      { revision: 1, settings: { ...preferred, userId: "user_b" } },
      { revision: 1, settings: preferred, userId: "user_b" },
      { settings: preferred },
    ]) assert.equal((await request("user_a", "sess_a", invalid)).status, 400);
    assert.equal((await request("user_a", "sess_a", { revision: 1, settings: preferred }, { "Sec-Fetch-Site": "cross-site" })).status, 403);

    // Two signed-in devices race from the same revision. Exactly one write
    // wins, and the stale request receives the value that was stored.
    const deviceASettings = { ...preferred, textSize: 120 };
    const deviceBSettings = { ...preferred, brushSize: 19 };
    const [deviceA, deviceB] = await Promise.all([
      request("user_a", "sess_a", { revision: 1, settings: deviceASettings }),
      request("user_a", "sess_b", { revision: 1, settings: deviceBSettings }),
    ]);
    const responses = await Promise.all([deviceA.json(), deviceB.json()]);
    assert.deepEqual([deviceA.status, deviceB.status].sort(), [200, 409]);
    const winner = deviceA.status === 200 ? responses[0] : responses[1];
    const conflict = (deviceA.status === 409 ? responses[0] : responses[1]) as { current: unknown };
    assert.deepEqual(winner, {
      revision: 2,
      settings: deviceA.status === 200 ? deviceASettings : deviceBSettings,
    });
    assert.deepEqual(conflict.current, winner);

    const restored = await createSettingsStore(drizzle(client, { schema: dbSchema })).read("user_a");
    assert.deepEqual(restored, winner);
    assert.deepEqual(await (await request("user_a", "sess_a")).json(), winner);
    assert.deepEqual(await createSettingsStore(database).read("user_b"), { revision: 0, settings: defaults });
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
