# Log

> **Pi-mirror note.** Pi-adapted copy of the `engineering-foundation` wiki page; the wiki is the source of truth, kept fresh by the `engineering-sync` skill. The body is unchanged — this page carries no Cursor-specific tool-call edges, only references to the target repo's own files (AGENTS.md, CLAUDE.md, .cursor/rules, .agents/skills).


Dated record of structural changes to the Engineering Foundation space.

## 2026-08-21
- `blueprint/` published: 16 universal rules under `blueprint/rules/` and 14 universal skills (one folder each, `SKILL.md` plus companions) under `blueprint/skills/`, plus `blueprint/manifest.yaml` (install target, checksum, version, source commit per block; `condition` on the two conditional tracker adapters). Uploaded by hand via the deployed instance's HTTP API with a personal PAT — provenance is person-based, the source commit lives in the manifest. Verified against `aiSetup` and `getBlueprintFiles`.
- Legacy page trees `rules/`, `skills/` and `entry/` removed — they were hand-copied in July, last touched in August, and had drifted from the repo (14 rule pages for 16 repo rules). `blueprint/` is their real-file-asset replacement. `workflow/development-workflow`'s `relations` retargeted from the removed `skills/universal/task/*` pages to their `blueprint/skills/*/` equivalents; the root `index` page's folder map updated accordingly. (AURA-1719, absorbs AURA-1668)

## 2026-08-12
- Page added: `skills/universal/ai-sync` — the repo-side counterpart to `ai-setup`: inventory with provenance, the per-item version comparison Y1–Y8, the three-way conflict case over the retrieval seam, and the bundled approval gate. Added because `ai-sync` was the only house skill with no page here, which would have made it classify itself as `local-only` once the comparison reference switches to this space. (PR review of AURA-914)

- Page updated: `skills/universal/ai-setup` — brought in line with the repository after S3/S5. It had still described only Blocks A/C/D and stated that `guides/ai-readiness-standard` did not exist yet; it now carries all nine blocks A–I, the interview blocks B/F, the follow-up-ticket exit, and section-accurate citations of the standard. (PR review of AURA-914)

- Page added: `guides/ai-readiness-standard` — the AI-readiness standard, transferred verbatim from artifact v15 (2026-08-04), plus one clearly separated house addition making Aura the mandatory tracker. This is the normative target every `ai-setup` checkpoint points at, and it resolves the references that `workflow/ai-readiness-rollout` and `guides/ai-foundation-file-map` already carried. Transferred ahead of full v15 approval (3 of 5, no rejection) — flagged as such on the page itself. (AURA-1338, part of AURA-914)

- Two pages added: `workflow/ai-readiness-rollout` (the four-bucket reconciliation model and six invariants shared by the `ai-setup`/`ai-sync` skills) and `guides/ai-foundation-file-map` (plain-language rendering of `general-ai-docs-structure` + the `AGENTS.md` inventory). Both `reference`. (AURA-1337, part of AURA-914)

## 2026-07-28

- Space scaffold created: `engineering-foundation` space, ten-folder tree (`guides`, `workflow`, `entry`, `rules/universal`, `rules/project`, `skills/universal`, `skills/universal/task`, `skills/project`), root `index` and `log`, and the Developer Guides copied under `guides/developer-guides`. (ANW-7813)
