---
kind: task
type: grilling
slug: keyring-key-redesign-grilling
title: Redesign the keyring service/account key surface
map: aura-access-rewrite
status: done
blocked_by: []
size: l
started_at: 2026-08-18T17:15:00Z
completed_at: 2026-08-18T17:55:00Z
---

## Decision to settle

Rework the `src/keyring.ts` **interface itself** (not just the strings we
pass to it). Settled through one-question-at-a-time grilling (25 questions
across 7 rounds). The full settled destination is recorded in the map's
"Second grilling" decisions section.

## Outcome

All 25 branches of the keyring-key design tree visited, nothing silently
assumed. The settled destination:

- `createKeyring()` takes zero args; the app namespace `"aura-skills"` is an
  internal default (adjustable per-OS by each impl).
- Secrets are identified by a closed `SecretKey` enumeration of `{service,
  name}` tuples (starts as `{service:"aura", name:"pat"}`); `name` is a
  per-service union when a service has multiple names.
- Concrete implementations *are* the `Keyring` interface (no separate
  `KeyringBackend` seam); `isAvailable()` is a static per-impl, not on the
  interface.
- The Linux impl is rewritten from `secret-tool` shell-out to a pure-JS
  `dbus-next` Secret Service client (D-Bus handshake + AES/GCM session
  encryption); Windows is dropped from this rewrite; macOS (`security`) and
  file (fallback) stay.
- `keyring.ts` is rewritten from scratch and split by impl
  (`keyring/{macos,secret-service,file}-keyring.ts`).
- Three errors: `KeyringUnavailableError`, `KeyringLockedError`,
  `KeyringDBusError`.
- `dbus-next` is a normal `dependency`, dynamically imported only in the
  `case "linux":` branch of `createKeyring()`'s `process.platform` switch, so
  macOS/file never load its module graph.

Supersedes the first grilling's Q9 placeholder (`pi-aura`/`aura`).

## Downstream work created / adjusted

- The `keyring.ts` rewrite becomes its own feature task (from-scratch,
  split-by-impl, dbus-next Linux, drop Windows + side-index +
  `KeyringBackend`).
- The `AuraClient`/factory task builds on the new `Keyring` interface
  (`getSecret({service:"aura",name:"pat"})`).
- The `/aura secrets` task's `discover`/`edit` operate on the new `Keyring`.
- The `clients.ts` cleanup is unaffected (it's about the MCP path).
