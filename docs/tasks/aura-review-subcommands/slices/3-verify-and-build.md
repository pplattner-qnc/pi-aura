---
kind: slice
slug: verify-and-build
title: Verify the full gate + bundle; mark task done
task: ../task.md
mode: afk
status: todo
size: s
blocked_by:
- wire-aura-mjs-review-subcommands
---

## End-to-end behavior

The review-subcommands feature is verified at the full gate (shared tests +
scripts typecheck + build), the built `dist/aura.mjs` confirmed to contain the
review-* dispatch, and the task marked done with a manual smoke-test note for
the user.

## Acceptance criteria

- `cd packages/shared && npm test` green (review-verb tests + existing).
- `cd scripts && npm run typecheck` green.
- `cd scripts && npm run build` green; `skills/aura/dist/aura.mjs` rebuilt +
  committed; the bundle contains the review-* dispatch (grep the bundle for
  `review-get`/`review-decide`/`review-reopen`).
- `## Implementation notes` appended to `docs/tasks/aura-review-subcommands/task.md`
  recording: the 6 subcommands added, the `AuraClient` verbs added, gate
  results, and the manual live-Aura smoke test:
  > `node skills/aura/dist/aura.mjs artifact review-get <real-artifact-uuid>`
  > should print review state (needs the user's PAT in the keyring/settings).
- Task `status: done`.

## Test plan

- Run the full gate; grep the bundle for the review-* dispatch.
- Manual smoke test delegated to the user (mode afk for the gate; don't claim
  live verification).

## Constraints

- No code beyond what slice 2 wrote; this slice is the gate + build + commit +
  done note.
