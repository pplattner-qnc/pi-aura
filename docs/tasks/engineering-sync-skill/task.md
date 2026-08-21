---
kind: task
type: feature
slug: engineering-sync-skill
title: Build the engineering-sync skill + fetch/finish utility (three-way reconciliation + drift gate)
map: engineering-foundation-sync
status: done
blocked_by:
- engineering-workflow-skill
slices: []
---

# engineering-sync skill + fetch/finish utility

## Outcome

Build the **package-author-only** `engineering-sync` skill at
`.pi/skills/engineering-sync/SKILL.md` (repo-local, not registered in
`package.json`) and its CLI utility, which keeps the local mirror fresh
against the `engineering-foundation` wiki space via a three-way
reconciliation flow with a `finish` gate.

## Scope

### In scope

- `.pi/skills/engineering-sync/SKILL.md` — frontmatter
  `name: engineering-sync`, `description` explicitly stating it is a
  **package-author-only maintenance tool** for keeping the
  engineering-foundation mirror fresh; not an end-user skill.
- `scripts/src/engineering-sync.ts` — the CLI utility, built via the
  existing esbuild pipeline → `.pi/skills/engineering-sync/dist/engineering-sync.mjs`
  (mirror how `scripts/src/aura.ts` bundles to `skills/core/aura/dist/aura.mjs`).
  Add the entry outfile to `scripts/esbuild.config.mjs` and a Makefile target
  if appropriate.
- The utility uses `createDefaultAuraClient()` (`@pi-aura/shared` generated
  REST client + keyring PAT) — not MCP. Calls: `getBlueprintFiles` (with
  optional `version` pin for `OLD_REMOTE`), `getKnowledgeTree`,
  `getKnowledgeNode`, `getKnowledgeNodeVersion`, `getKnowledgeNodeByPath`.
- Two subcommands:
  - **`fetch`** (read-write, into the repo working tree):
    - **Edit** of `a/b/c.md`: rename `c.md` → `c.CURRENT.md`; write
      `c.OLD_REMOTE.md` (prior version via `getBlueprintFiles({version})` /
      `getKnowledgeNodeVersion`) and `c.NEW_REMOTE.md` (new version).
      **Suffix** naming, **in-place** next to `c.md` (visible in `git status`).
    - **Add** (new on wiki): write only `c.NEW_REMOTE.md`; the agent creates
      `c.md` from it.
    - **Delete** (removed on wiki): auto-delete the local `c.md` + mark the
      manifest entry for removal — **skips the three-way flow** (git history
      preserves recoverability).
    - Also write a JSON of the new versions' sha256s (for the agent / `finish`).
    - **Authored files** (e.g. `skills/engineering-workflow/SKILL.md`): the
      sync skill also keeps these fresh. An authored file has no wiki
      counterpart to sha256 against; instead the manifest records its
      `localPath` and marks it `authored: true`, and the sync surfaces a
      diff prompt when the wiki's *structure* for the topic has changed.
      Concretely: the `engineering-workflow` SKILL.md router is an authored
      file — when the wiki's Index/guides/workflow structure changes (a guide
      added/removed/renamed), `fetch` writes `c.NEW_REMOTE.md` for the
      changed wiki node and a `c.CURRENT.md` snapshot of the current router,
      so the agent can reconcile the router's routing table against the new
      structure.
  - **`finish`** (the gate): verify no `*.OLD_REMOTE.md` / `*.NEW_REMOTE.md`
    / `*.CURRENT.md` files remain; on success update the committed hash
    manifest. **Refuse and exit non-zero** on incomplete reconciliation,
    printing unresolved files.
- The drift manifest under `.pi/` (exact filename TBC, e.g.
  `.pi/engineering-foundation.json`), keyed by wiki canonical identity
  (blueprint path / knowledge-node uuid). Per entry:
  `{ wikiPathOrUuid, localPath, sourceSha256, auraChecksumOrVersion,
  auraUpdatedAt, adaptedSha256?, ignored?, ignoreReason?, authored? }`.
  Invisible to user-facing skill discovery. Entries support the
  `ignored` + `ignoreReason` + `localPath` + `authored` fields decided in
  the grillings.
- The `SKILL.md` instructs the agent: run `fetch`, reconcile the three-way
  clusters (the agent **is** the mergetool — `OLD_REMOTE` + `NEW_REMOTE` +
  `CURRENT` → "new wiki + our pi adaptations"; adaptation is only for making
  content work with the pi agent, not a content change), then run `finish`.
- Initial seeding: first `fetch` with empty/absent manifest treats every
  file as "new" (`NEW_REMOTE_*` for all); `finish` seeds the manifest. No
  `init` subcommand. **Note: the initial seeding run is performed in a
  separate session via the `seed-engineering-mirror` manual task — the
  sync skill is built here but not run for seeding in this map.**

### Out of scope

- CI gate (Q7: no CI; freshness is enforced via the `finish` gate + author
  discipline).
- Adapting the blueprint skills (that's `adapt-blueprint-skills`); this skill
  only fetches/records/gates the raw content.
- The verbatim mirror content itself (that's `engineering-workflow-skill`).

## Acceptance criteria

- `engineering-sync` skill discoverable as a repo-local pi skill at
  `.pi/skills/engineering-sync/`; its description states it is
  package-author-only.
- `engineering-sync.ts` builds via esbuild to
  `.pi/skills/engineering-sync/dist/engineering-sync.mjs`; `make build`
  produces it.
- `fetch` correctly handles edit/add/delete per the design; the three-way
  files use suffix naming and are written in-place.
- `finish` refuses on incomplete reconciliation (non-zero exit, prints
  unresolved files) and updates the manifest on success.
- The manifest is written under `.pi/` with the agreed entry shape.
- A dry run of `fetch` against the live wiki produces the expected three-way
  files; `finish` clears them and updates the manifest.

## Constraints

- `engineering-sync` is package-author-only; its description must say so.
- No CI; the `finish` gate is the freshness enforcement.
- The utility uses the REST client + keyring PAT, not MCP.
- Deletions skip the three-way flow (auto-delete + manifest removal).

## Notes

- This task depends on `engineering-workflow-skill` (the mirror layout must
  exist before `fetch` can write into it).
- The three-way reconciliation is agent-driven; the utility only stages the
  files and gates the result. The `SKILL.md` is where the agent receives its
  instructions.
- **Authored files** (no wiki counterpart, e.g. the `engineering-workflow`
  router): the sync skill keeps these fresh by surfacing a diff prompt when
  the wiki's structure for the topic changes, not by sha256 against a wiki
  body. The manifest records their `localPath` and marks them `authored: true`.
- **The initial seeding run is NOT part of this task** — it is the separate
  `seed-engineering-mirror` manual task, performed in another session via
  the built sync skill. This task delivers the sync skill + utility; it does
  not run them to populate the mirror.
