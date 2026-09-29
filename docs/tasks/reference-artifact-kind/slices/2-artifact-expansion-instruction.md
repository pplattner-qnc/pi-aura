---
kind: slice
slug: 2-artifact-expansion-instruction
title: "#artifact: expansion and instruction block"
task: ../task.md
mode: afk
status: todo
size: s
blocked_by: [1-artifact-autocomplete]
---

## End-to-end behavior

On submit, a `#artifact:<uuid>` mention expands inline to
`<artifact-ref id="..." kind="..." version="...">title</artifact-ref>`
(version = latest), with the title XML-escaped and attribute values
escaped. Resolution is cache-first (cached metadata supplies the kind
and version), then a targeted `getArtifact` on a cache miss;
unresolvable references stay exactly as typed so the agent can resolve
them via the `aura` skill. The engine's per-turn instruction block grows
the artifact-ref shape.

## Acceptance criteria

- [ ] `#artifact:<uuid>` expands to `<artifact-ref id kind version>title</artifact-ref>` with proper escaping.
- [ ] Resolution is cache-first, then `getArtifact`; unresolvable references are left as typed.
- [ ] Cache metadata supplies the kind and version without a fetch when the item is cached.
- [ ] A prompt without references passes through unchanged.
- [ ] The instruction block documents the artifact-ref shape alongside task-ref and rule-ref.
- [ ] Without credentials no targeted fetch happens; mentions stay as typed.
- [ ] Unit tests cover the expansion format, the cache-first resolution path, the `getArtifact` fallback, and unknown-uuid passthrough.

## Test plan

Seams: the adapter's expansion and resolution (injected client and
fake cache).

Failure modes: cache miss then `getArtifact` miss (unchanged);
`getArtifact` throws (unchanged); no credentials (no fetch attempt).

Scenarios: a single mention; multiple mentions; mixed known and
unknown; a title with `&`, `<`, `"`; version taken from cached metadata
versus from the targeted fetch.

Edge cases: a mention whose cached entry lacks version metadata
(fallback to the targeted fetch); the mention at start, middle, and
end of the prompt; duplicate mentions of the same artifact.

## Constraints

- Bodies are never inlined (map constraint): the reference carries
  id, kind, version, and title only.
- No em-dashes in prose.
