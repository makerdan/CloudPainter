# Existing standard-tier API import failure

Observed 2026-10-19 in the normally admitted Runtime Safety workload:
the unchanged api-outline test exits during module initialization because
DATABASE_URL is absent from the unchanged credential-free supervisor environment.
This prevents its test cases from running. It is not a successful API check.

Primary full run: `e4eba4c7-eb34-42dd-acd4-168a466c1d70`, step 8.
Supported isolated retry: `5ac96ed4-2fe2-4f00-87b9-2fef35ab7189`, step 0.
Both exited 1 with confirmed quiescence. The raw error is:
`DATABASE_URL must be set. Did you forget to provision a database?`
No database, credentials or substitute URL was provided.

## Independent provenance evidence

`git diff --quiet HEAD --` on all five files below exited 0. Inspection of
`git show HEAD:scripts/failure-gate/runner.mjs` and
`git show HEAD:lib/db/src/index.ts` confirms the same environment exclusion and
eager import error were committed before this task's changes.
The outline test statically imports the outline route and image-budget module;
the route imports image-budget; image-budget imports the database package.
The supervisor's safeEnv intentionally excludes DATABASE_URL. Thus this failure
is reproducible from the unchanged committed import/environment contract,
independently of retry outcome and of the new runtime utilities.

| Unchanged source | SHA-256 |
|---|---|
| scripts/failure-gate/runner.mjs | 03c3901c95e888cf648e8eaf60429b3fd8ecbfccbc0bb3f791007e1e19437a2e |
| artifacts/api-server/src/routes/outline.test.ts | 009d04803a6519afa980ca86c54dbdf66ec61bc73ac8155b592a8debdacf1d34 |
| artifacts/api-server/src/routes/outline.ts | 0118458927bf428051f3fe9ea1e2b36e551ef0a26665eeac6449ca343dff8e2d |
| artifacts/api-server/src/lib/image-budget.ts | ef0ba5956397c5f110a25efc902c2c4391c6caad161cb691b879bc09bb362e10 |
| lib/db/src/index.ts | fc285bc83108137ba57c4c2774a35053e3c25fda1292c3d7a16a57d43dd9679c |

Disposition: supported per-plan self-classification as pre-existing is an
inference based on these unchanged committed sources, not a clean baseline,
a passing retry, a catalog ignore entry or authorization to repair application
behavior. Preserve the raw failure and unexecuted API cases in the handoff.
This note only enables subsequent required steps to be observed under the
existing runner; it does not turn the API test into PASS.
