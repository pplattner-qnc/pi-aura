## Deviation report — actions-routing-table

### API surface changes
- **Planned:** `DigestAction` type in `types.ts`; `buildActions(digest)` in `aura-digest.ts`; `Digest` gains `actions: DigestAction[]`.
- **Actual:** `DigestAction` type in `types.ts` (matches spec exactly). `buildActions(digest)` lives in a **new file `scripts/src/build-actions.ts`** (not in `aura-digest.ts` as the arch spec stated). `Digest.actions` added. `seedSuggestedActions` removed; `suggested_actions` derived via `actions.map(a => a.instruction)`. All field shapes, ranking, caps, and label/instruction formats match the spec.
- **Impact:** Minimal. `build-actions.ts` is imported by `aura-digest.ts` via `import { buildActions } from "./build-actions.js"`. The export is the same function signature. Downstream slices/tasks import from `build-actions.ts` (or re-export if needed). The arch spec's "Slice 1 Exports" line said `buildActions(digest)` (aura-digest.ts) — the file location differs but the export is identical and the function is pure. No dependent slice is blocked.

### Abstraction usage
- Used/was specified: **yes**. `buildActions` replaces `seedSuggestedActions` (the old function is fully removed, not kept). `suggested_actions` is derived from `actions` (single ranking, per decision #1). The markdown renderer `renderSuggestedActions` is unchanged (reads `suggested_actions`).
- The `?? []` guards on all section reads are present (per the test plan's failure-mode requirement).
- Stale corrections drop their `reviews_owed` actions (per decision #6 and the grilling's re-rank rule).
- The global ≤6 cap is applied as a final `actions.slice(0, 6)` truncation (decision: "Total ≤ 6").

### Out-of-scope changes
- **`followup` / `DigestFollowup`:** NOT present (correct — slice 2 owns it). The test fixture's `minimalDigest` omits `followup`, which is fine because `followup` doesn't exist on `Digest` yet.
- **Dashboard write (`DASHBOARD_DIGEST_PATH`):** NOT present (correct — slice 3 owns it).
- **Server/listener/SPA:** NOT present (correct — `digest-dashboard` task).
- **Stray file `stacked-branch-pattern.md`:** was created by the first (budget-exceeded) tdd-worker attempt at repo root; the retry worker removed it. It is NOT in the commit. No residual.
- **Stray dir `tdd-actions-routing-table/`:** worker output artifact on disk (untracked); not in the commit. Should be cleaned up before landing.
- **`dist/aura-digest.mjs` regenerated:** the build step regenerated the bundled `.mjs`; it's left unstaged (correct — only source was committed).

### Task doc update needed?
**No.** No implementation notes need appending. The only divergence (file location of `buildActions`) is an improvement (separating a pure 145-line function from the 1164-line `aura-digest.ts` aligns with the repo's modularity rules) and doesn't change the interface contract for slices 2 or 3.

### User attention needed?
**No.** The API surface (the `DigestAction` type + `buildActions` export + `Digest.actions` field) matches the spec. The file-location deviation is minor and improves modularity. No scope creep.
