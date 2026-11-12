---
type: task
subtype: research
title: Which claims in README.md, CONTEXT.md, and AGENTS.md are stale against the post-removal package and current Aura?
status: deprecated
workflow_state: done
blocked_by: []
---

## Question

Audit the root docs claim by claim:

- README.md: the install example pins `v0.1.0` while package.json is 0.8.0;
  the skill table includes aura-digest and the agents table lists the
  morning agents (both removed by remove-digest: mark "removal handles");
  the morning-routine usage section; the design-principles lines about the
  digest pipeline and `deepseek-v4-flash`; the prerequisites and MCP
  config section.
- CONTEXT.md: the digest-related terms (Digest, digest-dashboard,
  in-process, /digest: "removal handles"); the `mcp*` tools term (it embeds
  the "90" count and the old server description); the AuraClient
  description.
- AGENTS.md: the `skills/core/aura-digest` line ("removal handles"); the
  rest against current Aura.
- docs/testing.md and docs/dev-env.md (amended into this task at
  remove-digest spec time): after remove-digest rewrites their digest and
  Atlassian sections, audit the remaining claims: the keyring-era bundle
  externals claim, the runner and mock-convention descriptions, and
  anything else that no longer matches the post-removal tree.

Mark each digest-related claim "removal handles"; audit the rest against
current Aura and the post-removal tree.

## Unblocks

The root-docs update tickets.

## Trusted sources

- The five files (README.md, CONTEXT.md, AGENTS.md, docs/testing.md,
  docs/dev-env.md).
- The live server facts (the mcp-inventory-drift report).
- package.json and Taskfile.yml for what the post-removal package actually
  ships.

## Evidence

A claim-by-claim list in
`docs/tasks/audit-update-aura-instructions/tasks/root-docs-drift/report.md`
(claim, file and line, verdict: stale / removal-handles / current,
correction).

## Likely dependents

to-spec.

## Notes

Resolved 2026-11-09 against the five files (README.md, CONTEXT.md, AGENTS.md, docs/testing.md, docs/dev-env.md), package.json, Taskfile.yml, the pi 1.5 docs, the live machine config, and the introspection dump. Evidence report: .work/report.md (57 claim rows: 19 stale, 38 current; zero digest or Atlassian leftovers, because remove-digest plus the earlier root-docs refresh already scrubbed them).

Settled results:
- README.md:23-37 MCP config is stale: pi 1.5 reads ~/.pi/agent/mcp.json with url plus headers (headers.Authorization), not ~/.config/mcp/mcp.json with type/auth/bearerToken. The working entry on this machine confirms the pi-native shape.
- README.md:43 install pin @v0.1.0 is stale: package.json is 0.8.0, latest tag v0.8.0.
- CONTEXT.md:30 "the full server has 90" is stale: the live server exposes 120 tools; skills/core/aura/SKILL.md L11 and L81 mirror the same stale number (owned by mcp-inventory-drift).
- The credential story is rewritten and the docs lag it (aura-access-rewrite, archived): the REST CLI reads the PAT from the OS keyring plus baseUrl from ~/.pi/agent/settings.json (aura-credentials.ts L41-63); mcp.json is now only the /aura secrets discover import source (CONTEXT.md L21-24, L56-57; dev-env.md L23-24).
- CONTEXT.md:43-44 @napi-rs/keyring is stale: zero references anywhere; the backends are FileKeyring, MacosKeyring, and Linux D-Bus Secret Service via dbus-next.
- dev-env.md:6-14 setup flow is stale: root workspaces install (not cd scripts && npm install), codegen lives in packages/shared, one bundle (skills/core/aura/dist/aura.mjs), not "skill bundles". dev-env.md:35-37 is stale: no live keyring smoke test exists (keyring.test.ts uses FileKeyring on temp files), no KeyringBackend symbol; the seam is FakeKeyring / FileKeyring.
- README.md:14-16 "No user-facing commands" is stale: aura-secrets registers the /aura slash command (aura-secrets.ts:325) and aura-feedback registers the aura_feedback tool.
- README.md:20 prerequisites pi-subagents plus pi-mcp-adapter are stale: unused by the package; pi 1.5 has built-in MCP.
- testing.md:96-98 mock convention 2 is stale (the suite states it cannot stub the generated SDK, hey-api-aura-client.test.ts:16-19); minors: AGENTS.md:40 names a "slice" pointer absent from state.yaml, testing.md:42 "typecheck + bundle" one-liner, testing.md:30 glob comment.

Recommendation (high confidence, all rows tree-grounded or dump-grounded): land the root-docs update tickets as one pass in the report's priority order (credential and MCP story, 90 to 120, version pin, README extensions section, dev-env flow, minors), keeping no-remnants.test.ts green while text moves.

Open items: whether the README should also document mcp.json's discovery-source role next to the pi-native config is a wording choice for the update ticket; the SKILL.md 90-tools lines are owned by mcp-inventory-drift; the report lives at .work/report.md (.work is the gitignored, guard-exempt evidence location), while task.md's Evidence section says report.md.
