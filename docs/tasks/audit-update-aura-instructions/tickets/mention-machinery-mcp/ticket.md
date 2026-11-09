---
type: ticket
subtype: feature
title: Mention machinery on MCP
status: stable
workflow_state: ready
blocked_by:
- aura-mcp-interface
size: l
---

## What to build

The mention machinery (the reference engine and its sqlite cache) switches every Aura lookup from the REST library to the typed interface built by the aura-mcp-interface ticket, and in doing so fixes the two live bugs the audit found: the task search sends parameters the server does not accept (the stale `search` and `status` keys; the live contract is the full-text parameter plus archived visibility), and the wiki tree derivation has never populated a single wiki row because it reads fields the tree no longer returns.

Task mentions: search via the typed task-search method with the corrected parameters, paged cache warmup, resolution by human key. Artifact mentions: search and resolution through the artifact methods (parameters already aligned). Wiki mentions: search through the knowledge-search method; resolution by identifier and by path; the tree walk adapts to the slim tree shape (candidates derive from title and slug; versions load lazily from the node read when a reference is inserted or resolved).

Everything observable stays the same: the reference tags and rendered title and status lines, the legacy human-key spelling with its deprecation warning, and the strict cache-first behavior (pi renders autocomplete exactly once per keystroke; the cache is the only synchronous source; fresh lookups are background writes; late resolutions after further typing are dropped). A tool path marked unavailable by the interface's self-check degrades to cache-only answers for that kind, never to render lag or a thrown pane.

The reference instruction's artifact kind list becomes the live set (PLAN, OPINION, GENERIC, and the chat-only TEMPORARY), and the "no space-listing verb" premise drops (the listing exists).

## Acceptance criteria

- [ ] Typing a task, artifact, or wiki mention renders candidates instantly from the cache; none of the three kinds waits on the network.
- [ ] After a session with Aura reachable, the cache holds fresh rows for all three kinds, including wiki rows (verified against a reachable instance).
- [ ] The task search sends only parameters the live server accepts; the stale keys are gone.
- [ ] A wiki mention resolves to a reference whose version comes from the lazily fetched node read.
- [ ] With a tool path marked unavailable by the interface self-check, that mention kind still renders from cache and never blocks the pane.
- [ ] The existing reference-engine test suite passes extended with the interface-fed cases (slim-tree candidates, lazy versions, corrected task parameters) using the fake caller.

## Blocked by

- aura-mcp-interface
