---
type: deviation report
title: 2-wiki-expansion-instruction
status: stable
---
## Deviation report: 2-wiki-expansion-instruction

Scope reviewed: the slice 2 red and green commits (`ec34a68` red,
`d44aee8` green; files: `extensions/aura-references.ts`,
`extensions/aura-references.test.ts`). Tests run: `node
--experimental-strip-types extensions/aura-references.test.ts` passes
(72 sections), every other extension suite passes, root vitest 236
green, shared `tsx --test` 202 green, both typechecks (scripts, shared)
clean. The pre-existing red (`atlassian-provision.test.ts`) is out of
scope (`docs/bugs/atlassian-provision-test-broken-import.md`). The
dual-form resolution was additionally exercised against live Aura before
landing: both forms of the same page produced the identical canonical
expansion, and the unresolvable cases returned null.

### API surface changes

- **Planned (arch spec):** `formatExpansion` emitting
  `<wiki-ref space path version>title</wiki-ref>` with proper escaping;
  `resolveFullToken` cache-first (cached metadata supplies space, path,
  version), then `getKnowledgeNodeByPath` for path-form tokens or
  `getKnowledgeNode` for uuid-form tokens; unresolvable references stay
  as typed; the instruction block grows the wiki-ref shape.
- **Actual:** all of that landed as specified, with these refinements:

  1. **The uuid form's targeted fetch is a node-plus-tree join.** The arch
     spec named `getKnowledgeNode` for uuid-form tokens, but the node
     response carries no ancestor chain (no path), so resolution composes:
     `getKnowledgeNode(uuid)` supplies the space, the fresh title, and
     the fresh version, and the space's (memoized) tree supplies the
     canonical path. The fresh node's title and version WIN over the
     tree's snapshot, which is what makes both identity forms resolve to
     the same current expansion (the path form's `getKnowledgeNodeByPath`
     is equally fresh). A uuid whose node is absent from its space's tree
     resolves to null (a wrong path would be worse than no expansion).
  2. **The cache-first lookup is keyed by the token's shape.** The uuid
     form matches the item id, the path form the item key
     (case-insensitively), both gated on complete cached metadata (the
     artifact kind's completeness gate: a metadata-less row falls through
     to the fetch rather than expanding with half the attributes).
  3. **A bare space slug is neither form and fetches nothing.** The path
     form requires a slash to split space from path; `#wiki:eng`
     submitted as-is resolves to null without any client build (an
     unresolvable reference, left as typed).
  4. **Every public method builds exactly one client per call.** The
     tree fetch (`fetchTreeItems`) reuses the caller's client instead of
     building its own, so the uuid form's two API roundtrips (node +
     tree) share one client build; `createDefaultAuraClient` resolves
     credentials per call, so this halves that cost on the resolution
     path.
  5. **One red-phase test expectation was corrected during green**: the
     metadata-less fallback's by-path call carries the full path after
     the space segment (`process/qa-checklist`, not the bare slug); the
     implementation was right, the pinned expectation was a test typo.
  6. **The instruction block grew one example element and one
     paragraph** beside the existing task-ref, rule-ref, and artifact-ref
     shapes (space/path/version semantics, title as element text, never
     the body, the `aura`-skill pointer), completing the
     one-block-documents-all-four end state. No other system-prompt
     text changed.

### Verdict

Conforms. The node-plus-tree join (item 1) is the slice doc's own
mechanism generalized to the payload reality the slice-1 derivation
already recorded (the node response has no path; the tree is the
canonical path source), not a deviation from the slice contract; the
identical-expansion acceptance criterion is what forced the composition
rule. Everything else is exactly the arch spec's slice-2 contract.
