import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const CHECKER = path.join(PROJECT_ROOT, "scripts", "check-regression-guard.mjs");
const RUNNER = path.join(PROJECT_ROOT, "scripts", "validate-task-plans.mjs");
const PACKAGE_ROOT = path.join(PROJECT_ROOT, ".agents/skills/regression-guard");
// Owner-selected package fingerprints. This is source-installation acceptance,
// not the live gate's revision/cutover policy. Change only with an authorized
// definition revision, updating the installation handoff through maintenance.
const PACKAGE_SHA256 = {
  "SKILL.md": "6ae83efa7b986e684debd120a4c7f816379a8584cbe8b700ed5716e45993b7a1",
  "reference/enforcement-contract.md": "bdae119a887cda74dadbc6fded7ff7360e94c54fb57a858756ee4fdfa192d964",
  "reference/delivery-handoff.md": "2df6f93305e3757989bff36be1ab1bc7cc9deb3229ad703cec83e3ef1a4c9910",
  "REVISION-NOTES.md": "0e1b11b5900591eafd6bb4134b25c91cf5a19416d4158feef5807f0edf8cf868",
};
const SOURCE_OBLIGATIONS = {
  "SKILL.md": [
    "Any material component makes mixed work qualifying for that component.",
    "The entire implementation scope is the test/check itself:",
    "Automatically reassess actual scope and the applicable declaration before any\nimplementation",
    "otherwise the executing Agent performs this as its first\naction after Start.",
    "through draft creation or the supported amendment/reseal route",
    "Failed amendments leave the last admitted sealed revision intact.",
    "Never wire automatic `--fix-stub` rewriting into validation, CI or execution.",
    "does not update a local sealed plan or tier binding.",
    "Recheck the current admitted revision before\nimplementation dispatch; reject stale context.",
    "If the gap appears after work begins, pause affected work",
    "historical tasks retain their original rules until an authorized supported\namendment applies a newer revision.",
    "Maintain a revision-bound requirement-to-delivery handoff",
    "The handoff is required; separate **read-only verification is optional** unless\nthe owner explicitly selects it or an identifiable already-approved requirement\ncalls for it.",
    'Record optional review as "not selected," not "pending."',
  ],
  "reference/enforcement-contract.md": [
    "Separate read-only verification is optional unless selected by the owner",
    "Locate a genuine host hook or document the Agent-first cooperative preflight.",
    "apply supported amendments before implementation starts.",
    "For failed amendment, preserve the last admitted revision,\nbinding and ledger history.",
  ],
  "reference/delivery-handoff.md": [
    "The handoff above is required; a separate verifier is not.",
    "Pre-implementation preflight outcome and any post-Start amendment references,",
    "Do not claim retrospective authorization or test delivery from plan edits.",
    "Review-only work must not run tests, create tasks, change task states, repair files,",
  ],
};

function packageFiles(root = PACKAGE_ROOT) {
  return Object.fromEntries(Object.keys(PACKAGE_SHA256).map(file => [
    file, fs.readFileSync(path.join(root, file), "utf8"),
  ]));
}

// These assertions inspect source text, not application behavior or semantic
// adequacy of arbitrary plans. Exact-byte acceptance is deliberately separate.
function assertPackageContract(root) {
  const files = packageFiles(root);
  const links = [...files["SKILL.md"].matchAll(/\[[^\]]+\]\((reference\/[^)]+)\)/g)]
    .map(match => match[1]);
  for (const required of ["reference/enforcement-contract.md", "reference/delivery-handoff.md"]) {
    assert.ok(links.includes(required), `missing required link: ${required}`);
  }
  for (const link of links) {
    assert.ok(fs.statSync(path.join(root, link)).isFile(), `unresolved reference: ${link}`);
  }
  for (const [file, obligations] of Object.entries(SOURCE_OBLIGATIONS)) {
    for (const obligation of obligations) {
      assert.ok(files[file].includes(obligation), `missing source obligation in ${file}: ${obligation}`);
    }
    assert.doesNotMatch(files[file],
      /(?:separate|independent) (?:read-only )?(?:verification|review) is (?:mandatory|required) for (?:all|every)/i,
      `unselected blanket review requirement in ${file}`);
  }
}

