# Core runtime contract

Read for default installation, adaptation and acceptance. This is a deliberately
reduced contract, not a partial claim that the optional advanced features work.
Equivalent audited host implementations may satisfy these outcomes; the shipped
templates require Node 20+, Linux `/proc` and a compatible local filesystem.
Verify actual capabilities before choosing them. Neither instructions nor
environment variables are authorization.

## Retained requirements

| ID | Required outcome |
|---|---|
| C01 | Scope, genuine authority, current inputs and relevant host capabilities are established before affected writes/execution. |
| C02 | Port inventory sends no signals; protected busy and unknown discovery never become FREE. |
| C03 | Production guards, argument validation and disabled/recursive non-success remain enforced. |
| C04 | Actual managed service ownership, configured bind/preview routing and health are verified for changed service lifecycles. |
| C05 | Every participating conflicting caller shares one canonical local lease; independent callers are not unnecessarily serialized. |
| C06 | Explicit finite safe queue/execution/termination limits and actual independent outer supervision cover authorized owned work. |
| C07 | Exact owned incarnations, startup registration and descendant cleanup prevent false release/success; uncertain lifecycle retains exclusion. |
| C08 | Raw exit/signal and deadline/cleanup outcomes remain distinct; late zero and missing evidence never fabricate success. |
| C09 | Recovery requires compatible finalized healthy state and verified quiescence or a genuinely authorized recovery route; no age-only unlink. |
| C10 | Existing validation authority/coverage/failure/completion policy remains unchanged; Port Authority creates none of those permissions. |
| C11 | Actual app wiring, applicable positive/negative proofs and two consecutive authorized host runs establish activation; fixture proof alone does not. |
| C12 | Stage, independent acceptance, current runtime readiness and administrative/native task state are reported separately. |

## Inventory CLI

```sh
node scripts/free-ports.mjs [--dry-run] PORT...
```

Decimal ports must be in 1..65535; invalid arguments fail. Default accepts no action,
manifest or own-tree options. It uses TCP socket inodes and process fd/incarnation
evidence. Both applicable socket tables must be readable; absence of IPv6 is safe
only with positive disabled-capability evidence. Unknown holder mappings fail closed.

| Exit/state | Interpretation |
|---|---|
| 0 / FREE | Complete current discovery found no listeners; not a reservation. |
| 2 / INVALID or PROHIBITED | Invalid input or blocked production context; no cleanup. |
| 3 / PROTECTED_BUSY or SKIPPED | Listener protected, or disabled/recursive invocation; no free-port claim. |
| 4 / UNKNOWN | Ownership/discovery unavailable; no free-port claim. |

Hard `NODE_ENV=production`, `REPLIT_DEPLOYMENT=1` and
`REPLIT_ENVIRONMENT=production` deny core template admission, even with a domain or
development record. Unmarked admission does not independently attest development.
Never remove real flags to make execution pass.

## Single outer lease CLI and configuration

```sh
VALIDATION_LOCK_TIMEOUT_MS=<approved-ms> \
VALIDATION_LOCK_MAX_HOLD_MS=<approved-ms> \
node scripts/validation-lock.mjs -- executable arg...
```

All conflict participants must resolve the same canonical file. The default is
`.local/validation-lock-global.lock` relative to the installed script's project root;
`VALIDATION_LOCK_FILE` selects an exact alternative path, not an authorization token.
Core rejects options before `--` and inherited `VALIDATION_LOCK_CONTEXT_*` or
PID-only reentry indicators. Use unwrapped inner commands. Do not nest core wrappers.

Queue TIMEOUT and execution MAX_HOLD are required. All duration values must be integer
milliseconds in 1..2147483647 and within the actual approved host limits. Local defaults:
POLL 100, HEARTBEAT 1000, STALE_HEARTBEAT 10000 (> heartbeat), STOP_GRACE 3000 and
STOP_KILL 5000. These mechanics are not authority to exceed host/parent limits.
The engine retains advisory waiter records internally; core exposes no priority
selection or fairness guarantee. Environment override paths must be mapped consistently.

Execution starts after acquisition. Queue timeout is not a slow-test failure.
Monotonic elapsed time governs deadlines. Retain parent-wide remaining allowance
through the adopted host runner; standalone MAX_HOLD values do not implement it.

## Owned-work lifecycle

Lease v2 retains boot, token, canonical path, owner PID/start time, phase, group,
observed descendants and the mandatory boolean `recoveryRequired`.
Reserve with true before dispatch. A private startup gate and independent IPC
watchdog must register exact owned scope before executing user commands.
Handshake failure denies dispatch. The watchdog remains outside the owner's event
loop and original process group, retaining the same finite execution deadline.

