import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const CHECKER = path.join(PROJECT_ROOT, "scripts", "check-regression-guard.mjs");
const RUNNER = path.join(PROJECT_ROOT, "scripts", "validate-task-plans.mjs");
const VALID_GUARD = `## Regression Guard
**Covers:** Loading a saved sketch with a photo whose dimensions changed after resize.
**Test location:** artifacts/cloudpainter/src/lib/photoLayout.test.ts
**What it checks:** Asserts restored photo bounds use the current canvas dimensions and the saved sketch does not drift.
`;
const VALID_PLAN = `# Fix sketch drift after resizing

## What & Why
Fix incorrect saved photo placement after the editor is resized.

## Done looks like
- The drawing remains aligned with its reference photo.

## Pre-existing failures to ignore
None established.

## Validation
Run the focused layout test.

${VALID_GUARD}
## Relevant files
- artifacts/cloudpainter/src/lib/photoLayout.ts
`;
const EXCLUDED_ADDITIVE_PLAN = `# Add a new independent color palette export

## What & Why
Add an optional palette export without replacing or changing existing behavior.

## Done looks like
- A new export action is available.

## Out of scope
Existing export behavior remains unchanged.
`;
const VALID_NA_PLAN = `# Fix a race in reconnect timing

## What & Why
Fix reconnect scheduling when the proxy delays a response.

${`## Regression Guard
**N/A**
**Why N/A:** This race condition requires real wall-clock concurrency between the reconnect timer and proxy idle drop, which deterministic fake timers cannot reproduce.
`}
`;
const VALID_NA_REASONS = [
  "The race condition depends on genuine wall-clock timing between two concurrent requests and cannot be reproduced by deterministic fake timers.",
  "This depends on unmockable third-party API behavior because the upstream endpoint's undocumented response drift cannot be represented faithfully in local tests.",
  "This is a purely visual regression, and the project has no screenshot or pixel-diff infrastructure to compare the affected rendering.",
  "The fix removes the feature entirely, so there is no remaining behavior or code path that an automated regression test could guard.",
];
const VALID_SELF_SATISFYING_PLAN = `# Add a task-plan regression checker

## What & Why
Add a guard script that checks plans for required regression declarations.

## Regression Guard
**Self-satisfying** — this task's primary deliverable is the regression guard checker and focused tests.
`;
const QUALIFYING_MISSING_PLAN = `# Fix wrong layer order in exports

## What & Why
Fix the bug that reverses drawing layers in exported images.

## Steps
1. Correct the export ordering.
`;

