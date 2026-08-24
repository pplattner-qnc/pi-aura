---
kind: task
type: grilling
slug: blueprint-skills-and-sync-design
title: Decide how blueprint skills + the sync skill + drift gate live in pi-aura
map: engineering-foundation-sync
status: done
blocked_by: []
slices: []
---

# DECISION RECORDED — grilling complete

Shared understanding confirmed by the user on 2026-08-21. The design tree has
been fully visited; every branch is settled (Q1–Q16 below). This section is
the completion evidence required by the grilling resource: final decision,
important alternatives considered, constraints, and dependent-task
implications. The full per-question trail is preserved in the body below for
the implementer.

## Final decision (user's terms)

Two skills, split by audience:

- **`engineering-workflow`** — user-facing, top-level
  `skills/engineering-workflow/`. Auto-discovered by topic; surfaces the
  engineering-foundation canon to the agent. Holds the user-facing skill
  **and** the 14 adapted blueprint skills as
  `skills/engineering-workflow/<name>/SKILL.md`.
- **`engineering-sync`** — **package-author-only**, repo-local at
  `.pi/skills/engineering-sync/`. A maintenance tool for whoever maintains
  the mirror, not an end-user skill. Its description must state this.

## Decisions settled

### Q1 — Blueprint skills disposition → Registered + pi-adapted at the edges

The 14 anwalt.de blueprint skills become invokable pi skills. Cursor-specific
edges (AskQuestion / SwitchMode / CreatePlan / `AGENTS.md` key lookups) are
adapted to pi idioms; the substantive body is otherwise carried verbatim.

### Q2 — Sync skill split → Two skills, split by advertising

- `engineering-workflow` — user-facing, top-level.
- `engineering-sync` — non-advertised, repo-local at `.pi/skills/engineering-sync/`
  (pi loads project skills from `.pi/skills/` when project-trusted).

### Q3 — Sync utility access path → Existing REST client + keyring PAT

`createDefaultAuraClient()` / `@pi-aura/shared` generated client from
`openapi/openapi.yaml`. Available ops: `getBlueprintFiles` (returns
`{path, filename, content, checksum:"sha256:<hex>", version, provenance}`,
accepts optional `version` pin), `getKnowledgeTree`, `getKnowledgeNode`
(`{id, slug, latest_version, updated_at, body_hash, body}`),
`getKnowledgeNodeVersion` (returns any historical version — needed for
`OLD_REMOTE_*`), `getKnowledgeNodeByPath`.

### Q4 — Drift gate → Committed JSON manifest

A single committed JSON file stores, per mirrored item, the local file's
sha256 plus Aura's per-file metadata. Drives new/edited/deleted detection.

### Q5 — Tracking source + output separately (refined by Q9)

A verbatim reference copy of each mirrored file lives under
`skills/engineering-workflow/resources/blueprint/...` (sha256-checked against
`manifest.yaml` for blueprint files; against `getKnowledgeNode`/`getKnowledgeNodeVersion`
for wiki docs). The pi-adapted derivative lives separately. Both the wiki
sha256 and the local adapted sha256 are tracked in the manifest (see Q8).

### Q6 — Repo layout → skills/core/ for existing + canon; skills/engineering-workflow/ for adapted skills

- Move `skills/aura/` → `skills/core/aura/` and `skills/aura-digest/` →
  `skills/core/aura-digest/`.
- `skills/engineering-workflow/` holds the user-facing canon skill **and**
  the adapted blueprint skills as sub-skills:
  `skills/engineering-workflow/<name>/SKILL.md`.
  The verbatim reference content lives under
  `skills/engineering-workflow/resources/`.
- `engineering-sync` at `.pi/skills/engineering-sync/` (repo-local, not
  registered in `package.json`).
