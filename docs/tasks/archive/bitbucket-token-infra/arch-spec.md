# Architecture spec — bitbucket-token-infra

Adds the `atlassian/bitbucket_token` keyring key + a `readBitbucketCredentials`
reader, factoring the shared email read out of `readAtlassianCredentials`.
Extends the just-shipped `atlassian-keyring-auth` pattern; no new abstractions.

---

## Existing abstractions to use

- **`SecretKey` + backends** (`packages/shared/src/keyring/keyring.ts`,
  `file-keyring.ts`, `macos-keyring.ts`, `secret-service-keyring.ts`) — add the
  `atlassian/bitbucket_token` member + `KNOWN_SECRET_KEYS` entry, exactly as
  `atlassian/api_token` was added in the prior task. `FileKeyring(storePath)`
  is the test seam.
- **`readAtlassianCredentials`** (`scripts/src/clients.ts`) — refactor its
  email read into a shared `readAtlassianEmail(keyring)` helper; keep its
  signature + message unchanged (behavior-preserving refactor). Add a sibling
  `readBitbucketCredentials(keyring)` that reads `email` + `bitbucket_token`.
- **Fake `Keyring`** test pattern — mirror `test/atlassian-keyring-auth/clients.test.ts`.

## Do NOT reimplement

- Do not fork the keyring — extend the `SecretKey` union + `KNOWN_SECRET_KEYS`.
- Do not change `readAtlassianCredentials`'s signature or message — only
  refactor its email read into the shared helper.
- Do not wire `bitbucket.ts` or the chooser (the wire task).
- Do not add auto-discovery or a new slash command.
- Keep `SecretKey` a closed union.

---

## Slice 1 — bitbucket-token-key-and-reader

**Exports:**
- New `SecretKey` member `{ service: "atlassian"; name: "bitbucket_token" }` (no
  new function).
- New exported helpers in `scripts/src/clients.ts`:
  - `readAtlassianEmail(keyring): Promise<string>` — reads `atlassian/email`,
    trims, returns `""` if missing/empty. (Both readers call it.)
  - `readBitbucketCredentials(keyring): Promise<{ email, token }>` — reads
    `atlassian/email` (via `readAtlassianEmail`) + `atlassian/bitbucket_token`,
    trims, throws an Error naming `/aura secrets edit` when either is
    missing/empty.
- `readAtlassianCredentials` now calls `readAtlassianEmail` internally;
  signature + message unchanged.

**Seams (test only here):**
- `FileKeyring(storePath)` round-trip for `bitbucket_token` — extend
  `packages/shared/test/keyring.test.ts` with a `bitbucket_token` block
  (set/get/overwrite/delete/empty-string) mirroring the `atlassian/api_token`
  block.
- `readBitbucketCredentials` with a fake `Keyring`: both present →
  `{email, token}`; email/token missing/empty/whitespace → throws the
  `/aura secrets edit` message. No live network call.
- `readAtlassianCredentials` existing tests pass unchanged (behavior-preserving
  email refactor — regression).

**Interface contract for later tasks:**
- `provision-atlassian-pats` (manual) stores the Bitbucket PAT under
  `atlassian/bitbucket_token` (the key now exists) + reads it via
  `readBitbucketCredentials` for the probe.
- `wire-bitbucket-guided-edit` swaps `bitbucket.ts`'s `loadCreds` to call
  `readBitbucketCredentials`.

**Notes:**
- The shared `readAtlassianEmail` means the email-missing message is identical
  in both readers (no duplication). Decide the exact message in the helper:
  the reader throws with the full `/aura secrets edit` guidance; `readAtlassianEmail`
  itself returns `""` (does not throw) so each reader can compose its own
  message — OR `readAtlassianEmail` throws and both readers rethrow/extend.
  Recommended: `readAtlassianEmail` returns `""` (silent), each reader checks
  `if (!email || !token)` and throws the unified message — keeps one throw site
  per reader and one message string.
- Trim whitespace on read (trailing editor newline must not break auth) —
  same contract as the shipped reader.

---

## Architecture notes

- The Bitbucket reader is a sibling to `readAtlassianCredentials`; the email
  read is the shared part (`readAtlassianEmail`).
- `readAtlassianCredentials` is unchanged behavior (same signature, same
  message) — only its internal email read moves to the shared helper.
- No consumer changes in this task (the wire task swaps `bitbucket.ts`; the
  manual task stores + probes). The new key is writable but unused after this
  task — that's expected.
