---
kind: task
type: feature
slug: cli-deletion-and-rewire
title: Delete the aura-digest CLI bundle + esbuild config; rewire skills/docs/tests off it
map: in-process-aura-digest
status: done
blocked_by:
- core-move
- in-process-fetch
- in-process-log-save
slices:
- 1-delete-cli-shim-and-bundle
- 2-drop-dead-shared-exports
- 3-rewrite-skill-doc-and-tests
---

## User-visible outcome

The `aura-digest` CLI is gone: `main()`, `process.argv`/`stdout`/`exit`, the
committed `dist/aura-digest.mjs` bundle, and the `scripts/esbuild.config.mjs`
that builds it are deleted. Anything that invoked the bundle — the
`aura-digest` skill doc, other docs, and tests — goes through the in-process
tools instead. The `scripts/` project shrinks to whatever non-CLI tooling
remains (or is itself removed if empty).

## Scope boundaries

- In: delete `main()` + the CLI dispatch (`fetch`/`render`/`save`/`diff`/
  `last`/`cleanup` actions), `process.argv`/`stdout`/`exit`, `fail()`'s
  `process.exit`, the `dist/aura-digest.mjs` bundle, `scripts/esbuild.config.mjs`
  (if it only built the bundle); rewire `skills/core/aura-digest/aura-digest.md`
  and any other doc/skill that invokes `aura-digest.mjs` to use the tools;
  update tests that spawn the bundle.
- Out: the in-process tools (tasks 2–4), the core logic (task 1 moves it;
  this task deletes the CLI shim that called it). Any wider skill
  choreography redesign (collect as friction).

## Acceptance criteria

- No `aura-digest.mjs` bundle exists or is built; no `esbuild.config.mjs`
  for it; `scripts/package.json` `build` script updated or removed.
- No code path uses `process.argv`/`process.stdout`/`process.exit` for the
  digest flow (the `fail()` helper becomes a throw or is deleted).
- The `aura-digest` skill doc references only the in-process tools (no
  `aura-digest.mjs` path); any other invoking doc/skill audited and rewired.
- A friction log records anything that wanted wider skill-choreography
  redesign (turned into a separate map/task if warranted, not absorbed).
- All tests pass; no test spawns `aura-digest.mjs`.

## Existing abstractions to use

- The in-process tools (tasks 2–4) — the skill doc points at them.
- `submit_feedback` to record friction points discovered during the rewire.

## Slice intent (planned in a later pass)

- Likely: (a) delete the CLI shim + bundle + esbuild config; (b) rewire
  the skill doc + audit other invokers; (c) update/rewrite tests; (d)
  friction log + dead-code sweep (incl. the `c80ef96d`/`e56e96ec` lifecycle
  fixes that are now dead code).

## Implementation notes

_The land-worker appends a per-slice note here as each slice lands._

### slice 2 — drop-dead-shared-exports

Deleted `packages/shared/src/digest/progress-emitter.ts` (`createProgressEmitter`/`readDashboardUrl`/`joinUrl`/`defaultServerUrlPath` — CLI-era) + `write-dashboard-digest.ts` + their tests (`aura-digest-progress`/`write-dashboard-digest`/`joinUrl-export`). Removed the dead `aura-digest.ts` exports (`renderAction`/`saveAction`/`diffAction`/`cleanupAction`/`lastAction`/`USAGE`/`FailError`/`DASHBOARD_DIGEST_PATH`/`fail`) + their internal render/diff helpers (`render`/`attentionLine`/`renderAttention`/`renderQueue`/`renderCapacity`/`decisionEmoji`/`renderReviews`/`renderReviewsOwed`/`renderCorrections`/`renderSuggestedActions`/`renderWarnings`/`renderDevLinks`/`computeDiff`/`daysBetween`/`fmtHours`/`fmtPct`); removed now-unused imports (`rmSync`/`ApprovalDecision`/`DigestDiff`). `stateEmoji` extracted back to shared-helpers (still used by `gitColumnSummary` in `fetchAction`). KEPT `fetchAction` + `saveLastDigest` (the in-process seam). `package.json` `exports` dropped `./digest/progress-emitter` + `./digest/write-dashboard-digest` subpaths. `fetchAction.test.ts` stale comment updated. New `drop-dead-shared-exports.test.ts` (structural guard). Shared typecheck + tsx 202 green. Extension/tools/skill-doc NOT touched (slice 3).

