import { getAuth } from "@clerk/express";
import { Router, json, type ErrorRequestHandler, type Request } from "express";
import {
  GENERATION_TIMEOUT_MS, LogoImageError, generateLogo, poeLogoProvider, parseLogoInput,
  type LogoProvider,
} from "../lib/logo-images";
import { imageBudget, ImageAccessError } from "../lib/image-budget";

type Dependencies = {
  provider?: LogoProvider;
  timeoutMs?: number;
  concurrency?: number;
  perIpLimit?: number;
  globalLimit?: number;
  now?: () => number;
  configured?: () => boolean;
  auth?: (req: Request) => { userId: string | null; sessionId: string | null };
  budget?: typeof imageBudget;
};

export function createLogoImagesRouter(options: Dependencies = {}) {
  const router = Router();
  let active = 0;
  const now = options.now ?? Date.now;
  const auth = options.auth ?? (req => getAuth(req));
  const budget = options.budget ?? imageBudget;
  const configured = options.configured ?? (() => Boolean(process.env.POE_API_KEY));
  const windowMs = 10 * 60_000;
  const clients = new Map<string, { count: number; reset: number }>();
  let global = { count: 0, reset: 0 };

  router.use("/logo-images", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  router.post("/logo-images", (req, res, next) => {
    if (!req.is("application/json") || req.headers["sec-fetch-site"] === "cross-site") {
      const error = new LogoImageError("INVALID_INPUT");
      res.status(error.status).json(error.toJSON());
      return;
    }
    const identity = auth(req);
    if (!identity.userId || !identity.sessionId || req.get("X-Logo-Session") !== identity.sessionId) {
      res.status(401).json({ code: "unauthorized", message: "Sign in again to generate logo concepts.", retryable: false });
      return;
    }
    const origin = req.get("origin");
    const allowedHosts = [req.get("host"), process.env.REPLIT_DEV_DOMAIN].filter(Boolean);
    try {
      if (!origin || !allowedHosts.includes(new URL(origin).host)) throw new Error("Wrong origin");
    } catch {
      res.status(403).json({
        code: "authorization_denied",
        message: "Generate logo concepts from the CloudPainter app.",
        retryable: false,
      });
      return;
    }
    res.locals.logoUserId = identity.userId;
    next();
  }, json({ limit: "8kb", strict: true }), async (req, res) => {
    let ownsSlot = false;
    let reservation: string | undefined;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onDisconnect = () => { if (!res.writableEnded) controller.abort(); };
    try {
      const input = parseLogoInput(req.body);
      const time = now();
      // Proxy IP headers are not trusted. Shared proxy clients may share this conservative limit.
      for (const [key, value] of clients) if (value.reset <= time) clients.delete(key);
      if (global.reset <= time) global = { count: 0, reset: time + windowMs };
      const key = req.ip ?? "unknown";
      const client = clients.get(key) ?? { count: 0, reset: time + windowMs };
      if (client.count >= (options.perIpLimit ?? 5) || global.count >= (options.globalLimit ?? 12) || (!clients.has(key) && clients.size >= 1000)) {
        res.setHeader("Retry-After", Math.max(1, Math.ceil((global.reset - time) / 1000)));
        throw new LogoImageError("RATE_LIMITED");
      }
      if (active >= (options.concurrency ?? 2)) {
        res.setHeader("Retry-After", "15");
        throw new LogoImageError("BUSY");
      }
      const userId = res.locals.logoUserId as string;
      try {
        await budget.status(userId);
      } catch (error) {
        if (error instanceof ImageAccessError) {
          if (error.retryAfter) res.setHeader("Retry-After", String(error.retryAfter));
          res.status(error.status).json({
            code: error.code,
            message: error.message,
            retryable: error.status === 429,
          });
        } else {
          res.status(503).json({
            code: "budget_unavailable",
            message: "Image access could not be checked. Please try again later.",
            retryable: true,
          });
        }
        return;
      }
      if (!configured()) {
        res.status(503).json({
          code: "UNAVAILABLE",
          message: "Poe image generation is unavailable. Check the Poe account has points or try again later. The five logo directions and sketch workspace still work.",
          retryable: true,
        });
        return;
      }
      try {
        reservation = await budget.reserve(userId);
      } catch (error) {
        if (error instanceof ImageAccessError) throw error;
        res.status(503).json({
          code: "budget_unavailable",
          message: "Spending limits could not be checked. No logo request was sent.",
          retryable: true,
        });
        return;
      }
      client.count++;
      clients.set(key, client);
      global.count++;
      active++;
      ownsSlot = true;
      res.on("close", onDisconnect);
      timer = setTimeout(() => controller.abort(), options.timeoutMs ?? GENERATION_TIMEOUT_MS);
      const cancelled = new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(new LogoImageError("TIMEOUT")), { once: true });
      });
      const generation = generateLogo(input, options.provider ?? poeLogoProvider, controller.signal);
      // Keep both concurrency leases until upstream settles, even if it ignores
      // cancellation. The durable attempt remains charged either way.
      const lease = reservation;
      generation.then(() => {
        active--;
        void budget.release(lease).catch(() => {});
      }, () => {
        active--;
        void budget.release(lease).catch(() => {});
      });
      ownsSlot = false;
      reservation = undefined;
      const result = await Promise.race([generation, cancelled]);
      if (!controller.signal.aborted && !res.destroyed) res.json(result);
    } catch (error) {
      // Only code-owned safe messages leave this boundary. No prompt/image/provider logs.
      if (error instanceof ImageAccessError) {
        if (error.retryAfter) res.setHeader("Retry-After", String(error.retryAfter));
        if (!res.destroyed) res.status(error.status).json({
          code: error.code,
          message: error.message,
          retryable: error.status === 429,
        });
      } else {
        const safe = error instanceof LogoImageError ? error : new LogoImageError("PROVIDER_FAILED");
        if (safe.code === "RATE_LIMITED" && !res.hasHeader("Retry-After")) res.setHeader("Retry-After", "60");
        if (!res.destroyed) res.status(safe.status).json(safe.toJSON());
      }
    } finally {
      if (timer) clearTimeout(timer);
      res.off("close", onDisconnect);
      if (ownsSlot) active--;
      if (reservation) {
        try { await budget.release(reservation); } catch { /* lease expiry is bounded; the attempt stays charged */ }
      }
    }
  });
  const parseError: ErrorRequestHandler = (error, _req, res, _next) => {
    const safe = new LogoImageError(error?.type === "entity.too.large" ? "BODY_TOO_LARGE" : "INVALID_INPUT");
    res.status(safe.status).json(safe.toJSON());
  };
  router.use("/logo-images", parseError);
  return router;
}

export default createLogoImagesRouter();
