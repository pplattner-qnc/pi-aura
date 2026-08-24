## Deviation report — interactive-flow-step

### API surface changes
- **Planned (arch spec Step 4):** A 7-step flow (save → digest.json already written → cleanup → start dashboard → wait for click → act on one action → return-to-wait-or-clean-close). Steps 1–3 unchanged. Pipeline diagram + subcommand list mention the dashboard. Clean-close terminal present.
- **Actual:** All 7 steps present and correctly ordered, matching the arch spec's prose verbatim in structure. The pipeline diagram section gained a paragraph noting the dashboard reads `~/.pi/aura/digest.json` + `~/.pi/aura/state.json` and is started/stopped via the tool or `/digest-dashboard start|stop`. The opening blurb (lines 9–13) was also updated to mention the dashboard — a **superset** of the arch spec's "pipeline diagram + subcommand list mention" requirement. The clean-close terminal is present with the one-line verdict template + `/digest-dashboard stop` + stop.
- **Impact:** None. The Step 4 contract matches the arch spec exactly. The extra opening-blurb update is an improvement (the reader encounters the dashboard mention earlier) and doesn't change any downstream slice's contract.

### Clean close terminal
- **Planned:** One-line verdict (template with `queue.length`, `capacity.committed_pct`, `reviews_owed.length`) + `/digest-dashboard stop` + stop — no dangling prompt.
- **Actual:** Present at lines 224–236, exactly as specified. The verdict template, the fill instructions, and the "Stop — no dangling prompt" directive are all present and correct. ✓

### Pipeline diagram / subcommand list
- **Planned:** Mention `digest.json` + `state.json` + `/digest-dashboard start|stop`.
- **Actual:** The diagram section (lines 44–47, after the ASCII pipeline) adds a paragraph: "The interactive dashboard reads `~/.pi/aura/digest.json` (actions + followup) and `~/.pi/aura/state.json` (ack events), and is started/stopped via the `digest-dashboard-start` tool or `/digest-dashboard start|stop`." ✓ The opening blurb (lines 9–15) also mentions these. ✓

### Steps 1–3 unchanged
- **Planned:** Steps 1 (Fetch), 2 (Augment), 3 (Render) untouched.
- **Actual:** Verified — the diff's `@@` hunks touch only lines 7–15 (opening blurb), 42–47 (post-diagram paragraph), and 158–236 (Step 4 rewrite + clean close). No Step 1/2/3 heading or body line was added or removed. ✓

### last-digest.json store section unchanged
- **Planned:** Unchanged (it documents the `LastDigestStore` type + `diff`/`last` semantics).
- **Actual:** Present at line 265, unchanged by the diff. ✓

### Out-of-scope boundaries (slice 1 must NOT preempt slices 2 and 3)

- **Exact `node -e` ack/clear commands (slice 2):** NOT present. Step 4 step 6 correctly defers: "The exact command is documented in the next section" / "in the next section." ✓ Correctly deferred.
- **Routing table (slice 3):** NOT present. No table mirroring `buildActions` was added. ✓ Correctly deferred.
- **`[ASK]` block removal (slice 3):** The `[ASK]` block is **still present** (line 256), identical to the pre-commit version. ✓ Correctly left in place for slice 3 to remove.
- **Scope and handoff section update (slice 3):** The section is **unchanged** by this slice. Step 4 step 6 references it ("the handoff rule in 'Scope and handoff' below"), but the section itself was not modified. ✓ Correctly deferred to slice 3.

### Minor finding (non-blocking)

- **`save` explanation removed from Step 4:** The old Step 4 contained a paragraph explaining `save` writes `~/.pi/aura/last-digest.json` with `presented_at`, `fetched_at`, and `schema_version`, and that it should be called "after presenting and before cleanup." This explanatory paragraph was removed when Step 4 was rewritten. However, this information **survives in the "last-digest.json store" section** (lines 272–274: `schema_version`, `presented_at`, `fetched_at` fields are documented there). The `save` *command* itself is still present in Step 4 step 1. The loss is the "call it *after* presenting and *before* cleanup" ordering note — but the new Step 4 makes the ordering explicit via the numbered steps (save is step 1, cleanup is step 3). **Non-blocking; the ordering is now structural rather than prose.**

### Task doc update needed?
**No.** No implementation notes need appending. The slice matches the arch spec's interface contract. The minor `save`-paragraph removal is covered by the structural step ordering + the existing `last-digest.json store` section.

### User attention needed?
**No.** The Step 4 rewrite matches the arch spec exactly. All out-of-scope items (node -e commands, routing table, [ASK] removal, Scope section update) are correctly deferred to slices 2 and 3. No scope creep.
