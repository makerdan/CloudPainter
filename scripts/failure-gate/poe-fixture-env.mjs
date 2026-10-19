// Gate-owned import safety for mocked API suites, never an application preload.
// Resolve the same pg instance used by @workspace/db in this pnpm workspace.
import { createRequire } from "node:module";

process.env.DATABASE_URL = "postgresql://fixture:fixture@poe-fixture.invalid:1/fixture";
const require = createRequire(new URL("../../lib/db/package.json", import.meta.url));
const pg = require("pg");
const Connection = require("pg/lib/connection.js");
function denyDatabase() {
  const error = new Error("PostgreSQL is disabled in Poe gate fixtures");
  error.code = "POE_FIXTURE_DATABASE_DENIED";
  throw error;
}
// Block both pool and direct-client APIs (including callback overloads), before
// pg can acquire a client, resolve DNS, open a socket or write a query.
for (const [prototype, methods] of [
  [pg.Pool.prototype, ["connect", "query"]],
  [pg.Client.prototype, ["connect", "query"]],
  [Connection.prototype, ["connect"]],
]) {
  for (const method of methods) {
    Object.defineProperty(prototype, method, {
      value: denyDatabase, writable: false, configurable: false,
    });
  }
}
