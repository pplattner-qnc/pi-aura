## Deviation report — secrets-edit

### Summary

The implementation matches the arch spec and slice doc on the public API
surface and all acceptance criteria. The `decideEditAction` pure function,
`handleEdit` thin UI wrapper, prefilled editor, cancel/unchanged/empty
guards, and `KeyringLockedError` handling are all present and correct. No
blockers.

### API surface changes
- **Planned:** `secrets edit` handler branch: `getSecret` →
  `ctx.ui.editor` prefilled → `setSecret`; cancel/unchanged/empty guards;
  `KeyringLockedError` → notify error.
- **Actual:** Matches. `decideEditAction(current, edited)` pure function
  decides cancel/unchanged/save/confirm-empty; `handleEdit(ui,
  keyringFactory, current)` is the thin UI wrapper. Empty-string edits
  confirm via `ctx.ui.confirm`.
- **Impact:** None.

### Abstraction usage
- `createKeyring` + `getSecret` + `setSecret` from `@pi-aura/shared/keyring`
  — used correctly.
- `ctx.ui.editor` / `ctx.ui.confirm` / `ctx.ui.notify` — per the pi API.
- `KeyringLockedError` — caught and surfaced via `ctx.ui.notify(...,
  "error")`.

### Out-of-scope changes
- None. This is the last slice; the `secrets discover` branch was already
  implemented in slice 2.

### Acceptance criteria
- Prefilled editor (`current ?? "<paste your Aura PAT here>"`) ✅.
- `edited === undefined/null` (cancel/non-TUI) → notify "no change", no
  write ✅.
- `edited === current` → notify "unchanged", no write ✅.
- Else `setSecret` + notify "saved" ✅.
- Empty-string guard: `edited === ""` → `ctx.ui.confirm` before storing;
  decline → no change ✅.
- `KeyringLockedError` → `ctx.ui.notify(error.message, "error")` ✅.
- `decideEditAction` pure function extracted + tested (cancel/unchanged/
  save/confirm-empty/current-null cases) ✅.

### Task doc update needed?
- No — the land-worker appended the slice-3 implementation note to
  `## Implementation notes` already.

### User attention needed?
- No.
