import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export async function run({ mode = "ready", basePath = "/", discoveryMarker }) {
  if (mode === "fail-before-listen") throw new Error("Expected fixture startup failure");
  if (["descendant", "late-descendant", "fail-after-ready"].includes(mode)) {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "child"], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    if (mode === "late-descendant") process.on("SIGTERM", () => {
      spawn(process.execPath, [fileURLToPath(import.meta.url), "child"], {
        stdio: ["ignore", "inherit", "inherit"],
      });
    });
    if (mode === "fail-after-ready") setTimeout(() => process.exit(7), 1100);
    return child;
  }
  let handler;
  if (mode === "api") {
    const require = createRequire(new URL("../../../artifacts/api-server/package.json", import.meta.url));
    const { tsImport } = await import(pathToFileURL(require.resolve("tsx/esm/api")));
    const { default: health } = await tsImport("../../../artifacts/api-server/src/routes/health.ts", import.meta.url);
    const express = require("express");
    handler = express();
    handler.use("/api", health); // Actual router, no database/auth/provider startup.
    basePath = "/api/healthz";
  } else handler = (_req, res) => {
    if (mode === "hang") return;
    if (mode === "redirect") { res.writeHead(302, { Location: "/" }); res.end(); return; }
    res.setHeader("content-type", mode === "json" ? "application/json" : "text/html");
    if (mode === "json") res.end(JSON.stringify({ status: "not-ok" }));
    else if (mode === "wrong") res.end("<html>wrong service</html>");
    else res.end(`<title>CloudPainter</title><script src="${basePath}@vite/client"></script><script src="${basePath}src/main.tsx"></script>`);
  };
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const stat = (await import("node:fs")).readFileSync(`/proc/${process.pid}/stat`, "utf8").split(") ")[1].split(" ");
  console.log("@service " + JSON.stringify({
    event: "listening", port: server.address().port, basePath,
    pid: process.pid, start: stat[19],
  }));
  if (discoveryMarker) {
    setTimeout(() => import("node:fs").then(fs => fs.writeFileSync(discoveryMarker, "observe real discovery error")), 500);
  }
}

if (process.argv[2] === "child") {
  process.on("SIGTERM", () => {}); // Force verified escalation, not TERM-only success.
  await run({});
}
