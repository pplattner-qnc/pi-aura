---
type: map
title: Remove the digest functionality entirely
status: deprecated
blocked_by: []
---

# Remove the digest functionality

## Destination

The digest functionality is gone from the package: no aura-digest skill, no
digest-dashboard extension, no morning agents, no shared digest modules, no
Atlassian dev-links machinery, no digest settings namespace, no digest
tests. The tree is green (`task typecheck`, full test suite), README /
CONTEXT.md / AGENTS.md no longer mention the digest, the dead
`refine-phase-transition` effort is archived, and the package still installs
and works for the core `aura` and `engineering-foundation` skills. No
standalone version bump here: the 0.9.0 release happens at the
audit-update-aura-instructions finalize and covers both efforts.

Reached on 2026-10-30: all seven tickets landed (see the changelog entry and
the twice-reconciled arch spec); every gate is green and a consolidated
no-remnants guard pins the end state. The 0.9.0 release itself stays deferred
to the audit effort's finalize per the decision above.

## Constraints

- The Aura PAT path stays: the aura-secrets core (settings + keyring PAT)
  and `createDefaultAuraClient()` are untouched.
- Package-external state is untouched: `~/.pi/aura/last-digest.json` stays
  on disk, and the user-level `atlassian` entry in `~/.config/mcp/mcp.json`
  is not modified.
- `task typecheck` and the full test suite pass after removal.
- Archived task history (`docs/tasks/archive/digest-*`) is history:
  untouched.
- No em-dashes in any touched prose.

## Decisions so far

- Full removal (grilling Q3), including the Atlassian dev-links machinery
  whose only consumer is the digest. Verified during planning: nothing
  outside `packages/shared/src/digest` imports `@pi-aura/shared/digest`, and
  `atlassian-provision.ts` is reached only through the guided-walkthrough
  import inside `aura-secrets.ts`.
- Coarse removal inventory (to-spec refines this into exact files and
  per-dependency decisions):
  - `skills/core/aura-digest/` (skill doc + dist)
  - `.pi/extensions/digest-dashboard/` and its `package.json`
    `pi.extensions` entry
  - `agents/aura-morning-fetcher.md`, `agents/aura-morning-digest.md`
    (the legacy morning pipeline) and the `pi.subagents` entry in
    `package.json` (the directory becomes empty; drop the section)
  - `packages/shared/src/digest/*` and `packages/shared/test/digest/*`
  - `scripts/morning-fetch.js` and `scripts/src/followup-working-on.test.ts`
  - the `settings.digest` namespace in `packages/shared/src/settings.ts`
  - inside extensions that stay: the digest settings + guided-walkthrough
    section of `aura-secrets.ts` and all of `atlassian-provision.ts` (spec
    exploration found no digest references in `aura-skill-instruction.ts`;
    the original inventory line naming it was wrong)
  - the Atlassian provisioning docs `docs/atlassian-api-token.md` and
    `docs/atlassian-api-token-walkthrough.md`
  - test scaffolding: the digest-dashboard config in `vitest.config.ts`,
    `test/digest-dashboard/`, `test/atlassian-keyring-auth/`,
    `test/bitbucket-token-infra/`, `test/wire-bitbucket-reader/`
  - root docs: README (skill table row, agents table, morning-routine
    section, digest lines in design principles), CONTEXT.md (the Digest,
    digest-dashboard, in-process, and /digest terms), AGENTS.md (the
    `skills/core/aura-digest` line), docs/testing.md (the digest and
    Atlassian sections, the FakeKeyring example re-point), and
    docs/dev-env.md (the digest reproduction mention); the two doc files
    joined the scope at spec time
  - `Taskfile.yml` digest note
  - root `package.json`: the digest-dashboard entry, the subagents entry,
    and digest-only devDependencies (verify per dependency: svelte, vite
    plugins, tailwind, daisyui, @fontsource, happy-dom, 0x,
    @lanterna-profiler; keep anything other code needs)
  - root `@napi-rs/keyring` dependency: verify whether it serves only the
    in-process digest fetch or also the aura.mjs / aura-secrets keyring
    path; keep it if the latter
- Archive `refine-phase-transition` (its only ticket is a digest view
  change with no reason to exist without the dashboard) as part of the
  removal landing; update `docs/tasks/index.md`.
- Keep `add-capacity-subcommands` as-is (user decision, grilling Q4): a
  CLI capacity surface may still be wanted; not this effort's business.

Decisions recorded during execution (2026-10-30):

- Two level-0 deviation routings, applied to pending charters within the
  approved Q3 scope: the shared keyring secret-key union shrink went to
  manifest-and-infra-cleanup (the coherence pass cannot change API
  surfaces), and the stale Atlassian bug-report archive went to
  root-docs-refresh.
- The stacked landing lineage forked once (the second ticket forked from the
  starting branch); user-approved repair merge folded ticket 1's landing
  back into the stack, and every later chain forked from the current stack
  tip per the reconciled arch spec.
- The per-ticket absence suites were relocated (never deleted) and finally
  consolidated into a single 40-test no-remnants guard, which also absorbed
  the docs ticket's seams.
- The end-of-effort stage authored the repo's first gated test protocol
  into docs/testing.md (always-run set plus numbered run-if-asked gates),
  resolving the suite runner's fail-closed refusal.
- Chain budgets: after two deadline backstops on one ticket, the user
  approved a 45-minute window, which carried the remaining chains.

## Fog

None at planning time; the to-spec refinements settled everything. The two
fog items of the audit effort (not this one) remain with it.

## Out of scope

- Any instruction-content refresh beyond removing digest mentions (the
  audit-update-aura-instructions effort owns that; its update tickets land
  after this removal).
- Deleting `~/.pi/aura/last-digest.json` or touching the user-level
  `atlassian` MCP config.
- The 0.9.0 version bump and release (the audit effort's finalize owns it).
