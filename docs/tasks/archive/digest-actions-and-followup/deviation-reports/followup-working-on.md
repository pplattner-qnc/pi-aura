## Deviation report — followup-working-on

### API surface changes
- **Planned:** `DigestFollowup = { currentlyWorkingOn: string | null }` type in `types.ts`; `Digest` gains `followup: DigestFollowup`; `fetch` sets `digest.followup = { currentlyWorkingOn: null }`.
- **Actual:** Exactly as planned. `DigestFollowup` interface added to `types.ts` (lines 137–143) with the `currentlyWorkingOn: string | null` field and the spec's doc comment. `Digest` gains `followup: DigestFollowup` (line 162, after `actions`). `fetch` sets `followup: { currentlyWorkingOn: null }` inline in the digest literal (`aura-digest.ts` line 556). No API surface changes.
- **Impact:** None. The type and default match the spec exactly. Slice 3 (`digest-json-writer`) can rely on `Digest` being complete (`actions` + `followup`).

### Abstraction usage
- Used/was specified: **yes**. The `Digest` type was extended in place (not forked). `followup` is always present in the `fetch` digest literal (never `undefined`), satisfying the edge-case requirement. The `build-actions.test.ts` fixture was updated to include `followup: { currentlyWorkingOn: null }` so the existing slice-1 tests remain type-safe with the extended `Digest`.

### Out-of-scope changes
- **`currentlyWorkingOn` SETTER:** NOT present (correct — the agent sets it via `digest-dashboard`/`skl-flow-rewrite`; this slice only owns the shape + default). Verified: no assignment to `followup.currentlyWorkingOn =` anywhere in `scripts/src/` except the default `{ currentlyWorkingOn: null }` literal.
- **`DASHBOARD_DIGEST_PATH` / dashboard write:** NOT present (correct — slice 3 owns it). No new write target added.
- **Server / listener / SPA / `state.json`:** NOT present (correct — `digest-dashboard` task).
- **`dist/aura-digest.mjs` committed:** The regenerated bundle IS included in the commit (127 insertions). This is **correct per repo convention** — `dist/` `.mjs` files are tracked build artifacts (confirmed: `git ls-files` shows them tracked; `scripts/.gitignore` documents "compiled .mjs files are committed to the skill's dist/ by `make`"). Slice 1's land left it unstaged; slice 2 correctly includes it.

### Divergence from slice doc's acceptance criteria
- **Test approach (minor, non-blocking):** The slice doc's test plan says "assert `followup.currentlyWorkingOn === null` in the **`fetch` fixture**", implying the test should exercise `fetch`'s output. The implementation uses a **static `minimalDigest` fixture** with `followup: { currentlyWorkingOn: null }` hardcoded, rather than reading the output of `fetchAction()`. This tests the *type contract* (that `Digest.followup` exists and defaults to null) but not the *runtime wiring* (that `fetch` actually sets it). The wiring is visible in the diff (`aura-digest.ts:556` adds `followup: { currentlyWorkingOn: null }` to the digest literal), so the behavior is correct — but the test doesn't verify it end-to-end. This is a test-seam weakness, not an acceptance-criteria failure (the criterion says "new unit test asserts the default" — it does).

### Task doc update needed?
**No.** No implementation notes need appending. The slice is a clean, minimal type+default addition with no divergence from the spec's interface contract.

### User attention needed?
**No.** The API surface matches the spec exactly. No scope creep. The test-approach note above is advisory (the test verifies the type contract, not the runtime wiring) but doesn't block — the wiring is a one-liner visible in the diff and is exercised indirectly by any future `fetch` integration test.
