---
kind: map
slug: aura-mcp-doc-salvage
title: Salvage the aura-mcp-overhaul docs onto current main + re-implement the review CLI on AuraClient
status: complete
tasks:
- openapi-spec-bump
- aura-review-subcommands
---

## Destination

The aura-mcp-dev overhaul (195 → 90 tools) doc cleanup lands on **current
main** (not the stale v0.3.0 base the original branch used), and the
`aura.mjs artifact review-*` subcommands referenced by the salvaged docs
become real — implemented on main's `AuraClient` (not the dropped `restClient`).

Specifically:
- `packages/shared/openapi/openapi.yaml` is updated to the `openapi-new.yaml`
  the user provided, codegen regenerated, and any breakage reconciled.
- `scripts/src/aura.ts` gains the 6 `artifact review-*` subcommands via
  `AuraClient`, so the doc references are truthful.
- The salvaged skill docs (cleaned of ~30 gone-tool references + 21 newly-exposed
  tools documented) and the `replacement-table.md` audit are committed on top of
  main.

## Constraints

- **Don't reintroduce the dropped `restClient`.** Main's `aura-access-rewrite`
  already migrated the scripts to a typed `AuraClient` (REST codegen + keyring
  PAT). The review subcommands must use `AuraClient` (or its generated
  `HeyApiAuraClient` impl), not a hand-rolled REST helper.
- **Don't duplicate `aura-access-rewrite`.** That initiative already dropped
  `REQUIRED_TOOLS`/`assertToolsAvailable`, migrated the fetcher, removed
  `markAllNotificationsRead` from the digest SKILL.md, and deduped `types.ts`.
  This map does NOT redo any of that — only the spec bump + the review CLI.
- **Keep the salvaged doc prose intact** (including the `aura.mjs artifact
  review-*` references) — the review-subcommands task makes them real rather
  than weakening the docs.
- `openapi-new.yaml` is the user-provided spec (2026-08-21). Use it as the
  codegen input; reconcile any codegen breakage.

## Decisions so far

- The original `aura-mcp-overhaul-update` branch (86 commits) was cut from the
  stale v0.3.0 release and **fully duplicated** main's `aura-access-rewrite`
  initiative (8 tasks, 2026-08-20) at the code layer. Its code (rest-client,
  fetcher migration, review subcommands, test harness) was **dropped** in favor
  of main's `AuraClient`.
- The original branch's **docs were net-new**: main still has ~30 gone-tool
  references across its skill docs that the original branch cleaned to zero,
  plus 21 newly-exposed tools main doesn't document, plus the
  `replacement-table.md` audit. These were salvaged by copying the final doc
  content onto current main.
- 2 doc files (`artifact-management.md`, `review-modes.md`) reference
  `aura.mjs artifact review-*` subcommands that existed only in the dropped
  code → catalogued in `dangling-review-cli-refs.md` → re-implemented by the
  `aura-review-subcommands` task.
- main's `AuraClient` interface has review/approval **types** but no review
  **verbs** on the interface yet → the review-subcommands task adds them (or
  calls the generated `HeyApiAuraClient` methods directly).

## Fog

- Whether to add the review verbs to the `AuraClient` *interface* (clean,
  testable) or call `HeyApiAuraClient`'s generated methods directly from
  `aura.ts` (less ceremony, leaks generated types). Lean: add to the interface
  (matches the `AuraClient` design intent). Confirm in the review-subcommands
  task.

## Out of scope

- Re-doing any of `aura-access-rewrite` (fetcher migration, clients cleanup,
  types dedupe, markAllNotificationsRead removal). Already on main.
- The test harness / vitest setup from the original branch (main has no test
  runner; adding one is a separate concern, not needed for the doc salvage or
  the review CLI).
- `aiSetup`/`getBlueprintFiles`/`systemHealth` docs (one-time admin, out of
  scope per the original map).
