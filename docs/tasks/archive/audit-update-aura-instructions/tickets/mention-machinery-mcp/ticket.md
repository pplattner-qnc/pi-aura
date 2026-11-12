---
type: ticket
subtype: feature
title: Mention machinery on MCP
status: deprecated
workflow_state: done
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

## Implementation notes

Landed as merge 3176edb on task/mention-machinery-mcp (eleven commits: the original nine plus the route-back fix pair; the merged tree is bit-identical to the verified tip). The mention machinery runs every server lookup through the typed interface; the whole change lives in the reference engine and its test (the three interface modules, the manifest, and the cache module are untouched).

Durable facts for dependents: the adapters' seam is renamed createClient to createInterface, and the removed exports (the four structural client types, the two warmup seed constants, the private default-client import) were package-internal with no remaining consumers (verified by grep). Wiki versions load lazily at resolution only (no insert-time fetch, no cache write-back; one node read per expansion, so a repeated mention refetches). Every tree node is an autocomplete candidate, folders included; the by-path read is assumed to resolve documents only, and a folder-exclusion discriminator would need a live probe (recorded as the one unverified-live assumption). The wiki warmup is space-listed: one tree per listed space, capped at 500 nodes per space. The factory holds a persistent connection released on /reload (untested; pi-runtime verified only). Two factory hooks exist for tests: loadCredentials and createCache (the registration extension's hook pattern mirrored); production wiring passes nothing.

The route-back addendum (second chain run): the first verification found the production blocker, the construction of the interface without credentials latching cache-only for every user; the fix loads real credentials through the exported loader at session_start and passes baseUrl and pat beside notify. The construction-path regression test runs with no injected caller anywhere: the real loader over fixture seams, the real MCP client and streamable transport over loopback HTTP to a local fake aura-mcp-dev serving the shipped contracts; it re-runs acceptance criteria 1 and 2 at the production path and pins the corrected warmup wire parameters there. The verify pass additionally probed the production instance read-only through the shipped construction path using the config-file PAT; the keyring-PAT live check stays on the operator's list.
