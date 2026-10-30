---
type: arch spec
title: remove-digest architecture
status: stable
---

# remove-digest architecture

Starting branch: develop. The stacked-branch model fork broke once: the
digest-skill-and-agents-removal chain forked from `develop` instead of the
previous ticket's landing branch, and the repair merge `e327de2` carried
the dashboard deletions into that lineage. The current stack tip is
`task/secrets-aura-pat-only`; every pending ticket forks from the current
stack tip, never from `develop`.

Every ticket is a deletion or a slimming; nothing new is exported except
the shrunk secrets surface and the final guard suite. The TDD loop runs
red-first as absence assertions: an assertion at the ticket's seam fails
on the pre-removal tree (RED), then the deletion makes it pass (GREEN).
The per-ticket absence suites live in `packages/shared/test/digest/`
(`dashboard-extension-removal.test.ts` and
`digest-skill-and-agents-removal.test.ts`), under the shared package's
runner, which stays. When digest-core-and-build-pkg-cleanup empties that
directory it relocates the suites to the shared package's test root or a
guards directory; it never deletes them. The final ticket consolidates
them into the guard.

## Effort-wide rules

- Do NOT reimplement: no ticket touches the aura skill (doc, resources,
  CLI sources, committed bundle), engineering-foundation, or archived task
  history (except the final archive operation).
- The committed aura bundle mechanism stays as is.
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

- Exports: the secrets extension's shrunk surface: command parsing,
  discovery, the chooser (machinery kept, one Aura PAT item), and the
  generalized edit flow. The provisioning module and its exports are gone.
- Existing abstractions to use: the shared keyring interface and settings
  reader; the extension's existing editor and confirm UI patterns; the
  sibling module-surface test pattern.
- Do NOT reimplement: no new secrets flow; the chooser stays; do not touch
  the digest settings field (manifest-and-infra-cleanup owns it).
- Seams: (1) the extension's exported module surface; (2) parsed-command
  and chooser-decision behavior as pure functions; (3) the edit flow
  against injected UI and keyring fakes; (4) typecheck.
- Interface contract: after this ticket, no extension reads the digest
  settings namespace, so the field can go.

## digest-core-and-build-pkg-cleanup (m, blocked by dashboard-extension-removal)

- Exports: the shared package's manifest loses its seven digest subpath
  exports; the scripts manifest loses the MCP SDK dependency and its
  digest-era name.
- Existing abstractions to use: the shared package's exports map and
  runner; the scripts workspace manifest (its morning-fetch script and
  followup test are the digest core's scripts-side consumers); the root
  test tree's e2e families.
- Do NOT reimplement: do not remove the digest settings field from the
  shared settings type (manifest-and-infra-cleanup owns it); do not touch
  the secrets extension; never delete the per-ticket absence suites.
- Seams: (1) the shared manifest's exports map; (2) the shared runner green
  without the digest suites; (3) the scripts manifest shape (name,
  description, dependency set); (4) the tracked tree (no digest source or
  test modules in the shared package or the scripts workspace, no e2e
  families), with the absence suites relocated out of
  `packages/shared/test/digest/` to the shared package's test root or a
  guards directory, preserved, never deleted; (5) typecheck and build.
- Interface contract: after this ticket, the only digest reference left in
  packages/shared source is the settings field, the scripts manifest is
  digest-free, and the relocated absence suites (from
  dashboard-extension-removal and digest-skill-and-agents-removal) await
  the guard ticket's consolidation.

## manifest-and-infra-cleanup (m, blocked by the three removal tickets)

- Exports: the shared settings type without the digest namespace; the
  shared keyring secret-key union without its three Atlassian members
  (dead type surface after the provisioning removal; routed here from the
  level-0 deviation reports because the coherence pass cannot change API
  surfaces).
- Existing abstractions to use: the root manifest, the build manifest, the
  shared package's manifest, settings type, and keyring secret-key union.
- Do NOT reimplement: do not re-add any test runner at root; the per-package
  runner convention stands.
- Seams: (1) the settings type's shape and the keyring secret-key union's
  shape (no digest namespace, no Atlassian members, shared suite green);
  (2) the root manifest's devDependency set (each drop verified unused);
  (3) the root vitest absence and empty root test tree; (4) the build
  manifest without its digest-era comment (targets unchanged); (5) a fresh
  install plus typecheck, build, and the remaining suites green.
- Interface contract: the final manifest and infra shape exists (the docs
  describe it; the guard asserts it).

## root-docs-refresh (m, blocked by digest-skill-and-agents-removal and manifest-and-infra-cleanup)

- Exports: none; doc edits and one archive operation only.
- Existing abstractions to use: the five root docs' existing structures;
  the bugs archive convention for the stale Atlassian provisioning bug
  report (this effort fixed that bug by deleting the guided-walkthrough
  path, so `docs/bugs/atlassian-provision-test-broken-import.md` is
  archived with a resolution note; routed here from the level-0 deviation
  reports).
- Do NOT reimplement: no new docs; no instruction-content refresh beyond
  digest mentions (the audit effort owns that).
- Seams: (1) docs content: no digest or Atlassian-provisioning mentions
  outside task history, and no active bug report mentioning Atlassian
  provisioning (the archived report carries the resolution note); (2) the
  README's skill and agent tables match the shipped manifest.
- Interface contract: none downstream except review.

## no-remnants-guard-and-archive (m, blocked by digest-skill-and-agents-removal and manifest-and-infra-cleanup)

- Exports: the structural guard suite in the shared package's test tree.
- Existing abstractions to use: the structural-assertion test pattern from
  the deleted digest suite (fs reads, no imports); the relocated per-ticket
  absence suites, whose assertions this ticket consolidates into the
  guard; the task tree's archive convention.
- Do NOT reimplement: do not rebuild a general lint; assert absence only.
- Seams: (1) the guard suite green under the shared runner, failing on any
  reintroduced remnant, with the per-ticket absence assertions
  consolidated into it; (2) the task index no longer lists the dead effort;
  (3) the registration smoke (manual): a fresh session loads clean, the
  secrets command is present, the digest command and tools are absent.
- Interface contract: the guard is the effort's contract with the future.