test("canonical Regression Guard package exactly matches the approved source fingerprints", () => {
  for (const [file, expected] of Object.entries(PACKAGE_SHA256)) {
    const actual = createHash("sha256").update(fs.readFileSync(path.join(PACKAGE_ROOT, file))).digest("hex");
    assert.equal(actual, expected, `${file}: unauthorized source drift; use an approved definition revision`);
  }
});

test("canonical package closes references and retains preflight, amendment and optional-review obligations", () => {
  assertPackageContract(PACKAGE_ROOT);
});

test("source-contract checks reject removal of every required obligation without relying on byte hashes", t => {
  const originals = packageFiles();
  const root = fixture(t, originals);
  for (const [file, obligations] of Object.entries(SOURCE_OBLIGATIONS)) {
    const target = path.join(root, file);
    for (const obligation of obligations) {
      fs.writeFileSync(target, originals[file].replace(obligation, ""));
      assert.throws(() => assertPackageContract(root), /missing source obligation/, `${file}: ${obligation}`);
      fs.writeFileSync(target, originals[file]);
    }
  }
  assertPackageContract(root);
});

test("source-contract checks reject missing reference files and removed or redirected required links", t => {
  const originals = packageFiles();
  const root = fixture(t, originals);
  for (const reference of ["reference/enforcement-contract.md", "reference/delivery-handoff.md"]) {
    const target = path.join(root, reference);
    fs.unlinkSync(target);
    assert.throws(() => assertPackageContract(root), /ENOENT/);
    fs.writeFileSync(target, originals[reference]);
    for (const replacement of ["", "reference/missing.md"]) {
      fs.writeFileSync(path.join(root, "SKILL.md"), originals["SKILL.md"].replace(`](${reference})`, `](${replacement})`));
      assert.throws(() => assertPackageContract(root), /missing required link/);
    }
    fs.writeFileSync(path.join(root, "SKILL.md"), originals["SKILL.md"]);
  }
  assertPackageContract(root);
});

test("source-contract checks reject blanket mandatory unselected review even alongside optional wording", t => {
  const originals = packageFiles();
  const root = fixture(t, originals);
  for (const file of Object.keys(SOURCE_OBLIGATIONS)) {
    fs.writeFileSync(path.join(root, file), originals[file] +
      "\nSeparate read-only verification is mandatory for all work.\n");
    assert.throws(() => assertPackageContract(root), /unselected blanket review requirement/);
    fs.writeFileSync(path.join(root, file), originals[file]);
  }
});

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
const MATERIAL_RISK_PLANS = {
  "visual-correction.md": `# Keep saved drawings aligned after resizing

## What & Why
The reference photo and saved strokes drift apart after switching canvas dimensions.
`,
  "behavior-change.md": `# Keep layer selection predictable

## What & Why
Clicking a layer name opens its rename field rather than selecting the layer.
`,
  "error-path.md": `# Keep image loading from getting stuck

## What & Why
When photo decoding cannot complete, the panel remains on its loading state forever and offers no way forward.
`,
  "privacy-boundary.md": `# Keep profiles separate

## What & Why
One profile can display sketches belonging to another profile after switching workspaces.
`,
  "data-integrity.md": `# Keep the newest sketch name

## What & Why
The earlier label is stored when a second rename finishes first.
`,
  "lifecycle.md": `# Release editor documents when leaving

## What & Why
Closing the editor leaves the hidden drawing document left behind after the screen disappears.
`,
  "reliability.md": `# Keep large references usable

## What & Why
The drawing tab becomes unresponsive for several minutes while opening panoramic images.
`,
  "compatibility.md": `# Keep older sketches readable

## What & Why
Previously saved sketches will not open in the new viewer after its required drawing field changes.
`,
};

function fixture(t, files = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "regression-guard-"));
  for (const [relativePath, contents] of Object.entries(files)) {
    const destination = path.join(directory, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, contents);
  }
  t.after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
    assert.equal(fs.existsSync(directory), false, "disposable fixture root must be removed");
  });
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

