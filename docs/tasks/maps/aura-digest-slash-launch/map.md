---
kind: map
slug: aura-digest-slash-launch
title: Re-launch the Aura digest as a slash-gated, tool-driven flow with zero idle context + fix the real-data render bug
status: active
tasks: "[{slug: digest-real-data-render-bug, blocked_by: [], done: false}, {slug: digest-slash-launch-rewrite, blocked_by: [digest-real-data-render-bug], done: false}]"
---

## Destination

The `aura-digest` interactive dashboard stops being an always-present,
model-invokable skill that shells out to `aura-digest.mjs`, and becomes a
**slash-gated, tool-driven flow with zero idle context**:

- **The skill is not model-invokable** (`disable-model-invocation: true`) —
  the agent never auto-loads it; its description is not in the system prompt in
  a normal session.
- **The dashboard tools are inactive by default** (registered but not in the
  active set) — their descriptions are not in the system prompt either.
- **A single `/digest` slash command** is the sole entry. Its handler:
  1. activates the digest tools (`pi.setActiveTools`), and
  2. forcibly launches the skill by injecting its content into the agent
     context (`pi.sendMessage` + `triggerTurn`).
- **The agent drives the digest via typed tools**, not bash + `aura-digest.mjs`
  subcommands: a `digest-fetch` tool returns the digest + report JSON directly
  (and writes `~/.pi/aura/digest.json` for the dashboard server); `digest-save`
  writes `last-digest.json`; `render`/`cleanup` drop (the dashboard *is* the
  render). The `.mjs` CLI can stay as a thin wrapper / scripted-use surface, or
  be dropped if the tool is the single source — settled in the feature task.
- **The dashboard renders real Aura data** (the stuck-loading bug is fixed).

Concretely, done looks like:

- A fresh pi session has **zero** digest footprint in the system prompt (no
  skill description, no tool descriptions) until `/digest` is run.
- `/digest` activates the tools + injects the skill → the agent runs the flow:
  `digest-fetch` (typed) → augment → `digest-save` → start the dashboard via
  the `digest-dashboard-start` tool → wait for clicks → act on one via the
  `aura` skill → ack + clear → clean close (`digest-dashboard-stop`).
- The dashboard page renders **real** Aura data (not just the fixture).
- No `sed`/stdout parsing or temp-dir plumbing in the skill prose.

## Constraints

- **Aura only.** The Atlassian (Jira Teamwork Graph) + Bitbucket paths stay out
  of scope.
- **Don't break the working mechanism.** The detached server, the `state.json`
  listener, the SPA's click→POST→forward loop, and teardown are all landed +
  unit-tested; this map reuses them, it doesn't rewrite them (except the SPA's
  initial-load reactivity bug).
- **Zero idle context is the core requirement.** Any design that leaves the
  skill or tool descriptions in the system prompt of a normal session fails
  the destination.
- **The `aura` skill handoff stays.** When a click asks the agent to act, it
  loads the `aura` skill (unchanged) — only the `aura-digest` entry surface +
  fetch mechanism change.
