---
kind: slice
slug: secrets-edit
title: /aura secrets edit — interactive prefilled editor, save back
task: ../task.md
mode: hitl
status: done
size: s
blocked_by:
  - aura-command-skeleton
---

## End-to-end behavior

`/aura secrets edit` reads the current PAT from the keyring, opens
`ctx.ui.editor("Aura PAT", currentPatOrPlaceholder)`, and writes the
result back to the keyring unless the user cancels or the value is
unchanged.

## Acceptance criteria

- `edit` handler: `const keyring = await createKeyring(); const current =
  await keyring.getSecret({service:"aura", name:"pat"});`
- `const edited = await ctx.ui.editor("Aura PAT", current ?? "<paste your
  Aura PAT here>");`
- If `edited` is null/undefined (user cancelled) -> notify "no change".
- If `edited === current` -> notify "unchanged".
- Else `await keyring.setSecret({service:"aura", name:"pat"}, edited)` +
  notify "saved".
- If `current` is null, note that no PAT was stored before (the placeholder
  makes this obvious).

## Test plan

- Seams: `ctx.ui.editor` is the interactive seam — in a non-TUI (RPC) mode
  it returns undefined; guard for that.
- Failure modes: keyring locked -> `KeyringLockedError` -> notify the error
  message.
- Scenarios: with a stored PAT, `/aura secrets edit` opens the editor
  prefilled; change + save -> `getSecret` returns the new value.
- Edge cases: empty string saved -> `setSecret` stores "" (valid, but
  probably a mistake); consider rejecting empty with a confirm. Cancelled
  editor -> no write.

## Constraints / dependencies

- Blocked by `aura-command-skeleton` (and benefits from `secrets-discover`
  existing, but not strictly blocked by it).
