## Deviation report — bitbucket-token-key-and-reader

### API surface changes

- **Planned:** New `SecretKey` member `{ service: "atlassian"; name: "bitbucket_token" }` (no new function); new exported helpers `readAtlassianEmail(keyring): Promise<string>` and `readBitbucketCredentials(keyring): Promise<{email,token}>` in `scripts/src/clients.ts`; `readAtlassianCredentials` behavior-preserving (same signature + message, only its email read moves to the shared helper).
- **Actual:** Exactly that.
  - `SecretKey` union in `packages/shared/src/keyring/keyring.ts` adds `{ service: "atlassian"; name: "bitbucket_token" }` with the empty-string contract comment. No new function on the keyring API.
  - `readAtlassianEmail(keyring)` exported — reads `atlassian/email`, trims, returns `""` if missing/empty (never throws). Matches the arch spec's recommended design.
  - `readBitbucketCredentials(keyring)` exported — reads `atlassian/email` via `readAtlassianEmail` + `atlassian/bitbucket_token`, trims, throws an Error naming `/aura secrets edit` when either is missing/empty.
  - `readAtlassianCredentials` signature unchanged (`(keyring: Keyring): Promise<{email,token}>`); its internal email read now calls `readAtlassianEmail`; message unchanged (`"no Atlassian credential in keyring (run \`/aura secrets edit\`)"`).
- **Impact:** None on dependent tasks. `provision-atlassian-pats` (manual) can store under `atlassian/bitbucket_token` and read via `readBitbucketCredentials` for the probe. `wire-bitbucket-guided-edit` can swap `bitbucket.ts`'s `loadCreds` to call `readBitbucketCredentials`. The interface contract holds.

### Abstraction usage

- Used/was specified: **yes**.
  - Extended the existing `SecretKey` union (closed union, not forked to `string`). ✓
  - `KNOWN_SECRET_KEYS` in **all three** backends (`file-keyring.ts`, `macos-keyring.ts`, `secret-service-keyring.ts`) lists the new key — no per-backend special casing. ✓
  - `readAtlassianEmail` is shared by **both** `readAtlassianCredentials` (line 57) and `readBitbucketCredentials` (line 76) — no duplicated email-read logic or duplicated email-missing message. ✓
  - `FileKeyring(storePath)` test seam used for the round-trip test; fake `Keyring` used for the reader test (mirrors the prior task's `test/atlassian-keyring-auth/clients.test.ts` pattern). ✓
  - Keyring was not forked; `McpClient` was not touched. ✓

### Out-of-scope changes

- **None.** The committed slice diff touches exactly 7 files, all in scope:
  - `packages/shared/src/keyring/keyring.ts` (enum)
  - `packages/shared/src/keyring/{file,macos,secret-service}-keyring.ts` (KNOWN_SECRET_KEYS)
  - `packages/shared/test/keyring.test.ts` (round-trip tests)
  - `scripts/src/clients.ts` (helpers)
  - `test/bitbucket-token-infra/clients.test.ts` (reader tests)
- No consumer files (`scripts/src/bitbucket.ts`, `scripts/src/devlinks.ts`, `extensions/aura-secrets.ts`, `scripts/src/aura-digest.ts`) were touched. No chooser changes, no auto-discovery, no new slash command. The Aura PAT key and existing keyring behavior are unchanged.

### Acceptance-criteria divergence

- `SecretKey` adds `{ service: "atlassian"; name: "bitbucket_token" }` with the empty-string contract comment — **met** (keyring.ts, 4-member union now; comment present).
- `KNOWN_SECRET_KEYS` in all three backends lists it — **met** (file/macos/secret-service all updated).
- `readBitbucketCredentials` exported: reads email + bitbucket_token, trims, throws `/aura secrets edit` when either missing/empty — **met** (line 65-86; 8 tests cover both-present, trim, email/token missing/empty/whitespace/both-missing).
- `readAtlassianEmail` factored out; both readers call it; email-missing message identical (no duplication) — **met** (line 45; called at 57 + 76; `readAtlassianEmail` returns `""` silently, each reader composes the unified throw — exactly the arch spec's recommended design).
- `readAtlassianCredentials` existing tests pass unchanged — **met** (the 9 `readAtlassianCredentials` references in `test/atlassian-keyring-auth/clients.test.ts` still pass; full vitest suite 108 tests green; the email refactor is behavior-preserving — signature + message byte-identical).
- `keyring.test.ts` gains a `bitbucket_token` round-trip block (set/get/overwrite/delete/empty-string) — **met** (6 new tests + the `listSecrets` test updated from 3 keys to 4 keys, asserting the new key is listed).
- New clients test for `readBitbucketCredentials` (fake keyring): both present → `{email,token}`; email/token missing/empty/whitespace → throws `/aura secrets edit`; no live network call — **met** (`test/bitbucket-token-infra/clients.test.ts`, 13 tests: 5 for `readAtlassianEmail` + 8 for `readBitbucketCredentials`; no network call).
- `make build` succeeds; `packages/shared` + `scripts` typecheck clean; `tsx --test` + `vitest run` green — **met** (`npm run build` exit 0; both `tsc --noEmit` exit 0; `tsx --test` 30 pass/0 fail; `vitest run` 108 pass/0 fail across 14 files).

### Note on dist files (not a deviation)

- The `npm run build` step (run during verification) regenerated the committed dist bundles (`skills/core/aura-digest/dist/aura-digest.mjs`, `skills/core/aura/dist/aura.mjs`, `.pi/skills/engineering-sync/dist/engineering-sync.mjs`) to pick up the new `bitbucket_token` entry in the bundled `KNOWN_SECRET_KEYS`. This is the normal `make build` step — the dist changes are the compiled output of the `KNOWN_SECRET_KEYS` addition (verified: the diff adds exactly the `{ service: "atlassian", name: "bitbucket_token" }` line to the inlined keyring arrays). The tdd-worker did **not** commit these dist files; they are unstaged working-tree changes from the verification build. The land-worker should commit them as part of the slice landing (consistent with the prior task's pattern where dist rebuilds accompany source changes).

### Task doc update needed?

No. The arch spec's slice 1 section is accurate: the exports, seams, and interface contract all hold. The `readAtlassianEmail` design (returns `""` silently, each reader throws the unified message) matches the arch spec's recommended approach. No `## Architecture notes` or `## Implementation notes` append is required.

### User attention needed?

No. Scope was followed exactly; the API surface matches the spec. The only unplanned-but-expected artifact is the dist rebuild from the verification `make build` — the land-worker should commit those three dist files alongside the source changes.
