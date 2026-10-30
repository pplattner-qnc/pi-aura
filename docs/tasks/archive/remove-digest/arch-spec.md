---
type: arch spec
title: remove-digest architecture
status: stable
---

# remove-digest architecture

Starting branch: develop. The stacked-branch model fork broke once: the
digest-skill-and-agents-removal chain forked from `develop` instead of the
previous ticket's landing branch, and the repair merge `e327de2` carried
the dashboard deletions into that lineage. After the repair, every ticket
forked from the then-current stack tip, never from `develop`; all seven
tickets landed.

Every ticket is a deletion or a slimming; nothing new was exported except
the shrunk secrets surface and the final guard suite. The TDD loop ran
red-first as absence assertions: an assertion at the ticket's seam failed
on the pre-removal tree (RED), then the deletion made it pass (GREEN).
The first two tickets' absence suites landed in
`packages/shared/test/digest/` (`dashboard-extension-removal.test.ts` and
`digest-skill-and-agents-removal.test.ts`) under the shared package's
runner, which stayed. digest-core-and-build-pkg-cleanup relocated both to
`packages/shared/test/guards/` (preserved, not deleted with the digest
suites) and added its own third suite there; manifest-and-infra-cleanup
added a fourth; no-remnants-guard-and-archive ported the surviving
assertions from all four into the single guard
`packages/shared/test/guards/no-remnants.test.ts` and then deleted the
four source files, with a consolidation pin inside the guard asserting
they stay gone; root-docs-refresh appended its docs seams to the same
guard.

## Effort-wide rules

- Do NOT reimplement: no ticket touches the aura skill (doc, resources,
  CLI sources, committed bundle), engineering-foundation, or archived task
  history (except the final archive operation).
- The committed aura bundle mechanism stays as is. One letter-level
  exception to the bundle clause above, disclosed by
  manifest-and-infra-cleanup: that ticket's own build gate regenerated
  the committed bundle, because the keyring module the bundle embeds
  shrank with the Atlassian union removal and the previously committed
  bundle no longer matched a fresh build; the regeneration also embedded
  a js-yaml caret-range float (4.3.2 within `^4.1.0`) from the fresh
  install. The mechanism itself, the build gate owning the bundle's
  content, is unchanged.
- No em-dashes in any touched prose.
- Verification gates per ticket: the typecheck target, the bundle build
  target, the shared package's runner suite, and the per-file strip-types
  suites the ticket's area touches.

## dashboard-extension-removal (m)

- Exports: none; deletions only.
- Existing abstractions to use: the package manifest's extension
  registration; the root gitignore's exception lines (the comment above
  `dist/**` was rewritten with them; its sole rationale named the dashboard
  bundles); the root test tree's vitest suite for the dashboard.
- Do NOT reimplement: do not touch the shared digest modules (the next
  ticket owns them) or any other extension.
- Seams: (1) the package manifest's registered extension list; (2) the
  tracked tree shape (no dashboard directory); (3) the root suite runner
  green over the remaining test trees; (4) the typecheck and build gates.
- Interface contract: after this ticket, the only remaining importers of
  the shared digest modules are the digest unit tests, the scripts-side
  followup test, and the three e2e trees (which the
  digest-core-and-build-pkg-cleanup ticket deletes); no extension loads
  the dashboard.

## digest-skill-and-agents-removal (s)

- Exports: none; deletions only.
- Existing abstractions to use: the package manifest's skills and
  subagents registration.
- Do NOT reimplement: do not touch the remaining skills' content.
- Seams: (1) the manifest's registration shape (skills scan unchanged, no
  subagents block); (2) the tracked tree (no digest skill directory, no
  agents directory); (3) typecheck, build, and a clean session load.
- Landed lineage: this ticket's chain forked from `develop` instead of
  ticket 1's landing branch; the repair merge `e327de2` carried the
  dashboard deletions into this lineage, so the stack holds both.
- Interface contract: the final skill and agent surface exists (the docs
  and guard tickets build on it).

## secrets-aura-pat-only (m)

- Exports: the secrets extension's shrunk surface, pinned by a
  module-surface test at 11 keys: argument parsing, completions, the MCP
  bearer-token reader, discovery sources and finder, the single-key
  pickSecretKey, the edit decision, the generalized handleEdit with Aura
  PAT defaults, the chooser orchestrator, the discover flow, plus the
  default factory. The chooser machinery stayed with exactly one Aura
  PAT item and zero confirm prompts. The provisioning module and its
  exports are gone, along with the guided-walkthrough offer, its dynamic
  import, handleAtlassianPatEdit, and WALKTHROUGH_DOC_PATH; the extension
  source carries zero Atlassian or walkthrough references.
- Existing abstractions to use: the shared keyring interface and settings
  reader; the extension's existing editor and confirm UI patterns; the
  sibling module-surface test pattern.
