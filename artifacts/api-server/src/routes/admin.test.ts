import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import express from "express";
import { clerkMiddleware } from "@clerk/express";
import { createAdminRouter, type AdminAccountProvider, type AdminAction } from "./admin";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwtKey = publicKey.export({ type: "spki", format: "pem" }).toString();
const issuer = "https://admin-test.clerk.accounts.dev";

function token(user: string, session: string, expired = false) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode({ alg: "RS256", typ: "JWT", kid: "test" })}.${encode({
    sub: user, sid: session, iss: issuer, iat: now - 60, nbf: now - 60,
    exp: expired ? now - 30 : now + 120, azp: "http://localhost",
  })}`;
  return `${body}.${sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url")}`;
}

test("admin API fails closed and isolates Clerk account operations", { timeout: 30000 }, async () => {
  type AuditRecord = {
    actor: string;
    target: string;
    action: AdminAction;
    outcome: "pending" | "succeeded" | "failed";
    id: string;
    createdAt: Date;
  };
  const adminPermissions = new Map([
    ["admin-user", true],
    ["user_admin123", true],
    ["disabled-admin", false],
  ]);
  let listCalls: { limit: number; offset: number; query?: string }[] = [];
  let auditListCalls: {
    limit: number;
    cursor?: { createdAt: string; id: string };
    action?: AdminAction;
    outcome?: "pending" | "succeeded" | "failed";
  }[] = [];
  let providerMutations: string[] = [];
  let audit: AuditRecord[] = [];
  let failProvider = false;
  let failAuditStart = false;
  let failAuditFinalize = false;
  const latestAudit = (): AuditRecord | undefined => audit.at(-1);
  const cursorTime = (value: Date) => value.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
  const sensitiveUser = {
    id: "user_target123456",
    firstName: "River",
    lastName: "Stone",
    primaryEmailAddressId: "email-primary",
    emailAddresses: [
      { id: "email-primary", emailAddress: "river@example.test" },
      { id: "email-other", emailAddress: "private@example.test" },
    ],
    createdAt: 1_700_000_000_000,
    banned: false,
    phoneNumbers: [{ phoneNumber: "+15551234567" }],
    privateMetadata: { secret: "must not appear" },
  };
  const provider: AdminAccountProvider = {
    async listUsers(params) {
      if (failProvider) throw new Error("provider details must not leak");
      listCalls.push(params);
      return { data: params.limit === 1 ? [] : [sensitiveUser], totalCount: 87 };
    },
    async suspend(userId) {
      if (failProvider) throw new Error("provider details must not leak");
      providerMutations.push(`suspend:${userId}`);
    },
    async reactivate(userId) {
      if (failProvider) throw new Error("provider details must not leak");
      providerMutations.push(`reactivate:${userId}`);
    },
  };
  const app = express();
  app.use(express.json());
  app.use(clerkMiddleware({
    jwtKey,
    publishableKey: `pk_test_${Buffer.from("admin-test.clerk.accounts.dev$").toString("base64")}`,
    secretKey: "sk_test_fixture",
  }));
  app.use("/api", createAdminRouter({
    async isEnabledAdmin(userId) { return adminPermissions.get(userId) === true; },
    async listAuditEvents(params) {
      auditListCalls.push(params);
      const filtered = audit.filter(event => (!params.action || event.action === params.action)
        && (!params.outcome || event.outcome === params.outcome));
      const sorted = filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
      const matching = params.cursor
        ? sorted.filter(event => event.createdAt.getTime() < new Date(params.cursor!.createdAt).getTime()
          || (event.createdAt.getTime() === new Date(params.cursor!.createdAt).getTime() && event.id < params.cursor!.id))
        : sorted;
      const events = matching.slice(0, params.limit);
      const lastEvent = events.at(-1);
      return {
        events: events.map(event => ({
          actorId: event.actor,
          targetId: event.target,
          action: event.action,
          outcome: event.outcome,
          createdAt: event.createdAt,
        })),
        totalCount: filtered.length,
        ...(lastEvent && matching.length > events.length
          ? { nextCursor: { createdAt: cursorTime(lastEvent.createdAt), id: lastEvent.id } }
          : {}),
      };
    },
    async startAction(actor, target, action) {
      if (failAuditStart) throw new Error("database details must not leak");
      const id = String(audit.length + 1);
      audit.push({
        actor, target, action, outcome: "pending",
        id: `00000000-0000-4000-8000-${id.padStart(12, "0")}`,
        createdAt: new Date("2024-02-03T04:05:06.000Z"),
      });
      return id;
    },
    async finishAction(id, outcome) {
      if (failAuditFinalize) throw new Error("database details must not leak");
      audit[Number(id) - 1].outcome = outcome;
    },
  }, provider));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/admin`;
    const request = (path: string, user?: string, session = "session-a", options: RequestInit = {}) => fetch(`${url}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Session": session,
        ...(user ? { Authorization: `Bearer ${token(user, session)}` } : {}),
        ...options.headers,
      },
    });
    const initialProviderCalls = () => ({ lists: listCalls.length, mutations: providerMutations.length, audits: audit.length });
    const deniedChange = { method: "PUT", body: JSON.stringify({ status: "suspended" }) };

    const untouched = initialProviderCalls();
    assert.equal((await request("/overview")).status, 401);
    assert.equal((await request("/accounts", "ordinary-user")).status, 404);
    assert.equal((await request("/accounts", "quota-admin-only")).status, 404);
    assert.equal((await request("/accounts", "disabled-admin")).status, 404);
    assert.equal((await request("/audit-events")).status, 401);
    assert.equal((await request("/audit-events", "ordinary-user")).status, 404);
    assert.equal((await request("/audit-events", "quota-admin-only")).status, 404);
    assert.equal((await request("/audit-events", "disabled-admin")).status, 404);
    assert.equal((await request("/accounts", "admin-user", "session-a", {
      headers: { Authorization: `Bearer ${token("admin-user", "session-a", true)}` },
    })).status, 401);
    assert.equal((await request("/accounts", "admin-user", "mismatched-session", {
      headers: { Authorization: `Bearer ${token("admin-user", "session-a")}` },
    })).status, 401);
    assert.equal((await request("/audit-events", "admin-user", "session-a", {
      headers: { Authorization: `Bearer ${token("admin-user", "session-a", true)}` },
    })).status, 401, "expired sessions cannot read account history");
    assert.equal((await request("/audit-events", "admin-user", "mismatched-session", {
      headers: { Authorization: `Bearer ${token("admin-user", "session-a")}` },
    })).status, 401, "stale session IDs cannot read account history");
    for (const [user, expectedStatus] of [
      [undefined, 401],
      ["ordinary-user", 404],
      ["quota-admin-only", 404],
      ["disabled-admin", 404],
    ] as const) {
      assert.equal((await request("/accounts/user_target123456/status", user, "session-a", deniedChange)).status, expectedStatus);
    }
    assert.equal((await request("/accounts/user_target123456/status", "admin-user", "session-a", {
      ...deniedChange,
      headers: { Authorization: `Bearer ${token("admin-user", "session-a", true)}` },
    })).status, 401, "expired sessions cannot mutate accounts");
    assert.deepEqual(initialProviderCalls(), untouched, "denials must not contact Clerk or write audit rows");

    const summary = await request("/overview", "admin-user");
    assert.equal(summary.status, 200);
    assert.deepEqual(await summary.json(), { totalAccounts: 87 });
    assert.equal(summary.headers.get("cache-control"), "private, no-store");
    const emptyAudit = await request("/audit-events?limit=2", "admin-user");
    assert.equal(emptyAudit.status, 200);
    assert.equal(emptyAudit.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await emptyAudit.json(), { events: [], totalCount: 0, limit: 2, nextCursor: null });
    assert.deepEqual(auditListCalls.at(-1), { limit: 2 });
    assert.equal((await request("/audit-events?limit=51", "admin-user")).status, 400);
    assert.equal((await request("/audit-events?offset=10001", "admin-user")).status, 400);
    assert.equal((await request("/audit-events?cursor=not-a-cursor", "admin-user")).status, 400);
    assert.equal((await request("/audit-events?action=delete", "admin-user")).status, 400);
    assert.equal((await request("/audit-events?outcome=unknown", "admin-user")).status, 400);
    assert.equal((await request("/audit-events?action=suspend&action=reactivate", "admin-user")).status, 400);

    const page = await request("/accounts?limit=2&offset=4&query=river", "admin-user");
    assert.equal(page.status, 200);
    const pageBody = await page.json() as {
      accounts: { id: string; name: string | null; email: string | null; createdAt: string; status: string }[];
    };
    assert.deepEqual(listCalls.at(-1), { limit: 2, offset: 4, query: "river" });
    assert.deepEqual(pageBody.accounts, [{
      id: "user_target123456",
      name: "River Stone",
      email: "river@example.test",
      createdAt: new Date(sensitiveUser.createdAt).toISOString(),
      status: "active",
    }]);
    assert.equal(JSON.stringify(pageBody).includes("private@example.test"), false);
    assert.equal(JSON.stringify(pageBody).includes("+15551234567"), false);
    assert.equal(JSON.stringify(pageBody).includes("must not appear"), false);
    assert.equal((await request("/accounts?limit=51", "admin-user")).status, 400);
    assert.equal((await request("/accounts?offset=10001", "admin-user")).status, 400);

    const target = "/accounts/user_target123456/status";
    assert.equal((await request(target, "admin-user", "session-a", {
      method: "PUT", body: JSON.stringify({ status: "suspended" }),
      headers: { "Sec-Fetch-Site": "cross-site" },
    })).status, 403);
    assert.equal((await request(target, "admin-user", "session-a", {
      method: "PUT", body: JSON.stringify({ status: "suspended", actor: "forged" }),
    })).status, 400);
    assert.equal((await request(target, "ordinary-user", "session-a", {
      method: "PUT", body: JSON.stringify({ status: "suspended" }),
    })).status, 404);
    assert.equal((await request("/accounts/user_admin123/status", "user_admin123", "session-a", {
      method: "PUT", body: JSON.stringify({ status: "suspended" }),
    })).status, 409);
    assert.deepEqual(providerMutations, []);
    assert.deepEqual(audit, []);

    const suspended = await request(target, "admin-user", "session-a", {
      method: "PUT", body: JSON.stringify({ status: "suspended" }),
    });
    assert.equal(suspended.status, 200);
    assert.deepEqual(await suspended.json(), { id: "user_target123456", status: "suspended" });
    const reactivated = await request(target, "admin-user", "session-a", {
      method: "PUT", body: JSON.stringify({ status: "active" }),
    });
    assert.equal(reactivated.status, 200);
    assert.deepEqual(providerMutations, ["suspend:user_target123456", "reactivate:user_target123456"]);
    assert.deepEqual(audit.map(({ actor, target, action, outcome }) => ({ actor, target, action, outcome })), [
      { actor: "admin-user", target: "user_target123456", action: "suspend", outcome: "succeeded" },
      { actor: "admin-user", target: "user_target123456", action: "reactivate", outcome: "succeeded" },
    ]);
    const newestHistoryResponse = await request("/audit-events?limit=1", "admin-user");
    assert.equal(newestHistoryResponse.status, 200);
    const newestHistory = await newestHistoryResponse.json() as {
      events: Record<string, unknown>[];
      totalCount: number;
      nextCursor: string | null;
    };
    assert.ok(newestHistory.nextCursor);
    const historyResponse = await request(`/audit-events?limit=1&cursor=${newestHistory.nextCursor}`, "admin-user");
    assert.equal(historyResponse.status, 200);
    const history = await historyResponse.json() as { events: Record<string, unknown>[]; totalCount: number; nextCursor: string | null };
    assert.deepEqual(history, {
      events: [{
        actorId: "admin-user",
        targetId: "user_target123456",
        action: "suspend",
        outcome: "succeeded",
        createdAt: "2024-02-03T04:05:06.000Z",
      }],
      totalCount: 2,
      limit: 1,
      nextCursor: null,
    });
    assert.deepEqual(Object.keys(history.events[0] ?? {}).sort(), ["action", "actorId", "createdAt", "outcome", "targetId"]);
    assert.deepEqual(auditListCalls.at(-1), {
      limit: 1,
      cursor: { createdAt: "2024-02-03T04:05:06.000000Z", id: "00000000-0000-4000-8000-000000000002" },
    });
    const filteredHistoryResponse = await request("/audit-events?limit=5&action=suspend&outcome=succeeded", "admin-user");
    assert.equal(filteredHistoryResponse.status, 200);
    const filteredHistory = await filteredHistoryResponse.json() as {
      events: Record<string, unknown>[];
      totalCount: number;
      limit: number;
      nextCursor: string | null;
    };
    assert.deepEqual(filteredHistory, {
      events: [{
        actorId: "admin-user",
        targetId: "user_target123456",
        action: "suspend",
        outcome: "succeeded",
        createdAt: "2024-02-03T04:05:06.000Z",
      }],
      totalCount: 1,
      limit: 5,
      nextCursor: null,
    });
    assert.deepEqual(auditListCalls.at(-1), { limit: 5, action: "suspend", outcome: "succeeded" });

    const beforeFailure = initialProviderCalls();
    failProvider = true;
    const failedProvider = await request(target, "admin-user", "session-a", {
      method: "PUT", body: JSON.stringify({ status: "suspended" }),
    });
    assert.equal(failedProvider.status, 503);
    assert.equal((await failedProvider.text()).includes("provider details"), false);
    assert.equal(latestAudit()?.outcome, "failed", "provider failures remain auditable");
    failProvider = false;
    const beforeAuditStartFailure = initialProviderCalls();
    failAuditStart = true;
    const failedAuditStart = await request(target, "admin-user", "session-a", {
      method: "PUT", body: JSON.stringify({ status: "suspended" }),
    });
    assert.equal(failedAuditStart.status, 503);
    assert.equal((await failedAuditStart.text()).includes("database details"), false);
    assert.deepEqual(initialProviderCalls(), beforeAuditStartFailure, "a mutation is not attempted until its audit intent is persisted");
    failAuditStart = false;

    const beforeAuditFinalizeFailure = initialProviderCalls();
    failAuditFinalize = true;
    const failedAudit = await request(target, "admin-user", "session-a", {
      method: "PUT", body: JSON.stringify({ status: "suspended" }),
    });
    assert.equal(failedAudit.status, 200, "audit status finalization failure does not misreport a successful Clerk change");
    assert.equal((await failedAudit.text()).includes("database details"), false);
    assert.equal(providerMutations.length, beforeAuditFinalizeFailure.mutations + 1);
    assert.equal(latestAudit()?.outcome, "pending", "a provider change always has a durable audit intent even if finalization fails");
    assert.equal(audit.length, beforeAuditFinalizeFailure.audits + 1);
    failAuditFinalize = false;

    audit = Array.from({ length: 10_050 }, (_, index) => ({
      actor: "admin-user",
      target: `archived-account-${index + 1}`,
      action: "suspend" as const,
      outcome: "succeeded" as const,
      id: `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
      createdAt: new Date("2024-02-03T04:05:06.000Z"),
    }));
    let cursor: string | null = null;
    let visitedPages = 0;
    let oldestTarget = "";
    do {
      const query = cursor ? `?limit=50&cursor=${cursor}` : "?limit=50";
      const response = await request(`/audit-events${query}`, "admin-user");
      assert.equal(response.status, 200);
      const body = await response.json() as {
        events: { targetId: string }[];
        totalCount: number;
        nextCursor: string | null;
      };
      assert.ok(body.events.length <= 50);
      assert.equal(body.totalCount, 10_050);
      oldestTarget = body.events.at(-1)?.targetId ?? oldestTarget;
      cursor = body.nextCursor;
      visitedPages += 1;
    } while (cursor);
    assert.equal(visitedPages, 201);
    assert.equal(oldestTarget, "archived-account-1");
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