Observe exact descendant incarnations; PID/name/port alone is insufficient. On
deadline, cancellation, owner/watchdog loss or journal failure, stop new dispatch,
attempt bounded TERM/KILL of exact owned work and verify termination. Late descendants
receive applicable cleanup. A stopped listener cannot hide a surviving wrapper.
Expiration of admission after launch must not abandon already owned children.

Release requires complete quiescence, independent acknowledgement and the guarded
durable healthy-finalization/unlink transition. Child exit/signal delivery/heartbeat
expiry alone is insufficient. Journal/discovery errors retain exclusion and raw
incidents even after best-effort local cleanup. Do not inject false recovery flags.

Dead-owner ordinary recovery permits only a compatible finalized
`phase:"finished", recoveryRequired:false` lease with no remaining or unknown workload.
Missing fields, legacy/corrupt leases, launch gaps, surviving work and abandoned
transition sidecars require actual separately authorized recovery. Reconcile competing
writers and unknown outcomes; do not blindly unlink or replay.

Bound JSON reads: no-follow, nonblocking regular-file checks, private owner and byte
limits. Filesystem/kernel stalls still need verified outer supervision. Commands must
not daemonize or start untracked remote work. Local polling cannot prove every escape;
use verified stronger host containment or block that claim. No cross-clone exclusion,
hostile-code sandbox or uninterruptible-I/O guarantee.

Completed commands propagate raw exits; raw signals are preserved separately.
Invalid input returns 2, queue timeout 3, uncertain discovery/recovery 4, and budget/
cancellation/survivor/spawn failures nonzero. A raw zero after deadline or with missing
cleanup/evidence is not success. The resource lease is not a checked-task decision,
global parent budget, tier registry, independent acceptance or completion authority.

## Acceptance and regression guard

Before implementation, pin the applicable C01–C12 outcomes, original scope, starting
observations and expected proof. Keep pre-install and delivered snapshots distinct.
Preserve approved input/environment/source/plan bindings; expected code changes do
not change requirements. Relevant changed inputs invalidate affected proof.

For material behavior/safety/error-path changes, retain the host-required Regression
Guard: pre-change observation, exact protected behaviors, automated cases at the owning
boundary and expected outcome. A deliberately denied fixture is not an ignored failure.
Do not skip, quarantine, delete, filter, reclassify or retry away required failures.
The adopted validation contract determines tiers, diagnosis, acceptance and closure.

The executable package tests separate default-profile fixtures from optional advanced
fixtures. Under actual isolated-test permission, use:

```sh
node tests/hardening.test.mjs --supervised
```

Run twice sequentially for package acceptance. This creates a private fixture supervisor
and test-only adapters; it does not configure genuine host authority. Keep an independent
external finite boundary around authoring checks, allowing owned teardown. The fixture
engine's own watchdog covers its admitted scope; a shell-client timeout alone does not
prove transitive termination. Preserve retained fixture state when lifecycle is uncertain.

Required applicable cases: free/busy/unknown inventory; invalid/production/disabled
rejections; no default signals or advanced admission; same-file exclusion and independent
work; 0/nonzero/signal propagation; missing/invalid limits; queue-versus-execution expiry;
late zero, synchronous hang, hook/child hang, owner/watchdog failure; surviving/late
descendants; corrupted/legacy/retained leases, blocked reads and uncertain recovery.
Keep the hardened runtime cases for shared mechanisms; feature-specific advanced cases
are package regressions, not prerequisites to enable optional authority on an app.

For host activation, independently map these outcomes to actual adapted callers and
their transitive hooks. Obtain two consecutive authorized host runs without manual
cleanup between them. Test expected negative cases safely; never stop a live service
merely to create an outage fixture. Actual API probes need status, media type, parsed
service-specific health, finite cancellation and the real browser/proxy path when used.
The host's own required coverage/evidence still governs.

Stage inactive sources without overwriting live scripts/callers. `STAGED` proves only
the source stage; `CORE_VERIFIED` requires named installed core controls and real
authorized acceptance. Record isolated checks PASSED/FAILED/BLOCKED/NOT_RUN separately.
Default installation does not need configured reclaim adapters. A dependent caller
that invokes advanced cleanup still needs its actual capability; do not silently
remove that dependency or call it core merely to pass.

Audit first; scoped repair never self-certifies independent acceptance. If the selected
host route requires independent review, obtain fresh independent post-repair proof.
Definition-only confirmation, resource verification and app integration are distinct.
If a paired workflow is selected, follow its actual canonical full-plan/readback,
dependency/readiness and uncertainty protocol instead of duplicating it here.
