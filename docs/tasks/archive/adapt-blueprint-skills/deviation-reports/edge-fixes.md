## Deviation report — edge-fixes

### API surface changes
- **Planned:** N/A for prose — this slice edits markdown skill files only, no code API surface.
- **Actual:** No implementation was applied. No files were changed.
- **Impact:** Slice 2 (move-to-top-level) is blocked by this slice; without these edits the move would carry the residual Cursor edges to the top-level layout.

### Abstraction usage
- Used/was specified: N/A — no abstractions involved (prose edits only).

### Edits made vs the exact edge inventory in the arch spec's "Slice 1" section

**None of the 8 specified edits were applied.** All residual Cursor edges remain in their pre-edit state:

**`task-refine/SKILL.md`** — 6 edges still present:
| Line | Spec says | Current state |
|---|---|---|
| `:26` | "ask the user via the Q&A module" → "ask the user via `ask_user_question`" | ❌ still "via the Q&A module" |
| `:28` | "(e.g. Cursor's "open and recently viewed files")" → "(e.g. an IDE's automatically injected "open and recently viewed files" context)" | ❌ still "Cursor's" |
| `:36` | "using Cursor's Question & Answer (Q&A) module" → "using pi's `ask_user_question` tool" | ❌ still "Cursor's Question & Answer (Q&A) module" |
| `:48` | "via the Q&A module" → "via `ask_user_question`" | ❌ still "via the Q&A module" |
| `:50` | "right before the Q&A call" → "right before the `ask_user_question` call" | ❌ still "Q&A call" |
| `:64` | "via the Q&A tool" → "via `ask_user_question`" | ❌ still "via the Q&A tool" |

**`task-implement/SKILL.md`** — 2 edges still present:
| Line | Spec says | Current state |
|---|---|---|
| `:59` | "open it in the current Editor Window without a second Cursor window" → "open it in their editor" | ❌ still "Editor Window without a second Cursor window" |
| `:205` | "open it in the current Editor Window" → "open it in their editor" | ❌ still "Editor Window" |

### Out-of-scope changes
- None — no files were changed at all (no out-of-scope edits, but also no in-scope edits).

### "Do NOT touch" items verification
All "Do NOT touch" items are correctly untouched (as expected, since nothing was edited):
- ✅ `ai-setup/SKILL.md` — "Cursor or Claude Code", "Cursor/Claude Code", "Target tools: Cursor, Claude Code, or both" all intact.
- ✅ `pr-review/SKILL.md:31` — "Pi-mirror note" about `emit_review` intact.
- ✅ `task-slice/SKILL.md:110` — "no plan-creation tool to call" intact.
- ✅ `.cursor/rules/anwaltde/universal/<rule>.mdc` refs — 27 occurrences across all skills, all intact.

### Test plan results (arch spec test plan for slice 1)
| Test | Expected | Actual | Pass? |
|---|---|---|---|
| `grep -rin "Q&A module\|Q&A tool\|Q&A call\|Cursor's Question\|Cursor window\|Editor Window"` | empty | **6 matches** (4 in task-refine, 2 in task-implement) | ❌ FAIL |
| `grep -rin "AskQuestion\|SwitchMode\|CreatePlan"` | empty | empty | ✅ PASS |
| `git diff` shows only edge rewrites | 8 edits across 2 files | **no diff** (no edits applied) | ❌ FAIL |
| All 14 `description` frontmatters start with "anwalt.de engineering-workflow skill." | yes | yes (all 14 confirmed) | ✅ PASS |

### Task doc update needed?
No — the task doc's Implementation notes don't need updating for this finding. This is a TDD worker non-execution, not a spec deviation.

### User attention needed?
**Yes** — the TDD worker for slice "edge-fixes" did not produce any implementation. None of the 8 specified edge edits were applied. The slice is not complete. The parent orchestrator should re-dispatch the TDD worker (the failure toolbelt's "split" step is not appropriate here — the slice is already atomic; jump to "retry +50%").
