import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// Package data are inspected, never loaded as instructions or executed.
// This is consistency checking, not an authenticity boundary against a writer
// who can change both the supplied manifest and this test.
const SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CANONICAL = path.join(SOURCE, ".agents/skills/app-support-ops");
const MANIFEST = "PACKAGE-MANIFEST.json";
const MEMBERS = [
  MANIFEST, "REVISION-NOTES.md", "SKILL.md", "application-prompt.txt",
  "authoring/B0-SKILL.md", "authoring/CHANGES.diff",
  "authoring/TEXT-VERIFICATION.json", "evals/evals.json",
].sort();
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function safeRelative(value) {
  assert.equal(typeof value, "string", "member path must be a string");
  assert.ok(value && !/^[\\/]|[\\\x00-\x1f\x7f]/.test(value), "unsafe member path");
  assert.ok(value.split("/").every(part =>
    part && part !== "." && part !== ".." && /^[A-Za-z0-9_.-]+$/.test(part)),
  "unsafe member path component");
  return value;
}

function regularAncestors(file) {
  let current = path.parse(path.resolve(file)).root;
  for (const part of path.resolve(file).slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    assert.equal(stat.isSymbolicLink(), false, "symlink path refused");
  }
}

function inventory(root) {
  regularAncestors(root);
  assert.ok(fs.lstatSync(root).isDirectory(), "package root must be a directory");
  const files = [];
  const directories = new Set(["authoring", "evals"]);
  function walk(relative = "") {
    for (const name of fs.readdirSync(path.join(root, relative))) {
      const member = safeRelative(relative ? `${relative}/${name}` : name);
      const stat = fs.lstatSync(path.join(root, member));
      assert.equal(stat.isSymbolicLink(), false, "symlink member refused");
      if (stat.isDirectory()) {
        assert.ok(directories.has(member), "unexpected package directory");
        walk(member);
      } else {
        assert.ok(stat.isFile(), "special member refused");
        assert.ok(stat.size <= 1_000_000, "package member exceeds bound");
        files.push(member);
        assert.ok(files.length <= MEMBERS.length, "extra package member");
      }
    }
  }
  walk();
  assert.deepEqual(files.sort(), MEMBERS, "complete regular-file membership");
}

function frontmatter(text) {
  const block = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(block, "skill frontmatter required");
  assert.match(block[1], /^name: App Support Ops$/m, "display-form skill identity");
  assert.match(block[1], /^description: >-\n/m, "description metadata");
  return block[0];
}

