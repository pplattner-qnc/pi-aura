---
name: engineering-sync
description: PACKAGE-AUTHOR-ONLY maintenance tool (not an end-user skill). Keeps the engineering-foundation mirror under skills/core/engineering-foundation/resources/ fresh against the Aura wiki via a three-way reconciliation flow (fetch stages OLD_REMOTE/NEW_REMOTE/CURRENT files; finish gates and updates the drift manifest). Use only when maintaining the mirror; end users should use the engineering-foundation skill instead.
---

# engineering-sync (package-author-only)

**This is a maintenance tool for whoever maintains the `pi-aura` package, not
an end-user skill.** It is repo-local (`.pi/skills/`) on purpose — it does not
ship to consumers. If you are an end user of `pi-aura`, you want the
`engineering-foundation` skill, not this one.

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
- **Authored files** (e.g. `skills/core/engineering-foundation/SKILL.md`, the
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
   for `skills/core/engineering-foundation/SKILL.md` with the wiki's current
   structure signature (so later `fetch` runs can detect structural drift).
5. **Save** `.pi/engineering-foundation.json`; **delete** the fetch report.

The division of labor: **you** delete the `NEW_REMOTE`/`OLD_REMOTE`/`CURRENT`
diff files for the reconciled items after approval; **`finish`** deletes
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
an add means: write the adapted `c.<ext>` at the same path as
`c.NEW_REMOTE.<ext>` (same directory, plain name), starting from the
`NEW_REMOTE` body and applying the pi adaptations; reconciling an edit means:
write the new adapted `c.md` at the same path `c.CURRENT.md` already sits,
porting the prior adaptations onto the new `NEW_REMOTE` body.

The target path is the `localPath` `fetch` recorded in
`.pi/engineering-sync-fetch-report.json` (read it — it's the authoritative map
of wiki item → repo path). The wiki-dir → repo-dir mapping `fetch` uses:

| Wiki source | Repo destination |
|---|---|
| `blueprint/manifest.yaml` | `skills/core/engineering-foundation/resources/blueprint/manifest.yaml` |
| `blueprint/skills/<name>/SKILL.md` (+ companion `.ts`) | `skills/engineering-foundation/<name>/SKILL.md` (+ the `.ts`) |
| `blueprint/rules/<name>.mdc` | `skills/core/engineering-foundation/resources/rules/<name>.mdc` (flat, one dir) |
| `index` (top-level doc) | `skills/core/engineering-foundation/resources/INDEX.md` |
| `log` (top-level doc) | `skills/core/engineering-foundation/resources/Log.md` |
| `guides/<slug>` | `skills/core/engineering-foundation/resources/guides/<slug>.md` |
| `workflow/<slug>` | `skills/core/engineering-foundation/resources/workflow/<slug>.md` |
| `skills/core/engineering-foundation/SKILL.md` (authored router) | untouched on first seed; diff staged next to it on a structural sync |

Blueprint files are keyed by their blueprint path; wiki documents are keyed
by node uuid but placed by their full slug path. Anything else `fetch` staged
that isn't in this table is unexpected — surface it in the inventory and stop.

If a diff file lands somewhere this table (or the router's routing table)
doesn't expect, **do not hand-move it with `cp`/`mv`** — use the `mv`
subcommand below so the manifest's `localPath` stays consistent, or surface
it as a `fetch` path-mapping bug and stop.

For each three-way cluster, the goal is: given `OLD_REMOTE` (old wiki) +
`NEW_REMOTE` (new wiki) + `CURRENT` (our pi-adapted version), produce the new
`c.md` = "new wiki + our pi adaptations". The adaptation is **only** for
making the content work with the pi agent (stripping/rewriting
Cursor-specific edges like AskQuestion/SwitchMode/CreatePlan, `AGENTS.md`
key lookups); it is **not** a content change.

### First seed vs steady-state sync — same adaptation, different inputs

**You adapt on every run, including a first seed.** A verbatim Cursor file
is useless in this repo — the whole point of mirroring is to make the content
work with the pi agent. There are no verbatim copies kept on disk; every
reconciled file is the pi-adapted version. The manifest still records the
wiki's `sourceSha256` (from the fetch report) so the drift gate can detect
wiki changes, but no verbatim file sits next to the adapted one.

**Initial seeding (empty manifest, all items are adds — no `CURRENT` exists):**
start from `NEW_REMOTE` (the wiki's current body) and author the pi
adaptations onto it. There is no `CURRENT` to carry forward from, so you are
authoring the adaptations fresh. See "What adaptation means" below for the
concrete edits.

**Steady-state sync (manifest exists, a changed item has `OLD_REMOTE` +
`NEW_REMOTE` + `CURRENT`):** produce `c.md` = `NEW_REMOTE` body + the
pi-adaptations carried in `CURRENT` (port them forward onto the new wiki body).
You are preserving prior adaptations against a new wiki version.

### What adaptation means (concrete, every run)

Adaptation is **only** for making the content work with the pi agent; it is
**not** a content change to the substantive body (workflow steps, quality bars,
anti-patterns, checklists stay verbatim). The Cursor-specific edges to rewrite:

- `AskQuestion` → pi's `ask_user_question` tool (note the 2–4 options
  constraint, the 16-char `header` limit, the reserved "Type something." row).
- `SwitchMode` (Cursor plan/normal mode) → drop or replace with the pi
  equivalent if one exists (the agent works in normal mode; no plan-mode shim
  needed unless the skill relies on it — record the decision per skill).
- `CreatePlan` → drop (pi has no plan-creation tool; the skill's plan output
  becomes a chat block).
- `AGENTS.md` key lookups (`Merge target branch`, `Worktree root`,
  `Stack-token derivation`, `Test commands`, etc.) → keep the *concept* but
  instruct the agent to read the target repo's `AGENTS.md` (which the anwalt.de
  repos have) rather than assume a pi-side register.
- Keep the anwalt.de Jira/Bitbucket/`task`/worktree/`fork-db` assumptions
  (those MCPs are or will be installed); only the *tool-call shape* is adapted.
- Each adapted blueprint skill's `description` must make clear it targets the
  anwalt.de engineering workflow (so it's not invoked outside that context).
- For `.mdc` rules: adapt the frontmatter/disposition to what pi's
  `engineering-rules` extension expects (see the extension), and strip any
  Cursor-specific body edges. The rules have no separate verbatim role —
  the adapted `.mdc` under `resources/rules/` is the only copy.

**Pattern registry (mandatory, append-only).** The catalog of
 Cursor/Cline-runtime patterns already encountered and how to adapt them to
 pi lives at `.pi/skills/engineering-sync/resources/cursor-to-pi-patterns.md`.
 Read it before you start reconciling — it is the accumulated memory of what
 the edges look like and how they were handled, so the run adapts consistently
 instead of re-deciding from scratch. When you find a Cursor/Cline-runtime tool
 or primitive in a fetched file, check the registry first: if the pattern is
 there, apply the recorded adaptation; if it isn't, adapt it per the rules
 above **and append a new entry to the registry** (source shape, pi-adapted
 shape, rationale, where it was found). The registry is append-only and ships
 with the skill — it grows over runs.

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
  `<name>/SKILL.md`). Flag any path the sync utility chose that
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
- **Adaptation applied (not byte-identical)** — every reconciled file is the
  pi-adapted version, **not** a verbatim copy of `NEW_REMOTE`. For each file,
  `diff` against its `NEW_REMOTE` source should show the Cursor-specific edges
  rewritten per "What adaptation means" and the substantive body unchanged.
  Flag any file that is byte-identical to its `NEW_REMOTE` (un-adapted) — that
  is a miss, not a success. (The `finish` manifest will record these with
  `adaptedSha256` set, since the local sha differs from `sourceSha256`.)

## Ignoring an item (the `.IGNORE` tombstone)

Some wiki items don't belong in this mirror (e.g. `tracker-aura` — this repo
talks to Aura via the `aura` skill / REST client, not via task-lifecycle skills
reading an AGENTS.md → Tracker adapter). To mark an item ignored during
reconciliation:

1. Leave its `NEW_REMOTE` file unreconciled (do **not** create the local
   `c.md`/`c.mdc` from it).
2. Write a tombstone file next to it named `<stem>.IGNORE` (no extension),
   whose content is the ignore reason. For `tracker-aura.mdc` the tombstone is
   `skills/core/engineering-foundation/resources/rules/tracker-aura.IGNORE`.
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
`ignored` flags yet); you adapt each `c.md` from its `NEW_REMOTE` (see "First
seed vs steady-state sync" — adaptation happens on the first seed too, there
are no verbatim copies), and for items you want to ignore (e.g. `tracker-aura`)
you write a `.IGNORE` tombstone instead. Then `finish` seeds the manifest.
There is no `init` subcommand. This is noisy on first run by design.

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
      "localPath": "skills/engineering-foundation/ai-setup/SKILL.md",
      "sourceSha256": "sha256:...",
      "auraChecksumOrVersion": "sha256:...",
      "auraUpdatedAt": "<provenance commit sha>",
      "adaptedSha256": "sha256:..."
    },
    "<node-uuid>": {
      "wikiPathOrUuid": "<node-uuid>",
      "localPath": "skills/core/engineering-foundation/resources/guides/developer-guides.md",
      "sourceSha256": "sha256:...",
      "auraChecksumOrVersion": "3",
      "auraUpdatedAt": "2026-08-21T...",
      "kind": "DOCUMENT",
      "slug": "developer-guides"
    },
    "<tracker-aura-uuid>": {
      "wikiPathOrUuid": "<tracker-aura-uuid>",
      "localPath": "skills/core/engineering-foundation/resources/rules/tracker-aura.mdc",
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

## `mv` — relocate a reconciled file (fix a wrong path)

```bash
node .pi/skills/engineering-sync/dist/engineering-sync.mjs mv <from-rel> <to-rel>
```

Moves a reconciled file **and all its diff variants** (the plain name +
`*.OLD_REMOTE.*` + `*.NEW_REMOTE.*` + `*.CURRENT.*` + a paired `.IGNORE`
tombstone, whichever exist) from one repo-relative path to another, and
records the new path in the fetch report so `finish` maps the item there.

Use it when `fetch` placed an item at a path you want to change (e.g. a layout
decision changed after the fetch, or the wiki-dir → repo-dir table above shows
it landed wrong). **Do not hand-move with `cp`/`mv` + `rm`** — the manifest's
`localPath` would then disagree with the file, and `finish` would record the
old path. `mv` keeps them consistent.

- `<from-rel>` must be the **plain name** (no `.OLD_REMOTE`/`.NEW_REMOTE`/
  `.CURRENT`/`.IGNORE` suffix) and must exist. Both paths are repo-relative.
- It moves every existing file belonging to that item (plain + the 3 diff
  variants + the `.IGNORE` tombstone) to the new path's directory, preserving
  each suffix.
- It updates the fetch report's `items[].localPath` for the matching item.
  If no fetch report exists or no item matches `<from-rel>`, the on-disk move
  still happens but a warning is printed (run `fetch` first so there's a report).
- It does **not** touch the committed manifest — that's `finish`'s job. After
  `mv`, reconcile/verify/`finish` as usual; `finish` reads the updated
  `localPath` from the report.

Example: `fetch` put a rule under `resources/blueprint/rules/foo.mdc` but the
table says rules go to `resources/rules/`. Fix it:

```bash
node .pi/skills/engineering-sync/dist/engineering-sync.mjs mv \
  skills/core/engineering-foundation/resources/blueprint/rules/foo.mdc \
  skills/core/engineering-foundation/resources/rules/foo.mdc
```

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