### slice 1 — delete-cli-shim-and-bundle

Deleted `scripts/src/aura-digest.ts` (CLI shim) + `skills/core/aura-digest/dist/aura-digest.mjs` (committed bundle, 21526 lines). `scripts/esbuild.config.mjs` drops the `aura-digest` entry, KEEPS the `aura` entry (aura.mjs still builds). `scripts/package.json` description updated. Deleted `scripts/src/keyring.ts` (orphaned since core-move, zero importers, 601 lines) + `scripts/profile-fetch.mjs` (ran the deleted bundle). `Taskfile.yml` ENTRY_OUTS + `docs/dev-env.md` updated to remove aura-digest.mjs references. `@modelcontextprotocol/sdk` dep KEPT (unused in scripts now but sole declaration the shared package's mcp-client.ts relies on via workspace hoisting — slice 2 owns shared). New `cli-deletion.test.ts` (9 structural tests). Scripts typecheck + aura.mjs build green. Shared-core exports NOT touched (slice 2). Skill doc NOT touched (slice 3).

### slice 3 — rewrite-skill-doc-and-tests

Rewrote `skills/core/aura-digest/aura-digest.md` off the CLI: frontmatter description now says "via in-process tools" (was "via a deterministic Node script (aura-digest.mjs)"); intro says "The flow runs entirely in-process via typed tools" (was "The heavy lifting still happens in the compiled aura-digest.mjs script"); Prerequisites section rewritten — no esbuild/bundle/task build, `digest-fetch` calls `fetchAction` from `@pi-aura/shared` directly, `@napi-rs/keyring` resolved from repo-root `node_modules` by the in-process `fetchAction` (not via walk-up from `dist/`); Development section rewritten — no digest bundle build, notes the `aura.mjs` bundle is separate. Updated `test/digest-dashboard/skill-md-prose.test.ts` with two new guards: (1) skill doc has no `aura-digest.mjs`/`dist/aura-digest` live references, (2) no `bundled by esbuild`/`dist/aura-digest.mjs`/`task build ... aura-digest`. Kept the existing "no bash shell-outs" guard. Audited other docs: `docs/testing.md` — updated digest-tests section (deleted `write-dashboard-digest`/`aura-digest-progress` test refs, added `fetchAction`/`drop-dead-shared-exports`), rewrote `/digest` command section (tools call `fetchAction`/`saveLastDigest` in-process, not thin wrappers over `aura-digest.mjs`), rewrote `digest-log` section (deleted `progress-emitter.ts` refs), updated `scripts/` build description (only `aura.mjs` now). `README.md` — updated skill description ("via in-process tools" not "via a deterministic script pipeline"). `Taskfile.yml` — removed dead `DIGEST_DIST` var + its `clean` task reference. **Friction log:** (1) `docs/testing.md` had stale references from slice 2's deletions (`progress-emitter.ts`, `write-dashboard-digest` test) that weren't caught in slice 2 — documentation-debt friction: when code is deleted, the testing docs that describe those tests need updating in the same slice, not deferred. (2) The skill doc's Development section previously described `task build`/`typecheck`/`watch`/`clean` as if they were for the digest; now that there's no digest bundle, those Taskfile commands only apply to the `aura` skill — the digest skill doc shouldn't document the `aura` skill's build process. Minor architectural note: the Development section could be dropped entirely from the digest skill doc (it has no build of its own), but left a brief note pointing at the Taskfile for the `aura` bundle since it's referenced in the handoff. Full vitest 235/235 + shared tsx 202/202 + all typechecks + aura.mjs build green.
