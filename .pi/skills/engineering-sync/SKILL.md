---
name: engineering-sync
description: PACKAGE-AUTHOR-ONLY maintenance tool (not an end-user skill). Keeps the engineering-foundation mirror under skills/engineering-workflow/resources/ fresh against the Aura wiki via a three-way reconciliation flow (fetch stages OLD_REMOTE/NEW_REMOTE/CURRENT files; finish gates and updates the drift manifest). Use only when maintaining the mirror; end users should use the engineering-workflow skill instead.
---

# engineering-sync (package-author-only)

**This is a maintenance tool for whoever maintains the `pi-aura` package, not
an end-user skill.** It is repo-local (`.pi/skills/`) on purpose — it does not
ship to consumers. If you are an end user of `pi-aura`, you want the
`engineering-workflow` skill, not this one.

## What it does

Keeps the local `engineering-foundation` mirror — the canon surfaced by the
`engineering-workflow` skill — fresh against the Aura wiki. The mirror is
**committed** and ships to end users; this skill is how the author re-syncs
it when the wiki changes.

The agent (you, when invoked) is the **mergetool**. The CLI only stages files
and gates the result; the reconciliation is done by you, per change, using
the three-way files as context.

## The two subcommands

The utility is built by the repo's esbuild pipeline to
`.pi/skills/engineering-sync/dist/engineering-sync.mjs`.

### `fetch` — stage three-way files

```bash
node .pi/skills/engineering-sync/dist/engineering-sync.mjs fetch
```

Enumerates the wiki (`engineering-foundation` space) and compares against
the committed drift manifest (`.pi/engineering-foundation.json`). For each
changed item it writes three-way files **in-place** (visible in `git status`):

- **Edit** of `a/b/c.md` — renames `c.md` → `c.CURRENT.md`, writes
  `c.OLD_REMOTE.md` (prior wiki version) + `c.NEW_REMOTE.md` (new wiki
  version). All three sit next to where `c.md` was.
- **Add** (new on wiki) — writes only `c.NEW_REMOTE.md`; you create `c.md`
  from it.
- **Delete** (removed on wiki) — auto-deletes the local `c.md` (git history
  preserves recoverability; skips the three-way flow). The manifest entry is
  marked for removal.
- **Authored files** (e.g. `skills/engineering-workflow/SKILL.md`, the
  router) — no wiki body to sha256 against; instead, when the wiki's
  *structure* changes (a guide added/removed/renamed), `fetch` writes a
  `SKILL.NEW_REMOTE.md` structure digest + `SKILL.CURRENT.md` snapshot so you
  reconcile the router's routing table.

Also writes `.pi/engineering-sync-fetch-report.json` (the new sha256s + the
resolved remote metadata, consumed by `finish`).

`tracker-aura` is skipped (manifest `ignored: true` — this repo talks to
Aura via the `aura` skill / REST client, not via task-lifecycle skills
reading an AGENTS.md → Tracker adapter).

### `finish` — the gate

```bash
node .pi/skills/engineering-sync/dist/engineering-sync.mjs finish
```

**Refuses and exits non-zero** if any `*.OLD_REMOTE.*` / `*.NEW_REMOTE.*` /
`*.CURRENT.*` three-way files remain (prints the list). `.IGNORE` tombstones
(see below) are not three-way files and don't trigger the refusal. On
success: recomputes the local adapted sha256s from the now-reconciled files,
consumes any `.IGNORE` tombstones into `ignored: true` manifest entries,
updates `.pi/engineering-foundation.json`, and removes the fetch report.

A partial reconciliation is **not** a success — resolve every cluster before
finishing.

## How to reconcile (the agent is the mergetool)

For each three-way cluster, the goal is: given `OLD_REMOTE` (old wiki) +
`NEW_REMOTE` (new wiki) + `CURRENT` (our pi-adapted version), produce the new
`c.md` = "new wiki + our pi adaptations". The adaptation is **only** for
making the content work with the pi agent (stripping/rewriting
Cursor-specific edges like AskQuestion/SwitchMode/CreatePlan, `AGENTS.md`
key lookups); it is **not** a content change.

Then:

1. Write the reconciled result back to `c.md` (the plain name, no suffix).
2. Delete all three suffix files (`c.OLD_REMOTE.md`, `c.NEW_REMOTE.md`,
   `c.CURRENT.md` — or `.mdc` for rules, e.g. `tracker-aura.NEW_REMOTE.mdc`).
3. Repeat for every cluster.
4. Run `finish`. If it refuses, it prints the unresolved files — fix them
   and re-run.

For **adds** (only `c.NEW_REMOTE.*` exists), create `c.md` (or `c.mdc`) from
the `NEW_REMOTE` content, applying pi adaptations for skills, then delete the
`NEW_REMOTE` file.

For **deletes**, nothing to reconcile — the file is gone; commit the
removal.

## Ignoring an item (the `.IGNORE` tombstone)

