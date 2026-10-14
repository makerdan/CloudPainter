import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import express from "express";
import { clerkMiddleware } from "@clerk/express";
import type { ProjectBackupRow } from "@workspace/db/schema";
import {
  MAX_CLOUD_PROJECT_BACKUP_BYTES,
  type CreateProjectBackupResult,
  type ProjectBackupStore,
} from "../lib/projectBackupStore";
import { createProjectBackupRouter } from "./project-backups";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwtKey = publicKey.export({ type: "spki", format: "pem" }).toString();
const issuer = "https://project-backups-test.clerk.accounts.dev";

function token(user: string, session: string, expired = false) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode({ alg: "RS256", typ: "JWT", kid: "test" })}.${encode({
    sub: user, sid: session, iss: issuer, iat: now - 60, nbf: now - 60,
    exp: expired ? now - 30 : now + 120, azp: "http://localhost",
  })}`;
  return `${body}.${sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url")}`;
}

function createMemoryStore(): ProjectBackupStore {
  const rows = new Map<string, ProjectBackupRow>();
  const requests = new Map<string, string>();
  return {
    async list(userId) {
      const backups = [...rows.values()]
        .filter(row => row.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(({ id, title, sizeBytes, createdAt }) => ({ id, title, sizeBytes, createdAt }));
      return { backups, totalBytes: backups.reduce((sum, row) => sum + row.sizeBytes, 0) };
    },
    async exportAll(userId) {
      return [...rows.values()].filter(row => row.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async get(userId, id) {
      const row = rows.get(id);
      return row?.userId === userId ? row : null;
    },
    async create(userId, requestId, title, backup): Promise<CreateProjectBackupResult> {
      const requestKey = `${userId}:${requestId}`;
      const previousId = requests.get(requestKey);
      if (previousId) {
        const existing = rows.get(previousId)!;
        return existing.backup === backup
          ? { kind: "existing", backup: existing }
          : { kind: "request-mismatch" };
      }
      const row: ProjectBackupRow = {
        id: randomUUID(),
        userId,
        requestId,
        title,
        backup,
        sizeBytes: Buffer.byteLength(backup, "utf8"),
        createdAt: new Date(),
      };
      rows.set(row.id, row);
      requests.set(requestKey, row.id);
      return { kind: "created", backup: row };
    },
    async delete(userId, id) {
      const row = rows.get(id);
      if (!row || row.userId !== userId) return false;
      rows.delete(id);
      requests.delete(`${userId}:${row.requestId}`);
      return true;
    },
  };
}

test("project backup routes require the current account session and isolate all reads and deletes", { timeout: 60000 }, async () => {
  const app = express();
  app.use(clerkMiddleware({
    jwtKey,
    publishableKey: `pk_test_${Buffer.from("project-backups-test.clerk.accounts.dev$").toString("base64")}`,
    secretKey: "sk_test_fixture",
  }));
  app.use((req, _res, next) => {
    Object.defineProperty(req, "log", {
      value: { error: () => {}, debug: () => {} },
    });
    next();
  });
  const store = createMemoryStore();
  app.use("/api", createProjectBackupRouter(store));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/project-backups`;
  const request = (
    path: string,
    user?: string,
    session = "session-a",
    init: RequestInit = {},
  ) => fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(user ? { Authorization: `Bearer ${token(user, session)}` } : {}),
      ...(user ? { "X-Project-Session": session } : {}),
      ...init.headers,
    },
  });

  try {
    assert.equal((await request("")).status, 401);
    assert.equal((await request("", "user_a", "session-a", {
      headers: { "X-Project-Session": "session-b" },
    })).status, 401);
    assert.equal((await request("/export")).status, 401);

    const backup = JSON.stringify({
      format: "cloudpainter-project",
      version: 1,
      project: { title: "River study" },
    });
    const requestId = randomUUID();
    const blockedCrossSite = await request("", "user_a", "session-a", {
      method: "POST",
      headers: { "Sec-Fetch-Site": "cross-site" },
      body: JSON.stringify({ requestId, backup }),
    });
    assert.equal(blockedCrossSite.status, 403);

    const created = await request("", "user_a", "session-a", {
      method: "POST",
      body: JSON.stringify({ requestId, backup }),
    });
    assert.equal(created.status, 201);
    const summary = await created.json() as { id: string; title: string; sizeBytes: number };
    assert.equal(summary.title, "River study");
    assert.equal(summary.sizeBytes, Buffer.byteLength(backup));

    const retry = await request("", "user_a", "session-a", {
      method: "POST",
      body: JSON.stringify({ requestId, backup }),
    });
    assert.equal(retry.status, 200);
    assert.equal((await retry.json() as { id: string }).id, summary.id);

    const reused = await request("", "user_a", "session-a", {
      method: "POST",
      body: JSON.stringify({ requestId, backup: backup.replace("River", "Forest") }),
    });
    assert.equal(reused.status, 409);

    const userARead = await request(`/${summary.id}`, "user_a", "session-a");
    assert.equal(userARead.status, 200);
    assert.equal((await userARead.json() as { backup: string }).backup, backup);
    assert.equal((await (await request("", "user_a", "session-a")).json() as { backups: unknown[] }).backups.length, 1);
    assert.equal((await (await request("", "user_b", "session-b")).json() as { backups: unknown[] }).backups.length, 0);
    assert.equal((await request(`/${summary.id}`, "user_b", "session-b")).status, 404);
    assert.equal((await request(`/${summary.id}`, "user_b", "session-b", { method: "DELETE" })).status, 404);

    const otherAccountBackup = JSON.stringify({
      format: "cloudpainter-project",
      version: 1,
      project: { title: "Private other account sketch" },
    });
    await store.create("user_b", randomUUID(), "Private other account sketch", otherAccountBackup);
    const exported = await request("/export", "user_a", "session-a");
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get("content-type") ?? "", /^application\/zip\b/);
    assert.equal(exported.headers.get("cache-control"), "private, no-store");
    assert.match(exported.headers.get("content-disposition") ?? "", /cloudpainter-account-backups\.zip/);
    const archiveBytes = Buffer.from(await exported.arrayBuffer());
    assert.equal(archiveBytes.readUInt32LE(0), 0x0403_4b50);
    const archiveText = archiveBytes.toString("utf8");
    assert.match(archiveText, /cloudpainter-account-backups/);
    assert.ok(archiveText.includes(backup));
    assert.ok(!archiveText.includes(otherAccountBackup));

    const maxSizedBackup = "x".repeat(MAX_CLOUD_PROJECT_BACKUP_BYTES);
    store.exportAll = async () => Array.from({ length: 17 }, (_, index) => ({
      id: randomUUID(),
      userId: "user_a",
      requestId: randomUUID(),
      title: `Large backup ${index}`,
      backup: maxSizedBackup,
      sizeBytes: MAX_CLOUD_PROJECT_BACKUP_BYTES,
      createdAt: new Date(),
    }));
    const tooLarge = await request("/export", "user_a", "session-a");
    assert.equal(tooLarge.status, 413);
    assert.match((await tooLarge.json() as { error: string }).error, /export limit/i);

    store.exportAll = async () => {
      throw new Error("temporary database failure");
    };
    const failedExport = await request("/export", "user_a", "session-a");
    assert.equal(failedExport.status, 503);
    assert.equal(failedExport.headers.get("cache-control"), "private, no-store");

    const interruptibleBackup = "x".repeat(MAX_CLOUD_PROJECT_BACKUP_BYTES);
    store.exportAll = async () => [{
      id: randomUUID(),
      userId: "user_a",
      requestId: randomUUID(),
      title: "Interrupted download",
      backup: interruptibleBackup,
      sizeBytes: MAX_CLOUD_PROJECT_BACKUP_BYTES,
      createdAt: new Date(),
    }];
    const abortController = new AbortController();
    const partialExport = await request("/export", "user_a", "session-a", { signal: abortController.signal });
    assert.equal(partialExport.status, 200);
    const reader = partialExport.body?.getReader();
    assert.ok(reader);
    assert.ok((await reader.read()).value?.length);
    abortController.abort();
    await assert.rejects(reader.read());

    store.exportAll = async () => [];
    const oversized = await request("", "user_a", "session-a", {
      method: "POST",
      body: JSON.stringify({ requestId: randomUUID(), backup: "x".repeat(2 * 1024 * 1024 + 1) }),
    });
    assert.equal(oversized.status, 413);
    const parserLimited = await request("", "user_a", "session-a", {
      method: "POST",
      body: JSON.stringify({ requestId: randomUUID(), backup: "x".repeat(2 * 1024 * 1024 + 200_000) }),
    });
    assert.equal(parserLimited.status, 413);

    const removed = await request(`/${summary.id}`, "user_a", "session-a", { method: "DELETE" });
    assert.equal(removed.status, 204);
    assert.equal((await request(`/${summary.id}`, "user_a", "session-a")).status, 404);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