- **Backwards-compat for scripted use.** If the `.mjs` CLI is dropped, the
  feature task must confirm there's no scripted/non-pi caller that needs it
  (the map's `digest-actions-and-followup` task wrote `~/.pi/aura/digest.json`
  via the script — that's the one caller to check).
- **No hidden plan.** If implementation exposes uncertainty (e.g. the
  skill-injection mechanism doesn't work as the docs imply), stop and return
  to Wayfinder.

## Decisions so far

Settled in the post-finalization conversation (2026-08-24), not a grilling
task — the back-and-forth *was* the grilling:

- **D1 — Entry surface: slash-gated, not model-invokable.** The `aura-digest`
  skill gets `disable-model-invocation: true`. The agent never auto-loads it.
  Rationale: no value in model-invocability for a once-a-day deliberate
  browser-spawning action; the context tax (skill description always in the
  system prompt) buys nothing.
- **D2 — Tools inactive by default.** The `digest-dashboard-start`/`-stop`
  tools stay registered (the extension loads at startup) but are **not** in
  the active tool set in a normal session (`pi.setActiveTools` excludes them)
  → their descriptions are not in the system prompt until the slash activates
  them. (Confirmed: `pi.setActiveTools` + the `promptGuidelines`-only-while-
  active semantics in the extensions doc support this.)
- **D3 — The slash command is the sole entry + forcibly launches the skill.**
  `/digest` (an extension `registerCommand`) handler: (a) `setActiveTools`
  adds the digest tools; (b) reads the `aura-digest` SKILL.md from disk +
  `pi.sendMessage({ customType, content: <SKILL.md body>, display: false },
  { triggerTurn: true })` injects the skill instructions into the agent context
  and triggers a turn. (Confirmed: `pi.sendMessage` injects into LLM context;
  extension commands are checked before skill expansion, so the slash is the
  sole entry, not `/skill:aura-digest`.)
- **D4 — Tool-ify the fetch (drop the bash shell-outs).** The skill no longer
  shells out to `aura-digest.mjs fetch` via bash + parses stdout. A
  `digest-fetch` tool returns the digest + report JSON directly (typed,
  structured) and writes `~/.pi/aura/digest.json` (+ the temp files the
  dashboard server reads). `digest-save` writes `last-digest.json`. `render`/
  `cleanup` drop (the dashboard is the render). The orchestrator's judgment
  work (fill `summary`, re-rank `actions[]`) stays the agent's job, not a tool.
- **D5 — Where the fetch logic lives: thin wrapper first.** The
  `digest-fetch` tool's `execute` calls `aura-digest.mjs fetch` internally +
  parses its output (the `.mjs` stays the single source of truth; the tool is
  a typed face over it). Refactor to shared `@pi-aura/shared` code later only
  if dual maintenance bites. (Deferred to a future task if it does.)
- **D6 — The stuck-loading bug is a separate bug task**, not folded into the
  feature. Rationale: it's an unverified fix on main (the `started`-guard
  targets the suspected Svelte 5 `$effect` double-invocation race but was
  never confirmed against real data); it may be fixable independently + it's a
  blocker (the dashboard is broken on real data right now), so it goes first.

## Fog

- **Will `pi.sendMessage({ customType, content, triggerTurn })` from a command
  handler actually make the agent *execute* the injected skill content?** The
  docs confirm the injection + turn-trigger, but whether the agent treats the
  injected SKILL.md as instructions-to-run vs. a passive message is a runtime
  behavior. If it doesn't run, the fallback is `pi.sendUserMessage("Run the
  aura-digest skill")` + keep the skill user-invokable via `/skill:` — a
  small de-escalation. → Resolved during the feature task's first slice (a
  verify-the-mechanism slice).
- **Does `disable-model-invocation: true` also hide the skill from the
  `/skill:` listing?** The doc says "Users must use `/skill:name`" — implying
  it stays listed. That's acceptable (D1 only requires not-model-invokable;
  `/skill:aura-digest` being available is harmless). Not a blocker.
- **Is the `started`-guard fix (commit `e6b42fe`) sufficient, or is the
  stuck-loading bug a deeper Svelte 5 reactivity issue?** The bug task's
  first move is a real-data e2e reproduction; if the guard doesn't fix it,
  the fix boundary expands (possibly `await tick()` / moving the `digest`
  assignment / a different mount pattern). Left to the bug task.

## Out of scope

- The `aura` skill's content (only routes into it).
- The detached server / listener / `state.json` / teardown mechanism (reused
  as-is; only the SPA's initial-load bug is in scope).
- Refactoring the fetch logic into `@pi-aura/shared` (D5 — deferred; thin
  wrapper first).
- Re-doing the Impeccable visual polish (already landed; the rewrite keeps
  the polished `Digest.svelte`, just fixes its load bug).
- Removing the `aura-digest.mjs` CLI entirely (D5 leaves it as the impl the
  tool wraps; dropping it fully is a later call).

## Task graph

1. `digest-real-data-render-bug` (bug) — reproduce the stuck-on-"Loading…"
   bug with real Aura data, confirm/fix the `started`-guard, restore real-data
   rendering. `blocked_by: []` (blocker; goes first).

2. `digest-slash-launch-rewrite` (feature) — the slash-gated entry +
   tool-ification (D1–D5). `blocked_by: [digest-real-data-render-bug]` (the
   rewrite reuses the SPA; no point tool-ifying a dashboard that doesn't
   render).

Wayfinder wires `blocked_by` after all slugs exist.
