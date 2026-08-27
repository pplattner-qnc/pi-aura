# Architecture spec — atlassian-keyring-auth

Owns pi-aura's Atlassian access: an email + API token in the `@pi-aura/shared`
keyring, sent as HTTP Basic auth to the Rovo MCP server. Replaces the
pi-mcp-adapter OAuth-token read. The Bitbucket fallback reuses the same
credential.

Shared across all slice chains. Seams are the public boundaries under test;
the tdd-worker tests only at these seams. Interface contracts are what later
slices call.

---

## Existing abstractions to use (all slices)

- **`McpClient`** (`scripts/src/mcp-client.ts`) — the HTTP-MCP transport. It
  already takes `authHeader: string` in `McpClientOptions`. **Basic auth needs
  no transport change** — just pass `authHeader: "Basic " + b64(email:token)`.
  Do not write a parallel HTTP client.
- **`Keyring` interface + `createKeyring()` + `FileKeyring(storePath)`**
  (`@pi-aura/shared/keyring`, `packages/shared/src/keyring/`) — the closed
  `SecretKey` union lives in `keyring.ts`; `FileKeyring.KNOWN_SECRET_KEYS` in
  `file-keyring.ts` is the list `listSecrets` probes. `FileKeyring` accepts a
  `storePath` constructor arg → the test seam for round-trip tests.
- **`loadSettings()` / `McpServerNames` / `AuraDigestSettings.bitbucket.workspace`**
  (`scripts/src/settings.ts`) — server names + workspace already live here.
  `settings.aura.mcpServers.atlassian` (default `"atlassian"`) names the MCP
  server; `settings.aura.digest.bitbucket.workspace` is the non-secret
  workspace.
- **`loadMcpConfig(path)`** (`scripts/src/clients.ts`) — already a pure helper
  that reads `~/.config/mcp/mcp.json` with an injectable path. Reuse it to read
  the Atlassian server URL; do not duplicate the reader.
- **`decideEditAction` / `handleEdit` / `parseAuraArgs` / `getArgumentCompletions`**
  (`extensions/aura-secrets.ts`) — the edit flow's pure decision + UI wrapper.
  `decideEditAction` is the testable seam; `handleEdit` wraps it with
  editor+confirm. The extension's tests use `makeMockUi` / `makeMockKeyring`
  fakes — extend that pattern.
- **`buildAtlassianClient`** (`scripts/src/devlinks.ts:330`) — the *consumer*
  wrapper that turns a thrown `atlassianClient()` into
  `{ client: null, warning: "Teamwork Graph dev-links layer skipped: <reason>" }`.
  It already propagates the thrown message into the digest warning. So if
  `atlassianClient` throws "no Atlassian credential in keyring (run
  `/aura secrets edit`)", the digest warning is correct with **no change to
  devlinks.ts**.

## Do NOT reimplement

- Do not fork the keyring — extend the `SecretKey` union and the backends'
  `KNOWN_SECRET_KEYS` list.
- Do not write a new HTTP/MCP client — reuse `McpClient`.
- Do not add a second keyring pair for Bitbucket — one shared Atlassian pair.
- Do not add auto-discovery for the Atlassian credential (Aura discover stays
  Aura-PAT-only).
- Do not register a new slash command — extend `/aura secrets edit`.
- Do not move `defaultWorkspace` into the keyring — it's a non-secret; stays in
  settings.

---

## Slice 1 — keyring-atlassian-secret-keys

**Exports:** two new `SecretKey` union members:
`{ service: "atlassian"; name: "email" }` and
`{ service: "atlassian"; name: "api_token" }`, added to
`packages/shared/src/keyring/keyring.ts`. `KNOWN_SECRET_KEYS` in
`file-keyring.ts` lists both (and the macOS/Secret-Service backends pick them
up via the same `service/name` pair).

**Existing abstractions:** `SecretKey` union, `FileKeyring(storePath)`,
`KNOWN_SECRET_KEYS`.

