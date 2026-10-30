---
type: deviation report
title: Deviation report for digest-skill-and-agents-removal
status: stable
---

## Deviation report: digest-skill-and-agents-removal

### API surface changes

- **Planned:** none; a pure deletion ticket. The digest skill directory (the
  `aura-digest.md` doc and the committed CLI bundle leftover
  `skills/core/aura-digest/dist/aura.mjs`), both morning agents
  (`agents/aura-morning-digest.md`, `agents/aura-morning-fetcher.md`), and the
  `subagents` block in the package manifest go away. No exports added or
  changed; the arch spec's absence-test rule allows one new test module in the
  shared package's test tree.
- **Actual:** matches the plan. Deletion verified against `develop`: 6 files
  changed, 80 insertions, 19074 deletions; the one added file is the
  4-assertion absence suite
  `packages/shared/test/digest/digest-skill-and-agents-removal.test.ts`
  (fs reads only, no imports of deleted content, runs green under the shared
  runner). The manifest's skills scan stays `["./skills"]` unchanged and the
  `pi.subagents` key is gone. The interface contract holds: the final skill
  and agent surface exists for `root-docs-refresh` and
  `no-remnants-guard-and-archive` to build on.
- **Impact:** none beyond the plan. The `agents/` directory had exactly the
  two morning agents, so the whole directory went away; no other agent
  registrations existed to preserve.

### Abstraction usage

- Used/was specified: yes. The package manifest's skills and subagents
  registration (arch spec seam 1) and the tracked tree shape (seam 2); the
  absence suite follows the `drop-dead-shared-exports` fs-assertion pattern in
  the shared package's test tree and cites the arch spec seams in its header.

### Out-of-scope changes

- None. The shared digest modules and their unit tests, the digest subpath
  exports map, the `.pi/extensions/digest-dashboard/` extension and its
  registration, the scripts manifest, the settings digest namespace, and the
  README/AGENTS.md digest mentions are all untouched; each is owned by a
  later ticket per the arch spec (verified by grep).

### Ticket doc update needed?

Yes. Append to an Implementation notes section (done in the land commit):

1. The absence suite lives at
   `packages/shared/test/digest/digest-skill-and-agents-removal.test.ts`.
   As with the dashboard absence suite, `digest-core-and-build-pkg-cleanup`
   must relocate it (not delete it) when it empties
   `packages/shared/test/digest/`; `no-remnants-guard-and-archive`
   consolidates the absence tests either way.
2. The tdd state was reached across a chain resumption: commit `201f0d8` is
   a resumption checkpoint from two timed-out chain attempts and carries the
   skill-list criterion's red-to-green cycle, so its message deviates from
   the canonical `wip: <slug> <criterion> passing` form. Commit `4089e55`
   covers the agents criterion in the canonical form.

### User attention needed?

No. No scope change and no API-surface difference. The cross-ticket notes
below route through the normal level-completion path.

### Observations (non-deviations)

- Transient cross-ticket state: the dashboard extension's `/digest` handler
  (`.pi/extensions/digest-dashboard/index.ts` around line 280) reads the now
  deleted `skills/core/aura-digest/aura-digest.md`. Until
  `dashboard-extension-removal` lands, running `/digest` on a tree with this
  ticket applied shows the handler's caught error notification ("Failed to
  inject aura-digest skill") instead of injecting the skill. The extension
  itself still loads clean (fresh-session smoke green); the whole extension
  and its registration are that ticket's charter.
- Root vitest (`npx vitest run`) currently reports 3 failures out of 228, all
  inside `test/digest-dashboard/`, all caused by the deleted skill doc:
  `skill-md-prose.test.ts` (file-level ENOENT reading the doc),
  `cleanup-and-final-polish.test.ts` (2 assertions on the doc's digest-log
  prose), and `slash-command.test.ts` (the `/digest` injection assertion).
  That suite is exactly what `dashboard-extension-removal` deletes; the
  failures disappear on the integrated tree. Recorded here so the parent
  sees the transient state rather than a silent red suite; the foreign tests
  were not edited.
- README.md (skill table, `/skill:aura-digest` mention) and AGENTS.md (the
  `skills/core/aura-digest/` layout bullet) still reference the digest skill;
  `root-docs-refresh` owns the docs sweep.
