# AI-Readiness Rollout

> **Pi-mirror note.** This is the pi-adapted copy of the `engineering-foundation` wiki page; the wiki is the source of truth and the `engineering-sync` skill keeps this file fresh. The content below is unchanged from the wiki — this page carries no Cursor-specific edges, so the pi adaptation is limited to this provenance marker.

This page is the shared language two skills speak: `ai-setup` (guided onboarding of a repository) and `ai-sync` (recurring check that a repository's rules and skills still match the central state). Both read and write against the same four buckets, obey the same six invariants, and run in the same report-first shape. Written once here so neither skill has to restate it, and so an owner reading either skill's output recognises the same vocabulary.

## The four buckets

Every rule or skill a repository holds — or could hold — falls into exactly one bucket. Which bucket applies decides the action, never the other way round.

| Bucket | Condition | Action |
|---|---|---|
| **Redundant** | Repeats a central-layer rule that already covers it | Remove it — the central reference covers the same ground |
| **Conflicting** | Contradicts a central-layer rule | Report it. **Never resolve it automatically** — only a human knows which side is intentional |
| **Repo-specific** | Genuinely local: this repo's stack, layout, boundaries, tooling | Keep it, filed under the repo layer |
| **Missing** | The central layer expects it, the repo does not have it | Add it |

`ai-setup` uses the buckets to classify what a fresh or drifted repository has. `ai-sync` uses the same four buckets on every later run, so a repository's rule set stays legible in the same terms over its whole lifetime.

## The six invariants

These six hold for **every** automated write either skill makes, without exception:

1. **No silent writes.** A rule that declares itself team-gated (i.e. it says a change needs team sign-off before it applies) stops the run and records that a decision is pending — it does not fall back to a developer's approval as if it were enough.
2. **Idempotent.** Running either skill twice with nothing changed produces the same result the second time, with no new diff and no duplicate follow-up ticket.
3. **Conflicts fail loud.** A conflicting rule is reported, never silently overwritten or merged.
4. **Repo-specific content is never lost.** A rule correctly filed as repo-specific survives every later run untouched.
5. **The central layer is read-only from the repo side.** Neither skill ever writes back into the central rule/skill set directly — only report and propose.
6. **An aborted run leaves no partial, unapproved state.** Whatever gets written happens per approved block, so an interruption mid-run leaves only what was actually approved — never a half-written, silently-adopted change.

## The run shape: report first, decide at real decision points

Across roughly forty checkpoints in `ai-setup`, and every comparison case in `ai-sync`, asking a question per checkpoint would be a nuisance, and a single end-of-run approval button would be the opposite extreme — approving without having really read anything. The shape that resolves this:

- **Objective checkpoints are reported and proposed as a diff, not asked about.** This is the majority of checkpoints — file present, slot order correct, rule map consistent, import present, and so on.
- **Genuine decisions are asked about, and only there.** In `ai-setup` these concentrate in the two blocks that ask how a team actually works and whether it works in parallel. In `ai-sync`, a genuine decision is a detected conflict — the one case that needs a human call on intent.
- **Approval happens block by block**, not once at the very end, so the owner approves in units they can actually reason about.
- **Writes happen per approved block, not only at the end.** If a run is interrupted, only approved blocks are on disk — never an unapproved partial state (invariant 6).
- **A second run is cheaper than the first**, because everything already decided is read back from the repository's own decision memory and reported as settled rather than asked again.

## Source

This page is the wiki's permanent home for the reconciliation model first specified in the AI-Readiness Rollout Mechanism artifact and the AI-readiness tooling story (AURA-914, Baustein 1.4/1.5). Implementation detail for either skill lives in the skill itself, not here — this page stays the shared vocabulary, not the mechanics of one particular tool.