- **Registration note (verified):** `package.json` `pi.skills: ["./skills"]`
  is a single recursive entry — pi discovers every `SKILL.md` under `skills/`
  recursively, so `skills/core/*` and `skills/engineering-workflow/*` are all
  discovered without changing `pi.skills`. **The move ripples into 4 files
  that reference `skills/aura*` by path:** `Makefile` (dist outpaths),
  `scripts/esbuild.config.mjs` (entry outfiles), ~20 doc references to
  `skills/aura/dist/aura.mjs` in `skills/aura/resources/**` and
  `docs/dev-env.md`. These path references must be updated to
  `skills/core/aura/dist/aura.mjs` etc. — the implementation task must include
  a pass over them. (The `pi.skills` array itself needs **no** change for
  the new locations; only the hardcoded dist/doc paths do.)

### Q7 — Sync operations → CLI fetch + agent reconciliation + CLI finish gate (no CI)

No CI gate. The `engineering-sync` skill drives a CLI with two subcommands:

1. **`fetch`** (read-write into the repo working tree): for each changed
   file `a/b/c.md`, downloads `NEW_REMOTE_c.md` (the new wiki version) and
   `OLD_REMOTE_c.md` (the previously-recorded remote version, reconstructed
   via `getBlueprintFiles({version})` / `getKnowledgeNodeVersion`), and
   renames the local `a/b/c.md` to `a/b/CURRENT_c.md`. Also writes a JSON of
   the sha256s of the new versions. The agent then edits the files,
   reconciling the changes until only one `a/b/c.md` remains.
2. **`finish`** (the gate): invoked after reconciliation. Verifies no
   `OLD_REMOTE_*`/`NEW_REMOTE_*`/`CURRENT_*` files remain; on success updates
   the committed hash manifest with the new versions' hashes.

### Q8 — Drift manifest entry shape + key → (a)

One entry per mirrored item, keyed by the wiki's canonical identity (blueprint
file path for blueprint files, knowledge-node uuid for wiki docs). Stores:
`{ wikiPathOrUuid, localPath, sourceSha256, auraChecksumOrVersion,
auraUpdatedAt, adaptedSha256? }`. `adaptedSha256` only present for items the
adapter generates.

### Q9 — Three-way reconciliation IS the adaptation mechanism (all files)

The three-way flow applies to **all** mirrored files, including the adapted
pi skills — **there is no deterministic adapter** that regenerates
derivatives. The agent is the mergetool: given `OLD_REMOTE` (old wiki) +
`NEW_REMOTE` (new wiki) + `CURRENT` (our pi-adapted version), it computes
"new wiki + our pi adaptations." The reconciliation/adaptation is **only**
for making the content work with the pi agent (stripping/rewriting
Cursor-specific edges); it is not a content change. This means:

- Every file (verbatim docs + adapted skills) goes through the same
  three-way flow when it changes upstream.
- There is no separate "run the adapter" step; the agent *is* the adapter,
  per change, using the three-way files as context.
