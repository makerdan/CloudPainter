import { Router, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { clerkClient } from "@clerk/express";
import {
  GetAdminOverviewResponse,
  ListAdminAuditEventsResponse,
  ListAdminAccountsResponse,
  SetAdminAccountStatusBody,
  SetAdminAccountStatusParams,
  SetAdminAccountStatusResponse,
} from "@workspace/api-zod";

export type AdminAction = "suspend" | "reactivate";
export type AdminActionOutcome = "succeeded" | "failed";
export type AdminAuditOutcome = AdminActionOutcome | "pending";
export interface AdminAuditEvent {
  actorId: string;
  targetId: string;
  action: AdminAction;
  outcome: AdminAuditOutcome;
  createdAt: Date;
}
export interface AdminStore {
  isEnabledAdmin(userId: string): Promise<boolean>;
  listAuditEvents(params: {
    limit: number;
    cursor?: { createdAt: string; id: string };
    action?: AdminAction;
    outcome?: AdminAuditOutcome;
  }): Promise<{
    events: AdminAuditEvent[];
    totalCount: number;
    nextCursor?: { createdAt: string; id: string };
  }>;
  startAction(actorUserId: string, targetUserId: string, action: AdminAction): Promise<string>;
  finishAction(auditId: string, outcome: AdminActionOutcome): Promise<void>;
}
export interface AdminAccountProvider {
  listUsers(params: { limit: number; offset: number; query?: string }): Promise<{
    data: { id: string; firstName: string | null; lastName: string | null; primaryEmailAddressId: string | null;
      emailAddresses: { id: string; emailAddress: string }[]; createdAt: number; banned: boolean }[];
    totalCount: number;
  }>;
  suspend(userId: string): Promise<void>;
  reactivate(userId: string): Promise<void>;
}

const clerkAccounts: AdminAccountProvider = {
  listUsers: params => clerkClient.users.getUserList(params),
  async suspend(userId) { await clerkClient.users.banUser(userId); },
  async reactivate(userId) { await clerkClient.users.unbanUser(userId); },
};

type AuditCursor = { createdAt: string; id: string };

function parseAuditCursor(value: string | undefined): AuditCursor | null | undefined {
  if (value === undefined) return null;
  if (value.length === 0 || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) return undefined;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.from(decoded, "utf8").toString("base64url") !== value) return undefined;
    const parsed: unknown = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const candidate = parsed as Record<string, unknown>;
    if (Object.keys(candidate).sort().join(",") !== "createdAt,id"
      || typeof candidate.createdAt !== "string"
      || typeof candidate.id !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(candidate.createdAt)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.id)) return undefined;
    const createdAt = new Date(candidate.createdAt);
    if (!Number.isFinite(createdAt.getTime())) return undefined;
    return { createdAt: candidate.createdAt, id: candidate.id };
  } catch {
    return undefined;
  }
}

function encodeAuditCursor(cursor: AuditCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function safeAccount(user: Awaited<ReturnType<AdminAccountProvider["listUsers"]>>["data"][number]) {
  const primaryEmail = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId)?.emailAddress ?? null;
  return {
    id: user.id,
    name: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
    email: primaryEmail,
    createdAt: new Date(user.createdAt).toISOString(),
    status: user.banned ? "suspended" as const : "active" as const,
  };
}

