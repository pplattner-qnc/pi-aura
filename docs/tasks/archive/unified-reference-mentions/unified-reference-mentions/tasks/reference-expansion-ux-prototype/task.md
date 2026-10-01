---
type: task
title: What should the unified expansion tags and autocomplete rows look like?
status: deprecated
blocked_by: []
subtype: prototype
workflow_state: done
---

## Question

What exact XML tag names and attribute sets should each reference kind
expand to, and what should the inserted token + autocomplete row look like
per kind, so the result is self-describing to the model and readable in the
text box?

## Alternatives worth comparing

- Tag naming: `<task-ref>` / `<artifact-ref>` / `<wiki-ref>` / `<rule-ref>`
  vs aura-namespaced `<aura-task>` / `<aura-artifact>` / `<aura-wiki>` with
  rules as the odd one out (rules are not Aura resources).
- Attribute sets per kind: task (key, status), artifact (id, kind, version),
  wiki (space, path, version), rule (name, attach mode). Which are worth
  the tokens vs left for the agent to fetch.
- Inserted tokens: `#task:AURA-42`, `#artifact:9f3c...`, `#wiki:eng/process/pr-conventions`. Check how a raw artifact uuid reads in the text box and whether a short-id or title-bearing label is needed instead. Wiki autocomplete inserts the space/path form (decided); the uuid form is only for hand-typed references, so it needs no UX treatment.
- Compatibility: keep emitting `<aura-task>` for tasks (history compat) vs
  switch all kinds to the new tags and update the system-prompt instruction.

## Smallest artifact

A short markdown doc (or annotated mock) showing, per kind: the typed
token, the autocomplete row (label + description), and the expanded XML
element, in the 2-3 naming variants above. No working code required.

## Who must react

The user (product owner of this feature) picks the variant.

## Unblocks

The expansion-format decision recorded in the map, and with it the feature
tickets for the shared engine's expansion layer and the system-prompt
instruction block.

## Outcome

Artifact: `variants.md` in this directory. Decisions (recorded in the map):

- Variant B: uniform `<task-ref>` / `<rule-ref>` / `<artifact-ref>` /
  `<wiki-ref>` tags. `<aura-task>` stops being emitted; old history stays
  self-describing.
- Rich attributes: task `key,status`; artifact `id,kind,version`; wiki
  `space,path,version`; rule `name,attach`.
- Artifact tokens: autocomplete inserts the full uuid, row label shows the
  title.
