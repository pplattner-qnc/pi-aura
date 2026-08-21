# Land: wire-aura-mjs-review-subcommands

## Outcome

Slice `wire-aura-mjs-review-subcommands` landed into task branch
`task/aura-mcp-doc-salvage` (the task branch for `aura-review-subcommands`).

## Steps performed

1. **Reviewed slice doc + TDD/verify output** — slice wires the 6 `artifact
   review-*` subcommands into `scripts/src/aura.ts` via `createDefaultAuraClient()`.
   Verified the slice branch diff is purely additive (527 insertions, 0 deletions
   across `aura.ts` + two rebuilt `dist/*.mjs` bundles).
2. **Merged** `slice/wire-aura-mjs-review-subcommands` into
   `task/aura-mcp-doc-salvage` with `--no-ff` (merge commit `780ebf2`). No
   conflicts (expected — slice 1 was already landed on the task branch and this
   slice builds directly on it).
3. **Deleted** the slice branch (`slice/wire-aura-mjs-review-subcommands`).
4. **Archived** the slice doc →
   `docs/tasks/aura-review-subcommands/slices/archive/2-wire-aura-mjs-review-subcommands.md`.
5. **Appended** implementation note for slice 2 to the task doc's
   `## Implementation notes` section (documents the 6 subcommand handlers, arg
   parsing, USAGE update, build/bundle grep, and the `review-reopen --version`
   divergence).
6. **Committed** docs: `docs(slice): land wire-aura-mjs-review-subcommands`
   (`25b607d`).
7. **Updated state.yaml** — slice 2 landed; next slice is `verify-and-build`
   (slice 3, the final slice). Task remains `open` (`f3d77a6`).

## Post-merge verification

| Check | Result |
|---|---|
| `cd scripts && npm run typecheck` | ✅ green |
| `cd scripts && npm run build` | ✅ green, both bundles rebuilt |
| grep all 6 `case "review-*"` in `skills/aura/dist/aura.mjs` | ✅ all 6 present |
| `git diff --cached --stat` | empty (no staged files) |
| working tree | only sibling-worker untracked `result.md` dirs |

## Remaining slices

Slice 3 (`verify-and-build`) remains — this is not the last slice, so the task
stays `open`. state.yaml `slice` field updated to `verify-and-build`.

## Notes

- The task branch is named `task/aura-mcp-doc-salvage` (the map task), not
  `task/aura-review-subcommands` — the `aura-review-subcommands` task is a child
  of the `aura-mcp-doc-salvage` map. This is the correct branch.
- The `review-reopen --version` divergence (REST contract requires `version`
  in the reopen request body) was already documented in slice 1's notes and is
  carried forward in slice 2's notes. The salvaged doc example update is
  deferred to the dependent task per the slice's doc-edit constraints.
