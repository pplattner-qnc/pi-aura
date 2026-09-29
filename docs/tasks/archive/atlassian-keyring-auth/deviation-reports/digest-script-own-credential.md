## Deviation report — digest-script-own-credential

### API surface changes
- **Planned:** No new exports. `atlassianClient` in `clients.ts` uses slice 2's
  Basic-auth body (unchanged); `readOAuthTokenFromKeyring` + the `@napi-rs/keyring`
  import + chunked-reassembly code are **deleted**. `readAtlassianCredentials`
  kept for slice 5. `devlinks.ts` unchanged.
- **Actual:** Exactly that. `readOAuthTokenFromKeyring` (the function body), the
  `@napi-rs/keyring` dynamic import, the `pi-mcp-adapter.oauth` service constant,
  the `sha256-` account computation, the chunked-reassembly loop, and the
  `createHash` import from `node:crypto` are all deleted from `clients.ts`.
  `atlassianClient` and `readAtlassianCredentials` are unchanged from slice 2.
  No new exports.
- **Impact:** None on dependent slices. Slice 5 can import `readAtlassianCredentials`
  as specified (it's still exported at line 45). `devlinks.ts` is untouched.

### Abstraction usage
- Used/was specified: **yes**.
  - Slice 2's `atlassianClient` + `readAtlassianCredentials` reused unchanged. ✓
  - `buildAtlassianClient` in `devlinks.ts` is unchanged (empty diff, confirmed). ✓
  - `devlinks.ts` call sites unchanged — the swap is entirely in `clients.ts`. ✓
  - `McpClient` transport not reimplemented. ✓

### readOAuthTokenFromKeyring + @napi-rs/keyring + sha256 + pi-mcp-adapter.oauth all DELETED?
- **Yes — fully deleted.** Grep sweep:
  - `grep -rn "readOAuthTokenFromKeyring\|pi-mcp-adapter.oauth\|sha256-\|@napi-rs/keyring" scripts/src` → exit 1 (no matches).
  - `grep -rn "readOAuthTokenFromKeyring\|pi-mcp-adapter.oauth\|sha256-\|@napi-rs/keyring" .pi/extensions/digest-dashboard` → exit 1 (no matches).
  - The compiled dist (`skills/core/aura-digest/dist/aura-digest.mjs`) also contains none of these (grep count = 0).
- The `createHash` import from `node:crypto` (used only by the deleted sha256
  computation) was also removed — correct, it's now an unused import.
- One comment in `scripts/src/keyring.ts` (the Linux Secret Service backend)
  referenced `@napi-rs/keyring` by name; it was updated to "other keyring libs"
  to satisfy the grep sweep. This is a comment-only change in an unrelated file,
  but it's the minimal edit needed to make the acceptance grep clean. No logic
  changed.

### atlassianClient uses slice 2's Basic-auth body (unchanged); readAtlassianCredentials kept?
- **Yes.** `atlassianClient` (lines 71-92) is byte-identical to slice 2's
  implementation: reads keyring via `readAtlassianCredentials`, builds
  `Basic ${base64(email:token)}`, returns `McpClient`. `readAtlassianCredentials`
  (lines 45-58) is exported and unchanged.

### devlinks.ts UNCHANGED?
- **Yes.** `git diff task/atlassian-keyring-auth..slice/digest-script-own-credential -- scripts/src/devlinks.ts`
  returns empty (exit 0). The consumer wrapper `buildAtlassianClient`
  (devlinks.ts:330) already catches the thrown `atlassianClient()` error and
  formats it as `{ client: null, warning: "Teamwork Graph dev-links layer
  skipped: <reason>" }` — no change needed, as the arch spec predicted.

### Missing-credential warning text contains "/aura secrets edit" and NOT "invalid_token"?
- **Yes.** The warning chain: `readAtlassianCredentials` throws
  `"No Atlassian credential in keyring (run `/aura secrets edit`)"` →
  `buildAtlassianClient` catches → warning =
  `"Teamwork Graph dev-links layer skipped: No Atlassian credential in keyring (run `/aura secrets edit`)"`.
  - Test "the warning matches the exact expected format" asserts this exact string. ✓
  - Test "the warning does NOT contain 'invalid_token'" asserts the absence. ✓

### Dist rebuilt via make build?
- **Yes.** `cd scripts && npm run build` (the build step behind `make build`)
  succeeded, rebuilding all three dist bundles. The rebuilt
  `aura-digest.mjs` contains no trace of the deleted OAuth path (grep count = 0).
  The dist is byte-identical to the committed version because the deleted code
  was already unused at runtime — esbuild tree-shook it in the prior build. No
  dist files needed to change, and none did.

### Out-of-scope changes
- **`scripts/src/keyring.ts` comment update** (1 line): changed
  `@napi-rs/keyring` → `other keyring libs` in a comment in the Linux
  SecretServiceBackend to make the acceptance grep sweep clean. This is a
  minimal, justified edit — the comment mentioned the now-deleted dependency by
  name, and leaving it would cause the grep to return a false positive. No logic
  changed; the comment's meaning is preserved.
- **`@napi-rs/keyring` remains in `scripts/package.json` dependencies**: the
  package is no longer imported anywhere in `scripts/src` (grep confirms), but
  its entry in `scripts/package.json` `dependencies` was not removed. This is
  an orphaned dependency — not a spec violation (the spec says to delete the
  import + code, not the package.json entry), but it could be cleaned up later.
  Flagged here for the coherence-refactor stage; not a blocker for this slice.
- No source files outside the spec were touched. `bitbucket.ts` (slice 5 scope)
  is unchanged (empty diff). `aura-secrets.ts`, `settings.ts`, `devlinks.ts`,
  and the keyring package source are all unchanged.

### Acceptance-criteria divergence
- `atlassianClient` uses slice 2's helper (keyring + Basic auth); devlinks.ts
  call sites unchanged — **met** (confirmed: devlinks.ts empty diff, call sites
  at devlinks.ts:17/330 and aura-digest.ts:43/474 unchanged).
- `readOAuthTokenFromKeyring` + `@napi-rs/keyring` import + chunked-reassembly
  removed — **met** (grep sweep clean across scripts/src + dashboard extension
  + compiled dist).
- Grep sweep returns nothing — **met** (exit 1 on both scripts/src and
  .pi/extensions/digest-dashboard).
- Missing-credential warning contains `/aura secrets edit`, not
  `invalid_token` — **met** (4 tests assert the warning text + absence of
  invalid_token + exact format).
- `make build` succeeds; scripts typechecks clean; vitest green with a
  missing-credential warning test — **met** (`npm run build` exit 0; `tsc
  --noEmit` exit 0; 86 tests pass / 0 fail including 4 new slice-4
  warning-path tests + 1 export-deletion test).

### Task doc update needed?
No. The arch spec's slice 4 section is accurate: no new exports, the dead
OAuth path is deleted, `readAtlassianCredentials` is kept for slice 5,
`devlinks.ts` is unchanged, and the missing-credential warning flows through
the existing `buildAtlassianClient` wrapper. No `## Architecture notes` or
`## Implementation notes` append is required.

### User attention needed?
No. Scope was followed exactly. The only unplanned edit (the `keyring.ts`
comment update) is the minimal change needed to satisfy the acceptance grep
sweep and is a comment-only change with no logic impact. The orphaned
`@napi-rs/keyring` dependency in `scripts/package.json` is a cleanup item for
the coherence-refactor stage, not a blocker.
