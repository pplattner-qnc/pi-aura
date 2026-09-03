---
kind: slice
slug: rewrite-skill-doc-and-tests
title: Rewrite the aura-digest skill doc off the CLI; fix tests; audit other docs; friction log
task: ../task.md
mode: afk
status: todo
size: m
blocked_by: [drop-dead-shared-exports]
---

## End-to-end behavior

The `aura-digest` skill doc no longer references the deleted CLI (`aura-digest.mjs`, `dist/`, `task build` for the digest, "bundled by esbuild"). It describes the in-process tools flow (which it already drives). Other docs/skills that referenced `aura-digest.mjs` are rewired. A friction log records any wider-choreography desires. Tests pass.

## What this slice delivers

- `skills/core/aura-digest/aura-digest.md`: rewrite the CLI-era references (description line 3; lines 15, 63, 76, 84, 350; any others) to describe the in-process tools flow — no `aura-digest.mjs`, no `dist/`, no `task build` for the digest bundle, no "bundled by esbuild". The skill already drives the flow through tools (the tools are the source of truth); remove the CLI-era framing/provenance. Keep the routing table, the step choreography (start → fetch → augment → save → wait), the digest contract, the digest-update/digest-ack tool guidance (task 3). This is the "full skill-doc rewrite" tasks 2–4 deferred here.
- `test/digest-dashboard/skill-md-prose.test.ts`: it asserts "no bash shell-outs to `aura-digest.mjs`" (a guard — keep it, still valid). Update any assertion that checks the skill doc *describes* the bundle (it shouldn't anymore). Re-run; fix failures (the test may need its expectations updated to match the rewritten doc).
- Audit other docs/skills: grep the whole repo for `aura-digest.mjs`/`dist/aura-digest` references. Update `README.md`, `docs/testing.md` (the `scripts/` build section — the `aura-digest` bundle is gone; `aura.mjs` stays), `Taskfile.yml` (any `aura-digest` build target), other skill docs. Rewire to the tools (or remove the stale reference).
- `docs/testing.md`: update the `scripts/` build description (the `aura-digest` bundle is gone; the `aura` bundle stays) + any `aura-digest.mjs` reference. Keep the codegen/tsConfigPath note (unchanged).
- **Friction log:** if the skill-doc rewrite surfaces anything that wants wider skill-choreography redesign (e.g. the step order wants to change now that there's no CLI), record it via `submit_feedback` (kind: "architecture" or "friction") AND a note in the task doc's `## Implementation notes` — to be turned into a separate map/task if warranted, never absorbed here.
- Final gate: full vitest + shared `tsx --test` + all typechecks + `aura.mjs` build green; no `aura-digest.mjs`/`dist/aura-digest` anywhere; the skill doc references only the tools.

## Acceptance criteria

- The skill doc references only the in-process tools; no `aura-digest.mjs`/`dist/`/`task build` for the digest.
- No `aura-digest.mjs`/`dist/aura-digest` references remain anywhere in the repo (grep clean, except maybe historical CHANGELOG/archived task docs).
- `skill-md-prose.test.ts` passes (updated assertions).
- Full vitest + shared `tsx --test` + all typechecks + `aura.mjs` build green.
- Friction log recorded (if any).

## Test plan

- Grep the repo: no `aura-digest.mjs`/`dist/aura-digest` (except archived task docs / CHANGELOG history).
- `skill-md-prose.test.ts` passes.
- Full vitest + shared `tsx --test` + typechecks + `aura.mjs` build green.

## Constraints and dependencies

- Blocked by slice 2 (the dead exports must be gone).
- Do NOT redesign the skill choreography beyond removing CLI-era framing (collect as friction).
- Do NOT touch the in-process tools/store/server.
- Do NOT delete the `aura.mjs` bundle / `aura` skill.
