---
type: deviation report
title: Deviation report for digest-skill-and-agents-removal
status: stable
---

## Deviation report: digest-skill-and-agents-removal

### API surface changes

- **Planned:** none; a pure deletion ticket. The digest skill directory
  (the `aura-digest.md` doc and the committed CLI bundle leftover
  `skills/core/aura-digest/dist/aura.mjs`), both morning agents, and the
  `subagents` block in the package manifest go away. No exports added or
  changed; the arch spec's absence-test rule allows one new test module in
  the shared package's test tree.
- **Actual:** matches the plan. Diff vs the starting branch: 7 files
  changed, +168/-19074 (6 content files plus this report); the only added
  code file is the 4-assertion absence suite
  `packages/shared/test/digest/digest-skill-and-agents-removal.test.ts`
  (fs reads only, no imports of deleted content, green under the shared
  runner). The manifest's skills scan stays `["./skills"]` unchanged and
  the `pi.subagents` key is gone. The interface contract holds on this
  lineage: the final skill and agent surface exists for
  `root-docs-refresh` and `no-remnants-guard-and-archive` to build on.
- **Impact:** none beyond the plan at the content level. The `agents/`
  directory held exactly the two morning agents, so the whole directory
  went away. See the lineage finding below for the topology impact on
  dependent tickets.

### Abstraction usage

- Used/was specified: yes. The package manifest's skills and subagents
  registration (arch spec seam 1) and the tracked tree shape (seam 2); the
  absence suite follows the `drop-dead-shared-exports` fs-assertion pattern
  in the shared package's test tree and cites the arch spec seams in its
  header. Typecheck, build, and the clean-session load (seam 3) were run
  green by the chain.

### Out-of-scope changes

1. **Landing-branch lineage deviation (the significant finding).** The arch
   spec's branch model says each ticket's landing branch is created off the
   branch the previous ticket's chain landed on. Both this ticket's working
   branch and its landing branch
   (`task/digest-skill-and-agents-removal`) were created from the starting
   branch (`develop` at `46b1fef`) instead of ticket 1's landing branch
   (`task/dashboard-extension-removal` at `fa89e99`). Proof: the merge base
   of the two landing branches is `46b1fef`, and on
   `task/digest-skill-and-agents-removal` the dashboard extension directory
   and its `test/digest-dashboard` suite still exist while the manifest
   still registers `./.pi/extensions/digest-dashboard/index.ts`.
   Consequences:
   - The 3 root-vitest failures inside `test/digest-dashboard` (documented
     in the Implementation notes as transient) are NOT transient on this
     lineage: `dashboard-extension-removal` has already landed, on a
     parallel lineage this branch never included. The failures
     (`skill-md-prose.test.ts`, `cleanup-and-final-polish.test.ts` with 2
     assertions, `slash-command.test.ts`) persist until the two landing
     lineages are merged.
   - Every downstream chain forked from this branch builds without ticket
     1's deletions. `digest-core-and-build-pkg-cleanup` is chartered
     against a tree whose dashboard imports are already gone;
     `manifest-and-infra-cleanup` needs `test/digest-dashboard` deleted to
     empty the root test tree. Both would mis-fire on the un-repaired
     lineage.
   - At finalize, `task/dashboard-extension-removal` would dangle unmerged.
   The content merge is clean (disjoint files except the root manifest,
   where the two tickets touch different blocks: `pi.extensions` vs
   `pi.subagents`). Repair belongs to the orchestrator before the next
   dispatch: merge `task/dashboard-extension-removal` into
   `task/digest-skill-and-agents-removal` (or otherwise re-point the
   lineage) so the stack carries ticket 1's deletions.
2. **Tdd-worker scope overstep (workflow observation, not a content
   change).** On the resumed run, the tdd-worker went beyond its
   RED-to-GREEN charter: after re-confirming the two existing commits it
   also ran the verification gates, wrote the earlier deviation report
   (`76d15ed`), and performed the land (`b453563`, `a468d93`) ahead of the
   chain's dedicated verify, deviation, and land children. The artifacts it
   produced are accurate in content except the lineage framing corrected
   by this report (finding 1). Recorded for the workflow channel; this
   report is the authoritative deviation pass.
3. **Commit-message wrinkle:** `201f0d8` is a resumption checkpoint
   committed by the orchestrator after two deadline-killed chain attempts,
   so its message deviates from the canonical `wip: <slug> <criterion>`
   form; content is the skill-list criterion's red-to-green cycle.
   `4089e55` covers the agents criterion in the canonical form.

### Ticket doc update needed?

Yes. The Implementation notes (appended by the land step) frame the
dashboard test failures as lasting "until `dashboard-extension-removal`
lands". That ticket has landed; the failures persist because this lineage
does not include it. Append a correction: the 3 root-vitest failures inside
`test/digest-dashboard` persist on this lineage until it is merged with
`task/dashboard-extension-removal`; the orchestrator must perform that
lineage repair before dispatching the next ticket. Keep the existing
caveats unchanged (the absence-suite relocation for
`digest-core-and-build-pkg-cleanup`, and the resumption-checkpoint note).

### User attention needed?

Yes. Not because of scope or API surfaces (both match the plan exactly),
but because the landing topology deviates from the arch spec's branch
model: this ticket landed on a lineage that excludes ticket 1's deletions,
and every remaining ticket of the effort builds on that stack until the
orchestrator repairs it.
