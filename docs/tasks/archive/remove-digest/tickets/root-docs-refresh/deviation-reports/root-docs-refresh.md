---
type: deviation report
title: Deviation report for root-docs-refresh
status: stable
---

## Deviation report: root-docs-refresh

### API surface changes

- **Planned:** The arch spec's contract: "Exports: none; doc edits and one
  archive operation only." Seams: (1) docs content with no digest or
  Atlassian-provisioning mentions outside task history, and no active bug
  report mentioning Atlassian provisioning (the archived report carries the
  resolution note); (2) the README's skill and agent tables matching the
  shipped manifest. Interface contract: none downstream except review.
- **Actual:** Exactly that shipped for the docs: the five root docs
  rewritten (digest and Atlassian-provisioning mentions gone, the testing
  doc's runner and mock conventions re-described for the per-package runner
  reality with the FakeKeyring seam re-pointed at the remaining
  hey-api-aura-client suite, the dev-env digest mention dropped) and the
  stale bug report git-mv'd to the bugs archive with status fixed and a
  Resolution note. Three additions beyond the letter, all disclosed in the
  implementation result: (a) seven doc-seam tests appended to the existing
  no-remnants guard suite (40 tests total, all green in the shared runner)
  instead of a new per-ticket file, per the guard ticket's consolidation
  contract that this file is the single guard; (b) the README skill table
  gained the missing engineering-foundation row; (c) a one-clause stale
  digest-dashboard comment scrub in the shared codegen config, comment-only
  with no behavior change.
- **Impact:** None on dependent tickets. This is the effort's last content
  ticket and the spec's interface contract is none-downstream-except-review.
  The enlarged guard raises the shared runner to 169/169 at the ticket tip,
  which the end-of-effort suite gate will re-run. No API surface changed
  anywhere (no exported symbol, manifest, or config shape touched).

### Abstraction usage

- Used/was specified: yes. The bug archive followed the repo's archive
  convention; the doc-seam tests follow the established guard pattern (fs
  reads, no imports of deleted content) and ran red-first on the pre-edit
  tree (the five-doc assertion was red with 4/14/1/44/2 digest hits across
  the docs, the tables assertion was red with the digest skill and morning
  agents listed, both archive assertions were red), and a mutation
  spot-check (a reintroduced digest line tripped exactly the five-doc
  assertion) proves the seam is live rather than pass-by-construction.

### Out-of-scope changes

- The shared codegen config comment scrub is the one touch outside the
  chartered file set (the five docs plus the bug archive). Disclosed and
  justified: the comment named the deleted dashboard extension as the
  NodeNext consumer of the generated client, the reworded testing-doc
  lesson references that config, and leaving it would leave a digest
  remnant outside task history. Comment-only; no behavior change.
- In-file rider fixes in the testing doc, required by the
  descriptions-match-post-removal-reality criterion: dropped a stale
  codegen run-command line that no script in the scripts manifest provides,
  added the missing semantic-search suite to the remaining-suites list,
  rewrote two digest-era runner-discipline lessons, and reworded the
  esbuild-externals bullet off the removed keyring dependency.
- The README row addition goes beyond the ticket's enumerated removals but
  is required by the tables-match-shipped criterion (and the repo rule that
  every skill appears in the README skill table).
- Deliberately not done, correctly left to the audit effort's
  instruction-content refresh: the README Commands section still claims no
  user-facing commands while the secrets command is registered, the README
  intro still says agents, the glossary PAT and Keyring entries still
  describe the pre-keyring-rewrite reality, the agent conventions intro
  still says agents live under the agents directory, and the build config
  still lists the dead keyring externals (harmless, and off-limits under the
  effort-wide rule).

### Ticket doc update needed?

Yes. Append to ## Implementation notes: the guard-extension choice (seven
doc-seam tests appended to the no-remnants guard rather than a new file, per
the guard's consolidation contract), the README engineering-foundation row
addition, the codegen-config comment rider, and the residual staleness items
routed to audit-update-aura-instructions (README Commands and intro,
glossary PAT and Keyring entries, the agent-conventions agents line, the
dead keyring externals).

### User attention needed?

No. No scope or API-surface change beyond the disclosed, justified riders;
every residual staleness item is already the audit effort's charter. All
five docs' seams are now pinned by the guard, so any reintroduction fails
the shared suite.
