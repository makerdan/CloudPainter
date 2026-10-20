import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { configuredPort } from "./configured-port.mjs";

/** Canonical read-only discovery: FREE is not allocation or takeover authority. */
export function portInventory(port) {
  configuredPort(String(port));
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [
      fileURLToPath(new URL("../../.agents/skills/port-authority/scripts/free-ports.mjs", import.meta.url)),
      String(port),
    ], { timeout: 1800, maxBuffer: 65536 }, (error, stdout) => {
      try {
        const result = JSON.parse(stdout);
        if ((error && error.code !== 3) || !["FREE", "PROTECTED_BUSY"].includes(result.state)) {
          throw new Error("Port inventory unknown/prohibited; no retry or takeover");
        }
        resolve(result);
      } catch (failure) { reject(failure); }
    });
  });
}
