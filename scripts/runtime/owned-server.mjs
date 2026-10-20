import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitReady } from "./readiness.mjs";
import { portInventory } from "./inventory.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const finite = n => Number.isSafeInteger(n) && n > 0 && n <= 900000;

/** No lease: these servers have independent ports and private mutable caches.
 * The existing outer tier owns repository exclusion; do not nest its lease.
 */
export async function startOwnedServer({
  worker = path.join(here, "vite-service.mjs"), options = {},
  startupMs = 20000, lifetimeMs = 600000, cleanupMs = 3000,
  signal, kind = "cloudpainter",
} = {}) {
  if (![startupMs, lifetimeMs, cleanupMs].every(finite) || cleanupMs > 8000 ||
      startupMs >= lifetimeMs) throw new Error("Invalid owned-server finite limits");
  if (process.platform !== "linux") throw new Error("Owned service requires Linux process discovery");
  if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1" ||
      process.env.REPLIT_ENVIRONMENT === "production") throw new Error("No test services in production");
  signal?.throwIfAborted();
  const directory = await mkdtemp(path.join(tmpdir(), "cloudpainter-service-"));
  const child = spawn("python3", [
    path.join(here, "owned-service.py"), process.execPath,
    path.join(here, "service-gate.mjs"), worker,
    JSON.stringify({ ...options, cacheDir: path.join(directory, "vite-cache") }),
    String(lifetimeMs), String(cleanupMs),
  ], { stdio: ["pipe", "pipe", "pipe"] });
  let registered, listening, finished, spawnError, rawCode, output = "", buffer = "", closed = false;
  const events = [];
  let wake;
  const notify = () => { wake?.(); wake = null; };
  child.on("error", error => { spawnError = error; notify(); });
  child.stdout.on("data", chunk => {
    buffer += chunk.toString();
    if (buffer.length > 131072) { spawnError = new Error("Supervisor protocol output cap"); child.stdin.end(); notify(); return; }
    while (buffer.includes("\n")) {
      const end = buffer.indexOf("\n"), line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (!line.startsWith("@runtime ")) continue;
      try {
        const event = JSON.parse(line.slice(9));
        events.push(event);
        if (event.event === "registered") registered = event;
        if (event.event === "listening") listening = event;
        if (event.event === "finished") finished = event;
      } catch { spawnError = new Error("Invalid supervisor evidence"); child.stdin.end(); }
      notify();
    }
  });
  child.stderr.on("data", chunk => { output = (output + chunk).slice(-8192); });
  child.stdin.on("error", () => {}); // Close/error is assessed from final evidence.
  const ended = new Promise(resolve => child.once("close", code => {
    rawCode = code; closed = true; notify(); resolve();
  }));
  const abort = () => { child.stdin.end(); };
  signal?.addEventListener("abort", abort, { once: true });
  let stopping;
  async function stop() {
    if (stopping) return stopping;
    stopping = (async () => {
      child.stdin.end("stop\n");
      let timer;
      try {
        await Promise.race([ended, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Supervisor cleanup unobserved; retain " + directory)), cleanupMs + 2000);
        })]);
        if (spawnError || !registered || !finished?.quiescent || rawCode !== 0 ||
            finished.reason !== "stop-requested") {
          throw new Error(`Owned service non-success: ${JSON.stringify({ spawnError: spawnError?.message, registered, finished, rawCode, events })} ${output}; retained ${directory}`);
        }
        if (listening && (await portInventory(listening.port)).state !== "FREE") {
          throw new Error("Owned processes stopped but endpoint not proven free; retained " + directory);
        }
        await rm(directory, { recursive: true, force: true });
        return finished;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      }
    })();
    return stopping;
  }
  try {
    const deadline = performance.now() + startupMs;
    while (!listening) {
      if (spawnError || closed || signal?.aborted || performance.now() >= deadline) {
        throw new Error(`Owned service startup failed/cancelled: ${JSON.stringify(finished)} ${output}`);
      }
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 30);
        wake = () => { clearTimeout(timer); resolve(); };
      });
    }
    if (!registered || !Number.isInteger(listening.port) || listening.port < 1 || listening.port > 65535) {
      throw new Error("Unregistered/invalid service endpoint");
    }
    const url = `http://127.0.0.1:${listening.port}${listening.basePath}`;
    await waitReady(url, { kind, basePath: listening.basePath,
      startupMs: Math.max(1, Math.floor(deadline - performance.now())), signal });
    if (closed || finished || signal?.aborted || performance.now() >= deadline) throw new Error("Service exited/expired during readiness");
    return { url, port: listening.port, registered, events, stop, directory };
  } catch (error) {
    try { await stop(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], `Startup/cleanup non-success: ${error.message}; ${cleanupError.message}`); }
    throw error;
  }
}

export function startCloudPainterTestServer(options = {}) {
  return startOwnedServer({ ...options, options: {
    appDirectory: fileURLToPath(new URL("../../artifacts/cloudpainter/", import.meta.url)),
    basePath: "/", ...options.options,
  } });
}