function fixture(t, files = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "regression-guard-"));
  for (const [relativePath, contents] of Object.entries(files)) {
    const destination = path.join(directory, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, contents);
  }
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function runChecker(args, env = {}, cwd = PROJECT_ROOT) {
  return spawnSync(process.execPath, [CHECKER, ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function runRunner(env = {}) {
  return spawnSync(process.execPath, [RUNNER], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

test("strict mode accepts a complete qualifying regression guard", (t) => {
  const directory = fixture(t, { "complete.md": VALID_PLAN });
  const result = runChecker([], { TASK_PLAN_FILE: path.join(directory, "complete.md") });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /strict check passed/);
});

test("strict mode exempts additive and DELETE-prefixed plans", (t) => {
  const directory = fixture(t, {
    "additive.md": EXCLUDED_ADDITIVE_PLAN,
    "DELETE-old-flow.md": `# DELETE: Remove the obsolete flow\n\n## What & Why\nDelete this plan's feature.\n`,
    "hardening.md": `# Add a checker for plan declarations\n\n## What & Why\nAdd a standalone checker that enforces the plan declaration rule.\n`,
    "new-endpoint.md": `# Add a new export endpoint\n\n## What & Why\nAdd a new optional endpoint as a purely additive capability without changing existing behavior.\n`,
    "bug-with-tests.md": `# Fix wrong sketch restoration\n\n## What & Why\nFix a bug that restores sketches to the wrong layer.\n\n## Steps\nAdd regression tests for the restored-layer behavior.\n`,
  });
  for (const name of ["additive.md", "DELETE-old-flow.md", "hardening.md", "new-endpoint.md", "bug-with-tests.md"]) {
    const result = runChecker([], { TASK_PLAN_FILE: path.join(directory, name) });
    if (name === "bug-with-tests.md") {
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /missing ## Regression Guard/);
    } else {
      assert.equal(result.status, 0, result.stderr);
    }
  }
});

test("strict mode accepts a specific valid N/A reason and self-satisfying declaration", (t) => {
  const directory = fixture(t, {
    "na.md": VALID_NA_PLAN,
    "self.md": VALID_SELF_SATISFYING_PLAN,
  });
  for (const name of ["na.md", "self.md"]) {
    const result = runChecker([], { TASK_PLAN_FILE: path.join(directory, name) });
    assert.equal(result.status, 0, result.stderr);
  }
});

test("N/A protocol accepts each of the four allowed reason categories", (t) => {
  const directory = fixture(t);
  for (const [index, reason] of VALID_NA_REASONS.entries()) {
    const plan = `# Fix a broken workflow\n\n## What & Why\nFix the workflow failure.\n\n## Regression Guard\n**N/A**\n**Why N/A:** ${reason}\n`;
    const file = path.join(directory, `na-${index}.md`);
    fs.writeFileSync(file, plan);
    const result = runChecker([], { TASK_PLAN_FILE: file });
    assert.equal(result.status, 0, `${reason}\n${result.stderr}`);
  }
});

test("strict mode rejects missing sections for qualifying plans and incomplete declarations", (t) => {
  const directory = fixture(t, {
    "missing.md": QUALIFYING_MISSING_PLAN,
    "incomplete.md": QUALIFYING_MISSING_PLAN.replace(
      "## Steps",
      "## Regression Guard\n**Covers:** <FILL IN>\n**Test location:**\n\n## Steps",
    ),
  });
  const missing = runChecker([], { TASK_PLAN_FILE: path.join(directory, "missing.md") });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /missing ## Regression Guard/);
  const incomplete = runChecker([], { TASK_PLAN_FILE: path.join(directory, "incomplete.md") });
  assert.equal(incomplete.status, 1);
  assert.match(incomplete.stderr, /unfilled placeholder|What it checks/);
});

test("strict mode rejects invalid N/A, vague self-satisfying, and misplaced sections", (t) => {
  const directory = fixture(t, {
    "bad-na.md": `# Fix an intermittent race\n\n## What & Why\nFix a concurrent failure.\n\n## Regression Guard\n**N/A**\n**Why N/A:** Hard to test.\n`,
    "bad-self.md": `# Fix layer loss\n\n## What & Why\nFix lost layers.\n\n## Regression Guard\n**Self-satisfying** — done.\n`,
    "wrong-self.md": `# Fix layer loss\n\n## What & Why\nFix the bug that loses layers during restoration.\n\n## Regression Guard\n**Self-satisfying** — this task's primary deliverable is the regression test itself.\n`,
    "extra-field.md": VALID_PLAN.replace(
      "**What it checks:**",
      "**Extra context:** Unneeded.\n**What it checks:**",
    ),
    "misplaced.md": VALID_PLAN.replace("## Validation\nRun the focused layout test.\n\n", "")
      .replace("## Regression Guard", "## Relevant files\n- file.ts\n\n## Regression Guard")
      .replace("\n## Relevant files\n- artifacts/cloudpainter/src/lib/photoLayout.ts\n", ""),
  });
  for (const name of ["bad-na.md", "bad-self.md", "wrong-self.md", "extra-field.md", "misplaced.md"]) {
    const result = runChecker([], { TASK_PLAN_FILE: path.join(directory, name) });
    assert.equal(result.status, 1, `${name}: ${result.stderr}`);
  }
  assert.match(runChecker([], { TASK_PLAN_FILE: path.join(directory, "bad-na.md") }).stderr, /specific reason/);
  assert.match(runChecker([], { TASK_PLAN_FILE: path.join(directory, "wrong-self.md") }).stderr, /valid only when the primary deliverable/);
  assert.match(runChecker([], { TASK_PLAN_FILE: path.join(directory, "extra-field.md") }).stderr, /unexpected field/);
});

test("--fix-stub inserts only for qualifying plans, and is a no-op on a second run", (t) => {
  const directory = fixture(t, {
    "qualifying.md": QUALIFYING_MISSING_PLAN,
    "excluded.md": EXCLUDED_ADDITIVE_PLAN,
    "already-complete.md": VALID_PLAN,
  });
  const target = path.join(directory, "qualifying.md");
  const untouched = {
    excluded: fs.readFileSync(path.join(directory, "excluded.md"), "utf8"),
    complete: fs.readFileSync(path.join(directory, "already-complete.md"), "utf8"),
  };
  const first = runChecker(["--fix-stub"], { TASK_PLAN_FILE: target });
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /inserted 1 stub/);
  assert.match(fs.readFileSync(target, "utf8"), /<FILL IN: concrete scenario/);
  assert.equal(fs.readFileSync(path.join(directory, "excluded.md"), "utf8"), untouched.excluded);
  assert.equal(fs.readFileSync(path.join(directory, "already-complete.md"), "utf8"), untouched.complete);
  const second = runChecker(["--fix-stub"], { TASK_PLAN_FILE: target });
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /inserted 0 stubs/);
});

test("--stubs-only ignores missing sections but rejects placeholders in existing sections", (t) => {
  const directory = fixture(t, {
    "missing.md": QUALIFYING_MISSING_PLAN,
    "stub.md": QUALIFYING_MISSING_PLAN.replace("## Steps", "## Regression Guard\n**Covers:** TBD\n\n## Steps"),
    "complete.md": VALID_PLAN,
  });
  const missing = runChecker(["--stubs-only"], { TASK_PLAN_FILE: path.join(directory, "missing.md") });
  assert.equal(missing.status, 0, missing.stderr);
  const placeholder = runChecker(["--stubs-only"], { TASK_PLAN_FILE: path.join(directory, "stub.md") });
  assert.equal(placeholder.status, 1);
  assert.match(placeholder.stderr, /unfilled placeholder/);
  const complete = runChecker(["--stubs-only"], { TASK_PLAN_FILE: path.join(directory, "complete.md") });
  assert.equal(complete.status, 0, complete.stderr);
});

test("TASK_PLAN_FILE rejects non-Markdown, missing, empty, and directory targets before scanning", (t) => {
  const directory = fixture(t, { "notes.txt": "not markdown\n" });
  fs.mkdirSync(path.join(directory, "folder.md"));
  const invalidExtension = runChecker([], { TASK_PLAN_FILE: path.join(directory, "notes.txt") });
  assert.equal(invalidExtension.status, 1);
  assert.match(invalidExtension.stderr, /ending in \.md/);
  const missing = runChecker([], { TASK_PLAN_FILE: path.join(directory, "missing.md") });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /does not exist/);
  const empty = runChecker([], { TASK_PLAN_FILE: "" });
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, /set but empty/);
  const folder = runChecker([], { TASK_PLAN_FILE: path.join(directory, "folder.md") });
  assert.equal(folder.status, 1);
  assert.match(folder.stderr, /is not a file/);
});

