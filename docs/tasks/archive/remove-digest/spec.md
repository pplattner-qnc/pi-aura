---
type: spec
title: Remove the digest functionality entirely
status: stable
---

## Problem Statement

The package still ships a morning-digest pipeline (a user-invoked skill, an
in-process dashboard extension with a Svelte SPA, seven registered digest
tools, two morning subagents, a shared digest module family, and an
Atlassian dev-links provisioning path) that Aura itself has replaced with a
serviceable dashboard. Everything digest is now dead weight: it drags a
Svelte/Vite/Tailwind devDependency stack into the package, keeps an Atlassian
token provisioning flow alive whose only consumer was the digest's
dev-links enrichment, and fills the skill list, tool registry, and docs with
surfaces that no longer do anything. Maintainers pay for all of it on every
install and every change, and consumers see inert commands and skills.

## Solution

Remove the digest functionality entirely and cleanly: delete the skill, the
dashboard extension and its tools, the morning agents, the shared digest
modules and their subpath exports, the Atlassian dev-links machinery, the
digest settings namespace, the digest and Atlassian test families, and the
root vitest setup. Slim the secrets extension to the Aura PAT only (keeping
its existing chooser flow with a single item), prune the root devDependency
stack to what remains used, and make README, CONTEXT.md, AGENTS.md, the
testing doc, and the dev-env doc describe the post-removal package. The
`aura` and `engineering-foundation` skills, the artifact/wiki/rest CLI, and
the Aura PAT keyring path are untouched. A structural guard test plus the
existing typecheck/build/unit seams prove the removal is complete and
nothing broke; the dead digest effort is archived from the task tree.

## User Stories

1. As a package consumer, I want the morning-digest skill gone from the
   skill list, so that skill discovery shows only routines that still work.
2. As a package consumer, I want no digest tools (dashboard start/stop,
   fetch, finalize, log, update, ack) registered in my sessions, so that the
   tool registry carries nothing inert.
3. As a package consumer, I want the digest launch command gone, so that
   the command palette only offers live commands.
4. As a package consumer, I want no dashboard HTTP server or browser tab
   ever spawned, so that sessions stay lean and predictable.
5. As a package consumer, I want the package to install without the
   Svelte/Vite/Tailwind/vitest stack, so that installs are smaller and
   faster.
6. As a pi session user, I want the package's remaining extensions to load
   cleanly at session start, so that no load errors appear.
7. As a pi session user, I want the secrets command to manage only the Aura
   PAT, so that the flow matches what the package actually supports.
8. As a package consumer, I want the Atlassian provisioning walkthrough and
   its two docs gone, so that nothing suggests provisioning tokens that
   nothing consumes anymore.
9. As a package consumer, I want no leftover digest or Atlassian settings
   namespace, so that settings stay limited to what is real (base URL, MCP
   servers).
10. As a package consumer, I want the morning subagents gone, so that no
    dead agent surface ships.
11. As a package consumer, I want the aura skill untouched (artifact, wiki,
    upload, and rest CLI workflows), so that my daily Aura work survives the
    removal unchanged.
12. As a package consumer, I want nothing writing digest state to my home
    directory anymore, so that the package leaves no digest footprint.
13. As a maintainer, I want typecheck and the bundle build green after
    removal, so that I can trust the import graph is clean.
14. As a maintainer, I want the remaining unit suites green (shared package,
    extensions, scripts), so that surviving behavior stays pinned.
15. As a maintainer, I want a structural guard test asserting no digest
    remnants, so that the removal cannot silently regress.
16. As a maintainer, I want a fresh-session registration smoke, so that the
    package still loads end to end after the removal.
17. As a maintainer, I want README, CONTEXT.md, and AGENTS.md to no longer
    mention the digest, so that the docs match the package.
18. As a maintainer, I want the testing and dev-env docs to describe the
    post-removal test reality, so that contributors run the right commands.
19. As a maintainer, I want the dead digest effort archived in the task
    tree, so that the live list shows only real work.
20. As a maintainer, I want the internal build package renamed away from its
    digest-era name, so that nothing carries the dead name.
21. As a maintainer, I want the Atlassian and Bitbucket e2e helper trees
    removed, so that the test tree carries nothing for deleted machinery.
22. As a maintainer, I want no npm manifest or Taskfile reference to the
    digest left behind, so that tooling discovery shows only live entries.
23. As a contributor, I want the MCP SDK dependency dropped from the
    scripts workspace, so that dependencies match what the remaining code
    consumes.
24. As an agent using the aura skill, I want the skill's instructions and
    resources left alone by this removal, so that instruction drift is
    handled only by the audit effort, not mixed into a deletion.

## Implementation Decisions

- Delete the digest skill directory including its committed CLI bundle
  leftover.
- Delete the dashboard extension package entirely: the in-process server,
  the Svelte SPA and its committed front-end bundles, the in-memory store,
  the listener, the fixtures, and its per-extension manifest; drop its
  registration from the package manifest and its gitignore exception lines.
- Delete both morning agents and the subagents registration in the package
  manifest (the agents directory empties).