export function createAdminRouter(store: AdminStore, provider: AdminAccountProvider = clerkAccounts) {
  const router = Router();
  const auth: RequestHandler = async (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    const { userId, sessionId } = getAuth(req);
    if (!userId || !sessionId || req.get("X-Admin-Session") !== sessionId) {
      res.status(401).json({ error: "Sign in again to access account administration." });
      return;
    }
    try {
      if (!(await store.isEnabledAdmin(userId))) {
        res.status(404).json({ error: "Page not found." });
        return;
      }
      res.locals.adminActor = userId;
      next();
    } catch {
      res.status(503).json({ error: "Account administration is temporarily unavailable." });
    }
  };
  router.use("/admin", auth);

  router.get("/admin/overview", async (_req, res): Promise<void> => {
    try {
      const result = await provider.listUsers({ limit: 1, offset: 0 });
      res.json(GetAdminOverviewResponse.parse({ totalAccounts: result.totalCount }));
    } catch {
      res.status(503).json({ error: "Could not load account information. Please retry." });
    }
  });

  router.get("/admin/accounts", async (req, res): Promise<void> => {
    const rawLimit = req.query.limit === undefined ? "25" : String(req.query.limit);
    const rawOffset = req.query.offset === undefined ? "0" : String(req.query.offset);
    const limit = Number(rawLimit);
    const offset = Number(rawOffset);
    const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
    if (!/^\d+$/.test(rawLimit) || !/^\d+$/.test(rawOffset)
      || !Number.isInteger(limit) || limit < 1 || limit > 50
      || !Number.isInteger(offset) || offset < 0 || offset > 10_000
      || (req.query.query !== undefined && (typeof req.query.query !== "string" || query.length > 100))) {
      res.status(400).json({ error: "Use a page size from 1 to 50, an offset up to 10,000, and a search up to 100 characters." });
      return;
    }
    try {
      const result = await provider.listUsers({ limit, offset, ...(query ? { query } : {}) });
      res.json(ListAdminAccountsResponse.parse({
        accounts: result.data.map(safeAccount),
        totalCount: result.totalCount,
        limit,
        offset,
      }));
    } catch {
      res.status(503).json({ error: "Could not load accounts. Please retry." });
    }
  });

  router.get("/admin/audit-events", async (req, res): Promise<void> => {
    const rawLimit = req.query.limit === undefined ? "25" : String(req.query.limit);
    const limit = Number(rawLimit);
    const cursor = parseAuditCursor(typeof req.query.cursor === "string" ? req.query.cursor : undefined);
    const action = req.query.action;
    const outcome = req.query.outcome;
    if (!/^\d+$/.test(rawLimit) || !Number.isInteger(limit) || limit < 1 || limit > 50
      || req.query.offset !== undefined
      || (req.query.cursor !== undefined && typeof req.query.cursor !== "string") || cursor === undefined
      || (action !== undefined && (typeof action !== "string" || !["suspend", "reactivate"].includes(action)))
      || (outcome !== undefined && (typeof outcome !== "string" || !["pending", "succeeded", "failed"].includes(outcome)))) {
      res.status(400).json({ error: "Use a page size from 1 to 50, a valid history cursor, and valid action and outcome filters." });
      return;
    }
    try {
      const result = await store.listAuditEvents({
        limit,
        ...(cursor ? { cursor } : {}),
        ...(action !== undefined ? { action: action as AdminAction } : {}),
        ...(outcome !== undefined ? { outcome: outcome as AdminAuditOutcome } : {}),
      });
      res.json(ListAdminAuditEventsResponse.parse({
        events: result.events.map(event => ({
          actorId: event.actorId,
          targetId: event.targetId,
          action: event.action,
          outcome: event.outcome,
          createdAt: event.createdAt.toISOString(),
        })),
        totalCount: result.totalCount,
        limit,
        nextCursor: result.nextCursor ? encodeAuditCursor(result.nextCursor) : null,
      }));
    } catch {
      res.status(503).json({ error: "Could not load account history. Please retry." });
    }
  });

  router.put("/admin/accounts/:userId/status", async (req, res): Promise<void> => {
    if (req.get("Sec-Fetch-Site") === "cross-site") {
      res.status(403).json({ error: "Cross-site account changes are not allowed." });
      return;
    }
    const params = SetAdminAccountStatusParams.safeParse(req.params);
    const parsed = SetAdminAccountStatusBody.strict().safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Choose an account and a valid status." });
      return;
    }
    const { userId } = params.data;
    const action: AdminAction = parsed.data.status === "suspended" ? "suspend" : "reactivate";
    if (action === "suspend" && userId === res.locals.adminActor) {
      res.status(409).json({ error: "You cannot suspend your current administrator account." });
      return;
    }
    let auditId: string;
    try {
      auditId = await store.startAction(res.locals.adminActor, userId, action);
    } catch {
      res.status(503).json({ error: "The account status could not be changed. Please retry." });
      return;
    }
    const operation = action === "suspend" ? provider.suspend : provider.reactivate;
    try {
      await operation(userId);
    } catch {
      try {
        await store.finishAction(auditId, "failed");
      } catch {
        // Keep the already-persisted audit intent as pending if the database is unavailable.
      }
      res.status(503).json({ error: "The account status could not be changed. Please retry." });
      return;
    }
    try {
      await store.finishAction(auditId, "succeeded");
    } catch {
      // The durable pending audit intent already records this operation; do not report a completed Clerk change as a failure.
    }
    res.json(SetAdminAccountStatusResponse.parse({ id: userId, status: parsed.data.status }));
  });
  return router;
}
