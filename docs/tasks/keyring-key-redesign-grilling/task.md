---
kind: task
type: grilling
slug: keyring-key-redesign-grilling
title: Redesign the keyring service/account key surface
map: aura-access-rewrite
status: in-progress
blocked_by: []
started_at: 2026-08-18T17:15:00Z
---

## Decision to settle

The `AuraClient`, the `/aura secrets` command, and the `createDefaultAuraClient()`
factory all depend on how the keyring keys a secret — the `(service, account)`
tuple. The first grilling parked this as "use `service="pi-aura"`,
`account="aura"` for now, but we may rework that surface soon." This task
settles, through one-question-at-a-time grilling, **the real keyring-key
surface** before any implementation task builds on it.

The decision has these interlocking parts:

1. **`service` value** — is it the package identity (`pi-aura`), the instance
   base URL, a fixed app name, or something else? Does it vary per instance?
2. **`account` value(s)** — is it a fixed name (`aura`), the instance
   hostname, a user-chosen label, or something else? How many accounts per
   service?
3. **Multi-instance support** — do we need to store PATs for >1 Aura instance
   (e.g. a dev + a prod), and if so, how does `AuraClient` pick which account
   to read (the `settings.json` `aura.instance` field selects it)?
4. **Relationship to `src/keyring.ts`'s API** — the keyring binds `service` at
   `createKeyring(service)` and methods take `account`. Does that API stay as
   is, or does the Aura access layer want a different shape (e.g. a typed
   `AuraSecrets` wrapper that hides the raw `service`/`account` from the
   scripts and the `/aura secrets` command)?
5. **Migration from the parked placeholder** — if the settled surface differs
   from `pi-aura`/`aura`, does `/aura secrets discover`/`edit` also migrate
   any placeholder entry, or do we just start fresh (the placeholder was
   never shipped)?

## Parent decisions it depends on

- The map's constraint that `src/keyring.ts` is the credential store (no new
  native bindings) and that its API is `createKeyring(service)` +
  `getSecret(account)` / `setSecret` / `deleteSecret` / `listSecrets`.
- The settled decision (Q9) to use `pi-aura`/`aura` *for now*, flagged as
  likely-to-rework — this task is that rework.
- The settled decision (Q4) that the instance base URL comes from
  `settings.json`'s `aura` block — the account-selection mechanism (if
  multi-instance) likely reuses that field.
- The settled decision (Q8) that `AuraClient` owns expressive domain types —
  a typed `AuraSecrets` wrapper (if chosen) would be one such type.
- The settled decision (Q6) that `/aura secrets discover` uses an extensible
  discovery-source pattern — the keyring is one (the destination) source,
  and the account it writes to is what this task decides.

## Choices already known

- **`service`:** (a) `"pi-aura"` (package identity, stable across instances);
  (b) the instance base URL (one entry per instance, tied to a URL);
  (c) a fixed app name like `"aura"`.
- **`account`:** (a) `"default"` or `"aura"` (single, simple);
  (b) the instance hostname (e.g. `"aura.dev-anwalt.de"`);
  (c) a user-chosen label.
- **Multi-instance:** (a) not now, one entry;
  (b) yes, `settings.json` `aura.instance` selects the account.
- **API shape:** (a) keep `createKeyring(service)` as the surface, scripts
  call `getSecret(account)` directly with the settled strings;
  (b) add a typed `AuraSecrets` wrapper (built by the factory) that hides the
  raw strings and exposes `getPat()` / `setPat()` / `editPat()`, so the
  settled key is an internal constant.

## Recommended starting answer

- **`service`:** `"pi-aura"` (package identity) — stable, not coupled to a
  URL, matches the map's parked value.
- **`account`:** the **instance hostname** derived from the `settings.json`
  `aura.instance` base URL (e.g. `new URL(baseUrl).host`). One entry per
  instance, naturally; no extra config field needed beyond what Q4 already
  added.
- **Multi-instance:** yes — `settings.json` `aura.instance` both picks the
  base URL *and* derives the keyring account, so the factory reads one field
  and gets both.
- **API shape:** a typed `AuraSecrets` wrapper — `getPat()` / `setPat()` /
  `hasPat()` — built by `createDefaultAuraClient()`, hiding `pi-aura` +
  hostname behind a method. The `/aura secrets` command operates on
  `AuraSecrets`, never the raw keyring. The settled strings become internal
  constants in one file.
- **Migration:** start fresh — the `pi-aura`/`aura` placeholder was never
  shipped (it only exists in the not-yet-built code), so no migration step.

This is a starting point only. Each sub-decision must be confirmed one
question at a time; do not answer on the user's behalf.

## What downstream work the answer may create

- Adjusts the shape of **every** implementation task downstream:
  - The `AuraClient`/factory task builds `AuraSecrets` (if chosen) and reads
    the account from the instance hostname (if chosen).
  - The `/aura secrets` task's `discover`/`edit` operate on `AuraSecrets`.
  - The `clients.ts` cleanup is unaffected (it's about the MCP path).
- If multi-instance is chosen, a `/aura secrets list` (deferred in the first
  grilling) may become worth adding now — to surface which instances have a
  stored PAT. Possibly promotes out of Fog.
- If the settled surface differs from `pi-aura`/`aura`, update the map's
  Q9 decision line to the settled value.
