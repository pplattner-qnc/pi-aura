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

## Change inventory (mandatory, written live)

**As the run progresses you MUST keep a change inventory in a markdown file at
`.pi/engineering-sync-inventory.md`.** Write it **live**, appending a line the
moment you open, read, run, or change a file — not reconstructed from memory
at the end (memory inventories hallucinate). The file is the human-readable
provenance of the run; the author (who may not have been in the loop) needs to
see, at a glance, what the agent touched and what it only looked at.

The inventory covers **every file you opened, read, or ran** during the
session — not just the ones you changed. For each entry, state what you did:

- **changed** — what you changed and why (the fix, with the file:line if
  useful);
- **read only** — why you looked (and that you left it untouched).

Group by:
1. Source files changed (with the reason per fix).
2. Generated/bundled files rebuilt by the pipeline.
3. Files read but not changed.
4. Files created by the run (the mirror + manifest).

The inventory is on top of the `finish` gate — the gate only checks that
diff files are gone. This file is the audit trail `finish` cannot give.

## User review before `finish` (mandatory)

`finish` is the point of no return: it deletes the diff files and writes the
manifest. **Before you run `finish`, you MUST ask the user to review the
inventory and the changes** (the inventory file + the `git status` of the
reconciled mirror). Do not run `finish`, and do not delete any diff files,
until the user gives explicit approval. See "How to reconcile" for the
keep-the-diff-files rule.

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
`*.CURRENT.*` three-way files remain (prints the list) — so only run it
**after the user has approved the run and you have deleted the diff files**
(see "User review before finish"). `.IGNORE` tombstones (see below) are not
three-way files and don't trigger the refusal.

