## Deviation report — wire-bitbucket-reader

### bitbucket.ts loadCreds uses readBitbucketCredentials (bitbucket_token), not readAtlassianCredentials? Basic-auth header + REST paths unchanged?

- **Yes — confirmed.** `scripts/src/bitbucket.ts` line 12 imports
  `readBitbucketCredentials` (not `readAtlassianCredentials`); line 35 calls
  `readBitbucketCredentials(keyring)` which reads `atlassian/email` +
  `atlassian/bitbucket_token`. The module comment (lines 3–4) was updated to
  document the `bitbucket_token` key.
- **Basic-auth header unchanged**: line 45 is byte-identical to the prior task
  — `Authorization: "Basic " + Buffer.from(`${creds.email}:${creds.token}`).toString("base64")`.
  Only the token *source* changed, not the header construction.
- **REST paths unchanged**: `/repositories/${workspace}`, `.../pullrequests`,
  `.../refs/branches` are byte-identical; the `api.bitbucket.org/2.0` base URL
  is unchanged. `bbFetch`, `listWorkspaceRepos`, `searchRepoPRs`,
  `searchRepoBranches` are untouched.

### atlassianClient / readAtlassianCredentials unchanged?

- **Yes — confirmed.** `git diff e7cdb2be..slice/wire-bitbucket-reader -- scripts/src/clients.ts`
  returns empty (exit 0). `atlassianClient` still uses `readAtlassianCredentials`
  (Teamwork Graph, `api_token`); `readAtlassianCredentials` is unchanged. The
  slice did not touch the Teamwork Graph path.

### The two layers degrade INDEPENDENTLY (each its own /aura secrets edit warning, no shared message)? Tested?

- **Yes — confirmed and tested.** `scripts/src/devlinks.ts` (line 270) calls
  `readBitbucketCredentials(keyring)` in the Bitbucket Layer 3 pre-check; on
  throw it pushes `Bitbucket dev-links layer skipped: <reason>` into `errors`.
  The Teamwork Graph layer's `buildAtlassianClient` (unchanged) calls
  `atlassianClient` → `readAtlassianCredentials`; on throw it yields
  `Teamwork Graph dev-links layer skipped: <reason>`. The two warnings are
  distinguishable (one says "Bitbucket", the other "Teamwork Graph"); there is
  no shared "no Atlassian credential" message that conflates them.
- **Tested** (`test/wire-bitbucket-reader/wire-bitbucket-reader.test.ts`, 12
  tests, all passing): the per-layer independence `describe` block covers all
  spec scenarios:
  - both tokens present → both layers resolve (warnings null);
  - only `bitbucket_token` → Bitbucket resolves, Teamwork Graph skips with its
    own `Teamwork Graph dev-links layer skipped` + `/aura secrets edit` warning;
  - only `api_token` → TWG resolves, Bitbucket skips with its own
    `Bitbucket dev-links layer skipped` + `/aura secrets edit` warning;
  - both missing → both skip, each with its own warning; the test explicitly
    asserts `bb.warning !== twg.warning`, that the Bitbucket warning does NOT
    mention "Teamwork Graph", and the TWG warning does NOT mention "Bitbucket";
  - email missing but both tokens present → both skip (email is shared),
    both warnings contain `/aura secrets edit`.
- The `loadCreds` `describe` block (7 tests) asserts it reads `bitbucket_token`
  (not `api_token`): with both tokens present the returned `creds.token` is the
  Bitbucket token; it resolves with only `bitbucket_token` present; it throws
  `/aura secrets edit` when `bitbucket_token` is missing even if `api_token` is
  present; whitespace trimming; empty-workspace workspace-specific warning.

### Out-of-scope additions / divergence from acceptance criteria

- **None.** The diff is exactly 5 files:
  - `scripts/src/bitbucket.ts` — the reader swap + comment update (8 lines).
  - `scripts/src/devlinks.ts` — the Layer 3 pre-check swap to
    `readBitbucketCredentials` (4 lines: import + the call site).
  - `skills/core/aura-digest/dist/aura-digest.mjs` — committed dist rebuild
    (18 lines), the compiled output of the source changes (normal `make build`).
  - `test/wire-bitbucket-reader/wire-bitbucket-reader.test.ts` — new test file
    (377 lines, 12 tests).
  - `test/atlassian-keyring-auth/bitbucket.test.ts` — pre-existing bitbucket
    test updated to use `bitbucket_token` instead of `api_token` (25 lines).
- No out-of-scope source changes: `clients.ts`, `aura-secrets.ts`, `settings.ts`,
  `keyring` package, `mcp-client.ts` are all untouched (empty diffs confirmed
  for `clients.ts` and `aura-secrets.ts`). No chooser or guided-mode changes
  (those are later slices). No new slash command, no auto-discovery.

### Acceptance-criteria divergence

| Criterion | Status |
|---|---|
| `loadCreds` calls `readBitbucketCredentials` (reads `bitbucket_token`); Basic-auth header + REST paths unchanged | **met** (bitbucket.ts:35; header line 45 byte-identical; paths unchanged) |
| `atlassianClient` still uses `readAtlassianCredentials` — unchanged | **met** (clients.ts empty diff) |
| Bitbucket token missing → Bitbucket skip + `/aura secrets edit` warning, distinguishable from TWG, no unhandled throw, TWG unaffected | **met** (devlinks.ts pre-check; test asserts) |
| TWG token missing but Bitbucket present → TWG skips, Bitbucket resolves (independent) | **met** (test "only api_token → TWG resolves, Bitbucket skips" and its inverse) |
| `make build` succeeds; typecheck clean; vitest green with the independence tests | **met** (build exit 0; scripts+shared typecheck exit 0; 120 tests pass across 15 files) |

### Task doc update needed?

No. The arch spec's Slice 1 section is accurate: no new exports, `loadCreds`
swaps to `readBitbucketCredentials`, the two layers degrade independently, the
seams (injectable `loadCreds` + fake keyring + the degrade wrappers) are used
as described. No `## Architecture notes` or `## Implementation notes` append
is required.

### User attention needed?

No. Scope was followed exactly; the API surface matches the spec. The only
unplanned artifact is the committed dist rebuild
(`skills/core/aura-digest/dist/aura-digest.mjs`), which is the normal `make build`
output of the source changes — not an out-of-scope source change. The
pre-existing `test/atlassian-keyring-auth/bitbucket.test.ts` was updated to
match the new token key; this is a necessary in-scope fix (the test would
otherwise fail against the swapped reader), not a divergence.
