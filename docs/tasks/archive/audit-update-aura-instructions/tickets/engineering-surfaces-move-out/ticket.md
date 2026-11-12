---
type: ticket
subtype: feature
title: Move out the engineering surfaces
status: deprecated
workflow_state: done
blocked_by: []
size: m
---

## What to build

The two engineering surfaces leave this package for their new home in the other package (the plugin repo), which becomes the sole delivery vehicle for the engineering canon. This package performs the removal; the receiving side is the other package's work.

Removed here: the engineering-foundation skill directory (the router skill with its resources) and the engineering-rules extension with its test. The router's rewrite worklist does not become work in this repo; the audit findings for it travel with the move (they are recorded in the effort's planning tasks).

Everything that names the removed surfaces updates with the removal: the package manifest lists exactly the six surviving extensions; the README's skill and extension tables drop the moved-out entries; the project instructions file drops the bullets describing the engineering-foundation skill layout and the rules extension.

## Acceptance criteria

- [ ] The package manifest lists exactly the six surviving extensions; the skill tree contains no engineering-foundation skill.
- [ ] The README and the project instructions file contain no claim about the removed surfaces.
- [ ] The guard tests fail on re-introducing the removed names.
- [ ] Typecheck and the test list pass after the removal.

## Blocked by

None (can start immediately).

## Implementation notes

Landed as merge 12e9ae2 on task/engineering-surfaces-move-out (10 files, +183 / -512). The removal was a split, not a deletion, forced by a dependency the spec missed: the dispatch half of the engineering-rules extension is gone (the extension factory, the always-on and on-demand system-prompt sections, the mention-name collector, the body-injection resolver), while the loading half (loadRules, the Rule type, the frontmatter parsing, the glob compiler and matcher, the ignore-list union, the recursive rules-directory walk) survives verbatim as extensions/cursor-rules.ts with its own test, because aura-references.ts imports it for the local #rule: / @rule: mention kind. A module-surface pin in cursor-rules.test.ts (exports are loading helpers only) prevents the dispatch from regrowing here. The manifest lists exactly the six surviving extensions; the engineering-foundation skill directory is gone; README and AGENTS.md carry no mention of either removed surface, pinned by the guard and probed by re-introduction in both directions.

Planned-versus-actual gaps recorded: the README has a skill table only (no extension table existed to trim) and AGENTS.md never carried a rules-extension bullet. The dual-matching resolver assertions left aura-references.test.ts together with the moved-out resolver; the engine-side expansion assertions for both mention syntaxes remain. Em-dash fixed in the touched README row; remaining README em-dashes stay for the root-docs ticket.

Behavior consequence for the operator and the plugin repo: mentioned-rule body injection no longer ships from this package; the plugin repo's dispatch must consume the same rules directory and implement its own ignore-list reading (its loader is its own copy). Until that side ships, #rule: and @rule: mentions still autocomplete and expand to rule-ref elements but nothing injects the rule body into the prompt. The root-docs ticket should state this companion-plugin assumption and describe cursor-rules.ts as a non-manifest library module.
