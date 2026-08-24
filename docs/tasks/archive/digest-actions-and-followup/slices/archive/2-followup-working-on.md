---
kind: slice
slug: followup-working-on
title: Add Digest.followup.currentlyWorkingOn (default null)
task: ../task.md
mode: afk
size: s
blocked_by: [actions-routing-table]
status: done
---

## End-to-end behavior

A fetched `digest.json` carries `followup: { currentlyWorkingOn: null }`. The
field exists for the agent (via `digest-dashboard`/`skl-flow-rewrite`) to set
when it starts acting on a click; this slice only owns the shape + default.

## Acceptance criteria

- `types.ts`: `DigestFollowup = { currentlyWorkingOn: string | null }`; `Digest` gains `followup: DigestFollowup`.
- `fetch` sets `digest.followup = { currentlyWorkingOn: null }`.
- `make typecheck && make build` green; existing tests pass; new unit test asserts the default.
- `last-digest.json` store (`save`) carries `followup` for free (it's a `Digest`).

## Test plan

- **Seams:** `fetch`'s digest construction — assert `followup.currentlyWorkingOn === null` in the output `digest.json` fixture.
- **Scenarios:** fresh digest → null; (the agent-set value is out of scope, tested in `digest-dashboard`).
- **Edge cases:** ensure `followup` is always present (never `undefined`) so the SPA can read it without a guard.

## Constraints and dependencies

- `blocked_by: [actions-routing-table]` (shares the `Digest` type extension; keep them in one coherent type block).
- Do not write the setter — only the default.
