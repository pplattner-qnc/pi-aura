## Deviation report — aura-secrets-edit-picker

### API surface changes
- **Planned:** Add a pure `pickSecretKey(choice: string): SecretKey | null` so the chooser→key mapping is unit-testable without a pi session; the `secrets-edit` handler gains a chooser; no new public export beyond the existing `auraSecretsExtension` default; no new slash command; `getArgumentCompletions`/`parseAuraArgs` unchanged.
- **Actual:** `pickSecretKey(choice: string | undefined): SecretKey | null` was added and exported (signature widened to `| undefined` to model cancel/non-TUI — the slice doc's test plan explicitly lists "`ui.select` returns `undefined`"). A new `handleSecretEdit(ui, keyringFactory)` orchestrator was added and exported — it owns the chooser→`pickSecretKey`→`handleEdit` wiring. `handleEdit` was **generalized** (3 new optional params: `key`, `label`, `placeholder`, all with Aura-PAT defaults) — **not** reimplemented; `decideEditAction` is untouched. No new slash command registered. `parseAuraArgs` and `getArgumentCompletions` are unchanged (empty diff on both).
- **Impact:** None on dependent slices — this is a leaf UI slice (arch spec says "Interface contract for later slices: none"). The `handleEdit` signature widening is backward-compatible (all new params default to Aura-PAT values), so any existing caller omitting them behaves identically.

### Abstraction usage
- Used/was specified: **yes**.
  - `decideEditAction` reused **unchanged** (confirmed: not in the diff) — the chosen secret is routed through it via `handleEdit`. ✓
  - `handleEdit` reused, not reimplemented — generalized with optional params (key/label/placeholder) so the chooser can route any of the three secrets through the same edit flow; the core editor→decide→confirm→setSecret body is preserved. ✓
  - The `makeMockUi`/`makeMockKeyring` test pattern was extended: a new `makeMockEditChooserUi` fake adds `select` + `editorResult` to the existing fake shape, mirroring the spec's "add `editorResult` to the existing fake" instruction. ✓

### discover stays Aura-PAT-only (no Atlassian discovery source added)
- **Confirmed.** The `discoverPat` / `DISCOVERY_SOURCES` / `readMcpBearerToken` / `handleDiscover` code paths show no additions in the diff. No Atlassian discovery source was added. ✓

### Chooser labels distinct ("Atlassian API token" not "API token")
- **Confirmed.** `SECRET_LABELS = ["Aura PAT", "Atlassian email", "Atlassian API token"]`. The Atlassian token is labelled "Atlassian API token", not "API token". A test asserts all three labels are present and `new Set(options).size === options.length` (distinct). ✓

### Out-of-scope changes
- None. The diff is exactly 2 files: `extensions/aura-secrets.ts` (+82/-11) and `extensions/aura-secrets.test.ts` (+157). No source files outside the spec were touched (`clients.ts`, `devlinks.ts`, `bitbucket.ts`, `settings.ts`, keyring package — all unchanged). No dist rebuilds (this slice touches no code that feeds `make build`).

### Acceptance-criteria divergence
- `/aura secrets edit` asks via `ctx.ui.select` which secret to edit, with cancel → "no change" — **met** (`handleSecretEdit` calls `ui.select("Edit which secret?", [...SECRET_LABELS])`; cancel → `pickSecretKey(undefined)` → null → "no change" notify, no keyring write).
- Chosen secret flows through `handleEdit`/`decideEditAction` — **met** (routed via `handleSecretEdit` → `handleEdit`; `decideEditAction` unchanged).
- Aura PAT path unchanged behavior, only routed through chooser; two new paths store under the right `SecretKey` — **met** (tests assert `aura/pat`, `atlassian/email`, `atlassian/api_token` routing; Aura PAT test confirms unchanged behavior).
- `/aura secrets discover` unchanged — **met** (empty diff on discover path).
- No new slash command registered; `getArgumentCompletions` preserved — **met** (no `registerCommand`/`registerTool` in diff; `getArgumentCompletions`/`parseAuraArgs` unchanged).
- Unit tests cover chooser wiring: each secret routes to right key; cancel exits cleanly; undefined select handled without throwing — **met** (6 `pickSecretKey` tests + 5 chooser-routing tests covering all three choices, cancel, and label distinctness).
- Prefill placeholders for new secrets — **met** (`SECRET_PLACEHOLDERS` map with `<paste your Atlassian email here>` and `<paste your Atlassian API token here>`; tests assert the prefilled values).

### Task doc update needed?
No. The arch spec's slice 3 section is accurate: `pickSecretKey` is the pure testable seam, `handleEdit` is generalized (not reimplemented), no new slash command, discover stays Aura-PAT-only. The `handleSecretEdit` orchestrator is a minor addition not literally named in the spec, but it is the chooser wiring the spec described ("the `secrets-edit` handler gains a chooser") — extracting it as a testable function mirrors the `handleEdit`/`handleDiscover` pattern already in the file. No `## Architecture notes` or `## Implementation notes` append is required.

### User attention needed?
No. Scope was followed; the API surface matches the spec. The `handleEdit` signature widening and the new `handleSecretEdit` export are the only unplanned surface additions, both backward-compatible and consistent with the spec's "route the chosen secret through them as-is" + "extract it and unit test it without a pi session" instructions.
