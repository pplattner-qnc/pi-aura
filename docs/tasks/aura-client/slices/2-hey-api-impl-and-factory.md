---
kind: slice
slug: hey-api-impl-and-factory
title: HeyApiAuraClient impl + createDefaultAuraClient() factory
task: ../task.md
mode: hitl
status: todo
size: m
blocked_by:
  - aura-client-interface
---

## End-to-end behavior

`HeyApiAuraClient` implements `AuraClient` by delegating to the generated
`@hey-api/client-fetch` SDK, mapping domain types <-> generated types
internally. `createDefaultAuraClient()` reads `settings.json` + builds the
keyring + constructs `HeyApiAuraClient` with DI.

## Acceptance criteria

- `HeyApiAuraClient({ keyring: Keyring; baseUrl: string }) implements
  AuraClient`.
- Each of the ~21 methods calls the matching generated SDK function (e.g.
  `getArtifact` -> generated `getArtifact`), passing a `createClient({
  baseUrl, auth: bearer })` configured with the keyring PAT.
- Domain-type <-> generated-type mapping happens inside `HeyApiAuraClient`
  (the `AuraClient` interface never sees generated types).
- `createDefaultAuraClient()`:
  - reads `~/.pi/agent/settings.json` `aura` block for the base URL (new
    `instance`/`baseUrl` field per Q4);
  - `const keyring = await createKeyring();`
  - `const pat = await keyring.getSecret({ service: "aura", name: "pat" });`
  - throws a clear error if the PAT is missing (point the user at `/aura
    secrets discover`);
  - returns `new HeyApiAuraClient({ keyring, baseUrl })`.
- `@hey-api/client-fetch` is in `packages/shared/package.json`
  `dependencies` (single-source per Q27).
- `npm run typecheck` passes; a smoke test constructs the client and calls
  one read method against a real Aura instance (or a fake SDK).

## Test plan

- Seams: inject a fake `Keyring` (returns a test PAT) and a fake
  `createClient`/SDK to unit-test the mapping without hitting Aura.
- Failure modes: missing PAT -> `createDefaultAuraClient()` throws with an
  actionable message; bad base URL -> the first SDK call throws a fetch
  error.
- Scenarios: construct via factory on the dev box (with a real PAT in the
  keyring from `/aura secrets` — or a manually-stored one) and call
  `getMyCapacity()` — returns real data.
- Edge cases: the generated SDK's response shape is `{ data, error,
  response }` — the impl unwraps to the domain type and throws on `error`.

## Constraints / dependencies

- Blocked by `aura-client-interface`.
- Residual: end-to-end smoke needs a stored PAT; if the `/aura secrets`
  task isn't done, manually store a PAT via the keyring for the smoke test.
