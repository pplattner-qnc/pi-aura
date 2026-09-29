---
kind: task
type: feature
slug: reference-task-alias
title: Legacy @AURA- through the engine; the task extension shrinks to the probe
map: unified-reference-mentions
status: ready
blocked_by: [reference-engine-core]
slices: [1-aura-alias-atomic-switch]
---

## What to build

`@AURA-42` keeps working but becomes a legacy alias registered in the
shared engine: the same autocomplete suggestions, and on submit the same
expansion path, so a legacy mention expands to the new `<task-ref>` tag
(never `<aura-task>`; there is exactly one expansion format regardless of
how the reference was typed). The first legacy-syntax use in a session
triggers a user-visible deprecation warning, once per session, stating
the syntax is deprecated and will be removed in a future version; the
warning is user-only and never enters the prompt sent to the model.

The old task extension shrinks accordingly: `aura-tasks.ts` keeps only the
session-start reachability probe. Its `@AURA-` autocomplete, expansion,
and `<aura-task>` system-prompt instruction are deleted; the engine's
instruction block becomes the only task-reference documentation in the
system prompt.

## Acceptance criteria

- [ ] `@AURA-42` still autocompletes and still expands on submit, now via the engine's alias registration.
- [ ] Legacy mentions expand to the same `<task-ref>` tag as `#task:` mentions.
- [ ] `<aura-task>` is no longer emitted anywhere.
- [ ] The first legacy-syntax token per session shows the deprecation warning exactly once (user-visible, not sent to the model).
- [ ] `aura-tasks.ts` keeps only the reachability probe; its autocomplete, expansion, and instruction block are removed.
- [ ] Exactly one task-reference instruction block remains in the system prompt (the engine's).
- [ ] Unknown keys are still left as typed; without Aura credentials the legacy path no-ops silently.

## Blocked by

- reference-engine-core

## Implementation notes

### Slice 1: 1-aura-alias-atomic-switch (landed)

- The registration: `createAuraTaskAlias(taskAdapter)` builds the alias
  and the extension factory registers it right after building the
  registry: `registry.registerAlias(createAuraTaskAlias(taskAdapter))`.
  The landing is atomic with the aura-tasks deletion (one commit; the
  commit before it is red tests only): while the alias is registered, the
  old extension's input handler would have transformed the same mention.
- The pattern pins the legacy grammar the old extension had:
  `(?:^|[ \t])@(AURA-\d+)\b$` with the `i` flag. Token boundary before
  `@`; at least one digit, so a bare `@AURA-` is not a mention (no
  suggestions, no warning; suggestions start at the first digit, where
  the old overlay already showed the same rows); a trailing word boundary
  so glued letters (`@AURA-42abc`) end the token; `i` keeps `@aura-42`
  working. Scanning on submit drops the `$` anchor through the engine's
  `globalScanPattern` (which adds `m`): mentions at the start of later
  lines in a multiline prompt now expand, matching the `#task:` behavior
  (the old extension's scan had no `m`, so those stayed as typed).
- Interface contract for the rule ticket (the friction the real
  registration surfaced): the engine's adapter seam could not express
  legacy-token autocomplete insertion (`formatRow`/`searchLocal` always
  emit `#kind:` rows), so `LegacyAlias` gained the optional `searchLocal`
  hook (rank + format cached items as legacy rows; falls back to the
  adapter's rows when omitted) and `ExtractedReferenceToken` carries the
  matched registration (`alias?`) so the provider can find the hook.
  `@rule:` registers the same way: a pattern whose group 1 is the rule
  name, kind `rule`, and its own `searchLocal` formatting `@rule:<name>`
  rows (rules are local-only, so their rows never need a server search).
- No partial adaptation was needed (resolving the carried-forward
  engine-core note): the alias partial is the full key shape (`AURA-4`
  while typing `@AURA-4`), which `filterReferenceItems`'s plain
  key-prefix matching ranks. The task keyMatch's number-prefix hook only
  matters for digits-only partials, which never arise through the alias;
  `@AURA-42` offers the same set the old number filter produced (AURA-42
  and AURA-424).
- The alias rows reuse the task adapter's `formatRow` for the description
  (`[status] title`) and swap value/label to the legacy token, so
  selection inserts `@AURA-42` (the user stays in the syntax they typed;
  the warning teaches the new one). The provider now declares
  `triggerCharacters: ["#", "@"]` (`@` is also a pi-tui default trigger
  character, so the declaration documents ownership as much as it changes
  behavior). The alias query also fires the same stale-while-revalidate
  background refresh as `#task:` (with the full-key partial as the
  `listTasks` search string), which the old overlay never had.
- The deprecation warning: `promptHasLegacyMention(prompt, registry)`
  (pure, new export) is the trigger; the input handler composes it with
  the once-per-session decision (`createDeprecationWarningDecision`, one
  per `session_start`) and `ctx.ui.notify` (user-only, never in the
  prompt). The trigger is the pattern, not resolution: an unknown
  `@AURA-999` warns too, and a new-syntax prompt never consumes the latch
  (short-circuit order).
- aura-tasks.ts after the shrink: `checkAuraReachable`,
  `formatUnreachableWarning`, and the `session_start` probe wiring,
  byte-identical (two wiring comments adapted because they referenced the
  deleted siblings); the extension stays registered in the package
  manifest. `aura-tasks.test.ts` shrinks to a module-surface pin (the
  runtime exports are exactly the probe pair plus the factory, so
  nothing regrows into the module) + the factory smoke; the probe's
  logic tests live in `aura-health.test.ts` as before. `<aura-task>` is
  emitted nowhere; the engine's `TASK_REF_INSTRUCTION` is the only
  task-reference block in the system prompt.
- Tests: 5 new sections in `aura-references.test.ts` (recognition,
  autocomplete rows with legacy insertion, expansion routing through
  `resolveFullToken` with the targeted fallback, the warning trigger, the
  warning composition) plus the reworked alias-API block; 40 sections
  total, all green.