**Seams (test only here):**
- `FileKeyring` set/get/delete/listSecrets for the two new keys, via the
  `storePath` temp-file seam (mirror how the Aura PAT would be tested; there
  is no existing keyring test file — create `packages/shared/test/keyring.test.ts`
  using `tsx --test` to match the shared package's test runner).

**Interface contract for later slices:** downstream slices import
`SecretKey` and reference the two new members by literal value
`{ service: "atlassian", name: "email" }` / `{ name: "api_token" }`. No new
function is exported — the keyring API is unchanged.

**Notes:** empty-string stored value must round-trip as `""` (callers treat
`""` as "not set"); document this on the new keys. No consumer reads/writes
them yet — that's expected.

---

## Slice 2 — atlassian-basic-auth-client

**Exports:** a `buildAtlassianClient` helper (name reused — but this is the
*real* client constructor; see "Migration note" below) in
`scripts/src/clients.ts`, replacing the current OAuth-keyring `atlassianClient`.
Signature:

```ts
export async function atlassianClient(serverName?: string): Promise<McpClient>
```

It reads `{service:"atlassian",name:"email"}` + `{service:"atlassian",name:"api_token"}`
from `createKeyring()`, reads the server URL from `loadMcpConfig()` for the
server named by `settings.aura.mcpServers.atlassian` (default `"atlassian"`),
and returns `new McpClient({ serverName, url, authHeader: "Basic " + b64(...) })`.

**Existing abstractions:** `McpClient` (transport — unchanged),
`createKeyring()`, `loadMcpConfig(path)`, `loadSettings()`.

**Do NOT reimplement:** the `McpClient` transport; the `loadMcpConfig` reader.

**Seams (test only here):**
- Inject a fake `Keyring` (implement the `Keyring` interface in the test) and a
  temp `mcp.json` via `loadMcpConfig(path)` (the path is already injectable).
- Assert the returned `McpClient`'s configured `authHeader` decodes to
  `${email}:${token}`. Do **not** make a live network call in the unit test
  (live Basic-auth reachability was verified during planning).
- Missing/empty email or token → throws an Error whose message contains
  `run \`/aura secrets edit\``. Missing/non-http server → throws the existing
  "not found / not http" message (preserve it).

**Interface contract for later slices:**
- Slice 4 calls `atlassianClient()` from `clients.ts` (unchanged call site).
- Slice 5 (Bitbucket) calls a shared credential reader. To avoid duplicating
  the keyring read, export a small pure helper from `clients.ts`:
  `readAtlassianCredentials(keyring): { email, token }` that throws the
  `/aura secrets edit` message when either is missing/empty. `atlassianClient`
  and `bitbucket.ts` both use it. (This is the one new internal helper; it has
  ≥2 call sites, so it clears the abstraction bar.)

**Migration note:** the *consumer* wrapper `buildAtlassianClient` in
`devlinks.ts:330` already calls `atlassianClient(serverName)` and converts a
throw into `{client:null, warning}`. Slice 2 keeps that name+signature on the
`clients.ts` side, so `devlinks.ts` is untouched. Slice 4 only *deletes* the
old `readOAuthTokenFromKeyring` implementation and swaps the body.

**Notes:** trim whitespace on read (a trailing editor newline must not break
auth). Do not delete `readOAuthTokenFromKeyring` in this slice (slice 4 does,
after the grep sweep) — this slice rewrites `atlassianClient`'s body and adds
the new helper, building alongside the old code so the tree compiles between
slices.

---

## Slice 3 — aura-secrets-edit-picker

**Exports:** no new public export beyond the existing `auraSecretsExtension`
default export. Internal change: the `secrets-edit` handler gains a chooser.
Add a pure function `pickSecretKey(choice: string): SecretKey | null` (or
extend `parseAuraArgs`) so the chooser→key mapping is unit-testable without a
pi session, mirroring `decideEditAction`.

**Existing abstractions:** `decideEditAction` + `handleEdit` (unchanged),
`ctx.ui.select` / `ctx.ui.editor` / `ctx.ui.confirm`, `createKeyring()`.

**Do NOT reimplement:** `handleEdit` or `decideEditAction` — route the chosen
secret through them as-is.

**Seams (test only here):**
- `pickSecretKey` (pure) → maps "Aura PAT" / "Atlassian email" / "Atlassian
  API token" / cancel to the right `SecretKey` (or null).
- The edit-handler wiring via `makeMockUi` (add `editorResult` to the existing
  fake) + `makeMockKeyring`, asserting each choice writes the right key and
  cancel writes nothing. `handleEdit` itself is already covered — don't
  re-test it; test the chooser routing into it.

**Interface contract for later slices:** none (this is a leaf UI slice).

**Notes:** chooser labels must be distinct — "Atlassian API token", not just
"API token" (disambiguates from the Aura PAT). Prefill placeholders:
`<paste your Atlassian email here>` and `<paste your Atlassian API token here>`.
Do not add a status/list view. `/aura secrets discover` stays Aura-PAT-only.

---

## Slice 4 — digest-script-own-credential

**Exports:** none new. `atlassianClient` in `clients.ts` now uses slice 2's
implementation; `readOAuthTokenFromKeyring` + the `@napi-rs/keyring` import +
chunked-reassembly code are **deleted**.

**Existing abstractions:** slice 2's `atlassianClient` + `readAtlassianCredentials`;
`buildAtlassianClient` in `devlinks.ts` (unchanged — already converts the
thrown message into the digest warning).

**Seams (test only here):**
- The missing-credential warning path: with a fake empty keyring,
  `atlassianClient()` throws the `/aura secrets edit` message, and
  `buildAtlassianClient` (tested directly or via the existing devlinks test
  seam) yields `{ client: null, warning: "Teamwork Graph dev-links layer
  skipped: no Atlassian credential in keyring (run \`/aura secrets edit\`)" }`.
  Assert the warning text, not `invalid_token`.
- The grep sweep is an acceptance check, not a unit test:
  `grep -rn "readOAuthTokenFromKeyring\|pi-mcp-adapter.oauth\|sha256-" scripts/src .pi/extensions/digest-dashboard`
  returns nothing.

**Interface contract for later slices:** slice 5 reuses
`readAtlassianCredentials` (exported in slice 2).

**Notes:** verify the dashboard still renders a digest with a skipped
dev-links layer (the prior `invalid_token` hardening already covers this;
slice 4's warning just changes the text). `devlinks.ts` call sites are
untouched.

---

## Slice 5 — bitbucket-shared-credential

**Exports:** none new. `bitbucket.ts`'s `loadCreds` is refactored to take a
`Keyring` + a `defaultWorkspace: string` (injectable), instead of reading
`mcp.json` env. The live call path (`bbFetch`) constructs the Basic header
from the keyring creds.

**Existing abstractions:** `readAtlassianCredentials` (slice 2),
`loadSettings()` (for `bitbucket.workspace`), the existing `bbFetch` Basic-auth
header construction (unchanged).

**Do NOT reimplement:** the Basic-auth header builder or the Bitbucket REST
paths — only the credential source changes.

**Seams (test only here):**
- `loadCreds` (refactored, injectable `Keyring` + `defaultWorkspace`): with
  keyring populated + workspace set → returns `{email, token, defaultWorkspace}`;
  keyring empty → throws/returns a degrade signal that the caller turns into a
  warning naming `/aura secrets edit`; workspace missing → degrade with a
  workspace-specific warning. No `mcp.json` read in the test.

**Interface contract for later slices:** none (leaf).

**Notes:** do not remove or edit the `atlassian-bitbucket` MCP server entry in
`mcp.json` — that's the user's MCP config. Only the script stops reading its
env. `defaultWorkspace` stays a non-secret in settings (not the keyring).
One `/aura secrets edit` provisions both Jira/TWG and Bitbucket via the shared
credential.

---

## Architecture notes (task doc)

- One shared Atlassian credential (`atlassian/email` + `atlassian/api_token`)
  serves Jira/Teamwork Graph and Bitbucket. `defaultWorkspace` is a non-secret
  in `settings.aura.digest.bitbucket.workspace`.
- The only new internal helper is `readAtlassianCredentials(keyring)` in
  `clients.ts`, shared by `atlassianClient` and `bitbucket.ts` (≥2 call sites).
- `McpClient` transport is unchanged; Basic auth is just a different
  `authHeader` string.
- The consumer wrapper `buildAtlassianClient` (devlinks.ts) is unchanged and
  already propagates the thrown message into the digest warning, so the
  missing-credential warning needs no devlinks change.
- The pi-mcp-adapter keyring-read path is deleted in slice 4 (after grep),
  not left as dead code.
