---
kind: slice
slug: 2-wiki-expansion-instruction
title: "#wiki: expansion, dual resolution, instruction completion"
task: ../task.md
mode: afk
status: todo
size: s
blocked_by: [1-wiki-autocomplete]
---

## End-to-end behavior

On submit, both `#wiki:<space>/<path>` and `#wiki:<uuid>` resolve to the
same canonical `<wiki-ref space="..." path="..." version="...">title</wiki-ref>`
(title XML-escaped, attributes escaped). Resolution is cache-first
(cached metadata supplies space, path, version), then
`getKnowledgeNodeByPath` for path-form tokens or `getKnowledgeNode` for
uuid-form tokens; unresolvable references stay exactly as typed so the
agent can resolve them via the `aura` skill. The engine's per-turn
instruction block grows the wiki-ref shape, completing the
one-block-documents-all-four end state (task, rule, artifact, wiki).

## Acceptance criteria

- [ ] Both input forms expand to the same canonical `<wiki-ref space path version>title</wiki-ref>` with proper escaping.
- [ ] Resolution is cache-first, then the shape-appropriate endpoint (`getKnowledgeNodeByPath` for paths, `getKnowledgeNode` for uuids); unresolvable references are left as typed.
- [ ] A cached page resolves without any fetch (metadata supplies all attributes).
- [ ] A prompt without references passes through unchanged.
- [ ] The instruction block documents all four tag shapes in the one block, per the effort spec.
- [ ] Without credentials no targeted fetch happens; mentions stay as typed.
- [ ] Unit tests cover the expansion format, dual-endpoint resolution, cache-first behavior, and unknown-reference passthrough.

## Test plan

Seams: the adapter's expansion and resolution (injected client and
fake cache).

Failure modes: cache miss then endpoint miss (unchanged); endpoint
throws (unchanged); no credentials (no fetch attempt).

Scenarios: path form and uuid form of the same page produce identical
expansions; mixed known and unknown mentions; a title with XML-special
characters; version from cached metadata versus from the targeted
fetch.

Edge cases: a path form with an unknown space (left as typed); a uuid
form that matches no node (left as typed); duplicate mentions; the
mention at start, middle, and end of the prompt.

## Constraints

- Bodies are never inlined (map constraint).
- No em-dashes in prose.