- Do NOT reimplement: no new secrets flow; the chooser stays; do not touch
  the digest settings surface (manifest-and-infra-cleanup owns removing
  it).
- Seams: (1) the extension's exported module surface; (2) parsed-command
  and chooser-decision behavior as pure functions; (3) the edit flow
  against injected UI and keyring fakes; (4) typecheck.
- Interface contract: after this ticket, no extension reads the digest
  settings namespace (the only read lived in the deleted
  guided-walkthrough block), so the settings module's last digest
  reference can go.

## digest-core-and-build-pkg-cleanup (m, blocked by dashboard-extension-removal)

- Exports: the shared package's manifest loses its digest subpath exports
  (the manifest carried nine `./digest/*` entries, not the seven
  originally counted here; the count-agnostic criterion, no digest
  subpaths, governed); the exports map now holds `.`, `./keyring`,
  `./aura-client`, and the `./*` catch-all. The scripts manifest was
  renamed from `aura-digest-scripts` to `aura-skill-scripts` with a
  digest-free description; the MCP SDK dependency is dropped (its only
  consumer was the deleted in-process digest MCP client), and the embed
  stack stays because it serves rest search. One comment-only touch
  dropped the deleted `aura-digest.ts` co-reference from the
  `packages/shared/src/aura-client.ts` header.
- Existing abstractions to use: the shared package's exports map and
  runner; the scripts workspace manifest (its morning-fetch script and
  followup test are the digest core's scripts-side consumers); the root
  test tree's e2e families.
- Do NOT reimplement: do not remove the digest settings reference from
  the shared settings module (manifest-and-infra-cleanup owns it); do not
  touch the secrets extension; never delete the per-ticket absence
  suites.
- Seams: (1) the shared manifest's exports map; (2) the shared runner green
  without the digest suites, which took
  `drop-dead-shared-exports.test.ts` with them (its subject, the
  `aura-digest.ts` exports, vanished; its fs-read pattern survives in
  the guards suites); (3) the scripts manifest shape (name,
  description, dependency set); (4) the tracked tree (no digest source or
  test modules in the shared package or the scripts workspace, no e2e
  families), with the absence suites relocated out of
  `packages/shared/test/digest/` to `packages/shared/test/guards/`
  (preserved, never deleted) and joined there by this ticket's own third
  guard suite (fs reads, no imports, 14 assertions); (5) typecheck and
  build. Deleting the e2e families emptied the root test tree, so
  `vitest.config.ts` gained an interim `passWithNoTests: true`, removed
  with the runner by manifest-and-infra-cleanup.
- Interface contract: after this ticket, the only digest reference left in
  packages/shared source is the one in `settings.ts` (comment-level, as
  it turned out; manifest-and-infra-cleanup owns it), the scripts
  manifest is digest-free, and the three guard suites under
  `packages/shared/test/guards/` await the guard ticket's consolidation.

## manifest-and-infra-cleanup (m, blocked by the three removal tickets)

- Exports: the shared settings type without the digest namespace; the
  shared keyring secret-key union without its three Atlassian members
  (dead type surface after the provisioning removal; routed here from the
  level-0 deviation reports because the coherence pass cannot change API
  surfaces). As built, `AuraClientSettings` never carried a digest field:
  what remained was the header comment's documented shape (mcpServers +
  digest) plus a stale cross-reference to the long-deleted scripts-side
  settings module, both deleted, with the guard pinning the absence.
  `SecretKey` is now the single member `{ service: "aura"; name: "pat" }`,
  all three backends' known-key lists shrank in step, and the shared
  keyring test was trimmed to the aura/pat member (the shared tsconfig
  typechecks `test/**`, so the Atlassian round-trip describes had to go).
- Existing abstractions to use: the root manifest, the build manifest, the
  shared package's manifest, settings type, and keyring secret-key union.
- Do NOT reimplement: do not re-add any test runner at root; the per-package
  runner convention stands.
- Seams: (1) the settings type's shape and the keyring secret-key union's
  shape (no digest namespace, no Atlassian members, shared suite green);
  (2) the root manifest's devDependency set, pruned per-dependency to the
  single verified survivor `@earendil-works/pi-tui` (its consumer is the
  aura-feedback extension), with root typescript and @types/node dropped
  too because the typecheck targets resolve workspace-local tooling and
  no root tsconfig exists; peerDependencies are untouched (the runtime
  contract with pi); (3) the root vitest configuration deleted (the
  interim `passWithNoTests` flag inherited from
  digest-core-and-build-pkg-cleanup goes with it) and the empty root
  test tree gone; (4) the build manifest without its digest-era comment
  (targets unchanged); (5) a fresh install plus typecheck, build, and the
  remaining suites green. A fourth per-ticket guard suite (fs reads, no
  imports, 9 assertions) pins the four assertable seams under
  `packages/shared/test/guards/`, awaiting the final consolidation.
