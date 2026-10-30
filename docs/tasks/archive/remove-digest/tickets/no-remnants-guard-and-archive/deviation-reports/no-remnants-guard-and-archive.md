---
type: deviation report
title: Deviation report for no-remnants-guard-and-archive
status: stable
---

## Deviation report: no-remnants-guard-and-archive

### API surface changes

- **Planned:** The arch spec's contract: a structural guard suite in the
  shared package's test tree, green under the shared runner and failing on
  any reintroduced remnant, with the per-ticket absence assertions
  consolidated into it; the task index no longer lists the dead
  refine-phase-transition effort; the registration smoke run as a manual
  seam. Assert absence only; no general lint.
- **Actual:** Landed exactly as planned, with four disclosed refinements
  inside that surface:
  1. Consolidation consumes the four per-ticket suite files: every
     assertion is ported into the single guard (33 tests, 8 describe
     blocks) and the four files are deleted, with a consolidation pin
     asserting they stay gone. The two relocation-bookkeeping assertions
     from the digest-core-and-build-pkg-cleanup suite (which pinned the
     interim existence of the files in the guards directory) are
     superseded by the consolidated end state and dropped; everything
     else carries over, one interim-state message reworded.
  2. One ported assertion is strengthened: "registers no digest-dashboard
     extension" became "registers no digest-named extension" (a
     case-insensitive filter over the manifest's extension list), so the
     remnant class cannot reappear under a new digest name. No current
     entry matches; the mutation run proves sensitivity.
  3. The task index seam became three permanent guard tests (the
     task-tree archive seam: live directory gone, archive directory
     present, live list free of the entry), reading the same principle as
     every other remnant class.
  4. The failure sensitivity criterion is proven by four throwaway
     mutations (digest subpath export, digest source directory,
     digest-named extension registration, svelte devDependency), each
     tripping exactly its intended assertion and reverted; deliberately
     not committed, since a committed remnant-factory would be the
     forbidden general lint.
  The archive is a pure git rename (content byte-identical, R100) and the
  index moves the effort from the live list to the archived list in the
  correct sorted position. The registration smoke passed: a fresh session
  loads with zero output and exit 0, the secrets command is present among
  73 commands, and zero of the 73 commands or 70 tools carry a digest name.
- **Impact:** None downstream beyond review. root-docs-refresh (the only
  remaining sibling ticket) is untouched by this ticket's surface. The
  guard is the effort's contract with the future: the per-ticket absence
  suites no longer exist as separate files, and any future remnant class
  must extend the single guard.

### Abstraction usage

- Used/was specified: yes. The structural-assertion test pattern from the
  deleted digest suites (fs reads only, no imports of removed code), the
  relocated per-ticket suites' assertions as the consolidation input, the
  task tree's archive convention, and the shared package's runner. The
  registration smoke followed the spec's manual-seam framing via a
  load-time probe that exits before any model call.

### Out-of-scope changes

- None in content scope: the diff is the guard suite, the four suite-file
  deletions, the archive rename, and the one-line index moves (7 files,
  +510/-541, verified by name-status against the fork point).
- Flow note, not a deviation: the landing branch was intentionally not
  created by the tdd pass; the land step creates it per the flow recorded
  in the manifest-and-infra-cleanup implementation notes.
- The tree carries the orchestrator's unstaged state.yaml pointer edit,
  uncommitted as in every prior landing.

### Ticket doc update needed?

Yes. Append to ## Implementation notes:

- The consolidation deletes the four per-ticket suite files after porting
  their assertions; the digest-core suite's two relocation assertions were
  interim-state bookkeeping and are superseded by the consolidation pin.
- The registration assertion is strengthened to any digest-named extension
  entry, not just the removed dashboard entry.
- The task index seam lives as three permanent guard tests (task-tree
  archive describe block); the block is self-contained if a future review
  wants the guard package-only.
- Criterion 2 is proven by four reverted mutations recorded in the tdd
  result, not by a committed test (the no-general-lint rule).
- The smoke and mutation evidence artifacts sit in the gitignored .work/
  directory of this ticket.

### User attention needed?

No. Scope and API surface match the spec and the reconciled arch spec; the
four refinements are disclosed consequences of the consolidation the
charter itself ordered. Residual risks worth knowing: two strict
"exactly" pins (the skills/core directory list and the surviving subpath
exports list) will trip on future legitimate additions until the guard is
extended; the archive seam couples three shared-runner tests to
docs/tasks paths; the user-level settings file still carries its aura
digest config block (package-external state, pinned untouched by the map);
and the root docs still mention the digest until root-docs-refresh lands.
