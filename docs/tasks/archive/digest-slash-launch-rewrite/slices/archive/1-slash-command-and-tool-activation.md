---
kind: slice
slug: slash-command-and-tool-activation
title: The /digest command — activate tools + inject the skill (verify the mechanism)
task: ../task.md
mode: hitl
size: m
blocked_by: []
status: done
---

## End-to-end behavior

A `/digest` extension command activates the digest tools + injects the
`aura-digest` skill into the agent context, which triggers a turn that runs
the skill. This slice verifies the **mechanism** (the map's Fog: does
`pi.sendMessage` + `triggerTurn` make the agent *execute* the injected
skill?) before building the rest.

## Acceptance criteria

- `index.ts`: a `pi.registerCommand("digest", { handler })` (keep the old
  `digest-dashboard` command temporarily for the transition).
- The `/digest` handler: (a) `pi.setActiveTools([...new Set([...pi.getActiveTools(), "digest-dashboard-start", "digest-dashboard-stop", "digest-fetch", "digest-save"])])` — even though fetch/save aren't built yet (slices 2), activate start/stop now + the others when they exist; (b) read `skills/core/aura-digest/SKILL.md` from disk (resolve relative to the repo root via the extension's cwd/sessionCwd) + `pi.sendMessage({ customType: "aura-digest-skill", content: <SKILL.md body>, display: false }, { triggerTurn: true })`.
- Verify (hitl): in a real pi session, run `/digest` → confirm the agent
  receives the skill content + starts executing it (e.g. it tries to run the
  fetch step — even if it falls back to the old bash path for now, the
  *injection* worked). If the agent does NOT execute the injected content,
  fall back to `pi.sendUserMessage("Run the aura-digest skill")` + keep the
  skill user-invokable via `/skill:` — record the de-escalation + return to
  Wayfinder if the whole approach fails.

## Test plan

- **Seams:** the command handler is testable with a fake `pi` (capture
  `setActiveTools` + `sendMessage` calls). Unit-test: `/digest` handler →
  `setActiveTools` includes the digest tools + `sendMessage` called with the
  SKILL.md content + `triggerTurn: true`.
- **Scenarios:** (a) handler activates the 4 tools; (b) handler injects the
  skill content; (c) `triggerTurn: true`.
- **Failure modes:** SKILL.md path resolution fails → handler reports a clear
  error, no crash.
- **Edge cases:** running `/digest` twice — idempotent activation (set is a
  set).

## Constraints and dependencies

- None blocking. This is the mechanism-verify slice; if it fails, the whole
  approach de-escalates. Keep the old `digest-dashboard` command until slice 5.
