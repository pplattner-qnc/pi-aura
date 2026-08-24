---
kind: slice
slug: aura-command-skeleton
title: /aura command skeleton + subcommand dispatch + completions
task: ../task.md
mode: hitl
status: done
size: s
blocked_by: []
---

## End-to-end behavior

`extensions/aura-secrets.ts` registers the `/aura` command with a handler
that parses `args` into a subcommand dispatch (`secrets discover`,
`secrets edit`) and a `getArgumentCompletions` that completes `secrets` +
its subcommands. The subcommands themselves are stubs ("not implemented")
in this slice.

## Acceptance criteria

- `extensions/aura-secrets.ts` exports default `function(pi)` calling
  `pi.registerCommand("aura", { description, getArgumentCompletions,
  handler })`.
- `handler` splits `args` and dispatches on the first token (`secrets`),
  then the second (`discover`/`edit`); unknown -> `ctx.ui.notify` usage.
- `getArgumentCompletions` completes `secrets` (and `discover`/`edit` when
  the prefix is `secrets `).
- Root `package.json` `pi.extensions` includes `./extensions/aura-secrets.ts`
  (alongside the existing `aura-skill-instruction.ts`).
- pi loads the extension; `/aura` + Tab completes `secrets`; `/aura foo`
  notifies usage.

## Test plan

- Seams: the args parser is the seam — test it with `secrets discover`,
  `secrets edit`, `secrets`, `''`, `foo`.
- Failure modes: empty args -> usage notify (not a crash).
- Scenarios: load pi with the extension; `/aura` + Tab; `/aura secrets` +
  Tab; `/aura secrets discover` (stub notify).
- Edge cases: extra whitespace in args (`secrets  discover`) handled by
  trim/split.

## Constraints / dependencies

- Blocked by `keyring-rewrite` (the command imports `@pi-aura/shared/keyring`,
  which must exist).