test("material mutations override test titles, negated and unrelated exclusions", t => {
  const plans = [
    "# Add tests for authorization\n\n## What & Why\nFix authorization so another tenant cannot read private records.",
    "# Fix authorization\n\n## What & Why\nFix authorization for protected records. This is not purely additive.",
    "# Add a checker\n\n## What & Why\nThe primary deliverable is a checker. Also change existing API authorization to deny cross-tenant reads.",
    "# Add an independent panel\n\n## What & Why\nAdd a purely additive panel without changing existing behavior. Also fix stale record overwrites.",
    "# Update error wording\n\n## What & Why\nCosmetic error copy only. Also change retry logic for existing failures.",
    "# Rename internal helper\n\n## What & Why\nA genuinely non-material internal refactor. Also replace existing serialization for supported clients.",
    "# Add tests\n\n## What & Why\nAdd tests and fix authorization for protected records.",
    "# Add an independent panel\n\n## What & Why\nThis is purely additive. One profile can display sketches from another profile.",
  ];
  const directory = fixture(t);
  for (const [index, plan] of plans.entries()) {
    const target = path.join(directory, `${index}.md`);
    fs.writeFileSync(target, plan);
    const result = runChecker([], { TASK_PLAN_FILE: target });
    assert.equal(result.status, 1, `${plan}\n${result.stderr}`);
    assert.match(result.stderr, /missing ## Regression Guard/);
    fs.appendFileSync(target, "\n\n## Regression Guard\n**Self-satisfying** — the deliverable is the authorization regression test and checker.\n");
    assert.match(runChecker([], { TASK_PLAN_FILE: target }).stderr, /valid only when the primary deliverable/);
  }
});

test("legitimate exclusions survive incidental risk words and unchanged clauses", t => {
  const plans = [
    "# Reword an error message\n\n## What & Why\nCosmetic error copy only; no trigger changes.",
    "# Change error message text\n\n## What & Why\nReword the error message without changing when or whether it fires.",
    "# Rename an internal validation helper\n\n## What & Why\nA genuinely non-material internal refactor with no behavior change.",
    EXCLUDED_ADDITIVE_PLAN,
    "# Add tests for authorization\n\n## What & Why\nAdd tests for existing authorization failures without changing existing behavior.",
    "# DELETE: Fix old authorization\n\n## What & Why\nThis task is marked for deletion.",
  ];
  const directory = fixture(t);
  for (const [index, plan] of plans.entries()) {
    const target = path.join(directory, `${index}.md`);
    fs.writeFileSync(target, plan);
    const result = runChecker([], { TASK_PLAN_FILE: target });
    assert.equal(result.status, 0, `${plan}\n${result.stderr}`);
  }
});

test("N/A rejects ordinary live API and race difficulty, and normal fields need specificity", t => {
  const directory = fixture(t);
  const guards = [
    "**N/A**\n**Why N/A:** The live external API behavior needs additional fixture work and is expensive to test.",
    "**N/A**\n**Why N/A:** The race condition uses real timing but is hard to test with our current harness.",
    "**N/A**\n**Why N/A:** This is already covered by existing tests somewhere in the suite.",
    "**Covers:** The bug\n**Test location:** existing coverage\n**What it checks:** It works",
  ];
  for (const [index, guard] of guards.entries()) {
    const target = path.join(directory, `${index}.md`);
    fs.writeFileSync(target, `${QUALIFYING_MISSING_PLAN}\n## Regression Guard\n${guard}\n`);
    assert.equal(runChecker([], { TASK_PLAN_FILE: target }).status, 1, guard);
  }
});

test("strict mode ignores declaration examples in fenced blocks and blockquotes", (t) => {
  const exampleFields = `**Covers:** The saved sketch is restored after a resize.
**Test location:** artifacts/cloudpainter/src/lib/photoLayout.test.ts
**What it checks:** Asserts the restored image uses the current canvas bounds.`;
  const plans = {
    "fenced-examples.md": `# Fix sketch drift after resizing

## What & Why
Fix incorrect saved photo placement after the editor is resized.

## Regression Guard
\`\`\`markdown
${exampleFields}
\`\`\`
`,
    "tilde-fenced-examples.md": `# Fix sketch drift after resizing

## What & Why
Fix incorrect saved photo placement after the editor is resized.

## Regression Guard
~~~markdown
${exampleFields}
~~~
`,
    "blockquote-examples.md": `# Fix sketch drift after resizing

## What & Why
Fix incorrect saved photo placement after the editor is resized.

## Regression Guard
> Example declarations:
**Covers:** The saved sketch is restored after a resize.
**Test location:** artifacts/cloudpainter/src/lib/photoLayout.test.ts
**What it checks:** Asserts the restored image uses the current canvas bounds.
`,
    "active-fields-with-examples.md": VALID_PLAN.replace(
      VALID_GUARD,
      `${VALID_GUARD}
\`\`\`markdown
${exampleFields}
\`\`\`
> Example declarations:
**Covers:** Example only.
`,
    ),
  };
  const directory = fixture(t, plans);

  for (const name of ["fenced-examples.md", "tilde-fenced-examples.md", "blockquote-examples.md"]) {
    const result = runChecker([], { TASK_PLAN_FILE: path.join(directory, name) });
    assert.equal(result.status, 1, `${name}: ${result.stderr}`);
    assert.match(result.stderr, /requires exactly one \*\*Covers:\*\* field/);
    assert.match(result.stderr, /requires exactly one \*\*Test location:\*\* field/);
    assert.match(result.stderr, /requires exactly one \*\*What it checks:\*\* field/);
  }

  const validWithExamples = runChecker([], {
    TASK_PLAN_FILE: path.join(directory, "active-fields-with-examples.md"),
  });
  assert.equal(validWithExamples.status, 0, validWithExamples.stderr);
});

test("strict mode requires guards for material risks phrased without trigger keywords", (t) => {
  const directory = fixture(t, MATERIAL_RISK_PLANS);
  for (const name of Object.keys(MATERIAL_RISK_PLANS)) {
    const result = runChecker([], { TASK_PLAN_FILE: path.join(directory, name) });
    assert.equal(result.status, 1, `${name}: ${result.stderr}`);
    assert.match(result.stderr, /qualifying plan is missing ## Regression Guard/);
  }

  const excluded = fixture(t, {
    "additive.md": EXCLUDED_ADDITIVE_PLAN,
    "internal-refactor.md": `# Rename a helper for clarity

## What & Why
Rename one local helper to match the naming convention; this has no effect on visible output, saved content, or supported workflows.
`,
  });
  for (const name of ["additive.md", "internal-refactor.md"]) {
    const result = runChecker([], { TASK_PLAN_FILE: path.join(excluded, name) });
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
  }
});

test("section parsing ignores fenced and quoted example headings", (t) => {
  const examples = `\`\`\`markdown
## Regression Guard
**Covers:** <FILL IN: illustrative only>
## Validation
example validation
## Relevant files
example.ts
\`\`\`

> ## Regression Guard
> **Covers:** Another example only.
> ## Relevant files
> example.ts

`;
  const plan = VALID_PLAN.replace("## Relevant files", `${examples}## Relevant files`);
  const directory = fixture(t, { "examples.md": plan });
  const result = runChecker([], { TASK_PLAN_FILE: path.join(directory, "examples.md") });
  assert.equal(result.status, 0, result.stderr);
});

test("bug examples in fences and blockquotes do not qualify unrelated plans", (t) => {
  const plan = `# Document the color palette examples

## What & Why
Add documentation showing the available palette swatches.

\`\`\`markdown
# Fix a broken drawing flow
Wrong saved placement can corrupt data and expose another user's sketch.
## Regression Guard
**Covers:** Example only.
\`\`\`

> Fix the stale layer order after export.
> The old behavior loses drawings and breaks saved-file compatibility.

## Done looks like
- The palette documentation is available.
`;
  const directory = fixture(t, { "quoted-bugs.md": plan });
  const result = runChecker([], { TASK_PLAN_FILE: path.join(directory, "quoted-bugs.md") });
  assert.equal(result.status, 0, result.stderr);
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

test("--fix-stub leaves malformed existing guard sections byte-for-byte unchanged", (t) => {
  const guards = {
    normal: `## Regression Guard
**Covers:** TBD
**Test location:** <FILL IN>
**What it checks:** Not yet specified.
`,
    na: `## Regression Guard
**N/A**
**Why N/A:** Hard to test.
`,
    self: `## Regression Guard
**Self-satisfying** — this is done.
`,
  };
  const files = Object.fromEntries(
    Object.entries(guards).map(([name, guard]) => [
      `${name}.md`,
      `${QUALIFYING_MISSING_PLAN}\n${guard}\n## Relevant files\n- scripts/check-regression-guard.mjs\n`,
    ]),
  );
  const directory = fixture(t, files);

  for (const name of Object.keys(guards)) {
    const target = path.join(directory, `${name}.md`);
    const original = fs.readFileSync(target, "utf8");
    const result = runChecker(["--fix-stub"], { TASK_PLAN_FILE: target });
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    assert.match(result.stdout, /inserted 0 stubs/);
    assert.equal(fs.readFileSync(target, "utf8"), original, `${name} was modified`);
  }
});

test("--fix-stub inserts at real headings and preserves all existing plan text", (t) => {
  const original = `${QUALIFYING_MISSING_PLAN}
\`\`\`markdown
## Regression Guard
**Covers:** an example section
## Relevant files
- example.ts
\`\`\`

> ## Relevant files
> quoted-example.ts

## Relevant files
- scripts/check-regression-guard.mjs
  \n`;
  const target = path.join(fixture(t), "plan.md");
  fs.writeFileSync(target, original);
  const insertionIndex = original.lastIndexOf("## Relevant files");
  const before = original.slice(0, insertionIndex);
  const after = original.slice(insertionIndex);
  const stub = `## Regression Guard
**Covers:** <FILL IN: concrete scenario, boundary, invariant, lifecycle, reliability property, or contract>
**Test location:** <FILL IN: test file path>
**What it checks:** <FILL IN: specific assertion that catches recurrence>`;
  const expected = `${before}${stub}\n\n${after}`;

  const result = runChecker(["--fix-stub"], { TASK_PLAN_FILE: target });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /inserted 1 stub/);
  assert.equal(fs.readFileSync(target, "utf8"), expected);
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

test("strict mode rejects duplicate, mixed, missing, misplaced, and case-mismatched declarations", (t) => {
  const validReason = VALID_NA_REASONS[0];
  const fixtures = {
    "duplicate-normal.md": `## Regression Guard
**Covers:** The saved sketch is restored after a resize.
**Covers:** The saved sketch is restored after a resize.
**Test location:** artifacts/cloudpainter/src/lib/photoLayout.test.ts
**What it checks:** Asserts the restored image uses the current canvas bounds.
`,
    "duplicate-location.md": `## Regression Guard
**Covers:** The saved sketch is restored after a resize.
**Test location:** artifacts/cloudpainter/src/lib/photoLayout.test.ts
**Test location:** artifacts/cloudpainter/src/lib/photoLayout.test.ts
**What it checks:** Asserts the restored image uses the current canvas bounds.
`,
    "duplicate-assertion.md": `## Regression Guard
**Covers:** The saved sketch is restored after a resize.
**Test location:** artifacts/cloudpainter/src/lib/photoLayout.test.ts
**What it checks:** Asserts the restored image uses the current canvas bounds.
**What it checks:** Asserts the restored image uses the current canvas bounds.
`,
    "duplicate-na-reason.md": `## Regression Guard
**N/A**
**Why N/A:** ${validReason}
**Why N/A:** ${validReason}
`,
    "duplicate-na-declaration.md": `## Regression Guard
**N/A**
**N/A**
**Why N/A:** ${validReason}
`,
    "duplicate-self-declaration.md": `## Regression Guard
**Self-satisfying** — this task's deliverable is the regression checker and tests.
**Self-satisfying** — this task's deliverable is the regression checker and tests.
`,
    "mixed-na-self.md": `## Regression Guard
**N/A**
**Why N/A:** ${validReason}
**Self-satisfying** — this task's deliverable is the regression checker and tests.
`,
    "mixed-na-normal.md": `## Regression Guard
**N/A**
**Why N/A:** ${validReason}
**Covers:** The saved sketch is restored after a resize.
**Test location:** artifacts/cloudpainter/src/lib/photoLayout.test.ts
**What it checks:** Asserts the restored image uses the current canvas bounds.
`,
    "mixed-self-normal.md": `## Regression Guard
**Self-satisfying** — this task's deliverable is the regression checker and tests.
**Covers:** The saved sketch is restored after a resize.
**Test location:** artifacts/cloudpainter/src/lib/photoLayout.test.ts
**What it checks:** Asserts the restored image uses the current canvas bounds.
`,
    "mixed-all-declarations.md": `## Regression Guard
**N/A**
**Why N/A:** ${validReason}
**Self-satisfying** — this task's deliverable is the regression checker and tests.
**Covers:** The saved sketch is restored after a resize.
**Test location:** artifacts/cloudpainter/src/lib/photoLayout.test.ts
**What it checks:** Asserts the restored image uses the current canvas bounds.
`,
    "missing-na-reason.md": `## Regression Guard
**N/A**
`,
    "case-mismatched-na-reason.md": `## Regression Guard
**N/A**
**why N/A:** ${validReason}
`,
    "case-mismatched-normal-field.md": `## Regression Guard
**covers:** The saved sketch is restored after a resize.
**Test location:** artifacts/cloudpainter/src/lib/photoLayout.test.ts
**What it checks:** Asserts the restored image uses the current canvas bounds.
`,
    "misplaced-normal-field.md": `**Covers:** The saved sketch is restored after a resize.

## Regression Guard
**Test location:** artifacts/cloudpainter/src/lib/photoLayout.test.ts
**What it checks:** Asserts the restored image uses the current canvas bounds.
`,
    "misplaced-na-reason.md": `## Regression Guard
**N/A**

## Relevant files
**Why N/A:** ${validReason}
`,
  };
  const directory = fixture(t);
  for (const [name, guard] of Object.entries(fixtures)) {
    const file = path.join(directory, name);
    fs.writeFileSync(file, `# Fix a broken saved sketch flow\n\n${guard}\n`);
    const result = runChecker([], { TASK_PLAN_FILE: file });
    assert.equal(result.status, 1, `${name}: ${result.stderr}`);
  }
});

test("--stubs-only catches placeholders in every declaration form, including mixed forms", (t) => {
  const fixtures = {
    "normal-covers.md": `## Regression Guard
**Covers:** <FILL IN>
**Test location:** artifacts/cloudpainter/src/lib/photoLayout.test.ts
**What it checks:** Asserts the restored image uses the current canvas bounds.
`,
    "normal-location.md": `## Regression Guard
**Covers:** The saved sketch is restored after a resize.
**Test location:** TBD
**What it checks:** Asserts the restored image uses the current canvas bounds.
`,
    "normal-assertion.md": `## Regression Guard
**Covers:** The saved sketch is restored after a resize.
**Test location:** artifacts/cloudpainter/src/lib/photoLayout.test.ts
**What it checks:** TODO
`,
    "na-declaration.md": `## Regression Guard
**N/A** <FILL IN>
**Why N/A:** ${VALID_NA_REASONS[0]}
`,
    "na-reason.md": `## Regression Guard
**N/A**
**Why N/A:** <FILL IN>
`,
    "self-satisfying.md": `## Regression Guard
**Self-satisfying** — TODO
`,
    "mixed-na-self.md": `## Regression Guard
**N/A**
**Why N/A:** ${VALID_NA_REASONS[0]}
**Self-satisfying** — <FILL IN: name the test or script>
`,
    "mixed-na-normal.md": `## Regression Guard
**N/A**
**Why N/A:** ${VALID_NA_REASONS[0]}
**Covers:** TBD
`,
    "mixed-self-normal.md": `## Regression Guard
**Self-satisfying** — this task's deliverable is the regression checker and tests.
**Covers:** TODO
`,
    "missing-na-reason.md": `## Regression Guard
**N/A**
`,
    "case-mismatched-na-reason.md": `## Regression Guard
**N/A**
**why N/A:** ${VALID_NA_REASONS[0]}
`,
    "case-mismatched-normal-field.md": `## Regression Guard
**covers:** The saved sketch is restored after a resize.
**Test location:** artifacts/cloudpainter/src/lib/photoLayout.test.ts
**What it checks:** Asserts the restored image uses the current canvas bounds.
`,
    "misplaced-normal-field.md": `**Covers:** The saved sketch is restored after a resize.

## Regression Guard
**Test location:** artifacts/cloudpainter/src/lib/photoLayout.test.ts
**What it checks:** Asserts the restored image uses the current canvas bounds.
`,
    "misplaced-na-reason.md": `## Regression Guard
**N/A**

## Relevant files
**Why N/A:** ${VALID_NA_REASONS[0]}
`,
  };
  const directory = fixture(t);
  for (const [name, guard] of Object.entries(fixtures)) {
    const file = path.join(directory, name);
    fs.writeFileSync(file, `# Fix a broken saved sketch flow\n\n${guard}\n`);
    const result = runChecker(["--stubs-only"], { TASK_PLAN_FILE: file });
    assert.equal(result.status, 1, `${name}: ${result.stderr}`);
  }
});

test("--stubs-only allows filled structural errors for strict mode to report", (t) => {
  const fixtures = {
    "duplicate-normal.md": `## Regression Guard
**Covers:** The saved sketch is restored after a resize.
**Covers:** The saved sketch is restored after a resize.
**Test location:** artifacts/cloudpainter/src/lib/photoLayout.test.ts
**What it checks:** Asserts the restored image uses the current canvas bounds.
`,
    "duplicate-na-reason.md": `## Regression Guard
**N/A**
**Why N/A:** ${VALID_NA_REASONS[0]}
**Why N/A:** ${VALID_NA_REASONS[0]}
`,
    "mixed-na-normal.md": `## Regression Guard
**N/A**
**Why N/A:** ${VALID_NA_REASONS[0]}
**Covers:** The saved sketch is restored after a resize.
`,
    "duplicate-section.md": `${VALID_GUARD}\n${VALID_GUARD}`,
  };
  const directory = fixture(t);
  for (const [name, guard] of Object.entries(fixtures)) {
    const file = path.join(directory, name);
    fs.writeFileSync(file, `# Fix a broken saved sketch flow\n\n${guard}\n`);
    const strict = runChecker([], { TASK_PLAN_FILE: file });
    assert.equal(strict.status, 1, `${name} strict: ${strict.stderr}`);
    const stubsOnly = runChecker(["--stubs-only"], { TASK_PLAN_FILE: file });
    assert.equal(stubsOnly.status, 0, `${name} stubs-only: ${stubsOnly.stderr}`);
  }
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

test("active Unified runner refuses an unprovisioned plan without inserting stubs", (t) => {
  const directory = fixture(t, {
    "current.md": QUALIFYING_MISSING_PLAN,
    "sibling.md": QUALIFYING_MISSING_PLAN,
  });
  const current = path.join(directory, "current.md");
  const currentBefore = fs.readFileSync(current, "utf8");
  const siblingBefore = fs.readFileSync(path.join(directory, "sibling.md"), "utf8");
  const result = runRunner({ TASK_PLAN_FILE: current });
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout, /inserted .*stub/);
  assert.match(result.stderr, /requires UNIFIED_TASK_ID and TASK_PLAN_FILE/);
  assert.equal(fs.readFileSync(current, "utf8"), currentBefore);
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

test("fix-stub refuses sealed repairs and reports actual read/write failures honestly", t => {
  const directory = fixture(t, {
    "sealed.md": QUALIFYING_MISSING_PLAN.replace("\n\n", "\n\n**Unified task ID:** FGU-fixture\n\n"),
    "editable.md": QUALIFYING_MISSING_PLAN,
  });
  const selected = path.join(directory, "sealed.md");
  const sealed = fs.readFileSync(selected, "utf8");
  const refused = runChecker(["--fix-stub"], { TASK_PLAN_FILE: selected });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /supported amendment/);
  assert.equal(fs.readFileSync(selected, "utf8"), sealed);
  for (const operation of ["readFileSync", "writeFileSync"]) {
    const target = path.join(directory, "editable.md");
    const program = `import fs from "node:fs";
      import { main } from ${JSON.stringify(new URL("../check-regression-guard.mjs", import.meta.url).href)};
      const original = fs.${operation};
      fs.${operation} = function(file, ...args) {
        if (file === ${JSON.stringify(target)}) throw new Error("injected fixture I/O failure");
        return original.call(this, file, ...args);
      };
      process.argv = [process.execPath, ${JSON.stringify(CHECKER)}, "--fix-stub"];
      main();`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", program], {
      env: { ...process.env, TASK_PLAN_FILE: target }, encoding: "utf8", timeout: 10000,
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /cannot (?:read|write) task plan.*injected fixture I\/O failure/);
    assert.doesNotMatch(result.stdout, /inserted .*stub/);
    assert.equal(fs.readFileSync(target, "utf8"), QUALIFYING_MISSING_PLAN);
  }
});
