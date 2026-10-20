# Poe generated raster validation

## Scope and authorization

The owner authorized task-scoped local checks with Failure Gate inactive for this
operation. This does not install or activate Failure Gate. Limits were five minutes
per command and fifteen minutes cumulative, including setup, cleanup and retries.
No live provider request, remote workflow, deployment, or database operation ran.

General generation now retains the existing synchronous header checks, then uses
Sharp to decode pixels before returning the original bytes/MIME. Strict decoding
rejects warnings, applies the existing 20-million-pixel ceiling, checks decoded
dimensions and complete pixel-buffer length, and decodes all frames. Decoding has
a ten-second native timeout and uses the existing media abort signal. Other
shared-helper callers retain their synchronous contract and existing validation.
Sharp is declared in its consuming library; the API build still externalizes it.
Models, transport, API schemas and durable spending code are unchanged.

## Checks and actual outcomes

An independent Linux subreaper supervised each finite command with a 270-second
execution deadline, 20-second owned-child cleanup allowance, two-megabyte aggregate
log cap, and persistent cumulative elapsed accounting. The initial one-second
parent/child hang fixture timed out as intended; owned processes were terminated
and confirmed quiescent. This was a supervisor proof, not a validation pass.
No process outside the supervisor's descendants was signaled.

The disposable supervisor injected `--test-timeout=10000` directly into owned Node
test processes, including the existing commands' tsx-launched children. Node does
not allow that flag in NODE_OPTIONS: an initial dependency launch failed before
installing anything, then the corrected CLI wrapper was used. Test and hook
execution therefore remained finite without changing canonical scripts.

| Command | Final result |
| --- | --- |
| `pnpm --filter @workspace/integrations-openai-ai-server run test:poe` | 29 passed |
| `pnpm --filter @workspace/api-server run test:image-upscale` | 10 passed |
| `pnpm --filter @workspace/api-server run test:logo-api` | 15 passed |
| `pnpm --filter @workspace/api-server run test:outline` | 8 passed |
| `pnpm run typecheck` | Passed library preparation and all leaf checks |
| `pnpm --filter @workspace/api-server run build` | Passed; Sharp stays external |

The first Poe run had one failed fixture: zeroing a WebP payload still produced
decodable pixels. The corrected fixture invalidates the VP8 frame tag while
preserving header dimensions/signature; the rerun passed. Both raw results are
retained, with no failure waiver. Synthetic PNG/JPEG/WebP success cases preserve
exact response bytes. Seven header-valid corruption/truncation cases include the
exact 33-byte PNG regression; each asserts one completion, one download, the selected
Poe model, and the existing safe 502 failure. The API regression uses an injected
budget, not persistence fixtures, and proves no success body or refund operation.

Completion feedback identified that `destroy(error)` on a Sharp Duplex can emit an
unhandled stream error rather than reject its pixel promise. Cancellation now races
the decode against an explicit rejection and uses error-free stream destruction.
Checks after metadata and pixel completion forbid late success; pending native work
retains its ten-second timeout. An isolated child regression starts real native
decoding, immediately aborts, checks the existing safe timeout error, waits for the
pending decode/event-loop turn, and exits normally without error-event interception.
The revised Poe suite, root typecheck and API build passed.

Total supervised command time including setup/proof/retries was under 40 seconds;
every command ended with owned-process quiescence. Raw logs and records are ignored
under `generated-artifacts/poe-raster-validation/`. The managed API workflow was
also restarted with a 30-second tool limit and came up cleanly; even reserving its
full limit for each of two restarts keeps combined verification below two minutes. The unchanged public
editor loaded in a screenshot; no paid inference was attempted.
