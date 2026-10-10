import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign, randomUUID } from "node:crypto";
import express from "express";
import { clerkMiddleware } from "@clerk/express";
import { drizzle } from "drizzle-orm/node-postgres";
import { pool, palettesTable } from "@workspace/db";
import * as dbSchema from "@workspace/db/schema";
import { createPaletteRouter } from "./palettes";
import { createPaletteStore } from "../lib/paletteStore";

// Real Clerk signature verification using an isolated signing key, never a production auth bypass.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwtKey = publicKey.export({ type: "spki", format: "pem" }).toString();
const issuer = "https://palette-test.clerk.accounts.dev";
function token(user: string, session: string, expired = false) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const body = `${encode({ alg: "RS256", typ: "JWT", kid: "test" })}.${encode({
    sub: user, sid: session, iss: issuer, iat: now - 60, nbf: now - 60,
    exp: expired ? now - 30 : now + 120, azp: "http://localhost",
  })}`;
  return `${body}.${sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url")}`;
}
test("verified routes enforce ownership, validation, expiry and durable persistence in isolated DB schema", { timeout: 60000 }, async () => {
  const client = await pool.connect();
  const schema = `palette_test_${randomUUID().replaceAll("-", "")}`;
  let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query(`CREATE TABLE account_palettes (user_id text PRIMARY KEY, revision integer NOT NULL, colors jsonb NOT NULL)`);
    const db = drizzle(client, { schema: dbSchema });
    const app = express();
    app.use(express.json());
    app.use(clerkMiddleware({
      jwtKey,
      // Non-secret fixture values, unrelated to the provisioned tenant.
      publishableKey: `pk_test_${Buffer.from("palette-test.clerk.accounts.dev$").toString("base64")}`,
      secretKey: "sk_test_fixture",
    }));
    app.use("/api", createPaletteRouter(createPaletteStore(db)));
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server!.once("listening", resolve));
    const port = (server.address() as { port: number }).port;
    const url = `http://127.0.0.1:${port}/api/palette`;
    const request = (user?: string, session = "sess_a", body?: unknown, extra: Record<string, string> = {}) => fetch(url, {
      method: body ? "PUT" : "GET",
      headers: { "Content-Type": "application/json", "X-Palette-Session": session,
        ...(user ? { Authorization: `Bearer ${token(user, session)}` } : {}), ...extra },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.equal((await request()).status, 401);
    const colors = [{ id: "pine", name: "Pine", hex: "#315D4D" }];
    let response = await request("user_a", "sess_a", { revision: 0, colors });
    assert.equal(response.status, 200, await response.clone().text());
    assert.deepEqual(await response.json(), { revision: 1, colors: [{ ...colors[0], hex: "#315d4d" }] });
    assert.deepEqual(await (await request("user_b", "sess_b")).json(), { revision: 0, colors: [] });
    assert.equal((await request("user_b", "sess_b", { revision: 1, colors: [] })).status, 409);
    assert.equal((await request("user_b", "sess_b", { revision: 0, colors, userId: "user_a" })).status, 400);
    for (const body of [
      { revision: 1, colors: [{ ...colors[0], hex: "red" }] },
      { revision: 1, colors: [{ ...colors[0], name: " " }] },
      { revision: 1, colors: [{ ...colors[0], image: "private" }] },
      { revision: 1, colors: [colors[0], colors[0]] },
      { revision: 1, colors: Array.from({ length: 65 }, (_, i) => ({ ...colors[0], id: `c${i}` })) },
      { revision: 1, colors, photo: "private", title: "private", strokes: [] },
    ]) assert.equal((await request("user_a", "sess_a", body)).status, 400);
    response = await request("user_a", "sess_a", undefined, { "X-Palette-Session": "sess_b" });
    assert.equal(response.status, 401);
    assert.equal((await request("user_a", "sess_a", undefined, { Authorization: `Bearer ${token("user_a", "sess_a", true)}` })).status, 401);
    assert.equal((await request("user_a", "sess_a", { revision: 1, colors: [] }, { "Sec-Fetch-Site": "cross-site" })).status, 403);
    // Fresh storage instance restores persisted values (not an in-memory route cache).
    const restored = await createPaletteStore(drizzle(client, { schema: dbSchema })).read("user_a");
    assert.equal(restored.colors[0].name, "Pine");
    const saves = await Promise.all([
      request("user_a", "sess_a", { revision: 1, colors: [{ ...colors[0], name: "Forest" }] }),
      request("user_a", "sess_a", { revision: 1, colors: [] }),
    ]);
    assert.deepEqual(saves.map(r => r.status).sort(), [200, 409]);
    await request("user_b", "sess_b", { revision: 0, colors: [{ ...colors[0], name: "Other" }] });
    assert.equal((await createPaletteStore(db).read("user_b")).colors[0].name, "Other");
    // Invalid signature fails real auth verification.
    assert.equal((await request("user_a", "sess_a", undefined, { Authorization: `Bearer ${token("user_a", "sess_a")}corrupt` })).status, 401);
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
