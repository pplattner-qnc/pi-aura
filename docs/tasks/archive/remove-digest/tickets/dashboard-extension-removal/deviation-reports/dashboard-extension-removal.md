---
type: deviation report
title: Deviation report for dashboard-extension-removal
status: stable
---

## Deviation report: dashboard-extension-removal

### API surface changes

- **Planned:** none; a pure deletion ticket. The extension package (server,
  SPA, store, listener, fixtures, per-extension manifest, committed front-end
  bundles), the registration entry in the package manifest, the gitignore
  exception lines, and the vitest suite go away. No exports added or
  changed; the arch spec's absence-test rule allows one new test module in
  the shared package's test tree.
- **Actual:** matches the plan. Deletion verified against `develop`:
  42 files changed, 83 insertions, 16466 deletions; one added file, the
  4-assertion absence suite
  `packages/shared/test/digest/dashboard-extension-removal.test.ts`
  (fs reads only, no imports of deleted code, runs green under the shared
  runner). The interface contract holds: after this ticket the only
  importers of the shared digest modules are the digest unit tests, the
  scripts-side followup test, and the three root e2e trees, all owned by
  later tickets.
- **Impact:** the absence suite's exact placement,
  `packages/shared/test/digest/`, sits inside the directory that
  `digest-core-and-build-pkg-cleanup` is chartered to empty ("contains no
  digest source or test modules"). That ticket must relocate the file (for
  example to the shared package's test root or a guards directory), not
  delete it with the digest suites, or its tracked-tree seam fails at the
  letter. `no-remnants-guard-and-archive` consolidates the absence tests
  either way, so the final guard is unaffected if the relocation happens.

### Abstraction usage

- Used/was specified: yes. The manifest's extension registration entry, the
  gitignore exception lines, the root vitest runner over the remaining
  trees, and the shared package's node:test runner with the
  drop-dead-style fs-assertion pattern for the absence suite; the test file
  cites the pattern and the arch spec seams in its header.

### Out-of-scope changes

- The `.gitignore` comment above `dist/**` was rewritten in addition to
  removing the two exception lines. Justified: the old comment's sole
  rationale named the dashboard bundles, so leaving it would have left a
  digest-dashboard mention. No rule text changed; the `dist/**` rule
  itself is untouched.
- Untracked build caches inside the deleted directories were removed from
  disk and the emptied `.pi/extensions/` directory was removed. No
  tracked-tree impact (the directory held only the deleted tracked files
  plus untracked caches).
- Nothing else: no shared digest module code, no other extension, and no
  skill content was touched; all remaining digest references in the tree
  are owned by later tickets (verified by grep).

### Ticket doc update needed?

Yes. Append to an Implementation notes section: (a) the absence suite lives
at `packages/shared/test/digest/dashboard-extension-removal.test.ts` and
`digest-core-and-build-pkg-cleanup` must relocate it when emptying that
directory, preserving the file; (b) the gitignore comment rewrite noted
above.

### User attention needed?

No. No scope change and no API-surface difference. The placement wrinkle
routes through the normal level-completion path (the parent reads this
report and the spec-reconciler amends the arch spec or the next ticket's
charter); nothing here needs a human decision.

### Observations (non-deviations)

- A pre-existing em-dash remains at `.gitignore` line 5 (profiler-output
  comment); it predates this ticket and was correctly left alone, but it
  violates the repo's no-em-dash rule and belongs to a docs sweep.
- The fresh-session behavioral smoke (no digest command or tools, clean
  load) is covered only by structural proxies here; the arch spec assigns
  the interactive registration smoke to `no-remnants-guard-and-archive`.
