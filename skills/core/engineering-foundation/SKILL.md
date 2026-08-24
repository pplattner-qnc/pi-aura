---
name: engineering-foundation
description: The anwalt.de engineering canon — development workflow (idea → merge), developer guides (LLM selection, coding conventions, PR & review, deployment), the AI-readiness standard, the house rules, and the blueprint skills. Use when the user asks about engineering process, PR/review conventions, deployment via Bitbucket Pipelines, the task lifecycle, AI-readiness, or any rule referenced from the engineering-foundation wiki space. Loads the relevant resource file from resources/ on demand.
---

# Engineering Foundation

This skill surfaces the **engineering-foundation canon** — how we build software at
anwalt.de — from a local mirror under `resources/`. The mirror is kept fresh against
the `engineering-foundation` Aura wiki space by the `engineering-sync` skill (a
package-author-only maintenance tool); do not edit the mirrored files by hand,
re-sync instead.

## What lives where

All paths are relative to this skill directory.

| Topic | Resource |
|---|---|
| **Index** — how to read a page in this space, the progressive-disclosure map | `resources/INDEX.md` |
| **Log** — dated record of structural changes to the space | `resources/Log.md` |
| **Development workflow** — idea → merge task-lifecycle playbook | `resources/workflow/development-workflow.md` |
| **AI-readiness rollout** — the four-bucket reconciliation model + six invariants | `resources/workflow/ai-readiness-rollout.md` |
| **AI-readiness standard** — the normative standard every house repo is measured against | `resources/guides/ai-readiness-standard.md` |
| **Developer guides** — LLM selection, coding conventions, PR & review, deployment | `resources/guides/developer-guides.md` |
| **Deployment via Bitbucket Pipelines** — release/hotfix flow, CodeArtifact | `resources/guides/deployment-ber-bitbucket-pipelines.md` |
| **AI foundation file map** — plain-language map of every steering file/folder | `resources/guides/ai-foundation-file-map.md` |
| **Blueprint manifest** — every building block with install target, checksum, version | `resources/blueprint/manifest.yaml` |
| **House rules** (Cursor `.mdc`) — the 15 included rules (tracker-aura ignored) | `resources/rules/*.mdc` |
| **Blueprint skills** (pi-adapted) — the 14 task-lifecycle + ai-setup/sync skills | `../../engineering-foundation/<name>/SKILL.md` |

## How to use it

Load the resource file that matches the user's question, with the `read` tool. The
canon is large; do not load it all into context — progressive disclosure, the same
pattern as the `aura` skill.

- A question about **process** (idea → merge, slicing, review, finish) →
  `resources/workflow/development-workflow.md`.
- A question about **PR/review conventions, coding standards, deployment
  windows, rollback** → `resources/guides/developer-guides.md` (and the matching
  section, e.g. §3 PR & Review, §4 Deployment).
- A question about **Bitbucket pipeline variants, release/hotfix flow** →
  `resources/guides/deployment-ber-bitbucket-pipelines.md`.
- A question about **AI-readiness, the AGENTS.md/CLAUDE.md rule, the two-layer
  split, readiness criteria** → `resources/guides/ai-readiness-standard.md`.
- A question about **a specific rule** (e.g. db-destructive-ops, code-quality,
  language policy) → `resources/rules/<name>.mdc`.

## Rules are reference, not enforced here

The `.mdc` rule files under `resources/rules/` are the pi-adapted versions of
the wiki's Cursor rules (frontmatter/disposition adapted to what pi's
`engineering-rules` extension expects, Cursor-specific body edges stripped).
In a pi context they are **reference material this skill surfaces on demand**,
not auto-attached guardrails. The `engineering-rules` extension (see
`extensions/engineering-rules.ts`) is what makes the always-on / glob / manual
dispositions active in pi; this skill's job is to let the agent read the rule
body when relevant.

The `tracker-aura` rule is **ignored** (this repo talks to Aura via the `aura`
skill / REST client, not via task-lifecycle skills reading an AGENTS.md → Tracker
adapter) — do not load or surface it.

## Blueprint skills are pi-adapted

The 14 `SKILL.md` files under `skills/engineering-foundation/<name>/SKILL.md`
are invokable pi sub-skills discovered recursively under
`skills/engineering-foundation/`. They live in a separate top-level directory
from this index skill (not nested here) because pi treats a directory with a
root `SKILL.md` as a skill root and does not recurse into it — keeping the
index here and the sub-skills under `skills/engineering-foundation/` is what
makes both discoverable. They are the pi-adapted versions of the anwalt.de
house skills. The sync skill authored
the adaptation from the wiki's Cursor/IDE-flavoured source — rewriting the
Cursor-specific edges (`AskQuestion` → `ask_user_question`, `SwitchMode` →
dropped, `CreatePlan` → dropped, `AGENTS.md` key lookups → read the target
repo's `AGENTS.md`) while keeping the substantive body verbatim and the
anwalt.de Jira/Bitbucket/`task`/worktree/`fork-db` assumptions (those MCPs are
or will be installed). The manifest tracks both the wiki's `sourceSha256`
and the local `adaptedSha256`.

## Freshness

The mirror is committed and ships with the package. It is kept fresh by the
`engineering-sync` skill (`/skill:engineering-sync`), which is a
package-author-only maintenance tool — it fetches the latest state from the wiki
and reconciles changes. If a mirrored file looks stale, re-run the sync skill
rather than editing by hand.