function validatePackage(root) {
  inventory(root);
  const read = member => fs.readFileSync(path.join(root, safeRelative(member)));
  const manifest = JSON.parse(read(MANIFEST));
  assert.equal(manifest.skillId, "app-support-ops", "manifest identity");
  assert.equal(manifest.revisionLabel, "existing-tier-coverage-clarification");
  assert.ok(Array.isArray(manifest.files), "manifest records required");
  const seen = new Set();
  for (const entry of manifest.files) {
    const member = safeRelative(entry.path);
    assert.equal(seen.has(member), false, "duplicate manifest member");
    seen.add(member);
    assert.notEqual(member, MANIFEST, "manifest must exclude itself");
    assert.ok(MEMBERS.includes(member), "unexpected manifest member");
    assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0, "bounded byte length");
    assert.match(entry.sha256, /^[0-9a-f]{64}$/, "SHA-256 format");
    const bytes = read(member);
    assert.equal(bytes.length, entry.bytes, `byte length: ${member}`);
    assert.equal(digest(bytes), entry.sha256, `content digest: ${member}`);
  }
  assert.deepEqual([...seen].sort(), MEMBERS.filter(member => member !== MANIFEST),
    "seven exact self-excluding manifest records");
  const skill = read("SKILL.md");
  const baseline = read("authoring/B0-SKILL.md");
  assert.equal(frontmatter(skill.toString("utf8")), frontmatter(baseline.toString("utf8")),
    "unchanged skill metadata");
  assert.equal(manifest.canonicalBaseline.path, ".agents/skills/app-support-ops/SKILL.md");
  assert.equal(digest(baseline), manifest.canonicalBaseline.sha256, "authoring baseline closure");
  assert.notEqual(digest(skill), digest(baseline), "historical baseline must not replace current entry point");
  for (const match of skill.toString("utf8").matchAll(/\[[^\]\n]*\]\(([^()\s]+)\)/g)) {
    const target = match[1].split("#")[0];
    if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
    const relative = safeRelative(target);
    assert.ok(MEMBERS.includes(relative), "missing local reference");
  }
  // Active specialist references are project-canonical files, not mirrors.
  // Historical authoring files are intentionally not adopted or followed.
  for (const match of skill.toString("utf8").matchAll(/`(\.agents\/skills\/[^`\s]+\/SKILL\.md)`/g)) {
    const file = path.join(SOURCE, safeRelative(match[1]));
    regularAncestors(file);
    assert.ok(fs.lstatSync(file).isFile(), "canonical specialist reference closure");
  }
  const evals = JSON.parse(read("evals/evals.json"));
  assert.equal(evals.skill_name, "app-support-ops");
  assert.equal(evals.evals.length, 9, "preserve supplied eval cases without executing them");
  assert.equal(new Set(evals.evals.map(entry => entry.id)).size, 9, "unique eval identities");
  const authoring = JSON.parse(read("authoring/TEXT-VERIFICATION.json"));
  assert.equal(authoring.total, Object.keys(authoring.checks).length, "authoring record closure");
  assert.match(authoring.scope, /no app execution or tier PASS/,
    "authoring claims must remain scoped, not host acceptance");
  return { files: MEMBERS.length, records: seen.size };
}

function fixture(t) {
  validatePackage(CANONICAL);
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "skill-package-integrity-"));
  const root = path.join(parent, "skill");
  fs.cpSync(CANONICAL, root, { recursive: true, dereference: false });
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  return { parent, root };
}
function editManifest(root, change) {
  const file = path.join(root, MANIFEST);
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  change(manifest);
  fs.writeFileSync(file, JSON.stringify(manifest));
}
function rehash(root, member) {
  editManifest(root, manifest => {
    const entry = manifest.files.find(entry => entry.path === member);
    const bytes = fs.readFileSync(path.join(root, member));
    entry.bytes = bytes.length;
    entry.sha256 = digest(bytes);
  });
}

test("canonical App Support Ops package has eight regular members, seven records and closed references", () => {
  assert.deepEqual(validatePackage(CANONICAL), { files: 8, records: 7 });
});
test("missing package resources reject without altering canonical input", t => {
  for (const member of MEMBERS) {
    const { root } = fixture(t);
    fs.unlinkSync(path.join(root, member));
    assert.throws(() => validatePackage(root), /complete regular-file membership/, member);
  }
});
test("same-length byte corruption is rejected by the content digest", t => {
  const { root } = fixture(t);
  const file = path.join(root, "REVISION-NOTES.md");
  const bytes = fs.readFileSync(file);
  bytes[0] ^= 1;
  fs.writeFileSync(file, bytes);
  assert.throws(() => validatePackage(root), /content digest: REVISION-NOTES.md/);
});
test("manifest byte-length mismatch is rejected independently", t => {
  const { root } = fixture(t);
  editManifest(root, manifest => manifest.files[0].bytes++);
  assert.throws(() => validatePackage(root), /byte length: REVISION-NOTES.md/);
});
test("duplicate, missing and self-referential manifest records reject", t => {
  for (const kind of ["duplicate", "missing", "self"]) {
    const { root } = fixture(t);
    editManifest(root, manifest => {
      if (kind === "duplicate") manifest.files.push(manifest.files[0]);
      if (kind === "missing") manifest.files.pop();
      if (kind === "self") manifest.files.push({ path: MANIFEST });
    });
    assert.throws(() => validatePackage(root),
      /duplicate manifest member|seven exact self-excluding|manifest must exclude itself/, kind);
  }
});
test("unsafe manifest paths reject before reading outside the package", t => {
  for (const unsafe of ["../outside.txt", "/outside.txt", "authoring\\outside.txt",
    "./SKILL.md", "authoring//outside.txt", "authoring/../SKILL.md", "bad\u0000file", "C:/file"]) {
    const { root } = fixture(t);
    editManifest(root, manifest => { manifest.files[0].path = unsafe; });
    assert.throws(() => validatePackage(root), /unsafe member path/, JSON.stringify(unsafe));
  }
});
test("file, directory and root symlinks reject while owned outside data stay intact", t => {
  for (const kind of ["file", "directory", "root"]) {
    const { parent, root } = fixture(t);
    const outside = path.join(parent, "outside.txt");
    fs.writeFileSync(outside, "owned fixture sentinel");
    if (kind === "file") {
      fs.unlinkSync(path.join(root, "application-prompt.txt"));
      fs.symlinkSync(outside, path.join(root, "application-prompt.txt"));
    } else if (kind === "directory") {
      fs.renameSync(path.join(root, "authoring"), path.join(parent, "authoring"));
      fs.symlinkSync(path.join(parent, "authoring"), path.join(root, "authoring"));
    } else {
      fs.renameSync(root, path.join(parent, "real-skill"));
      fs.symlinkSync(path.join(parent, "real-skill"), root);
    }
    assert.throws(() => validatePackage(root), /symlink/, kind);
    assert.equal(fs.readFileSync(outside, "utf8"), "owned fixture sentinel");
  }
});
test("unlisted files and unexpected directories reject", t => {
  for (const kind of ["file", "directory"]) {
    const { root } = fixture(t);
    if (kind === "file") fs.writeFileSync(path.join(root, "unlisted.txt"), "extra");
    else fs.mkdirSync(path.join(root, "unexpected"));
    assert.throws(() => validatePackage(root), /extra package member|unexpected package directory/);
  }
});
test("metadata identity checks reject even with a recomputed manifest", t => {
  const { root } = fixture(t);
  const file = path.join(root, "SKILL.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("name: App Support Ops", "name: Wrong Skill"));
  rehash(root, "SKILL.md");
  assert.throws(() => validatePackage(root), /display-form skill identity/);
});
test("missing and escaping relative references reject even with recomputed digests", t => {
  for (const target of ["missing.md", "../outside.md"]) {
    const { root } = fixture(t);
    fs.appendFileSync(path.join(root, "SKILL.md"), `\n[local resource](${target})\n`);
    rehash(root, "SKILL.md");
    assert.throws(() => validatePackage(root), /missing local reference|unsafe member path/);
  }
});
test("historical authoring baseline cannot become the active entry point", t => {
  const { root } = fixture(t);
  fs.copyFileSync(path.join(root, "authoring/B0-SKILL.md"), path.join(root, "SKILL.md"));
  rehash(root, "SKILL.md");
  assert.throws(() => validatePackage(root), /historical baseline must not replace current entry point/);
});
