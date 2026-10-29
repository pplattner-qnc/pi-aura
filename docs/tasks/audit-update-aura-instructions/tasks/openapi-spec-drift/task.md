---
type: task
subtype: research
title: What changed in the Aura REST API since the local openapi.yaml (synced Sep 1), and which changes affect the REST docs, the typed client, and aura.mjs?
status: stable
workflow_state: ready
blocked_by: []
---

## Question

Run the spec sync mechanics (`task openapi-sync`, or
`scripts/openapi-sync.sh` directly: a depth-1 clone of
`git@bitbucket.org:anwaltde/aura.git`, comparing
`src/api/openapi/openapi.yaml` against
`packages/shared/openapi/openapi.yaml`). Produce an endpoint-level diff
(added / changed / removed paths and operationIds, and schema changes that
matter to consumers) and map each change to its consumers:

- `scripts/src/gen-rest-doc.ts` output (the `rest-api.md` reference);
- `packages/shared/src/generated` (the typed client; regeneration itself is
  a later ticket, not this task);
- `scripts/src/aura.ts` commands (artifact / wiki / upload);
- the extensions' REST calls.

This task reports only: no files under `packages/` or `scripts/` are
modified, no codegen runs, nothing is committed.

## Unblocks

The spec sync, codegen, rest-api.md regen, and consumer-fix tickets.

## Trusted sources

- The Aura source repo spec via the sync mechanics.
- The local spec and its consumers (gen-rest-doc.ts, aura.ts, the
  generated client).

## Constraint (user instruction)

If the Bitbucket clone fails (no SSH access, auth rejected), ask the user
how to obtain the current spec instead of concluding it is unavailable.

## Evidence

An endpoint-level diff report in
`docs/tasks/audit-update-aura-instructions/tasks/openapi-spec-drift/report.md`
with a consumer-impact section per change.

## Likely dependents

to-spec; extensions-instruction-drift for extensions that encode REST
shapes.