- Delete the shared digest module family (fetch core, action builder,
  dev-links with its Bitbucket client, the in-process MCP client, the
  scheduler, the types, the digest settings loader) and the digest tests;
  remove the seven digest subpath exports from the shared package manifest;
  the shared settings type loses its digest namespace and its header
  comment reference.
- Delete the legacy morning-fetch script from the scripts workspace, plus
  the digest followup unit test that lives there.
- Slim the secrets extension minimally (user decision: keep the chooser):
  keep the command skeleton, the discovery flow, the chooser machinery
  (now listing only the Aura PAT), and the generalized edit flow; remove the
  Atlassian labels and placeholders, the Atlassian key mappings, the
  combined email+token edit flow, the guided-walkthrough offer and its
  dynamic import of the provisioning module, and the digest settings read.
- Delete the Atlassian provisioning module, its unit tests, and the two
  Atlassian token docs under docs.
- Delete the root test tree (the dashboard vitest suite and the three
  Atlassian/Bitbucket e2e families) and the root vitest configuration; the
  runner convention stays the per-package built-in runner, so the repo has
  no root test runner afterwards.
- Prune the root devDependencies to what remains used: drop the Svelte,
  Vite, Tailwind, daisyui, fontsource, vitest, and happy-dom stack and the
  two profiling tools; keep whatever the remaining root config still needs
  (each drop verified against actual use at implementation time).
- Drop the MCP SDK dependency from the scripts workspace; its only consumer
  was the deleted digest MCP client.
- Rename the scripts workspace package away from its digest-era name and
  fix its description; keep the single aura entry point, the bundle flow,
  and the rest-doc generation unchanged.
- Update the root docs: README (skill table, agents table, morning-routine
  usage section, digest lines in the design principles), CONTEXT.md (the
  digest-related terms, the AuraClient consumer wording, the digest
  relationships), AGENTS.md (the digest line in the skill layout), the
  testing doc (remove the digest and Atlassian sections, re-point the
  FakeKeyring example to a remaining test), and the dev-env doc (drop the
  digest reproduction mention).
- Taskfile: drop the digest-era note from the bundle verification comment;
  no target changes.
- Archive the dead digest effort (the phase-transition ticket) in the task
  tree and refresh the root task index.
- The committed aura bundle stays committed under the existing force-add
  mechanism; only the dashboard's gitignore exceptions go.
- Regenerate lockfiles after the dependency drops.
- External state is untouched: the last-digest data file in the user's home
  stays on disk, and the user-level Atlassian MCP entry is not modified.
- No version bump in this effort; the release is cut by the audit effort's
  finalize.

## Testing Decisions

- A good test here asserts external behavior and structure, not
  implementation: the surviving modules keep their exported surfaces
  pinned, the import graph is proven by compile and bundle, and absence is
  proven structurally, not by grepping around.
- Seams (approved by the user):
  1. Compile seam: the typecheck target over the scripts and shared
     workspaces; any dangling digest import fails here.
  2. Bundle seam: the build target; the aura skill's bundle still builds,
     the rest docs regenerate, and the output verification passes.
  3. Unit seams: the shared package's built-in-runner suite (keyring,
     AuraClient, settings, embed) and the per-file strip-types suites for
     the remaining extension and scripts tests.
  4. Structural guard: a new small suite in the shared package asserting
     no digest remnants: no digest subpath exports, no digest source or
     test directory, no dashboard extension directory, no subagents
     registration or agents directory, and a root devDependency list free
     of the dashboard stack. Prior art: the digest suite's own
     no-dead-exports structural test pattern.
  5. Registration smoke: a fresh pi session in the repo loads the package
     with no extension load errors and the secrets command still
     registers; run as a verify step, not an automated test.
- The slimmed secrets extension is pinned by a module-surface smoke (the
  pattern the shrunk task-rendering extension test already uses) plus its
  remaining parse, discovery, and edit tests; the Atlassian tests are
  deleted with the flows they covered.
- The aura skill CLI is intentionally not behavior-tested beyond the
  existing suites: this effort deletes code around it and must not change
  it.

## Out of Scope

- Refreshing any instruction content against current Aura (the audit effort
  owns that; its update tickets land after this removal).
- The version bump and release (cut as 0.9.0 at the audit effort's
  finalize).
- Deleting the last-digest data file from the user's home or touching the
  user-level MCP configuration.
- Simplifying the secrets flow beyond removing the Atlassian entries (the
  chooser stays, per user decision).
- Any Aura-side change or feedback (the sanctioned channel for that is the
  feedback tool).
- Deciding what to do with the unregistered health extension (the audit
  effort investigates it).

## Further Notes

- Two map corrections discovered during spec exploration: the skill
  instruction extension has no digest references (the map's inventory line
  was wrong; nothing to change there), and the testing and dev-env docs
  belong in the removal scope (the map listed only README, CONTEXT, and
  AGENTS).
- Both committed bundles live past the dist gitignore via force-add; the
  aura bundle keeps that mechanism and only the dashboard's exception lines
  are removed.
- The audit effort's root-docs task should additionally sweep the testing
  and dev-env docs for non-digest staleness (keyring-era claims); it will
  be amended accordingly.
- The registration smoke doubles as the acceptance check that the digest
  tools and command are truly gone from a live session, not just from the
  source tree.
