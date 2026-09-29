# Reference expansion UX variants

Throwaway mock for the `reference-expansion-ux-prototype` task. Each variant
shows, per kind: the typed token, the autocomplete row, and the expanded XML
element the LLM receives. React by picking a variant (or mixing parts).

## Variant A: aura-namespaced tags, keep `<aura-task>` for tasks

History-compatible: old prompts and the current system-prompt instruction
keep their meaning, tasks never change tag shape.

Typed tokens and autocomplete rows:

```text
#task:AURA-42          @-style row:  #task:AURA-42        [OPEN] Fix the login bug
#rule:tracker-aura                      #rule:tracker-aura  (manual)
#artifact:9f3c1b2e-…                    #artifact:9f3c1b2e  [PLAN] Auth redesign proposal
#wiki:eng/process/pr-conventions        #wiki:eng/process/pr-conventions  PR conventions
```

Expansions in the submitted prompt:

```xml
<aura-task key="AURA-42" status="OPEN">Fix the login bug</aura-task>
<rule-ref name="tracker-aura" attach="manual">Tracker Aura</rule-ref>
<aura-artifact id="9f3c1b2e-7a4d-…" kind="PLAN" version="3">Auth redesign proposal</aura-artifact>
<aura-wiki space="eng" path="process/pr-conventions" version="12">PR conventions</aura-wiki>
```

Pros: zero breakage for `<aura-task>`; aura resources visibly namespaced.
Cons: rules are the odd one out (`<rule-ref>` vs `<aura-*>`); two naming
families forever; new tags still need a system-prompt doc update.

## Variant B: uniform `<X-ref>` family for all four kinds (Recommended)

One naming rule for everything; the system-prompt instruction documents all
four tags once. `<aura-task>` disappears from new prompts (old history still
reads fine; the instruction block just stops teaching it).

```xml
<task-ref key="AURA-42" status="OPEN">Fix the login bug</task-ref>
<rule-ref name="tracker-aura" attach="manual">Tracker Aura</rule-ref>
<artifact-ref id="9f3c1b2e-7a4d-…" kind="PLAN" version="3">Auth redesign proposal</artifact-ref>
<wiki-ref space="eng" path="process/pr-conventions" version="12">PR conventions</wiki-ref>
```

Pros: one rule, self-describing, kind is the tag name; cleanest instruction
block. Cons: `<aura-task>` in old session history is no longer documented by
the per-turn instruction (harmless: the tag is self-describing).

## Variant C: one generic `<resource>` tag with a `kind` attribute

```xml
<resource kind="task" key="AURA-42" status="OPEN">Fix the login bug</resource>
<resource kind="rule" name="tracker-aura" attach="manual">Tracker Aura</resource>
```

Pros: one tag to document; trivially extensible (#feedback: later).
Cons: attributes vary per kind anyway, so the documentation saving is small;
less greppable; model must switch on `kind`.

---

## Orthogonal choices (pick independently of A/B/C)

**Attribute sets.** Shown above: task `key,status`; artifact `id,kind,version`;
wiki `space,path,version`; rule `name,attach`. Leaner alternative: drop
`version` from artifact/wiki (agent fetches current anyway) and `attach`
from rules (the system-prompt injection already carries the body).

**Artifact token readability.** `#artifact:9f3c1b2e-7a4d-…` is unreadable in
the text box. Options: (a) accept the uuid (unambiguous, decided default);
(b) autocomplete inserts the uuid but the row label shows the title, so the
uuid only appears after selection; (c) insert `#artifact:9f3c1b2e` short-id
and resolve by prefix (breaks if Aura has no prefix lookup; needs research).

**Wiki uuid form.** `#wiki:<uuid>` must also parse (hand-typed). No UX
treatment needed; expansion resolves it to space/path/title.
