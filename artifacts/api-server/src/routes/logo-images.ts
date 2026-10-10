import { Router, json, type ErrorRequestHandler } from "express";
import {
  GENERATION_TIMEOUT_MS, LogoImageError, generateLogo, poeLogoProvider, parseLogoInput,
  type LogoProvider,
} from "../lib/logo-images";

export function createLogoImagesRouter(options: {
  provider?: LogoProvider; timeoutMs?: number; concurrency?: number; perIpLimit?: number; globalLimit?: number; now?: () => number;
} = {}) {
  const router = Router();
  let active = 0;
  const now = options.now ?? Date.now;
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
    next();
  }, json({ limit: "8kb", strict: true }), async (req, res) => {
    let ownsSlot = false;
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
      // Keep the concurrency slot until upstream settles, even if it ignores cancellation.
      // An aborted HTTP response must not let new calls exceed the provider budget.
      generation.then(() => { active--; }, () => { active--; });
      ownsSlot = false;
      const result = await Promise.race([generation, cancelled]);
      if (!controller.signal.aborted && !res.destroyed) res.json(result);
    } catch (error) {
      // Only code-owned safe messages leave this boundary. No prompt/image/provider logs.
      const safe = error instanceof LogoImageError ? error : new LogoImageError("PROVIDER_FAILED");
      if (safe.code === "RATE_LIMITED" && !res.hasHeader("Retry-After")) res.setHeader("Retry-After", "60");
      if (!res.destroyed) res.status(safe.status).json(safe.toJSON());
    } finally {
      if (timer) clearTimeout(timer);
      res.off("close", onDisconnect);
      if (ownsSlot) active--;
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
