---
kind: slice
slug: wire-aura-mjs-review-subcommands
title: Wire the 6 `aura.mjs artifact review-*` subcommands in scripts/src/aura.ts via AuraClient
task: ../task.md
mode: afk
status: todo
size: m
blocked_by:
- add-review-verbs-to-aura-client
---

## End-to-end behavior

`scripts/src/aura.ts` exposes the 6 `artifact review-*` subcommands the
salvaged docs reference (see
`docs/tasks/maps/aura-mcp-doc-salvage/dangling-review-cli-refs.md`), implemented
via `createDefaultAuraClient()` (the `AuraClient` verbs landed in slice 1).
`USAGE` is updated. The doc references become truthful.

## Subcommands

- `artifact review-get <id>` → `client.getArtifactReview(id)`; prints compact
  review state (version, review_state, per-reviewer status, deadline,
  initiator).
- `artifact review-approvals <id>` → `client.getArtifactApprovals(id)`; prints
  decisions + decided/total counts.
- `artifact review-request <id>` → `client.requestArtifactReview(id)`;
  prints confirmation.
- `artifact review-start <id> --version V --roles R[,R] --user-ids U[,U] [--deadline D]` → `client.startArtifactReview({id, version, roles: [...], user_ids: [...], deadline})`.
- `artifact review-decide <id> --version V --decision APPROVED|REJECTED` → `client.submitArtifactDecision({id, version, decision})`.
- `artifact review-reopen <id>` → `client.reopenArtifactReview(id)`.

## Acceptance criteria

- `aura.ts` dispatches all 6 subcommands under the existing `artifact` group,
  using `createDefaultAuraClient()` (same client construction as the other
  subcommands — verify how the existing `artifact get`/`wiki` subcommands build
  the client and mirror it).
- Arg parsing: `--version` (number), `--roles` (comma list → array), `--user-ids` (comma list → array), `--deadline` (string, optional), `--decision` (validate APPROVED|REJECTED). Missing required flags → usage error (exit 2), mirroring the existing `fail()`.
- Each prints a compact human-readable summary to stdout; errors to stderr +
  exit 1 (mirror existing behavior).
- `USAGE` updated to list the 6 new subcommands.
- The existing artifact get/update/create/section/cleanup + wiki + upload
  subcommands are untouched.
- `cd scripts && npm run typecheck && npm run build` green; the built
  `dist/aura.mjs` contains the review-* dispatch (grep the bundle for
  `review-get`/`review-decide`/`review-reopen`).
- Commit on a slice/wire-aura-mjs-review-subcommands branch.

## Test plan

- **Seam:** the slice 1 unit tests cover the verbs; this slice is wiring +
  build. If a scripts test harness exists, add a dispatch test mocking
  `createDefaultAuraClient`; if not, the gate is typecheck + build + the
  bundle grep.
- **Scenarios:**
  1. `node dist/aura.mjs artifact review-get <id>` (manual, or via a test)
     calls `getArtifactReview` and prints the review state.
  2. `review-start` parses `--roles OWNER,STAKEHOLDER` → `["OWNER","STAKEHOLDER"]`; `--user-ids a,b` → `["a","b"]`; passes them to `startArtifactReview`.
  3. `review-decide --decision BAD` → usage error exit 2.
  4. Missing `--version` on `review-start`/`review-decide` → usage error.
  5. Build bundle contains the 6 `review-*` case branches.

## Constraints

- Use `createDefaultAuraClient()` (the existing pattern) — never the dropped
  `restClient`.
- Don't edit docs (the docs already reference these exact subcommands + flags;
  if a flag name diverges, fix the doc to match the implementation, but prefer
  matching the doc's flag names).
