---
type: deviation report
title: Deviation report for secrets-aura-pat-only
status: stable
---

## Deviation report: secrets-aura-pat-only

### API surface changes

- **Planned:** The arch spec's shrunk surface: command parsing, discovery,
  the chooser (machinery kept, one Aura PAT item), and the generalized edit
  flow; the provisioning module and its exports gone; the combined
  email+token edit flow and the guided-walkthrough offer (including its
  dynamic import) removed; interface contract: after this ticket, no
  extension reads the digest settings namespace, so the field can go.
- **Actual:** Exactly the planned surface. The extension's runtime export
  surface is pinned by a module-surface test at 11 keys (ten named values
  plus the default factory: argument parsing, completions, the MCP
  bearer-token reader, discovery sources and finder, the single-key
  pickSecretKey, the edit decision, the generalized handleEdit with Aura
  PAT defaults, the chooser orchestrator, the discover flow). The chooser
  machinery stayed with exactly one item ("Aura PAT") and zero confirm
  prompts; the guided offer, its dynamic import, handleAtlassianPatEdit,
  and WALKTHROUGH_DOC_PATH are gone; the module source carries zero
  Atlassian or walkthrough references (verified by grep). The contract
  holds: no extension source reads the digest settings namespace (the read
  lived in the deleted guided-walkthrough block), so
  manifest-and-infra-cleanup can remove the field as planned.
- **Impact:** None beyond the planned enablement: the settings-field removal
  in manifest-and-infra-cleanup is unblocked. The provisioning deletion also
  resolved the pre-existing atlassian-provision.test.ts red (the unguarded
  dead import died with the guided path), exactly as the dispatch routed.

### Abstraction usage

- Used/was specified: yes. The shared keyring interface (SecretKey, Keyring)
  was used as-is per the spec; the existing editor, confirm, and select UI
  patterns and the generalized edit flow were kept; the module-surface pin
  follows the sibling module-surface test pattern; the chooser machinery
  was kept with one item per the user decision.

### Out-of-scope changes

- Minor and justified: an em-dash in the dynamic-import-createKeyring rule
  comment was rewritten while touching the file (repo no-em-dash standard);
  no behavior change.
- WALKTHROUGH_DOC_PATH was removed in the chooser cycle rather than a later
  one (it existed only for the guided path); in scope, sequencing note only.
- Nothing else: the diff touches exactly the six chartered files (the
  extension, its test, the provisioning module, its test, the two Atlassian
  docs; +99 / -1953 across 6 files, 5 commits).

### Ticket doc update needed?

Yes. Append to ## Implementation notes:

- AC3 (tracked-tree shape) was verified by git ls-files commands, not by a
  test: the arch spec's seam list for this ticket deliberately omits the
  tracked-tree seam (structural absence assertions are routed to the final
  guard ticket), so no test was added at an unlisted seam.
- docs/bugs/atlassian-provision-test-broken-import.md is now stale: this
  ticket fixed that bug by deletion. root-docs-refresh's
  no-Atlassian-provisioning-mentions seam will trip on docs/bugs/ unless the
  report is archived first (by the orchestrator or that ticket's scope).
- The shared keyring SecretKey union still carries the three Atlassian
  members (packages/shared keyring sources); no remove-digest ticket owns
  shrinking it. Flagged for the end-of-effort coherence pass.

### User attention needed?

No. Scope and API surface match the spec and the user's chooser decision.
Two parent-level routing items ride in the findings above (the stale bug
report and the keyring union), both handled through the level's
spec-reconcile and the end-of-effort coherence pass rather than a user
decision.
