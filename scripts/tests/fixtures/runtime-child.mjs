// Owned disposable runtime fixture. Never imported by application startup.
import fs from "node:fs";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const [mode, manifest] = process.argv.slice(2);
const identity = () => ({
  pid: process.pid,
  start: fs.readFileSync(`/proc/${process.pid}/stat`, "utf8").split(") ")[1].split(" ")[19],
});
if (mode === "listener" || mode === "sentinel") {
  const server = net.createServer(socket => socket.end("runtime-fixture\n"));
  server.listen(0, "127.0.0.1", () => {
    const record = { ...identity(), port: server.address().port, ready: true };
    if (mode === "listener") process.send(record);
    else fs.writeFileSync(manifest, JSON.stringify({ parent: record }));
  });
  if (mode === "listener") process.on("SIGTERM", () => {});
} else if (["failure", "timeout", "cancel"].includes(mode)) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "listener"], {
    detached: true, stdio: ["ignore", "ignore", "ignore", "ipc"],
    env: { PATH: process.env.PATH },
  });
  process.on("SIGTERM", () => {});
  child.once("message", ready => {
    fs.writeFileSync(manifest, JSON.stringify({ parent: identity(), child: ready }));
    child.disconnect();
    child.unref();
    if (mode === "failure") process.exit(7);
    else setInterval(() => {}, 1000);
  });
} else {
  throw new Error("Unknown isolated runtime fixture mode");
}