- The verbatim reference copies (Q5) are still kept (they are the
  `OLD_REMOTE`/`NEW_REMOTE` source of truth and let the gate verify the
  wiki hasn't drifted from what we last recorded), but they are not
  "merged separately and then a derivative regenerated" — they are one of
  the three inputs to the same reconciliation.
- The manifest (Q8) stores both the wiki sha256 and the local adapted
  sha256 so the gate can detect (a) wiki drift vs last recorded and (b)
  uncommitted local edits to the adapted file.

### Q10 — `finish` on incomplete reconciliation → (a) Refuse and exit non-zero

`finish` refuses to update the hash manifest and exits non-zero if any
`OLD_REMOTE_*`/`NEW_REMOTE_*`/`CURRENT_*` files remain. It prints the list of
unresolved files. A partial reconciliation is not a success.

### Q11 — Drift manifest file path → under `.pi/`, invisible to user-facing skills

The manifest lives somewhere the user-facing skills won't find it — only the
internal sync skill uses it. Concretely under `.pi/` (which is not gitignored
here — verified: `.gitignore` only lists `node_modules/` + `package-lock.json`,
and `git check-ignore .pi/*` returns "not ignored"). pi only loads `SKILL.md`
from `.pi/skills/`, not arbitrary JSON, so a manifest under `.pi/` is
invisible to user-facing skill discovery and can be committed. Exact filename
to confirm in implementation (e.g. `.pi/engineering-foundation.json` or
`.pi/engineering-sync/manifest.json`).

### Q12 — Initial seeding → (b) First `fetch` with empty manifest

No `init` subcommand. The first `fetch` (with an empty/absent manifest)
treats every file as "new": it writes `NEW_REMOTE_*` for every file (no
`OLD_REMOTE_*` since there's no recorded old version), renames the existing
local `c.md` to `CURRENT_c.md`, and the agent reconciles each. `finish`
clears the three-way files and seeds the manifest. Noisy on first run but no
special command — keeps the CLI to two subcommands (`fetch`, `finish`).

## Open questions (Round 4 frontier)

- **Q13** — For brand-new files on a normal `fetch` (file added on the wiki
  since last sync, no `CURRENT_*` exists): does `fetch` write just
  `NEW_REMOTE_<name>` (agent creates `c.md` from scratch), or does it also
  synthesize an empty `CURRENT_<name>` so the three-way shape is uniform?
- **Q14** — For deleted files (file removed on the wiki since last sync):
  does `fetch` write a tombstone (`OLD_REMOTE_*` + `NEW_REMOTE_*` absent or
  empty) and rename `CURRENT_*` so the agent decides whether to delete the
  local `c.md`, or does it just delete the local file and record the
  deletion in the manifest?
- **Q15** — Naming for the three-way files when the original is `c.md`:
  `OLD_REMOTE_c.md` / `NEW_REMOTE_c.md` / `CURRENT_c.md` (prefix) vs
  `c.OLD_REMOTE.md` / `c.NEW_REMOTE.md` / `c.CURRENT.md` (suffix) — prefix
  collides if a real file is ever named `OLD_REMOTE_foo.md`; suffix keeps the
  base name leading and is grep-friendly. Which?
- **Q16** — Does `fetch` write the three-way files in-place (next to
  `c.md`, so they're visible in the working tree and `git status`) or in a
  side directory (e.g. `.pi/engineering-sync/staging/`), with `finish`
  clearing the side dir? In-place is more visible; side-dir is cleaner.

## Decisions settled (Round 4)

### Q13 — Brand-new files on `fetch` → (a) Just `NEW_REMOTE_<name>`

No `CURRENT_*` to rename. The agent creates `c.md` from `NEW_REMOTE_c.md`,
applying pi adaptations for skills. `finish` checks no `NEW_REMOTE_*` remains
and a new `c.md` exists before recording the addition in the manifest.

### Q14 — Deleted files → (b) Auto-delete the local file and record the deletion

`fetch` deletes the local `c.md` and marks the manifest entry for removal;
`finish` removes the entry. **Rationale: the mirrored files are committed and
the sync skill is package-author-only**, so git history preserves deletions and
no tombstone/decision flow is needed — a deleted file is recoverable from git.
Consequence: **deletions skip the three-way flow entirely**; only edits and
additions go through it.

### Important clarification (recorded as a constraint)

- The mirrored skill/resource files **are committed** to the repo and ship to
  end users of the pi package.
- The `engineering-sync` skill is **package-author-only** — a maintenance
  tool for whoever maintains the mirror, not an end-user skill. Its
  description must state this.
- Freshness is enforced by the author's discipline + the `finish` gate, not
  by CI (Q7 stands: no CI).

### Q15 — Three-way file naming → (b) Suffix

`c.OLD_REMOTE.md` / `c.NEW_REMOTE.md` / `c.CURRENT.md`. Base name leads
(grep-friendly, sorts next to `c.md`), no prefix-collision risk, matches the
`.orig` convention.

### Q16 — Three-way file location → (a) In-place

The three-way files are written next to `c.md`, visible in the working tree
and `git status`. The author sees the reconciliation state; the noise is the
signal. A side dir would hide the state.

## Frontier status

Empty. Every branch of the design tree visited.

## What downstream work the answer may create

- A **feature task** to build the `engineering-workflow` skill + mirror the
  non-skill content (guides/workflow/INDEX/Log) into `resources/`.
- A **feature task** to build the `engineering-sync` skill + utility
  (`fetch` three-way + `finish` gate) wired into the esbuild pipeline +
  Makefile; fetch must handle add/edit/delete cases.
- A **feature task** to move existing skills to `skills/core/` and update
  the 4 rippling path references (Makefile, esbuild config, docs).
- A **feature task** to adapt each of the 14 blueprint skills to pi (the
  per-skill edge adaptation) — folded into the mirror/sync flow since the
  agent does it during reconciliation, but the first-pass adaptation is a
  one-time effort per skill.
- A **feature task** to build the drift manifest + `finish` gate logic.
- Possibly a **manual task** to run the first `fetch` + reconciliation and
  seed the manifest.

## Execution note

This is a grilling task: one question at a time. Round 4 questions Q13–Q16
are the current frontier, per the Matt Pocock grilling protocol. These are
the edge cases of the three-way flow (add/delete/naming/location). Once they
settle, the frontier should be empty and the implementation tasks can
graduate from Fog.

---

## Completion evidence (grilling resource)

### Final decision (consolidated)

1. **Two skills, split by audience** — `engineering-workflow` (user-facing,
   top-level) and `engineering-sync` (package-author-only, repo-local at
   `.pi/skills/`).
2. **14 blueprint skills ship registered + pi-adapted at the edges** —
   Cursor-specific tool calls (AskQuestion/SwitchMode/CreatePlan, `AGENTS.md`
   key lookups) adapted to pi idioms; bodies otherwise verbatim. Adapted
   skills live at `skills/engineering-workflow/<name>/SKILL.md`.
3. **Sync utility uses the existing REST client + keyring PAT**
   (`createDefaultAuraClient` / `@pi-aura/shared` generated client from
   `openapi/openapi.yaml`), not MCP. Available ops: `getBlueprintFiles`
   (returns `{path, filename, content, checksum, version, provenance}`,
   accepts a `version` pin), `getKnowledgeTree`, `getKnowledgeNode`
   (`{latest_version, updated_at, body_hash, body}`),
   `getKnowledgeNodeVersion` (any historical version — for `OLD_REMOTE_*`),
   `getKnowledgeNodeByPath`.
4. **Repo layout** — existing `skills/aura*` → `skills/core/aura*`;
   `skills/engineering-workflow/` holds the canon skill + adapted blueprint
   skills + verbatim reference copies under `resources/`; `engineering-sync`
   at `.pi/skills/`. `package.json` `pi.skills` needs **no change** (recursive
   discovery), but 4 files reference `skills/aura*` by hardcoded path and must
   be updated: `Makefile`, `scripts/esbuild.config.mjs`, ~20 doc refs to
   `skills/aura/dist/aura.mjs`, `docs/dev-env.md`.
5. **`fetch` (read-write, into the working tree)** — edit of `a/b/c.md`:
   rename `c.md` → `c.CURRENT.md`; write `c.OLD_REMOTE.md` (prior version via
   `getBlueprintFiles({version})` / `getKnowledgeNodeVersion`) and
   `c.NEW_REMOTE.md` (new version). **Suffix** naming, **in-place** next to
   `c.md` (visible in `git status`). **Add** (new on wiki): write only
   `c.NEW_REMOTE.md`; agent creates `c.md` from it. **Delete** (removed on
   wiki): `fetch` auto-deletes the local `c.md` + marks the manifest entry for
   removal — **skips the three-way flow** (git history preserves recoverability;
   sync is author-only). Also writes a JSON of the new versions' sha256s.
6. **`finish` (the gate)** — verifies no `*.OLD_REMOTE.md` / `*.NEW_REMOTE.md`
   / `*.CURRENT.md` remain; on success updates the committed hash manifest
   under `.pi/`. **Refuses and exits non-zero** on incomplete reconciliation,
   printing unresolved files.
7. **Three-way reconciliation IS the adaptation mechanism** — no
   deterministic adapter; the agent is the mergetool: `OLD_REMOTE` +
   `NEW_REMOTE` + `CURRENT` (our pi-adapted version) → "new wiki + our pi
   adaptations". Applies to all files (docs + skills); the adaptation is only
   for making content work with the pi agent, not a content change.
8. **Drift manifest** — one committed JSON file under `.pi/` (not gitignored,
   invisible to user-facing skill discovery), keyed by wiki canonical identity
   (blueprint path / knowledge-node uuid). Per entry:
   `{ wikiPathOrUuid, localPath, sourceSha256, auraChecksumOrVersion,
   auraUpdatedAt, adaptedSha256? }`.
9. **Initial seeding** — first `fetch` with empty manifest; everything is
   "new", `NEW_REMOTE_*` written for all, agent reconciles, `finish` seeds
   the manifest. No `init` subcommand.
10. **Freshness enforced via the `finish` gate, not CI.**

### Important alternatives considered

- **Reference-only verbatim skills (Q1)** — rejected: user wants them
  invokable and pi-adapted.
- **Deterministic adapter regenerating derivatives (Q5/Q9)** — rejected: the
  agent-as-mergetool model preserves the old→new adaptation reasoning per
  change, which a deterministic adapter would lose.
- **Tombstone flow for deletions (Q14)** — rejected: committed files +
  git history + author-only sync make auto-delete safe and simpler.
- **CI gate (Q7)** — rejected: no CI; the `finish` gate + author discipline
  enforce freshness.
- **`init` subcommand (Q12)** — rejected: first `fetch` with empty manifest
  suffices.
- **Prefix three-way naming (Q15)** — rejected: suffix is grep-friendly and
  collision-free.
- **Side-dir staging (Q16)** — rejected: in-place makes the reconciliation
  state visible in `git status`.

### Constraints

- This is a pi package (not a Cursor repo, not the anwalt.de app repo).
- The mirrored files are committed and ship to end users.
- `engineering-sync` is package-author-only.
- The anwalt.de Jira/Bitbucket/`task`/worktree/`fork-db` assumptions in the
  blueprint skills are acceptable (those MCPs are or will be installed); only
  the *tool-call shape* (AskQuestion/SwitchMode/CreatePlan, `AGENTS.md`
  keys) is adapted.
- `skills/aura/resources/process/` is unrelated (parallel
  `how-we-work-in-aura` wiki node, bird's-eye) and stays untouched.
- The mirror is read-only; corrections go to the wiki, then re-sync.

### Dependent-task implications

The following feature tasks graduate from Fog and will be created on the map:

1. **`engineering-workflow-skill`** — build the user-facing canon skill +
   mirror the non-skill content (guides/workflow/INDEX/Log) into `resources/`.
2. **`engineering-sync-skill`** — build the repo-local sync skill + utility
   (`fetch` three-way + `finish` gate) wired into the esbuild pipeline +
   Makefile.
3. **`move-skills-to-core`** — move existing `skills/aura*` to `skills/core/`
   and update the 4 rippling path references.
4. **`adapt-blueprint-skills`** — first-pass pi-adaptation of the 14
   blueprint skills (one-time, per skill).
5. **`cursor-rules-incorporation`** (grilling, already created, now
   unblocked) — how the 16 `.mdc` Cursor rules are incorporated.

### Remaining fog / newly discovered work

- Exact manifest filename under `.pi/` (e.g. `.pi/engineering-foundation.json`
  vs `.pi/engineering-sync/manifest.json`) — left to the implementation task.
- The cursor-rules grilling is the next frontier item (separate grilling task).
- Whether the first-pass adaptation (task 4) splits per-skill or batches is a
  slicing decision for the implementer.
