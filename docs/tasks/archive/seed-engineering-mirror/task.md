---
kind: task
type: manual
slug: seed-engineering-mirror
title: Seed the engineering-foundation mirror via the sync skill's first fetch (run in a separate session)
map: engineering-foundation-sync
status: done
blocked_by:
- engineering-sync-skill
slices: []
---

# Seed the engineering-foundation mirror

## Prerequisite

- `engineering-sync-skill` is **done** — the `.pi/skills/engineering-sync/`
  skill + its `engineering-sync` CLI utility are built and on `PATH` via the
  esbuild pipeline.

## The exact prerequisite to check

The owner (the user, in a separate session) verifies, before running this
task:

- `make build` (or `npm run build` in `scripts/`) produces
  `.pi/skills/engineering-sync/dist/engineering-sync.mjs`.
- The Aura REST client + keyring PAT is configured (same path the `aura`
  skill uses): `~/.pi/agent/settings.json` baseUrl + OS keyring PAT.

## The manual step

Run the sync skill's first `fetch` to seed the mirror, then reconcile and
`finish`:

1. **Invoke `/skill:engineering-sync`** (or run the CLI directly:
   `node .pi/skills/engineering-sync/dist/engineering-sync.mjs fetch`).
   With an empty/absent drift manifest, **every** item is treated as "new" —
   `NEW_REMOTE_*` is written for all items (the 15+1 rules, the prose docs
   in `guides/` + `workflow/` + `INDEX.md` + `Log.md`, the
   `blueprint/manifest.yaml`, and the 14 verbatim blueprint skill files).
   Nothing is skipped on the first fetch because the manifest has no
   `ignored` flags yet.
2. **Reconcile** each `*.NEW_REMOTE.*` cluster: for verbatim reference
   copies, create the local file from `NEW_REMOTE` as-is; for the
   `engineering-workflow` SKILL.md router (an authored file), reconcile its
   routing table against the fetched `INDEX.md` structure. The agent is the
   mergetool. **For `tracker-aura`** (which doesn't belong in this repo),
   do **not** create the local `.mdc` — instead write a tombstone file
   `skills/engineering-workflow/resources/rules/tracker-aura.IGNORE` whose
   content is the ignore reason (e.g. "this repo talks to Aura via the aura
   skill / REST client"). `finish` consumes the tombstone into an
   `ignored: true` manifest entry and deletes both the tombstone and the
   paired `NEW_REMOTE` file.
3. **Run `finish`** — the gate verifies no `*.OLD_REMOTE.*` /
   `*.NEW_REMOTE.*` / `*.CURRENT.*` files remain (`.IGNORE` tombstones are
   consumed, not refused) and writes/updates the committed drift manifest
   under `.pi/`.
4. **Verify** the seeded mirror: `find skills/engineering-workflow/resources
   -type f` lists the expected files; spot-check a few checksums against
   `manifest.yaml`.

## Evidence required to mark it done

- The drift manifest under `.pi/` exists and is committed.
- `skills/engineering-workflow/resources/` is populated: 4 guides, 2
  workflow docs, INDEX.md, Log.md, blueprint/manifest.yaml, 15 rules
  (tracker-aura absent — its `NEW_REMOTE` was consumed by the `.IGNORE`
  tombstone flow), 14 verbatim blueprint skill SKILL.md files.
- `find ... -name '*.OLD_REMOTE.*' -o -name '*.NEW_REMOTE.*' -o -name
  '*.CURRENT.*' -o -name '*.IGNORE'` returns nothing (reconciliation + ignore
  consumption complete).
- A spot-check of 2–3 file sha256s matches `manifest.yaml`.

## Owner / actor

The user (package author), in a separate session, via the built sync skill.
Report back any failures (e.g. fetch errors, checksum mismatches,
reconciliation friction) so the sync skill / utility can be fixed.

## Dependent tasks that remain blocked

- `adapt-blueprint-skills` — the first-pass pi-adaptation of the 14
  blueprint skills — is blocked on this seeding (it needs the verbatim
  sources in place under `resources/blueprint/skills/`). It unblocks once
  this manual task is done.

## Notes

- This is a manual task, not automated: the sync skill is built by
  `engineering-sync-skill`, but the seeding run itself is done here, by the
  owner, in a fresh session. The build task does not run the seeding.
- If `fetch` surfaces drift or errors, report them back so
  `engineering-sync-skill` can be corrected before re-running.
