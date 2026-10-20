# Regression Guard Application Handoff

## Canonical source

Implementation contract: `.agents/skills/regression-guard/SKILL.md`, especially:

- Classification and explicit exclusions.
- The required three-field section, N/A reasons, self-satisfying tasks, and specificity rules.
- Strict, `--fix-stub`, and `--stubs-only` modes.
- `TASK_PLAN_FILE` single-file scoping and the fix-stub-then-strict validation order.

The skill and its runtime mirror were not changed.

## Project snapshot before implementation

- No Regression Guard checker or project validation runner existed.
- The root `build` and `typecheck` scripts ran application/library checks only.
- The current local `.local/tasks` archive contained 41 Markdown plans; 13 already had a `## Regression Guard` heading. `.local/` is ignored and may not be present in other environments.
- No archive-wide repair was run. Existing historical plans were not edited by this implementation.

## Delivered files

- `scripts/check-regression-guard.mjs` — standalone checker with strict (default), `--fix-stub`, and `--stubs-only` modes.
- `scripts/validate-task-plans.mjs` — sequential auto-stub then strict runner.
- `scripts/tests/check-regression-guard.test.mjs` — isolated temporary-fixture tests using Node's built-in test runner.
- `package.json` — explicit `validate:task-plans` and `test:regression-guard` commands; normal build/typecheck commands are unchanged.
- `reports/regression-guard-application-handoff.md` — this requirement and evidence map.

No CloudPainter or API runtime files, canonical skill files, or historical task plans were changed.

## Requirement mapping

| Requirement | Implementation and evidence |
| --- | --- |
| Classify qualifying and excluded plans | The checker applies strong-signal rules to the plan's substantive sections and excludes DELETE-prefixed plans, guard-focused hardening tasks, explicitly additive work, cosmetic error-copy edits, and plans without material-change signals. Tests cover fixes, a fix that also adds tests, additive work including a new endpoint, DELETE-prefixed work, and guard-focused work. |
| Validate a complete declaration | Strict mode requires exactly one `Covers`, `Test location`, and `What it checks` field, non-placeholder values, no extra labeled fields, and placement after present Failure Gate sections and before `Relevant files`. |
| Validate N/A and self-satisfying declarations | N/A requires a specific reason matching one of the four allowed categories. Self-satisfying text must identify its test/guard deliverable and is accepted only when the plan is classified as guard-focused hardening. Tests cover all four N/A categories, a vague N/A reason, a valid self-satisfying plan, and a bug-fix plan that incorrectly claims self-satisfaction. |
| Support all three modes | Strict reports missing sections for detected qualifying plans and malformed declarations. `--fix-stub` inserts placeholder sections only where a detected qualifying plan has no section and is a no-op otherwise. `--stubs-only` skips missing-section checks and reports unfilled placeholders in existing sections. |
| Scope and reject invalid targets | When `TASK_PLAN_FILE` is set, the checker first requires a non-empty path ending exactly in `.md` that exists and is a regular file; it then reads and repairs only that file. Relative paths resolve from the caller's working directory. Tests cover a selected file remaining isolated from a sibling, relative paths, an invalid extension, a missing file, an empty value, and a directory target. |
| Provide an explicit validation entry point | Run `pnpm run validate:task-plans`. The runner invokes `--fix-stub` and only after it succeeds invokes strict mode, passing the process environment unchanged. The runner test confirms a selected temporary plan is stubbed before strict reports the human decision still needed, while its sibling is unchanged. |
| Keep validation opt-in | The new commands are not added to `build` or `typecheck`; their existing command definitions remain unchanged. |

## Validation evidence

- `pnpm run test:regression-guard` — passed, 12 tests.
- `pnpm run typecheck` — passed for libraries and the API server, CloudPainter, mockup sandbox, and scripts workspaces.
- `node --check scripts/check-regression-guard.mjs` — passed.
- `node --check scripts/validate-task-plans.mjs` — passed.
- `git diff --check` — passed.
- `pnpm run validate:task-plans` with `TASK_PLAN_FILE` set to an isolated temporary valid plan — passed; the stub pass inserted zero sections and strict mode passed for one plan.
- The project validation runner was exercised by the tests against isolated temporary plans. The archive-wide command was deliberately not run, because its `--fix-stub` phase can modify qualifying legacy plans.

## Enforcement limits

- Classification is a bounded, rule-based approximation of the skill's substance-based judgment. It cannot reliably understand every plan, prove materiality, or distinguish every additive change from a behavior replacement. A human Planner must review ambiguous classifications; a missing automated violation is not proof that a plan is exempt.
- The checker validates that a test path and assertion description are present, not that the test exists, runs, catches the stated failure, or is in the correct code layer. It cannot enforce the skill's Planner Announcement in chat or guarantee that a Build agent delivers the named test.
- `--fix-stub` deliberately creates placeholders rather than deciding what a plan's guard should be. The subsequent strict pass will fail until a human fills in or documents the declaration.
- `pnpm run validate:task-plans` without `TASK_PLAN_FILE` scans the local `.local/tasks` Markdown archive and may insert stubs into detected qualifying plans. Prefer setting `TASK_PLAN_FILE` for a current plan; the archive is ignored and may differ across environments.
- This is an opt-in project command only. It is not wired into CI, Replit's task lifecycle, the normal application build/typecheck path, or Failure Gate, and it does not claim platform-level enforcement.
