import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

export const IMAGE_LIMITS = { normal: 2, admin: 15, globalDaily: 20, burst: 5, concurrent: 2 } as const;
// Longer than the provider's 120-second deadline and bounded media download.
// Crashed workers lose their slot after this lease, but never their spent budget.
const LEASE_SECONDS = 180;

export class ImageAccessError extends Error {
  constructor(public code: string, message: string, public status: number, public retryAfter?: number) {
    super(message);
  }
}

export function dailyLimit(role: string): number {
  if (role !== "normal" && role !== "admin") {
    throw new ImageAccessError("authorization_denied", "This account does not have a supported Poe access role.", 403);
  }
  return IMAGE_LIMITS[role];
}

export function checkBudget(counts: { account: number; total: number; burst: number; active: number }, limit: number, resetSeconds: number) {
  if (counts.account >= limit || counts.total >= IMAGE_LIMITS.globalDaily) {
    throw new ImageAccessError("quota_exhausted", "Daily image generation limit reached. Limits reset at midnight UTC.", 429, resetSeconds);
  }
  if (counts.burst >= IMAGE_LIMITS.burst) {
    throw new ImageAccessError("rate_limited", "Generation limit reached. Please wait ten minutes before trying again.", 429, 600);
  }
  if (counts.active >= IMAGE_LIMITS.concurrent) {
    throw new ImageAccessError("rate_limited", "Image generation is busy. Please try again shortly.", 429, 30);
  }
}

export function createImageBudget(database = pool) {
  async function ensureDefaultAccount(userId: string) {
    // A verified Clerk identity gets the ordinary allowance on first use.
    // ON CONFLICT DO NOTHING deliberately preserves admin roles and revocations.
    await database.query(
      "INSERT INTO image_generation_accounts (user_id, role, enabled) VALUES ($1, 'normal', true) ON CONFLICT (user_id) DO NOTHING",
      [userId],
    );
  }

  async function status(userId: string) {
    await ensureDefaultAccount(userId);
    const result = await database.query<{ role: string; used: string; total: string }>(`
      SELECT a.role, count(r.id)::text AS used,
        (SELECT count(*)::text FROM image_generation_attempts
         WHERE started_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS total
      FROM image_generation_accounts a
      LEFT JOIN image_generation_attempts r ON r.user_id = a.user_id
        AND r.started_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      WHERE a.user_id = $1 AND a.enabled = true GROUP BY a.role`, [userId]);
    const account = result.rows[0];
    if (!account) throw new ImageAccessError("authorization_denied", "Poe image access is disabled for this account.", 403);
    const limit = dailyLimit(account.role);
    return { dailyLimit: limit, remaining: Math.max(0, limit - Number(account.used)),
      globalRemaining: Math.max(0, IMAGE_LIMITS.globalDaily - Number(account.total)) };
  }

  async function reserve(userId: string) {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '5s'");
      // One database-wide lock serializes all workers' budget checks + inserts.
      await client.query("SELECT pg_advisory_xact_lock(7062026)");
      // Keep provisioning inside the reservation transaction so a concurrent
      // revoke or role change cannot be overwritten by a stale status request.
      await client.query(
        "INSERT INTO image_generation_accounts (user_id, role, enabled) VALUES ($1, 'normal', true) ON CONFLICT (user_id) DO NOTHING",
        [userId],
      );
      const account = await client.query<{ role: string }>(
        "SELECT role FROM image_generation_accounts WHERE user_id = $1 AND enabled = true FOR SHARE", [userId]);
      if (!account.rows[0]) throw new ImageAccessError("authorization_denied", "Poe image access is disabled for this account.", 403);
      const limit = dailyLimit(account.rows[0].role);
      const counts = await client.query<{ account: string; total: string; burst: string; active: string; reset: number }>(`
        SELECT
          count(*) FILTER (WHERE user_id = $1 AND started_at >= d.start)::text AS account,
          count(*) FILTER (WHERE started_at >= d.start)::text AS total,
          count(*) FILTER (WHERE started_at > now() - interval '10 minutes')::text AS burst,
          count(*) FILTER (WHERE active_until > now())::text AS active,
          extract(epoch FROM (d.start + interval '1 day' - now()))::int AS reset
        FROM image_generation_attempts,
          (SELECT date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS start) d
        WHERE started_at >= d.start OR active_until > now() OR started_at > now() - interval '10 minutes'
        GROUP BY d.start`, [userId]);
      const c = counts.rows[0];
      checkBudget(c ? { account: +c.account, total: +c.total, burst: +c.burst, active: +c.active }
        : { account: 0, total: 0, burst: 0, active: 0 }, limit, c?.reset ?? 86400);
      const id = randomUUID();
      await client.query(`INSERT INTO image_generation_attempts (id, user_id, active_until)
        VALUES ($1, $2, now() + make_interval(secs => $3))`, [id, userId, LEASE_SECONDS]);
      await client.query("COMMIT");
      return id;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function release(id: string) {
    // Never delete/refund an attempt: errors and disconnects may have cost points.
    await database.query("UPDATE image_generation_attempts SET active_until = NULL WHERE id = $1", [id]);
  }
  return { status, reserve, release };
}

export const imageBudget = createImageBudget();
