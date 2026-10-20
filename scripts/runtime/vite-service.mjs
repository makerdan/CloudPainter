import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { portInventory } from "./inventory.mjs";
import { mkdir, writeFile } from "node:fs/promises";

export async function run({ appDirectory, cacheDir, basePath = "/", heldPort, preview = false }) {
  const require = createRequire(path.join(appDirectory, "package.json"));
  const vite = await import(pathToFileURL(require.resolve("vite")));
  // Bounded handoff: the probe is not a reservation. EADDRINUSE can only retry,
  // never signal the holder. Each concurrent Vite owns a private cache directory.
  for (let attempt = 0; attempt < 3; attempt++) {
    const reservation = net.createServer();
    await new Promise((resolve, reject) => {
      reservation.once("error", reject);
      reservation.listen(0, "127.0.0.1", resolve);
    });
    const port = heldPort ?? reservation.address().port;
    await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
    process.env.PORT = String(port);
    process.env.BASE_PATH = basePath;
    let server;
    try {
      if (preview) {
        // Isolated preview build output. This tests exact config binding, not
        // the product build; no shared dist directory is read or modified.
        const outDir = path.join(cacheDir, "preview");
        await mkdir(outDir, { recursive: true });
        await writeFile(path.join(outDir, "index.html"), "<title>Preview fixture</title>");
        server = await vite.preview({ root: appDirectory,
          configFile: path.join(appDirectory, "vite.config.ts"),
          build: { outDir }, preview: { host: "127.0.0.1" } });
      } else {
        server = await vite.createServer({
          root: appDirectory, configFile: path.join(appDirectory, "vite.config.ts"),
          cacheDir, base: basePath,
          server: { host: "127.0.0.1", open: false },
        });
        await server.listen();
      }
      console.log("@service " + JSON.stringify({ event: "listening", port, basePath }));
      return;
    } catch (error) {
      await server?.close?.();
      if (!/in use|EADDRINUSE/i.test(error.message)) throw error;
      const observation = await portInventory(port);
      console.log("@service " + JSON.stringify({ event: "collision", port, state: observation.state }));
      if (heldPort || attempt === 2) throw error;
    }
  }
}
