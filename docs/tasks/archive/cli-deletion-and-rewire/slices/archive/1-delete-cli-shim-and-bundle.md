---
kind: slice
slug: delete-cli-shim-and-bundle
title: Delete the aura-digest CLI shim + bundle + esbuild entry; keep aura.mjs; delete orphaned keyring.ts + profile-fetch.mjs
task: ../task.md
mode: afk
status: todo
size: m
blocked_by: []
---

## End-to-end behavior

No user-visible change to the in-process tools (tasks 2–4 done). The `aura-digest` CLI is gone: the shim (`scripts/src/aura-digest.ts`), the committed bundle (`skills/core/aura-digest/dist/aura-digest.mjs`), and the esbuild entry that builds it are deleted. The `aura` skill's bundle (`aura.mjs`) stays. The orphaned `scripts/src/keyring.ts` (dead since core-move) + `scripts/profile-fetch.mjs` (ran the deleted bundle) are removed. `scripts` typecheck + the `aura.mjs` build still pass.

## What this slice delivers

- Delete `scripts/src/aura-digest.ts` (git rm).
- Delete `skills/core/aura-digest/dist/aura-digest.mjs` (git rm — committed).
- `scripts/esbuild.config.mjs`: remove the `aura-digest` entry (entryPoints `src/aura-digest.ts` → `skills/core/aura-digest/dist/aura-digest.mjs`). **Keep the `aura` entry** (`src/aura.ts` → `skills/core/aura/dist/aura.mjs`).
- `scripts/package.json`: update the stale `description` ("Deterministic Aura digest fetch + render script" — the digest CLI is gone; the `aura` skill's bundle is the main thing now). Keep the `build` script (`node esbuild.config.mjs` still builds `aura.mjs`). Audit deps: remove `@modelcontextprotocol/sdk` ONLY if nothing in `scripts/src/` (aura.ts/rest-*) still uses it — check before removing.
- `scripts/src/keyring.ts`: delete (orphaned since core-move — 601 lines, zero importers; confirm zero importers with grep first). This is the cleanup the core-move task deferred.
- `scripts/profile-fetch.mjs`: it runs the deleted `aura-digest.mjs` bundle for profiling → delete. Check whether anything references it (Taskfile.yml, docs) first; if so, update those references.
- Confirm `scripts` typecheck + `node esbuild.config.mjs` (builds `aura.mjs` only) pass after the shim's removal.

## Acceptance criteria

- No `scripts/src/aura-digest.ts`; no `skills/core/aura-digest/dist/aura-digest.mjs`.
- `scripts/esbuild.config.mjs` builds only `aura.mjs` (no `aura-digest` entry).
- `scripts/src/keyring.ts` + `scripts/profile-fetch.mjs` deleted.
- `scripts` typecheck + `aura.mjs` build green; `scripts/package.json` description updated.
- Full vitest + shared typecheck green (the shared core is unchanged this slice; the deletion is scripts-side).

## Test plan

- Grep: no `scripts/src/aura-digest.ts`; no `dist/aura-digest.mjs`; no `aura-digest` entry in esbuild config.
- `cd scripts && npx tsc --noEmit` clean; `cd scripts && node esbuild.config.mjs` builds `aura.mjs` only.
- Full vitest + shared `tsx --test` green.

## Constraints and dependencies

- Do NOT delete `scripts/src/aura.ts` or the `aura.mjs` bundle (separate skill).
- Do NOT remove shared-core exports yet (slice 2 — the shim's imports).
- Do NOT rewrite the skill doc (slice 3).
- Do NOT touch the in-process tools/store/server.
