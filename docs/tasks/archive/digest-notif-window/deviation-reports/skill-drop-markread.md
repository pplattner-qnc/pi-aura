## Deviation report — skill-drop-markread

### API surface changes
- **Planned:** None — this is a documentation-only slice. The arch spec lists "Exports: None (documentation only)."
- **Actual:** None. Only `skills/aura-digest/SKILL.md` was changed (+1 line, −2 lines). No source code, no types, no scripts touched.
- **Impact:** None on dependent slices (this is the last slice in the task).

### Abstraction usage
- Used/was specified: **yes**. The slice used `skills/aura-digest/SKILL.md` Step 4 ("Present, save, and act") as specified. No other abstractions were involved.

### Out-of-scope changes
- **None.** The diff is confined to a single file (`skills/aura-digest/SKILL.md`) and a single section (Step 4). The `diff`/`last` sections, the `last-digest.json` store section, the Scope and handoff section, and all other content are untouched. The arch spec's "Do NOT reimplement" constraints are honored:
  - The `save` / `cleanup` steps are intact and in order. ✓
  - `aura-digest.ts` was not edited. ✓
- **Working-tree note (not a deviation):** The slice doc `docs/tasks/digest-notif-window/slices/2-skill-drop-markread.md` has an unstaged change reverting `status: done` → `status: ready`. This was applied by the parent orchestrator to correct a prior land-worker overstep (it had prematurely marked this slice done during the slice 1 landing). This is a workflow-state correction, not part of this slice's implementation.

### Divergence from the slice doc's acceptance criteria
All acceptance criteria are met:
- ✅ The Step 4 bullet "Mark notifications read via MCP: `aura-mcp-dev_markAllNotificationsRead()`" is deleted.
- ✅ The `save` and `cleanup` bullets remain intact and in order.
- ✅ A short note is added: "The digest does not mark notifications as read automatically." (merged into the opening sentence of Step 4).
- ✅ No other section of SKILL.md is changed (confirmed via `git diff` — only 3 lines in the Step 4 section).

### Verification
- `git diff task/digest-notif-window..slice/skill-drop-markread --stat` → 1 file changed, 1 insertion(+), 2 deletions(-) — only `skills/aura-digest/SKILL.md`.
- `grep -n "markAllNotificationsRead" skills/aura-digest/SKILL.md` → no remaining references to `markAllNotificationsRead`.
- The `diff`/`last` sections still reference `last-digest.json` correctly (unchanged).

### Task doc update needed?
**No.** No `## Implementation notes` update required.

### User attention needed?
**No.** No public API surface changed, no scope widened, no out-of-scope code touched.
