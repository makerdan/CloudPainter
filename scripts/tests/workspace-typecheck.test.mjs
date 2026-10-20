import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const libraries = ["api-client-react", "api-zod", "outline-core"];

function write(directory, file, content) {
  const destination = path.join(directory, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, typeof content === "string" ? content : JSON.stringify(content));
}

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-typecheck-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }), { timeout: 10000 });
  write(directory, "package.json", { private: true, scripts: {
    "typecheck:libs": manifest.scripts["typecheck:libs"],
    "typecheck:cloudpainter": manifest.scripts["typecheck:cloudpainter"],
    "typecheck:api-server": manifest.scripts["typecheck:api-server"],
  } });
  write(directory, "scripts/workspace-typecheck.mjs",
    fs.readFileSync(path.join(root, "scripts/workspace-typecheck.mjs"), "utf8"));
  write(directory, "tsconfig.base.json", fs.readFileSync(path.join(root, "tsconfig.base.json"), "utf8"));
  write(directory, "tsconfig.json", { files: [], references: libraries.map(name => ({ path: `lib/${name}` })) });
  fs.mkdirSync(path.join(directory, "node_modules"), { recursive: true });
  fs.symlinkSync(fs.realpathSync(path.join(root, "node_modules/typescript")),
    path.join(directory, "node_modules/typescript"), "dir");
  for (const name of libraries) {
    write(directory, `lib/${name}/package.json`, {
      name: `@workspace/${name}`, type: "module", exports: { ".": "./src/index.ts" },
    });
    write(directory, `lib/${name}/tsconfig.json`, {
      extends: "../../tsconfig.base.json",
      compilerOptions: { composite: true, emitDeclarationOnly: true, rootDir: "src", outDir: "dist" },
      include: ["src"],
    });
    write(directory, `lib/${name}/src/index.ts`, "export const original = 1;\n");
  }
  for (const target of ["cloudpainter", "api-server"]) {
    write(directory, `artifacts/${target}/tsconfig.json`, {
      extends: "../../tsconfig.base.json", compilerOptions: { noEmit: true }, include: ["src"],
      references: libraries.map(name => ({ path: `../../lib/${name}` })),
    });
    const links = path.join(directory, `artifacts/${target}/node_modules/@workspace`);
    fs.mkdirSync(links, { recursive: true });
    for (const name of libraries) fs.symlinkSync(path.join(directory, `lib/${name}`), path.join(links, name), "dir");
    writeConsumer(directory, target, "original");
  }
  return directory;
}

function writeConsumer(directory, target, symbol) {
  write(directory, `artifacts/${target}/src/index.ts`, libraries.map((name, i) =>
    `import { ${symbol} as value${i} } from "@workspace/${name}";\nexport const result${i}: number = value${i};\n`).join(""));
}

function run(directory, args) {
  const result = spawnSync("pnpm", args, {
    cwd: directory, encoding: "utf8", timeout: 30000, maxBuffer: 1_000_000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return { status: result.status, output: result.stdout + result.stderr };
}

function direct(directory, target) {
  return run(directory, ["exec", "tsc", "-p", `artifacts/${target}/tsconfig.json`, "--noEmit"]);
}

function supported(directory, target) {
  return run(directory, ["run", `typecheck:${target}`]);
}

function passes(result) {
  assert.equal(result.status, 0, result.output);
}

function fails(result, diagnostic) {
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, diagnostic);
}

for (const target of ["cloudpainter", "api-server"]) {
  test(`${target}: absent, stale and warm declarations; genuine errors remain errors`, { timeout: 180000 }, t => {
    const directory = fixture(t);
    fails(direct(directory, target), /TS6305/);
    passes(supported(directory, target));
    for (const name of libraries) {
      assert.match(fs.readFileSync(path.join(directory, `lib/${name}/dist/index.d.ts`), "utf8"), /original/);
      write(directory, `lib/${name}/src/index.ts`, "export const currentExport = 2;\n");
      // Make the old build metadata older than the edited source even on
      // coarse-timestamp filesystems, without future-dating the new input.
      const past = new Date(Date.now() - 10000);
      fs.utimesSync(path.join(directory, `lib/${name}/tsconfig.tsbuildinfo`), past, past);
    }
    writeConsumer(directory, target, "currentExport");
    fails(direct(directory, target), /TS2305/);
    passes(supported(directory, target));
    const declarations = libraries.map(name => {
      const file = path.join(directory, `lib/${name}/dist/index.d.ts`);
      const text = fs.readFileSync(file, "utf8");
      assert.match(text, /currentExport/);
      assert.doesNotMatch(text, /original/);
      return { file, text, mtime: fs.statSync(file).mtimeMs };
    });
    passes(supported(directory, target));
    for (const { file, text, mtime } of declarations) {
      assert.equal(fs.readFileSync(file, "utf8"), text);
      assert.equal(fs.statSync(file).mtimeMs, mtime, "warm check must not force declaration emit");
    }
    writeConsumer(directory, target, "nonexistentExport");
    fails(supported(directory, target), /TS2305/);
    assert.equal(fs.existsSync(path.join(directory, ".workspace-typecheck.lock")), false);
  });
}

test("root preparation shares the focused lock and fails closed on library errors", { timeout: 90000 }, t => {
  const directory = fixture(t);
  write(directory, ".workspace-typecheck.lock", "occupied fixture lock\n");
  for (const script of ["typecheck:libs", "typecheck:cloudpainter", "typecheck:api-server"]) {
    fails(run(directory, ["run", script]), /already locked/);
  }
  for (const name of libraries) assert.equal(fs.existsSync(path.join(directory, `lib/${name}/dist`)), false);
  fs.unlinkSync(path.join(directory, ".workspace-typecheck.lock"));
  write(directory, "lib/api-zod/src/index.ts", 'export const original: number = "invalid";\n');
  fails(supported(directory, "cloudpainter"), /TS2322/);
  assert.equal(fs.existsSync(path.join(directory, ".workspace-typecheck.lock")), false);
  write(directory, "lib/api-zod/src/index.ts", "export const original = 1;\n");
  passes(run(directory, ["run", "typecheck:libs"]));
  passes(direct(directory, "cloudpainter"));
});
