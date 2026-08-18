---
kind: task
type: grilling
slug: aura-access-grilling
title: Decide what the Aura access rewrite even is
map: aura-access-rewrite
status: done
blocked_by: []
size: m
started_at: 2026-08-18T16:45:00Z
completed_at: 2026-08-18T17:10:00Z
slices: []
---

## Decision to settle

What does "rewrite the code used for accessing Aura" concretely mean?
Settled through one-question-at-a-time grilling (14 questions across 5
rounds). The full settled destination is recorded in the map's "Decisions
so far" and "Facts established by Wayfinder" sections.

## Outcome

All 14 branches of the design tree visited, nothing silently assumed. The
destination: scripts talk to Aura's REST API directly via the generated
client, behind an implementation-agnostic `AuraClient` interface with
expressive domain types; the PAT comes from the OS keyring; the instance
base URL from settings.json; a `/aura secrets` slash-command (discover +
edit) handles migration and manual editing; the Aura MCP wrapper is
removed from the scripts path but the `aura-mcp-dev` MCP entry stays for
the skill/agent.

## Downstream work created

Implementation task(s) to be spawned by Wayfinder from this settled
destination — see the map for the full decision table. Likely shape:
(1) `aura-client.ts` interface + `HeyApiAuraClient` implementation + factory;
(2) migrate `aura.ts`/`aura-digest.ts` call sites + dedupe types;
(3) `/aura secrets` extension (discover + edit) with extensible discovery
sources; (4) remove `bearerClient` Aura path from `clients.ts`. To be
precisely scoped and wired as feature tasks by the next Wayfinder pass.
