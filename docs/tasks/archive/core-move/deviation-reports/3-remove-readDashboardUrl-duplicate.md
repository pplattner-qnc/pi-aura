## Deviation report — 3-remove-readDashboardUrl-duplicate

### API surface changes

- **Planned:** Export `joinUrl` from `@pi-aura/shared/digest/progress-emitter` (arch spec decision: "export `joinUrl` from `@pi-aura/shared/digest/progress-emitter` so there's a single source of truth"). Delete the extension's local `readDashboardUrl` AND `joinUrl` definitions; import both from the shared core.
- **Actual:** Exactly as planned.
  - `packages/shared/src/digest/progress-emitter.ts`: `joinUrl` changed from `function joinUrl` (private) to `export function joinUrl` (public). One keyword added, no logic change.
  - `.pi/extensions/digest-dashboard/index.ts`: the local `readDashboardUrl` (16 lines) and local `joinUrl` (5 lines) definitions deleted; replaced by a single import: `import { readDashboardUrl, joinUrl } from "@pi-aura/shared/digest/progress-emitter";` (line 16). The two call sites (`readDashboardUrl()` at lines 476/579, `joinUrl(dashboardUrl, "/api/state")` at line 589) are unchanged — they now resolve to the shared import.
  - `packages/shared/test/digest/joinUrl-export.test.ts`: new 27-line test verifying `joinUrl` is exported and behaves correctly (4 assertions: exported as function, joins without trailing slash, strips trailing slash, adds leading slash).
- **Impact:** None on dependent slices — this is the final slice. The TS6059 workaround from `digest-live-progress-tree`'s slice 5 is cleanly closed: `readDashboardUrl` and `joinUrl` now have a single source of truth in `@pi-aura/shared/digest/progress-emitter`.

### Abstraction usage

- **Used/was specified: yes.**
  - Single source of truth achieved: the extension imports both `readDashboardUrl` and `joinUrl` from `@pi-aura/shared/digest/progress-emitter` — no local duplicates remain. ✅
  - No behavior change: the shared `readDashboardUrl` and `joinUrl` are functionally identical to the deleted local copies (same logic, same signatures). The extension calls `readDashboardUrl()` with no arguments at both call sites, so the shared default (`defaultServerUrlPath()` → `~/.pi/aura/server-url.json`) is used — which resolves to the same path as the old local default (`defaultAuraPaths().serverUrlPath` → `~/.pi/aura/server-url.json`). ✅
  - No other extension code touched: only `index.ts` modified in the extension; the import line and two function-definition deletions. No `server.ts`, `progressTree.ts`, `Digest.svelte`, `state.ts`, `listener.ts`, or `digest-types.ts` changes. ✅
  - `scripts/` untouched: zero files changed under `scripts/`. ✅
  - `readDashboardUrl` NOT deleted from shared — it stays exported (line 72 of `progress-emitter.ts`). The slice only de-duplicates the extension's copy. ✅

### Out-of-scope changes

- **None.** The implementation is scoped precisely to the slice doc and arch spec:
  - Did NOT rewire `digest-log` (that's task 4 of the map — the `digest-log` POST path at line 589 still calls `joinUrl(dashboardUrl, "/api/state")` exactly as before, just via the shared import). ✅
  - Did NOT delete `readDashboardUrl` from shared (it stays, per the slice doc note: "this slice removes the *duplicate now* to close the TS6059 workaround cleanly while the helper still exists"). ✅
  - Did NOT touch the CLI shim or `scripts/`. ✅
  - Did NOT touch `log-tool.test.ts` — and correctly so. The test drives `readDashboardUrl` behavior through `HOME` env + `server-url.json` file presence (behavior-level testing, not direct mocking), so no mock update was needed. The test passes unchanged (5/5). ✅
- **One addition (within scope):** Added `joinUrl-export.test.ts` — a small test verifying the new `joinUrl` export. This is appropriate: the arch spec's seam 1 ("De-duplication seam: `index.ts` has no local `readDashboardUrl`/`joinUrl` definitions; it imports them from shared") implies the shared export must be verified. The test is 4 assertions, no extra dependencies.

### Task doc update needed?

**No.** The implementation matches the arch spec and slice doc exactly. The `## Implementation notes` section (which the land-worker appends to) should note:
- `joinUrl` is now exported from `@pi-aura/shared/digest/progress-emitter` (was private).
- The extension's local `readDashboardUrl` + `joinUrl` duplicates are removed; both imported from shared.
- `log-tool.test.ts` was NOT modified (it tests at the behavior seam, not via direct mocking).
- `readDashboardUrl` remains in shared (not deleted) — it becomes dead code only after task 4 (in-process-fetch) rewires the fetch to not read `server-url.json`.

### User attention needed?

**No.** No API surfaces differ from the spec. Scope did not drift. `digest-log` behavior is unchanged (log-tool.test.ts passes 5/5). The single addition (joinUrl-export test) is within the arch spec's de-duplication seam. The `joinUrl` export matches the arch spec's explicit decision.
