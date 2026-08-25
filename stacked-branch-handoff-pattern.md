# Stacked Branch Handoff Pattern

A workflow for a large feature that **cannot be vertically sliced** (slices are sequentially dependent — often due to horizontal slicing) but must still ship as **multiple, separately reviewable pull requests**. The goal: finish a slice, put it up for review, and **continue with the next slice without waiting** for the review or merge to complete.

## Core idea

Each slice lives on its **own branch stacked on the previous slice's branch**, not on the shared `develop`/`main`. Each PR targets its **parent slice branch**, so its diff shows **only that slice's delta** — the review stays scoped instead of being buried under predecessor code.

```
develop / main
   └── task-branch                  base for the feature (your "task branch")
         ├── slice/A              ── PR1 → task-branch
         │     └── slice/B        ── PR2 → slice/A
         │           └── slice/C  ── PR3 → slice/B
         ├── slice/D              ── independent, PR4 → task-branch
```

## When to use it

- Large story (≈8–13 SP) whose plan was split by **horizontal** axes, so slices depend on each other — the classic parallel-wave model does not apply.
- **Any** slab-of-work that is too big for one PR but whose parts cannot be handed to parallel agents in isolation.
- Whenever you want the next unit of work to start the moment the previous one is committed — not when it is reviewed, merged, or deployed.

## Branch naming

Prefer a stable, self-documenting token in the name, e.g. the work item key:

```
task-branch        # the parent feature branch
slice/<KEY>        # one branch per slice
```

The `slice/` prefix marks branches as part of a stacked set, distinct from the parent task branch.

## The handoff (the free fast-forward)

Pre-created slice branches all start at the same commit. While a child branch has **no commits of its own**, moving it onto its finished parent is a **true fast-forward**:

```
X  ──A1──A2      slice/A   (slice 1 done here)
   (slice/B still at X, no own commits)

git checkout slice/A
git branch -f slice/B slice/A   # X → A2, clean fast-forward
git checkout slice/B
```

Because `slice/B` has no work of its own yet, nothing is rewritten — no rebase needed at this point.

## When it becomes a rebase (the real cost of stacking)

A pure fast-forward only holds while a child has **no local commits**. Two situations force actual history rewriting:

1. **Parent review feedback.** Slice 1 returns "change X" after slice 2 already has commits on top of it. Correcting the parent rewrites history *below* the child → `slice/B` must be rebased.
2. **Merging an ancestor.** When a slice merges into `develop`/task-branch later on, remaining descendants need rebasing onto the new base so their diffs collapse to just their own phase.

This rebase load is **unavoidable in any stacked-branch flow** — pick it deliberately, don't try to engineer it away.

## Operating rules

- **Freeze the parent tip at handoff.** Once a slice is done, stop adding commits to it; this keeps downstream PR diffs stable while the next slice develops.
- **Push the parent before handing off.** The child PR's base branch must exist on the remote, or the diff tool has nothing to compare against — draft PRs stay empty until the child is fast-forwarded (intended, but tell reviewers).
- **Open a PR when you hand off its branch**, not before — avoids a pile of near-identical empty drafts and stale notifications. Draft (non-ready) status covers work in progress.
- **Merge bottom-up, one PR at a time.** Each intermediate PR gets its own human approval + review. The whole feature lands on `develop` via the final task-branch merge; that final integration also needs its own approval.
- **Keep changes accepted up front and reviewed late.** The prompt-merge of a finished parent minimises how often children must rebase onto corrected ancestor history.

## Merge flow after each slice lands

```
slice/A → task-branch (or develop)
slice/B → rebase onto new head → effective diff collapses to slice B only
slice/C → rebase onto new head → effective diff collapses to slice C only
```

## Trade-offs

| Pro | Con |
|---|---|
| Every slice is independently reviewable at small scope | Every downstream branch may need rebasing on ancestor feedback |
| No waiting for review before starting next slice | Stack can only land on `develop` as one final unit |
| Clean sequential history if you rebase after merges | Reviewers must understand the stacked-target model |
| True fast-forwards while children are empty | More branch/PR bookkeeping than one PR per feature |
