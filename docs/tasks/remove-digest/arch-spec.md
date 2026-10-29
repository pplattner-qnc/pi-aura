---
type: arch spec
title: remove-digest architecture
status: stable
---

# remove-digest architecture

Starting branch: develop. Every ticket is a deletion or a slimming; nothing
new is exported except the shrunk secrets surface and the final guard suite.
The TDD loop runs red-first as absence assertions: an assertion at the
ticket's seam fails on the pre-removal tree (RED), then the deletion makes
it pass (GREEN). Absence tests live in the shared package's test tree (its
runner stays); the final ticket consolidates them into the guard.

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
  registration; the root gitignore's exception lines; the root test tree's
  vitest suite for the dashboard.
- Do NOT reimplement: do not touch the shared digest modules (the next
  ticket owns them) or any other extension.
- Seams: (1) the package manifest's registered extension list; (2) the
  tracked tree shape (no dashboard directory); (3) the root suite runner
  green over the remaining test trees; (4) the typecheck and build gates.
- Interface contract: after this ticket, the only remaining importers of
  the shared digest modules are the digest unit tests and the three e2e
  trees (which digest-core-and-build-pkg-cleanup deletes); no extension
  loads the dashboard.

## digest-skill-and-agents-removal (s)

- Exports: none; deletions only.
- Existing abstractions to use: the package manifest's skills and
  subagents registration.
- Do NOT reimplement: do not touch the remaining skills' content.
- Seams: (1) the manifest's registration shape (skills scan unchanged, no
  subagents block); (2) the tracked tree (no digest skill directory, no
  agents directory); (3) typecheck, build, and a clean session load.
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
  runner; the scripts workspace manifest; the root test tree's e2e
  families.
- Do NOT reimplement: do not remove the digest settings field from the
  shared settings type (manifest-and-infra-cleanup owns it); do not touch
  the secrets extension.
- Seams: (1) the shared manifest's exports map; (2) the shared runner green
  without the digest suites; (3) the scripts manifest shape (name,
  description, dependency set); (4) the tracked tree (no digest source or
  test modules, no e2e families); (5) typecheck and build.
- Interface contract: after this ticket, the only digest reference left in
  packages/shared source is the settings field, and the scripts manifest
  is digest-free.

## manifest-and-infra-cleanup (m, blocked by the three removal tickets)

- Exports: the shared settings type without the digest namespace.
- Existing abstractions to use: the root manifest, the build manifest, the
  shared package's manifest and settings type.
- Do NOT reimplement: do not re-add any test runner at root; the per-package
  runner convention stands.
- Seams: (1) the settings type's shape; (2) the root manifest's
  devDependency set (each drop verified unused); (3) the root vitest
  absence and empty root test tree; (4) a fresh install plus typecheck,
  build, and the remaining suites green.
- Interface contract: the final manifest and infra shape exists (the docs
  describe it; the guard asserts it).

## root-docs-refresh (m, blocked by digest-skill-and-agents-removal and manifest-and-infra-cleanup)

- Exports: none; doc edits only.
- Existing abstractions to use: the five root docs' existing structures.
- Do NOT reimplement: no new docs; no instruction-content refresh beyond
  digest mentions (the audit effort owns that).
- Seams: (1) docs content: no digest or Atlassian-provisioning mentions
  outside task history; (2) the README's skill and agent tables match the
  shipped manifest.
- Interface contract: none downstream except review.

## no-remnants-guard-and-archive (m, blocked by digest-skill-and-agents-removal and manifest-and-infra-cleanup)

- Exports: the structural guard suite in the shared package's test tree.
- Existing abstractions to use: the structural-assertion test pattern from
  the deleted digest suite (fs reads, no imports); the task tree's archive
  convention.
- Do NOT reimplement: do not rebuild a general lint; assert absence only.
- Seams: (1) the guard suite green under the shared runner, failing on any
  reintroduced remnant; (2) the task index no longer lists the dead effort;
  (3) the registration smoke (manual): a fresh session loads clean, the
  secrets command is present, the digest command and tools are absent.
- Interface contract: the guard is the effort's contract with the future.
