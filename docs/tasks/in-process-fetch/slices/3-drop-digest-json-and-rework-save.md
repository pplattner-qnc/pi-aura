---
kind: slice
slug: drop-digest-json-and-rework-save
title: Drop ~/.pi/aura/digest.json + temp dir; rework digest-save to write last-digest from the in-memory store
task: ../task.md
mode: afk
status: todo
size: s
blocked_by: [digest-fetch-in-process]
---

## End-to-end behavior

No user-visible change to the dashboard (already in-memory). The in-process
path no longer writes `~/.pi/aura/digest.json` or a temp dir (slice 1/2 already
stopped `fetchAction`/`digest-fetch` from writing them — this slice confirms +
cleans up). `digest-save` is reworked to write `~/.pi/aura/last-digest.json`
from the **in-memory current digest** (`store.getCurrentDigest()`) — no spawn,
no `dir` param. `runAuraDigest` + `resolveAuraDigestScriptPath` + the `spawn`
import are removed from `index.ts` (nothing spawns anymore). The CLI
`saveAction` + shim stay for the CLI path (task 5 deletes them).

## What this slice delivers

- Confirm no in-process write of `~/.pi/aura/digest.json` remains (slice 1 removed it from `fetchAction`; slice 2 didn't add it back). Grep clean for the in-process path.
- `digest-save` `execute`: write `last-digest.json` from `store.getCurrentDigest()` in-process. Drop the `dir` param (`saveToolParameters` → empty `Type.Object({})`). Use a small `saveLastDigest(digest)` helper — export it from the shared core (alongside `fetchAction`) OR implement in the extension (the existing `saveAction` logic: `LastDigestStore { schema_version, presented_at, fetched_at, digest }` → `~/.pi/aura/last-digest.json`). No `runAuraDigest(["save", dir])`. Handle the "no current digest" case (return a clear error — there's nothing to save).
- Remove `runAuraDigest` + `resolveAuraDigestScriptPath` + the `spawn` import from `index.ts` (digest-fetch no longer spawns (slice 2); digest-save no longer spawns). `runAuraDigest`/`SpawnResult` become dead — delete.
- Update the `digest-save` tool `description` (no longer "Pass the directory returned by digest-fetch"; now "Save the current in-memory digest as the last presented digest"). Audit `skills/core/aura-digest/aura-digest.md` for the fetch→save handoff prose; update minimally (in-scope: the handoff changed from dir to in-memory). A full skill-doc rewrite is task 5.
- Tests: rewrite `digest-save` tests to set `store.setCurrentDigest(digest)` then call the tool; assert `last-digest.json` written with that digest; no spawn. Update `fetch-save-tools.test.ts` (no `dir` handoff).

## Acceptance criteria

- No `~/.pi/aura/digest.json` written by the in-process path; no temp dir.
- `digest-save` writes `last-digest.json` from `store.getCurrentDigest()`; no `dir` param; no spawn.
- `runAuraDigest`/`resolveAuraDigestScriptPath`/`spawn` removed from `index.ts`.
- The CLI `aura-digest.mjs save <dir>` still works (the shim's `saveAction` + CLI path untouched — task 5 deletes them).
- Full vitest + typecheck green.

## Test plan

- `digest-save` test: `store.setCurrentDigest(d)`, call tool, assert `last-digest.json` contains `d`; no spawn. "No current digest" case returns an error.
- Grep: no `runAuraDigest`/`resolveAuraDigestScriptPath`/`spawn` in `index.ts`.
- Full vitest + typecheck green; CLI `aura-digest.mjs` still builds + `save` works.

## Constraints and dependencies

- Blocked by slice 2 (digest-fetch must be in-process first).
- Do NOT rewire `digest-log` (task 4 — keep HTTP POST).
- Do NOT delete the CLI shim/bundle/`saveAction` (task 5).
- Do NOT change the digest data model or Svelte view.
