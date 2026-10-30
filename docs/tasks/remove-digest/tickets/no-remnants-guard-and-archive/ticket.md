---
type: ticket
subtype: feature
title: Add the no-remnants guard and archive the dead digest effort
status: stable
workflow_state: done
blocked_by:
- digest-skill-and-agents-removal
- manifest-and-infra-cleanup
size: m
---

## What to build

A structural guard suite in the shared package's test tree asserts the
removal is total: no digest subpath exports, no digest source or test
directories, no dashboard extension directory, no subagents registration or
agents directory, and a root devDependency list free of the dashboard
stack. The dead digest effort (the phase-transition ticket) is archived in
the task tree and the root index drops it from the live list. A
registration smoke proves the end state: a fresh pi session loads the
package with no errors, the secrets command registers, and no digest command
or tools appear.

## Acceptance criteria

- [ ] The structural guard suite runs green in the shared package's runner.
- [ ] The guard fails if any digest remnant (export, directory,
      registration, or dashboard-stack dependency) reappears.
- [ ] The dead digest effort is archived and the task index no longer lists
      it as live.
- [ ] The registration smoke passes: clean load, secrets command present,
      digest command and tools absent.

## Blocked by

- digest-skill-and-agents-removal (the guard asserts the skill and agent
  directories are gone).
- manifest-and-infra-cleanup (the guard asserts the final manifest and
  dependency shape; transitively gated by the three removal tickets).

## Implementation notes

- Landed on `task/no-remnants-guard-and-archive` as merge commit `4bb9d16`
  (`ticket(no-remnants-guard-and-archive): Add the no-remnants guard and
  archive the dead digest effort`); the working branch
  `ticket/no-remnants-guard-and-archive` (tip `abe04a5`, forked from the
  stack tip `c97d0ca`) was deleted by the land step after the merge, its
  tip staying reachable as `4bb9d16^2`. The merged tree is identical to
  the verifier's branch tip. Gates at merge time (verifier on the branch
  tip): consolidated guard suite 33/33, shared runner 162/162 across 36
  suites, all 7 extension strip-types suites green, shared and scripts
  `tsc --noEmit` green, `task typecheck` and `task build` green with the
  committed bundle byte-stable under rebuild, the registration smoke
  re-run clean (exit 0, zero-byte load output, the secrets command
  present, zero digest-named commands or tools among the 73-command and
  70-tool dump), and a mutation spot-check tripping exactly its intended
  assertion; lint not-applicable because no linter is configured anywhere
  in this repo. Diff vs fork point: 7 files, +510/-541.
- The consolidation deletes the four per-ticket suite files
  (dashboard-extension-removal, digest-skill-and-agents-removal,
  digest-core-and-build-pkg-cleanup, manifest-and-infra-cleanup) after
  porting every assertion into the single guard
  `packages/shared/test/guards/no-remnants.test.ts` (33 tests, 8 describe
  blocks); a consolidation pin inside the guard asserts the four files
  stay gone. The digest-core suite's two relocation-bookkeeping assertions
  (pinning the interim existence of those files in `test/guards/`) were
  interim-state bookkeeping and are superseded by the consolidated end
  state; everything else carries over verbatim.
- One ported assertion is strengthened: "registers no digest-dashboard
  extension" became "registers no digest-named extension" (a
  case-insensitive filter over the manifest's `pi.extensions` list), so
  the remnant class cannot reappear under a new digest name.
- The task index seam lives as three permanent guard tests (the
  task-tree archive describe block: live directory gone, archive
  directory present, live list free of the entry); the block is
  self-contained if a future review wants the guard package-only.
- The refine-phase-transition archive is a pure git rename (R100, content
  byte-identical), and `docs/tasks/index.md` moves the effort from the
  Live list to the Archived list (between `reference-wiki-kind` and
  `skl-flow-rewrite`).
- Criterion 2 (the guard fails on any reintroduced remnant) is proven by
  four throwaway mutations, each tripping exactly its intended assertion
  and then reverted clean (digest subpath export, digest source
  directory, digest-named extension registration, svelte devDependency);
  deliberately not committed, since a committed remnant-factory would be
  the forbidden general lint. The smoke and mutation evidence artifacts
  sit in this ticket's gitignored `.work/` directory.
- The registration smoke is a manual seam per the spec, run via a
  load-time probe that dumps `getCommands()`/`getAllTools()` and exits
  before any model call (free, stateless); it is not automated.
- Residual for later tickets: two strict "exactly" pins (the
  `skills/core` directory list and the surviving subpath exports list)
  will trip on future legitimate additions until the guard is extended;
  the user-level `~/.pi/agent/settings.json` still carries its
  `aura.digest` config block (package-external state, no longer read by
  the settings type); and the root docs (`README.md`, `CONTEXT.md`,
  `AGENTS.md`, `docs/testing.md`) still mention digest until
  root-docs-refresh lands.
- The deviation report sits at
  `docs/tasks/remove-digest/tickets/no-remnants-guard-and-archive/deviation-reports/no-remnants-guard-and-archive.md`.
  The tdd pass left it untracked, so the land step committed it together
  with these notes. The ticket doc itself carried no `## Implementation
  notes` section when landed; the land step added it.