Some wiki items don't belong in this mirror (e.g. `tracker-aura` — this repo
talks to Aura via the `aura` skill / REST client, not via task-lifecycle skills
reading an AGENTS.md → Tracker adapter). To mark an item ignored during
reconciliation:

1. Leave its `NEW_REMOTE` file unreconciled (do **not** create the local
   `c.md`/`c.mdc` from it).
2. Write a tombstone file next to it named `<stem>.IGNORE` (no extension),
   whose content is the ignore reason. For `tracker-aura.mdc` the tombstone is
   `skills/engineering-workflow/resources/rules/tracker-aura.IGNORE`.
3. Run `finish`. It consumes the tombstone: records `ignored: true` +
   `ignoreReason` in the manifest for that item, and deletes both the
   tombstone and the paired `NEW_REMOTE` file.

Once an item is marked `ignored: true` in the manifest, subsequent `fetch` runs
skip it entirely (no `NEW_REMOTE` is staged for it again). There is no
hardcoded rule-name skip — the `engineering-rules` extension reads the same
manifest's `ignored` flags to decide which rules to load, so ignore decisions
live in one place.

If you change your mind later, edit the manifest entry (set `ignored: false` or
remove it) and re-run `fetch`.

## Initial seeding (first run)

The first `fetch` with an empty/absent manifest treats every file as "new"
(`NEW_REMOTE_*` for all items — nothing is skipped, since there are no
`ignored` flags yet); you create each `c.md` from its `NEW_REMOTE`, and for
items you want to ignore (e.g. `tracker-aura`) you write a `.IGNORE`
tombstone instead. Then `finish` seeds the manifest. There is no `init`
subcommand. This is noisy on first run by design.

The initial seeding is performed in a **separate session** via the
`seed-engineering-mirror` manual task — do not run it casually.

## The drift manifest

`.pi/engineering-foundation.json` — one entry per mirrored item, keyed by
wiki canonical identity (blueprint path or knowledge-node uuid):

```json
{
  "version": 1,
  "space": "engineering-foundation",
  "entries": {
    "blueprint/skills/ai-setup/skill.md": {
      "wikiPathOrUuid": "blueprint/skills/ai-setup/skill.md",
      "localPath": "skills/engineering-workflow/resources/blueprint/skills/ai-setup/SKILL.md",
      "sourceSha256": "sha256:...",
      "auraChecksumOrVersion": "sha256:...",
      "auraUpdatedAt": "<provenance commit sha>",
      "adaptedSha256": "sha256:..."
    },
    "<node-uuid>": {
      "wikiPathOrUuid": "<node-uuid>",
      "localPath": "skills/engineering-workflow/resources/guides/developer-guides.md",
      "sourceSha256": "sha256:...",
      "auraChecksumOrVersion": "3",
      "auraUpdatedAt": "2026-08-21T...",
      "kind": "DOCUMENT",
      "slug": "developer-guides"
    },
    "<tracker-aura-uuid>": {
      "wikiPathOrUuid": "<tracker-aura-uuid>",
      "localPath": "skills/engineering-workflow/resources/rules/tracker-aura.mdc",
      "sourceSha256": "sha256:...",
      "auraChecksumOrVersion": "1",
      "auraUpdatedAt": "2026-08-21T...",
      "kind": "DOCUMENT",
      "slug": "tracker-aura",
      "ignored": true,
      "ignoreReason": "this repo talks to Aura via the aura skill / REST client"
    }
  }
}
```

Fields: `sourceSha256` (the wiki's content hash as last recorded),
`auraChecksumOrVersion` (blueprint `checksum` or wiki `latest_version`),
`auraUpdatedAt`, optional `adaptedSha256` (present only if the local file
differs from the verbatim remote — i.e. it was adapted), `ignored` +
`ignoreReason` (for `tracker-aura`), `authored` (for the router), `kind` +
`slug` (for wiki docs).

## `status` — read-only drift summary

```bash
node .pi/skills/engineering-sync/dist/engineering-sync.mjs status
```

Prints whether the manifest is seeded, whether any three-way files are
unresolved, and entry counts by disposition (verbatim / adapted / authored
/ ignored). No network calls.

## Auth

Same path as the `aura` skill: `createDefaultAuraClient()` reads
`aura.baseUrl` from `~/.pi/agent/settings.json` + an Aura PAT from the OS
keyring. If the PAT is missing, run `/aura secrets discover` to store one
(service: `"aura"`, name: `"pat"`).

## What not to do

- Do not edit mirrored files by hand to "fix" wiki content — the mirror is
  read-only; corrections go to the wiki, then re-sync.
- Do not commit `*.OLD_REMOTE.*` / `*.NEW_REMOTE.*` / `*.CURRENT.*` or
  `*.IGNORE` files — they are staging artifacts; `finish` requires they all
  be gone (the `.IGNORE` tombstones are consumed, not committed).
- Do not run the initial seeding casually — use the
  `seed-engineering-mirror` manual task in a separate session.
