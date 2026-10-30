---
type: deviation report
title: Deviation report for digest-core-and-build-pkg-cleanup
status: stable
---

## Deviation report: digest-core-and-build-pkg-cleanup

### API surface changes

- **Planned:** The shared manifest loses its digest subpath exports (the
  spec and ticket prose said seven); the scripts manifest loses the MCP SDK
  dependency and its digest-era name; nothing new is exported; the two
  per-ticket absence suites are relocated out of
  `packages/shared/test/digest/`, preserved, never deleted; after this
  ticket, the only digest reference left in shared source is the settings
  field.
- **Actual:** All nine digest subpath exports were removed (the prose count
  was stale: the manifest carried nine `./digest/*` entries, and the
  count-agnostic criterion is what governs; the exports map now carries
  `.`, `./keyring`, `./aura-client`, and the `./*` catch-all). The scripts
  manifest was renamed to `aura-skill-scripts` with a digest-free
  description and the MCP SDK dependency dropped; the embed stack
  (`@huggingface/transformers`, `onnxruntime-node`) stays, it serves the
  rest search. The two absence suites were relocated to
  `packages/shared/test/guards/`, joined by a new third guard suite for
  this ticket (fs reads, no imports, 14 assertions). `vitest.config.ts`
  gained `passWithNoTests: true` with an explanatory comment (interim flag
  so the emptied root test tree stays literally green until
  manifest-and-infra-cleanup removes the runner). One header comment in
  `packages/shared/src/aura-client.ts` was rewritten to drop the deleted
  `aura-digest.ts` co-reference (comment-only).
- **Impact:** Downstream charters are unaffected: manifest-and-infra-cleanup
  already owns removing the root runner (the flag goes with it) and the
  settings field (verified: `settings.ts` is the only digest reference left
  in shared source); the guard ticket consolidates three per-ticket suites
  instead of two (its charter already names the relocated suites in the
  plural); root-docs-refresh is untouched by this ticket's shape.

### Abstraction usage

- Used/was specified: yes. The exports map and the shared runner were used
  as the seams; the relocation rule from the reconciled arch spec was
  followed exactly (a guards directory, preserved, never deleted); the new
  suite follows the fs-reads-no-imports pattern; the scripts manifest was
  edited in place.

### Out-of-scope changes

- `vitest.config.ts` `passWithNoTests: true` (justified: criterion 4's
  second half is otherwise false; deleting the three e2e families empties
  the root test tree and the bare runner exits 1 with "No test files
  found"; interim until manifest-and-infra-cleanup deletes the runner).
- The comment-only `aura-client.ts` header touch (holds the interface
  contract's letter; minimal).
- One atomic commit instead of per-criterion checkpoints (justified: the
  deletions form one dependency cluster; the e2e families and the followup
  test import the digest core, and the digest unit tests transitively
  import the MCP SDK whose dependency record lives in the scripts
  manifest; any split leaves a knowingly-red suite. RED was observed per
  criterion before the atomic GREEN).
- A new third per-ticket absence suite was added (the arch spec named only
  the two earlier ones; its red-first rule required one for this ticket's
  own criteria).
- Commit `9643ba1` is unsigned (GPG pinentry timeout in the headless
  environment; repo practice is signed commits; the land step can
  amend or re-sign).
- `drop-dead-shared-exports.test.ts` was deleted with the digest unit
  suites (its subject vanished; its fs-read pattern survives in the guards
  suites).

### Ticket doc update needed?

Yes. Append to ## Implementation notes:

- The exports-count correction: the ticket and spec prose said "seven"
  digest subpath exports; the manifest carried nine. All nine are gone and
  the count-agnostic criterion (no digest subpaths) is the governing form.
  The arch spec's contract detail needs the same correction at the next
  reconcile.
- The relocation target chosen: `packages/shared/test/guards/`; three
  suites now live there (this ticket's, plus the two relocated ones); the
  guard ticket consolidates all three.
- The vitest `passWithNoTests` interim flag: added so the emptied root
  tree stays green; manifest-and-infra-cleanup removes the runner and the
  flag together.
- The scripts package name target was chosen freely per the charter:
  `aura-skill-scripts`.
- The unsigned commit `9643ba1` (GPG pinentry timeout); the land step may
  re-sign.

### User attention needed?

No. Scope and every acceptance criterion are satisfied; the divergences
are a prose-count correction, interim-flag mechanics inside chartered
downstream ownership, and environmental (the unsigned commit). No API
surface differs from the plan's intent.