**What `finish` does** (so you don't have to read the source):

1. **Gate** — refuses if any diff files remain, except a `NEW_REMOTE` paired
   with an `.IGNORE` tombstone (that pair is consumed, not refused).
2. **Consume `.IGNORE` tombstones** — for each tombstone, finds the matching
   staged item by stem, writes a manifest entry with `ignored: true` + the
   tombstone text as `ignoreReason`, then **deletes both the tombstone and the
   paired `NEW_REMOTE` file itself**. You do not delete those manually.
3. **Record adds/edits** — iterates the fetch report's `items[]`; for each
   non-ignored item, reads the local file at `join(REPO_ROOT, it.localPath)`
   (the path *fetch* recorded — no rename needed), computes its sha256, and
   writes the manifest entry with `sourceSha256 = remoteSha256`. It omits
   `adaptedSha256` when the local sha equals the remote sha (verbatim copy);
   it sets `adaptedSha256` when they differ (an adapted file).
4. **Authored router** — on the first seeding, bootstraps a manifest entry
   for `skills/engineering-workflow/SKILL.md` with the wiki's current
   structure signature (so later `fetch` runs can detect structural drift).
5. **Save** `.pi/engineering-foundation.json`; **delete** the fetch report.

The division of labor: **you** delete the `NEW_REMOTE`/`OLD_REMOTE`/`CURRENT`
diff files for the verbatim/edited items after approval; **`finish`** deletes
the `.IGNORE` tombstone + its paired `NEW_REMOTE`. Run `finish` only after your
deletion pass, so the gate sees a tree with only the plain names + the
`.IGNORE` pair.

A partial reconciliation is **not** a success — resolve every cluster before
finishing.

## How to reconcile (the agent is the mergetool)

### Where files go (the path is decided by `fetch`, not by you)

You do **not** choose where a reconciled file lives — `fetch` already decided
it. Every diff file is written **at the plain file's eventual path, with the
suffix marker in its name**: `c.NEW_REMOTE.md` sits in the directory `c.md`
should occupy, `c.OLD_REMOTE.md` and `c.CURRENT.md` likewise. So reconciling
an add is literally: copy `c.NEW_REMOTE.<ext>` to `c.<ext>` **in the same
directory** (strip the `.NEW_REMOTE` marker); reconciling an edit is: write the
new `c.md` at the same path `c.CURRENT.md` already sits.

The target path is the `localPath` `fetch` recorded in
`.pi/engineering-sync-fetch-report.json` (read it — it's the authoritative map
of wiki item → repo path). The path rule `fetch` uses, so you know what to
expect:

- **Blueprint files** (fetched via `getBlueprintFiles`, keyed by blueprint
  path) → `skills/engineering-workflow/resources/blueprint/<path>` preserving
  the wiki's tree, **except rules**, which go to
  `skills/engineering-workflow/resources/rules/<name>.mdc` (flat, one dir).
- **Wiki documents** (fetched via the knowledge tree, keyed by node uuid) →
  mapped from the node's full slug path: top-level `index`/`log` →
  `resources/INDEX.md`/`resources/Log.md`; `guides/<x>` →
  `resources/guides/<x>.md`; `workflow/<x>` → `resources/workflow/<x>.md`.
- **Authored router** (`skills/engineering-workflow/SKILL.md`) — no diff on a
  first seed (see the gotcha below); on a steady-state sync a structural change
  stages `SKILL.NEW_REMOTE.md` + `SKILL.CURRENT.md` next to the router.

If a diff file lands somewhere the `engineering-workflow` router's routing
table doesn't expect, **do not move it** — that's a `fetch` path-mapping bug;
surface it in the inventory and stop, rather than papering over it with a
hand-move (the manifest's `localPath` would then disagree with the file).

For each three-way cluster, the goal is: given `OLD_REMOTE` (old wiki) +
`NEW_REMOTE` (new wiki) + `CURRENT` (our pi-adapted version), produce the new
`c.md` = "new wiki + our pi adaptations". The adaptation is **only** for
making the content work with the pi agent (stripping/rewriting
Cursor-specific edges like AskQuestion/SwitchMode/CreatePlan, `AGENTS.md`
key lookups); it is **not** a content change.

### First seed vs steady-state sync — they are different

The reconcile step splits by run type. **Read which one you are in before you
start reconciling** — the skill's generic "apply pi adaptations" clause is
right for a steady-state sync and wrong for a first seed.

**Initial seeding (empty manifest, all items are adds — no `CURRENT` exists):**
copy each `NEW_REMOTE` verbatim to the plain name (`c.md`/`c.mdc`). **Do not
adapt.** Adaptation is a whole separate task (`adapt-blueprint-skills`, which
produces pi skills elsewhere under `skills/engineering-workflow/<name>/SKILL.md`);
the verbatim source files under `resources/blueprint/` are what that task adapts
*from*. Seeding them verbatim is the point. This is also what the
`engineering-workflow` router SKILL.md says it consumes ("carried verbatim").

**Steady-state sync (manifest exists, a changed item has `OLD_REMOTE` +
`NEW_REMOTE` + `CURRENT`):** produce `c.md` = `NEW_REMOTE` body + the
pi-adaptations carried in `CURRENT` (port them forward onto the new wiki body).
This is the only time you adapt — you are preserving prior adaptations against
a new wiki version, not authoring new ones.

### Reconcile + verify, then gate on the user

1. Write the reconciled result back to `c.md` (the plain name, no suffix),
   next to the diff files.
2. **Do NOT delete the diff files** (`c.OLD_REMOTE.md`, `c.NEW_REMOTE.md`,
   `c.CURRENT.md` — or `.mdc` for rules). Keep them in place so the user can
   review the reconciliation against the source versions.
3. Repeat for every cluster.
4. **Verify before the gate** (see the checklist below) — do not present the
   run for approval on counts + byte-identity alone.
5. **Ask the user to review** the inventory (`.pi/engineering-sync-inventory.md`)
   and the reconciled mirror. Do not proceed until they approve.
6. **After the user approves**, delete all the diff files for every cluster
   (the `*.OLD_REMOTE.*`, `*.NEW_REMOTE.*`, `*.CURRENT.*`), then run `finish`.
   If `finish` refuses, it prints the unresolved files — fix them and re-run.

For **deletes**, nothing to reconcile — the file is gone; commit the
removal.

### Verification checklist before the user-review gate (mandatory)

Before you present the run for approval, verify **placement and content**,
not just that files exist. Run every item and record the results in the
inventory:

- **Content vs the blueprint manifest** — for every blueprint file, compare
  the plain file's sha256 to `blueprint/manifest.yaml`'s `checksum` field.
  Zero mismatches. (For wiki docs there is no manifest checksum; the fetch
  report's `remoteSha256` is the reference instead.)
- **Placement vs the consumer** — every plain file's path matches the layout
  the `engineering-workflow` SKILL.md router's routing table expects (INDEX.md,
  Log.md, `workflow/`, `guides/`, `rules/`, `blueprint/manifest.yaml`,
  `blueprint/skills/<name>/SKILL.md`). Flag any path the sync utility chose that
  the router doesn't list.
- **No orphans, no missing** — the plain-file set is exactly the expected
  count (first seed: 1 manifest + INDEX + Log + 4 guides + 2 workflow + 15
  rules + 14 SKILL.md + 4 task-untangle `.ts` = 42, with `tracker-aura.mdc`
  absent). Reconcile the count against the fetch report's `items[]`, not a
  `find` glob that also matches `*.NEW_REMOTE.*`.
- **Ignored item** — `tracker-aura.mdc` is absent and its `.IGNORE` tombstone
  exists; no other item was silently dropped.
- **Diff files retained** — the `*.NEW_REMOTE.*` (and `*.OLD_REMOTE.*` /
  `*.CURRENT.*` if any) are all still on disk; none were deleted ahead of the
  gate.

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
`ignored` flags yet); you copy each `c.md` **verbatim** from its `NEW_REMOTE`
(see "First seed vs steady-state sync" above — do not adapt on a first seed),
and for items you want to ignore (e.g. `tracker-aura`) you write a `.IGNORE`
tombstone instead. Then `finish` seeds the manifest. There is no `init`
subcommand. This is noisy on first run by design.

**Authored-router gotcha:** on the first seed, no `SKILL.NEW_REMOTE.md` is
staged for the `engineering-workflow` router. `surfaceAuthoredDiff` only stages
the router when an authored manifest entry already exists, and on the first
run there is none — so expect no router diff, leave the router file untouched,
and let `finish` bootstrap the authored entry (step 4 above). Do not go looking
for a router cluster to reconcile.

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
  `*.IGNORE` files — they are staging artifacts kept for review and deleted
  after the user approves (the `.IGNORE` tombstones are consumed by `finish`,
  not committed).
- Do not run the initial seeding casually — use the
  `seed-engineering-mirror` manual task in a separate session.
