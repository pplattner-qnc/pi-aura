---
kind: task
type: feature
slug: add-capacity-subcommands
title: Add capacity subcommands to the aura CLI (me / set / task)
status: proposed
size: m
---

# Add capacity subcommands to the aura CLI

## Outcome

First-class `capacity` subcommands in the `aura` CLI (`scripts/src/aura.ts` →
bundled `skills/core/aura/dist/aura.mjs`) that cover the REST-only capacity
endpoints the aura-mcp-dev server dropped in the 195 → 90 overhaul. The agent
(and a human) can check and adjust capacity commitments without hand-crafting
`fetch` calls with the bearer token.

Done looks like:

- `node aura.mjs capacity me` — prints base / committed / free / utilization +
  per-task commitment breakdown (wraps `GET /capacity/me`).
- `node aura.mjs capacity task <taskKey|uuid> [--user <userId|uuid|me>]` —
  cross-task member capacity view for a task (wraps
  `GET /tasks/{uuid}/members/{userIdOrUuid}/capacity`).
- `node aura.mjs capacity set <taskKey|uuid> --percent <N> [--user me]` — sets
  your capacity commitment on a task (wraps
  `PATCH /tasks/{uuid}/members/{userIdOrUuid}/capacity`). Defaults to the
  caller (`me`); adjusting another user requires `--user` and is surfaced with
  the "only adjust your own capacity" guardrail.
- `node aura.mjs capacity participation <taskKey|uuid> --status
  ACTIVE|WAITING|OBSERVING [--user me]` — participation status (wraps
  `PATCH /tasks/{uuid}/members/{userIdOrUuid}/participation`).
- Human keys (`AURA-1061`) resolve to UUIDs the same way the existing task
  commands do (`getTaskByHumanKey` path), so the user never pastes a UUID.
- The `aura` skill's `capacity-planning.md` is updated to point at these
  commands instead of telling the agent to hand-craft REST calls.

## User story

As an agent (or developer) managing my day, I want to see and set my capacity
commitments from the same CLI I already use for artifacts and wiki — so I don't
drop into raw `curl`/`fetch` with a bearer token every time capacity changes,
and so the `aura-digest` flow can act on a "put all my capacity into AURA-1061"
request end-to-end.

## Scope

### In scope

- A `capacity` command group in `aura.ts` with `me`, `task`, `set`, and
  `participation` subcommands.
- Human-key resolution (`AURA-<n>` → task uuid) reusing the existing task
  resolution path; `me` → caller user id resolution via the client.
- Output formatting for the capacity breakdown (readable, not raw JSON for
  `me`; compact table for `task`).
- The "only adjust your own capacity" guardrail from the process docs: `set`
  and `participation` default to `--user me`; a non-`me` target is allowed but
  the command prints the guardrail warning.
- `aura` skill `capacity-planning.md` + `process/capacity.md` updated to
  reference the new commands (replacing the "REST-only, use a REST client or
  UI" guidance).
- Tests for the command dispatch, human-key resolution, and the guardrail.

### Out of scope

- Leadership overview (`GET /capacity/leadership`) — admin/leadership only; add
  later if needed.
- Company base-capacity settings (`GET/PATCH /capacity/settings`) — admin only,
  requires explicit consent; explicitly out.
- A capacity *digest* integration (auto-suggesting over-commitment) — the
  digest already reports capacity; this task only adds the act-and-adjust
  commands.
- Depending on the generic openapi→CLI wrapper (task
  `generic-openapi-cli-wrapper`). These commands are hand-written against the
  existing `AuraClient`, like the current `artifact`/`wiki` commands. A later
  task may regenerate them through the generic layer.

## Acceptance criteria

- `node aura.mjs capacity me` prints base/committed/free/utilization and the
  per-task list.
- `node aura.mjs capacity set AURA-1061 --percent 80` resolves the human key,
  issues the authenticated `PATCH`, and confirms the new commitment.
- `node aura.mjs capacity set AURA-1061 --percent 80 --user <other-uuid>`
  works but prints the "only adjust your own capacity" guardrail warning.
- An unknown task key / bad percent / missing `--percent` produces a clear
  error.
- `task typecheck` and the full test suite pass.
- The `aura` skill capacity docs reference the new commands.

## Existing abstractions to use

- `scripts/src/aura.ts` — add the `capacity` command group; reuse the `fail()`
  / USAGE / inline-result patterns and the human-key resolution the task
  commands already use.
- `packages/shared/src/aura-client.ts` — add the four capacity methods to the
  `AuraClient` interface and `HeyApiAuraClient` implementation (the generated
  `hey-api-aura-client.ts` already covers these endpoints; wire the
  hand-written interface to them).
- `packages/shared/openapi/openapi.yaml` — the endpoint contracts
  (`/capacity/me`, `/tasks/{uuid}/members/{userIdOrUuid}/capacity`,
  `/participation`) are already present; no spec change needed.
- `skills/core/aura/resources/usecases/capacity-planning.md` +
  `resources/process/capacity.md` — update the docs to point at the commands.

## Architecture / domain decisions

- **Hand-written, not generated.** These commands are written directly
  against `AuraClient`, matching the existing `artifact`/`wiki` command style.
  They do *not* depend on the generic openapi→CLI wrapper
  (`generic-openapi-cli-wrapper`); a later task may absorb them into that layer
  if it proves out.
- **Human keys, not UUIDs.** Every task-targeting subcommand accepts
  `AURA-<n>` and resolves it, so the user never pastes a UUID — same
  convention as the rest of the CLI.
- **Guardrail, not a hard block.** The process docs say adjusting another's
  capacity needs explicit consent. The command allows it (the caller may have
  consent) but prints the guardrail; it does not refuse, because consent is
  out-of-band.
- **Auth parity.** Reuses `createDefaultAuraClient()` — the same settings +
  PAT/keyring path as every other command. No bespoke bearer-token handling.
