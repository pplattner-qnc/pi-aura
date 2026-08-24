---
kind: slice
slug: digest-fetch-and-save-tools
title: digest-fetch + digest-save tools (thin wrappers over aura-digest.mjs)
task: ../task.md
mode: afk
size: m
blocked_by: [slash-command-and-tool-activation]
---

## End-to-end behavior

Two agent-callable tools — `digest-fetch` and `digest-save` — replace the
skill's bash shell-outs to `aura-digest.mjs`. `digest-fetch` returns the
digest + report JSON directly (typed) + writes `~/.pi/aura/digest.json`;
`digest-save` writes `last-digest.json`.

## Acceptance criteria

- `index.ts`: `pi.registerTool("digest-fetch", …)` with `execute` that runs
  `aura-digest.mjs fetch` (via `child_process` or by importing the fetch
  function from the built bundle) + parses its output (the temp-dir path +
  the `digest.json`/`report.json` files) → returns `{ digest, report }` as
  `AgentToolResult` content. Ensures `~/.pi/aura/digest.json` is written (the
  script does it; the tool confirms).
- `pi.registerTool("digest-save", …)` with `execute` that runs
  `aura-digest.mjs save <dir>` → writes `last-digest.json`; returns a short
  confirmation.
- The tools are registered but **inactive by default** (not in
  `getActiveTools()`; slice 1's `/digest` activates them).
- No bash shell-outs in the skill prose for fetch/save (slice 4 rewrites the
  skill; this slice just provides the tools).
- Unit-test the tools with a fixture (mock the fetch/save subcommand output,
  not real Aura): `digest-fetch` returns `{ digest, report }` + writes the
  dashboard file; `digest-save` writes `last-digest.json`.

## Test plan

- **Seams:** the tool `execute` functions — test with a mocked
  `child_process` (or a fixture temp dir the real `aura-digest.mjs` writes).
- **Scenarios:** (a) `digest-fetch` → returns digest + report + writes
  `~/.pi/aura/digest.json`; (b) `digest-save` → writes `last-digest.json`;
  (c) fetch failure → tool returns a clear error result.
- **Failure modes:** Aura PAT missing / fetch error → tool returns an error
  result (doesn't throw); the agent can surface it.
- **Edge cases:** the temp-dir the script writes — the tool reads +
  cleans up (or leaves it; the script's `cleanup` is dropped in slice 4).

## Constraints and dependencies

- `blocked_by: [slash-command-and-tool-activation]` (the activation mechanism
  exists; these tools are what it activates).
- D5: thin wrapper — the `.mjs` stays the single source of truth; the tool
  is a typed face over it. Don't port the fetch logic to the tool (deferred).