test("relative TASK_PLAN_FILE is resolved from the caller's working directory", (t) => {
  const directory = fixture(t, { "nested/plan.md": VALID_PLAN });
  const result = runChecker([], { TASK_PLAN_FILE: "nested/plan.md" }, directory);
  assert.equal(result.status, 0, result.stderr);
});

test("project runner repairs then strictly checks only the selected plan", (t) => {
  const directory = fixture(t, {
    "current.md": QUALIFYING_MISSING_PLAN,
    "sibling.md": QUALIFYING_MISSING_PLAN,
  });
  const current = path.join(directory, "current.md");
  const siblingBefore = fs.readFileSync(path.join(directory, "sibling.md"), "utf8");
  const result = runRunner({ TASK_PLAN_FILE: current });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /inserted 1 stub/);
  assert.match(result.stderr, /unfilled placeholder/);
  assert.match(fs.readFileSync(current, "utf8"), /## Regression Guard/);
  assert.equal(fs.readFileSync(path.join(directory, "sibling.md"), "utf8"), siblingBefore);
});

test("unknown and conflicting checker modes fail clearly", (t) => {
  const directory = fixture(t, { "plan.md": VALID_PLAN });
  const target = path.join(directory, "plan.md");
  const unknown = runChecker(["--unknown"], { TASK_PLAN_FILE: target });
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Unknown option/);
  const conflicting = runChecker(["--fix-stub", "--stubs-only"], { TASK_PLAN_FILE: target });
  assert.equal(conflicting.status, 1);
  assert.match(conflicting.stderr, /Choose at most one mode/);
});
