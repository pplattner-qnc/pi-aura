## Deviation report — keyring-atlassian-secret-keys

### API surface changes
- **Planned:** Two new `SecretKey` union members — `{ service: "atlassian"; name: "email" }` and `{ service: "atlassian"; name: "api_token" }` — added to `packages/shared/src/keyring/keyring.ts`. No new functions exported; the keyring API unchanged.
- **Actual:** Exactly that. `SecretKey` is now a 3-member union; no new functions or exports were added. The interface contract for downstream slices (reference the two members by literal value) holds.
- **Impact:** None on dependent slices — slice 2 imports `SecretKey` and references the new members by literal, as the spec describes.

### Abstraction usage
- Used/was specified: **yes**. Extended the existing `SecretKey` union in `keyring.ts` and the `KNOWN_SECRET_KEYS` list in all three backends (`file-keyring.ts`, `macos-keyring.ts`, `secret-service-keyring.ts`). The keyring was not forked; no new keyring implementation was introduced. The `FileKeyring(storePath)` test seam was used as specified.

### Out-of-scope changes
- None. No consumer files (`scripts/src/*`, `extensions/*`, `devlinks.ts`, `clients.ts`, `bitbucket.ts`) were touched. The diff is exactly 5 files: 4 keyring source files + 1 new test file. The Aura PAT key and existing keyring behavior are unchanged.

### Acceptance-criteria divergence
- `SecretKey` union adds both members — **met** (keyring.ts, 3-member union).
- `KNOWN_SECRET_KEYS` includes both in `file-keyring.ts` — **met**.
- macOS and Secret Service backends enumerate by the same `service/name` pair — **met** (both `KNOWN_SECRET_KEYS` lists updated, no per-backend special casing).
- Round-trip test via `FileKeyring` test seam — **met** (`packages/shared/test/keyring.test.ts`, 18 tests covering set/get/overwrite/delete/missing/empty-string for both new keys + the Aura PAT regression).
- `packages/shared` typechecks and existing tests green — **met** (`tsc --noEmit` exit 0; `tsx --test` 54 pass / 0 fail, including the 36 pre-existing review/blueprint tests).
- Empty-string contract documented on the new keys — **met** (inline comments on both new `SecretKey` members; the test "empty string round-trips as empty string" covers it for all three keys).

### Task doc update needed?
No. The arch spec's slice 1 interface contract and notes are accurate; no `## Architecture notes` or `## Implementation notes` append is required.

### User attention needed?
No. Scope was followed exactly; the API surface matches the spec.