- Interface contract: the final manifest and infra shape exists (the docs
  describe it; the guard asserts it).

## root-docs-refresh (m, blocked by digest-skill-and-agents-removal and manifest-and-infra-cleanup)

- Exports: none; doc edits, the one archive operation (the stale
  Atlassian provisioning bug report git-mv'd to the bugs archive with
  status fixed and a Resolution note), and seven doc-seam tests in four
  describe blocks appended to the no-remnants guard (that guard's
  consolidation contract makes the single guard file this effort's
  structural home). The README skill table gained its missing
  engineering-foundation row (the tables seam required it), and one
  stale digest-dashboard clause was scrubbed from the shared codegen
  config's comment (comment-only, no behavior change).
- Existing abstractions to use: the five root docs' existing structures;
  the bugs archive convention for the stale Atlassian provisioning bug
  report (this effort fixed that bug by deleting the guided-walkthrough
  path, so `docs/bugs/atlassian-provision-test-broken-import.md` is
  archived with a resolution note; routed here from the level-0 deviation
  reports).
- Do NOT reimplement: no new docs; no instruction-content refresh beyond
  digest mentions (the audit effort owns that; deliberately left for it
  as residual staleness: the README Commands section's no-commands claim
  and its intro's agents wording, the agent conventions doc's agents
  line, the glossary's PAT and Keyring entries, and the dead keyring
  externals in the aura-skill build config).
- Seams: (1) docs content: no digest or Atlassian-provisioning mentions
  outside task history, and no active bug report mentioning Atlassian
  provisioning (the archived report carries the resolution note; the
  testing doc's runner and mock conventions were re-described for the
  per-package runner reality); (2) the README's skill and agent tables
  match the shipped manifest. The doc seams are pinned by the guard's
  doc-seam tests, so any reintroduction fails the shared runner.
- Interface contract: none downstream except review. The shared runner
  stands at 169/169 at this ticket's tip, the guard now carrying 40
  tests.

## no-remnants-guard-and-archive (m, blocked by digest-skill-and-agents-removal and manifest-and-infra-cleanup)

- Exports: the single structural guard suite
  `packages/shared/test/guards/no-remnants.test.ts` in the shared
  package's test tree, consolidating all four per-ticket guard suites
  (33 tests in 8 describe blocks at landing); the four per-ticket suite
  files are deleted, with a consolidation pin inside the guard asserting
  they stay gone. One ported assertion is strengthened: "registers no
  digest-dashboard extension" became "registers no digest-named
  extension" (a case-insensitive filter over the manifest's
  `pi.extensions` list), so the remnant class cannot reappear under a new
  digest name; the digest-core suite's two relocation-bookkeeping
  assertions were interim-state bookkeeping, superseded by the
  consolidated end state.
- Existing abstractions to use: the structural-assertion test pattern from
  the deleted digest suite (fs reads, no imports); the four per-ticket
  guard suites under `packages/shared/test/guards/` (the two relocated
  from `test/digest/`, the digest-core third, the manifest-and-infra
  fourth), whose assertions this ticket consolidates into the guard; the
  task tree's archive convention.
- Do NOT reimplement: do not rebuild a general lint; assert absence only.
- Seams: (1) the guard suite green under the shared runner, failing on any
  reintroduced remnant, with the four per-ticket suites' assertions
  consolidated into it; the failure sensitivity is proven by four
  throwaway mutations (a digest subpath export, a digest source
  directory, a digest-named extension registration, a svelte
  devDependency), each tripping exactly its intended assertion and
  reverted, never committed, since a committed remnant-factory would be
  the forbidden general lint; (2) the task index no longer lists the dead
  effort (the refine-phase-transition effort): the archive is a pure git
  rename, the index moves the effort to the Archived list, and the seam
  lives as three permanent guard tests in a task-tree archive describe
  block (live directory gone, archive directory present, live list free
  of the entry); (3) the registration smoke (manual): a fresh session
  loads clean (exit 0, zero load output), the secrets command is
  present, and no digest-named command or tool appears in the
  73-command, 70-tool dump.
- Interface contract: the guard is the effort's contract with the future
  (any future remnant class must extend the single guard);
  root-docs-refresh appended its doc-seam tests to it, for 40 tests
  total. Two strict "exactly" pins, the `skills/core` directory list and
  the surviving subpath exports list, will trip on future legitimate
  additions until the guard is extended, and the archive seam couples
  three shared-runner tests to docs/tasks paths. The Atlassian
  provisioning class sits outside the guard's asserted classes: the
  secrets module-surface test pins the extension's export surface, but
  the provisioning module's deletion (`extensions/atlassian-provision.ts`
  with its test, and the two Atlassian token docs) was verified by
  command, not by any assertion, so a reintroduced provisioning module
  would trip no assertion. The user-level settings file can still carry
  its stale `aura.digest` block (package-external state, no longer read
  by the shrunk settings type).
