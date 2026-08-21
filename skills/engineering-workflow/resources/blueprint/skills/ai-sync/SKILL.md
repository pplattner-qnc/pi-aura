---
name: ai-sync
description: anwalt.de engineering-workflow skill. Check whether the rules and skills already present in this repository still match the central set they came from — and, where they diverge, whether that is a deliberate adaptation or a stale copy. Use when the user invokes /ai-sync, asks whether the repo's guardrails are "up to date" or "in sync" with the central/house standard, or wants to know what changed centrally since this repo last adapted something. Reports an inventory with provenance, a per-item version-comparison verdict (identical, stale, locally modified, new centrally, local-only), and — where a local adaptation and a central change collide — a three-way conflict finding that is reported, never auto-resolved. Collects every safe catch-up proposal from a run into one bundled approval. Never adopts anything without explicit approval, and never checks whether a rule or skill is correctly wired in — that is `ai-setup`.
---

# AI Sync (`/ai-sync`)

Answers one question, in several shapes: **does what lives here still match the central state — and where it does not, is that on purpose or by accident?**

`ai-sync` owns the **version axis**: is the rule or skill present here **the current version** of what it came from? It never owns the **structure axis** — whether a rule is imported into `CLAUDE.md`, whether the attach mode is right, whether it is listed in the rule map, whether an adaptation is recorded in `adaptations.md` at all. That is `ai-setup`'s Block D. A structural finding in this skill's output (e.g. "missing `@import`", "no `adaptations.md` row") is a bug in this skill, not a feature.

See "What this skill still cannot do" below for the one honest limit that remains — it is a property of the carrier the building blocks live on, not a gap in this skill.

## When to apply

- The user runs `/ai-sync`.
- The user asks whether this repo's rules/skills are current, drifted, or out of sync with the house/central standard.
- The user wants to know what changed centrally since the last adaptation, without asking "is my setup correct" (that question is `/ai-setup`).

## The shared vocabulary — read, don't restate

This skill shares its four reconciliation buckets and its six invariants with `ai-setup`. Both are specified once, in the wiki, not here:

- [AI-Readiness Rollout](https://aura.dev-anwalt.de/knowledge/engineering-foundation/workflow/ai-readiness-rollout) — the four buckets (Redundant · Conflicting · Repo-specific · Missing), the six invariants every automated write obeys, and the report-first / block-approval run shape.
- [AI Foundation File Map](https://aura.dev-anwalt.de/knowledge/engineering-foundation/guides/ai-foundation-file-map) — what each steering file/folder is, in plain language, derived from `general-ai-docs-structure` and this repo's `AGENTS.md`.
- `general-ai-docs-structure` (rule) — the canonical mechanics: the `universal/`/`project/` split, and the "Adaptation convention" that defines what `adaptations.md` records and why a move (not a copy) is the only valid way to adapt.

If any instruction below seems to repeat one of these, treat the source as authoritative and this skill's text as a pointer, not a second definition. This skill adds only what is specific to the *version-comparison* act itself — including its own report line, which is defined under "Report format" below and nowhere else.

## Resolving the reference — never hardcoded

The central set to compare against is **whatever the target repo's `AGENTS.md` → `## Configuration` → `` `ai-sync` reference `` currently says.** Read it fresh on every run; never assume it still points where it pointed last time, and never fall back to a default location of your own choosing.

- If the key is **absent**, stop before doing any comparison work and report that `ai-sync` has nothing to compare against — this is a missing-configuration finding, not a silent no-op and not a guess.
- If the value names **this repository**, the central set is this repo's own `anwaltde/universal/` tree (and, for Y3, this repo's own git history of a since-moved file). Running `/ai-sync` here against that value will legitimately find little drift for `universal/` files — that is expected, not a bug, since this repo *is* the reference for everyone else. It is still meaningful for locally adapted (`project/`-with-origin) files, and for anyone temporarily repointing the value to test against a different central state.
- If the value names a **wiki space**, the central set is that space's `blueprint/` tree (the house building blocks), fetched by path with `getBlueprintFiles`. There is no `universal`/`project` segment under `blueprint/` — that split lives in the target repo after install.
- Whichever it is, the **fetch mechanism follows the value** — it is never written into this skill as a fixed path, host, or MCP call. When the value names this repository, fetch via git. When it names a wiki, fetch via `getBlueprintFiles`. Nothing else in this skill changes with that switch.

## Recognising a central origin

Three checks below (Y1's classification, Y5, Y7) turn on whether a local file has a **recognisable central origin**. That phrase decides whether a run stays quiet or produces a finding for every `project/` file, so it is defined here rather than left to judgement:

A `project/` file has a recognisable central origin when **either** of these holds, checked in this order:

1. **It is named in `adaptations.md`.** A recorded origin is the origin — no inference, no second opinion. This is the only case that yields a *confirmed* origin.
2. **A file of the same name exists in the central set.** For a git reference, that is this repo's `anwaltde/universal/` tree. For a wiki reference, that is the `blueprint/` tree. Filename identity is the only inference this skill makes, because it is the one signal the adaptation convention guarantees: a move keeps the filename and changes only the folder. This yields a *suspected* origin.

Anything else is **not** a recognisable origin — specifically, content similarity to a differently-named central file is explicitly **not** a signal. Do not diff a `project/` file against the whole central set hunting for a plausible ancestor: a false positive here means telling the owner their genuinely local rule is drift, which is worse than staying silent. A `project/` file with no `adaptations.md` row and no same-named central counterpart is **originally local**, full stop.

> In this repository today, `adaptations.md` is empty and no `project/` file shares a name with a `universal/` one, so every `project/` rule classifies as originally local and a run produces no Y5 finding at all. That is the correct result, not a missed check.

## The retrieval seam — fetching a past version

The section above resolves *where the current central state lives*. Y4's three-way comparison needs a different capability: **a specific past version of one building block** — the version an adaptation was made against, not today's version of anything. Treat this as a narrow interface, not a hardcoded procedure: **"give me version X of building block Y."** This skill never issues a git command, a wiki path, or a store-specific version call directly in its reasoning — it asks the seam and reacts to what comes back.

**Today's implementations — pick the one the reference value names:**

1. **This repository (git).** The *current* version of a building block is its present file content in the worktree. A *past* version — the source version recorded in `adaptations.md`'s "Source version at adaptation" column — is resolved via the file's commit history: find the commit at or immediately after that version stamp (e.g. `git log --follow -- <path>` to survive a `universal/` → `project/` move, then `git show <commit>:<path>`). If the file's path changed since the source version (a move, not a copy — see `general-ai-docs-structure`), follow it through git's rename detection rather than giving up because the path no longer matches.
2. **Wiki (`getBlueprintFiles`).** The *current* version is `getBlueprintFiles` with the block's `blueprint/` path and no version argument. A *past* version is the same tool with the version pointer stored in `adaptations.md` — the checksum or integer stamp the blueprint store treats as addressable. Read the current stamps from the manifest that `aiSetup` (or `getBlueprintFiles` on `blueprint/manifest.yaml`) returns, so Y3 can compare stamps without downloading every body.

**What the seam must promise, independent of implementation:** given a building block identity and a version stamp, return that exact version's content, or say clearly that it cannot. Nothing in Y4's judgement below depends on *how* that promise is kept.

**Honest degradation.** If the seam cannot produce the requested version — history temporarily unreachable, an old git stamp after a repo switched its reference to the wiki, or a pointer the store does not have — it says so plainly, and every check that depends on it (Y4) degrades to "original changed, please review" instead of asserting a three-way comparison it cannot back up. Never silently fall back to a two-way comparison and label it three-way; a degraded finding must read as degraded.

## Workflow

### Y1 — Inventory with provenance

Walk `.cursor/rules/anwaltde/` and `.agents/skills/anwaltde/`. Skip everything **outside** `anwaltde/` entirely (vendor/third-party) — that bucket is "not ours" and gets no further processing, not even a report line.

For everything else, classify each file into exactly one state before any version comparison happens — this inventory is the ground truth the rest of the run builds on. "Recognisable central origin" means exactly what the section above defines:

| State | How it is recognised |
|---|---|
| `universal`, unchanged | Lives under `anwaltde/universal/`; no reason yet to think it differs from the reference |
| `project`, with central origin | Lives under `anwaltde/project/` **and** has a row in `adaptations.md` naming the central original it came from |
| `project`, originally local | Lives under `anwaltde/project/` with **no** row in `adaptations.md` **and** no same-named central counterpart — always was repo-specific, nothing to compare against centrally |
| `project`, provenance unrecorded | Lives under `anwaltde/project/`, has a same-named central counterpart, but **no** row in `adaptations.md` — see Y5 |
| Orphaned | Exists locally with a confirmed or suspected central origin, but the central set no longer has it (see Y7) |
| Vendor | Outside `anwaltde/` — already excluded above |

### Y2 — Version comparison against the resolved reference

For every inventoried item that is not "originally local", "provenance unrecorded", or "vendor", compare against its counterpart in the resolved central set and assign exactly one verdict:

- **identical** — matches the current central version byte-for-byte (or, where only a version stamp is comparable, stamp-for-stamp).
- **stale** — a `universal`, unchanged item whose central counterpart has since moved on. Candidate for a straight catch-up proposal.
- **locally modified** — a `project`-with-origin item; see Y3 for the cheap path before doing any real diff work here.
- **new centrally** — the central set has it, this repo does not (Y6, first case).
- **local-only** — this repo has it, there is no central counterpart at all, and it was never adapted from one (genuinely repo-specific — not an error, just a fact worth stating).

### Y3 — The cheap happy path (do this before anything expensive)

For every `project`-with-origin item, **before** attempting any real comparison: read the source version recorded in `adaptations.md` and check it against the central counterpart's *current* version stamp only — no content diff, no fetch of full history.

- **Still current → stop here for this item.** No diff, no report line beyond "up to date", no further work. This is the overwhelmingly common case and it must stay cheap, or the skill becomes something nobody runs a second time.
- **Not current → only then** escalate. The plain two-way fact — local `project/` version vs. current central version, "stale, locally modified" — is always available and always gets reported. Whether the central change touched the adapted region specifically is the sharper, three-way question Y4 answers below; escalate to it whenever a source version stamp is recorded in `adaptations.md` for this item, so the report never understates what could be checked.

### Y4 — Conflict case: the three-way comparison

Applies to every item Y3 escalated (`project`-with-origin, source version stamp no longer current). Y3's two-way fact — "stale, locally modified" — is always reported regardless of what follows here. Y4 asks the sharper question underneath it: **did the central change land inside the region this repo deliberately touched, or somewhere untouched?**

1. **Fetch the source version** — the exact version named in `adaptations.md`'s "Source version at adaptation" column — through the retrieval seam above.
   - **Unreachable → stop here.** Report the honest-degradation finding ("original changed, please review") and do not proceed to steps 2–4; do not imply a three-way judgement was made.
2. **Diff source version → current central version.** This identifies which region(s) of the file changed centrally since the adaptation.
3. **Diff source version → this repo's local `project/` version.** This identifies which region(s) this repo deliberately touched when it adapted.
4. **Compare the two region sets:**
   - **Disjoint** (the central change and the local adaptation touch different parts of the file) → a **safe catch-up**: the central change can be pulled in without disturbing the adaptation. Feed it into Y8's collection; do not apply it here.
   - **Overlapping** → **conflict.** Report it, naming the colliding region precisely (the affected section, heading, or line range — whatever the file's structure makes identifiable), and **stop — propose nothing**. Never merge the two, never suggest which side should win. Only the person who made the original adaptation knows the intent behind it; a skill that resolves this "helpfully" destroys exactly that intent.

A conflict is never retried into a catch-up proposal on a later run just because it looks small — it stays a conflict, reported every run, until a human edits `adaptations.md` (recording a fresh adaptation against the new central version) or the local `project/` version itself.

### Y5 — Provenance unrecorded: not comparable, and not this skill's finding

Y1 files this state separately rather than guessing: a `project/` file with a same-named central counterpart but **no** row in `adaptations.md`. Two things follow from it, and only one of them belongs to this skill.

**The missing log row is `ai-setup`'s finding.** Its checkpoint **D6** owns "every `project/` version with a central origin is recorded in `adaptations.md`" — a completeness statement about the control layer, i.e. the structure axis this skill explicitly does not own (see the axis note at the top). So: do **not** report the missing row as an `ai-sync` finding, do **not** ask the owner whether this was a forgotten entry or accidental drift, and do **not** write a row into `decisions.md` about it. One condition, one owner; `/ai-setup` is where it gets settled.

**What does belong here is the consequence for the comparison.** Without a recorded source version there is no base version to fetch, so Y3 has no stamp to check cheaply and Y4 cannot run at all. Report the item as **not comparable, provenance unrecorded**, name `/ai-setup` D6 as the way to close it, and produce no proposal for it — there is nothing safe to propose about a file whose relationship to the central set is unknown.

**Read `decisions.md` first, though.** If `ai-setup` already recorded a D6 finding or the owner already recorded this file as deliberately local, report that recorded answer instead of re-stating the open question every run. This is a read, not a write. Once the `adaptations.md` row exists, a later run finds it and the item enters the normal Y3/Y4 path like any other `project`-with-origin item.

### Y6 — Central has it, this repo does not

Two truths hide behind the same observation, and only `decisions.md` tells them apart:

1. **Check `decisions.md` for an entry recording this item as deliberately removed.** If found: report it as removed, cite the entry, and propose **nothing** — no reinstatement suggestion, ever, for a deliberate removal.
2. **If no such entry exists, do not guess.** Ask the user directly which of the two truths applies — "this was deliberately dropped, just never logged" or "this is genuinely new centrally and was never here". Whatever the answer, **write it into `decisions.md` immediately** (this one write is not gated behind a bundled approval — the invariant it serves is "the next run doesn't ask again", not "nothing gets written before sign-off"). Use the row shape `decisions.md` defines for this skill: `Y6 · <building block>` in the first column, so two items settled under the same Y-case stay distinguishable. Only once that is settled does the item get either the "removed, no proposal" treatment above, or the adoption treatment below.
3. **For a genuinely new central item**, propose adoption — but measure it against the reach of the foundation set this repo actually adopted (`general-ai-docs-structure`, which owns that boundary; `ai-setup` checkpoint A3 is where a repo settles it). Not every new `universal/` item is in scope for every repo; say so if it plainly is not, instead of proposing it anyway.

### Y7 — This repo has it, centrally it is gone

Orphaned. State the fact and both legitimate outcomes side by side — **keep it, now explicitly as repo-specific** (and say what that implies: no future central updates will ever apply to it again), or **remove it**. Do not pick one. This is a human call, not a default.

### Y8 — Bundled catch-up proposal, one approval

Every proposal a run produces — Y4's disjoint (safe) catch-ups, Y6's new-centrally adoptions, Y7's orphan removals — is **collected across the whole run**, not applied or asked about one at a time. Y5 contributes nothing here by design: an item whose provenance is unrecorded gets a finding, never a proposal.

1. **Collect, don't act.** As each check produces a proposal, add it to the run's pending list instead of writing or asking immediately. This excludes the `decisions.md` write Y6 makes for itself — that records a **fact about what already happened**, not an **action this run proposes to take**, and stays ungated per its own section.
2. **Present once, as a single preview.** At the end of the run, show every collected proposal together — each keeps its own six-field report line (see "Report format" below) — and ask for exactly **one** approval covering the entire set.
3. **Approve → apply all, together.** Applying stays idempotent (Y3: an already-current item does nothing on a later run) and the six invariants from the shared vocabulary hold unchanged inside the bundle too — no silent writes beyond this one gated batch, the central layer is never written to, repo-specific content is never overwritten, and a proposal touching a team-gated rule still stops for the stricter sign-off that invariant demands even though it rode along in this bundle.
4. **Reject → apply nothing.** Not "apply the safe-looking ones and skip the rest" — a partially applied bundle is exactly the partial state the abort invariant forbids. Rejecting leaves the repository byte-identical to before the run; the next run proposes the same bundle again (or a changed one, if the central state moved on in the meantime).
5. **Re-applying an already-applied bundle is a no-op.** Each item inside it is itself subject to Y3 — once current, it produces no further finding, individually or as part of a later bundle.

## Report format

This skill's report line is **defined here** — the wiki carries the shared buckets, invariants and run shape, not a line format. `ai-setup` reports on checkpoints and uses a line suited to that; this one reports on building blocks and needs two fields that a checkpoint line has no use for (which file, and where it came from). The two are deliberately parallel in shape and length, not identical in fields:

```
<Y-case> · <comparison finding> · <file/path> · <provenance> · <reasoning> · <recommendation>
```

| Field | Carries |
|---|---|
| Y-case | The check that produced this line (`Y2`, `Y4`, …), qualified where one case can recur per file |
| comparison finding | The verdict from Y2, or the sharper Y4/Y5 outcome |
| file/path | The local building block this line is about |
| provenance | Its inventory state from Y1, plus the recorded origin where there is one |
| reasoning | Why the finding is what it is — the evidence, not a restatement of the verdict |
| recommendation | The next action, or explicitly that this skill cannot resolve it |

The examples below use a placeholder file (`example-rule.mdc`) rather than a real one on purpose: `adaptations.md` is empty in this repository, so **every** concrete example would have to invent an origin that does not exist — and, worse, one the adaptation convention forbids, since a recorded origin means the central original was deleted by the move.

Example, for a `project/`-with-origin rule whose central original has moved on:

> `Y2/Y3 · veraltet (Quell-Version nicht mehr aktuell) · .cursor/rules/anwaltde/project/example-rule.mdc · project, Ursprung universal/example-rule.mdc (siehe adaptations.md) · Zentrale Fassung hat sich seit der Quell-Version geändert · Diff gegen die aktuelle zentrale Fassung prüfen, kein automatischer Nachzug`

Example, for a Y4 **conflict** (note: names the colliding region, and the recommendation is explicitly "not resolvable by this skill" rather than a catch-up):

> `Y4 · Konflikt (zentrale Änderung trifft angepassten Bereich) · .cursor/rules/anwaltde/project/example-rule.mdc · project, Ursprung universal/example-rule.mdc (siehe adaptations.md) · Zentrale Fassung hat sich seit der Quell-Version im Abschnitt "Shared services" geändert — genau dort, wo die lokale Anpassung liegt · Nicht automatisch auflösbar — Diff von Hand prüfen, Absicht der Anpassung nur dem Menschen bekannt`

Example, for a Y4 **honest degradation** (history unreachable):

> `Y4 · Original geändert, bitte prüfen (Historie nicht erreichbar) · .cursor/rules/anwaltde/project/example-rule.mdc · project, Ursprung universal/example-rule.mdc (siehe adaptations.md) · Quell-Version aus adaptations.md konnte nicht über die Abruf-Naht geladen werden · Kein Drei-Wege-Vergleich möglich — Diff von Hand prüfen`

Example, for a Y5 item (a finding without a proposal, handing the log gap to `ai-setup`):

> `Y5 · nicht vergleichbar (Herkunft nicht protokolliert) · .cursor/rules/anwaltde/project/example-rule.mdc · project, gleichnamiges zentrales Gegenstück vorhanden, keine Zeile in adaptations.md · Ohne Quell-Version gibt es keine Ausgangsfassung, Y3 und Y4 sind damit nicht durchführbar · `/ai-setup` D6 schließt die Lücke — danach vergleicht ein späterer Lauf normal`

Items that resolve cheaply as "identical" or "up to date" (Y3's fast exit) do **not** need a full line each — collapse them into a single summary count so the report stays readable and the expensive-looking cases stand out.

**Y8's bundle** adds one trailing line after all collected proposal lines, making the all-or-nothing shape explicit, e.g.:

> `Sammel-Freigabe: 3 Nachzüge oben — freigeben zieht alle drei zusammen nach, ablehnen ändert nichts.`

Match the report's language to the conversation (German by default in this repo); keep the Y-case ids and field structure stable regardless of language.

## Boundary: `ai-sync` vs. AURA-755

`ai-sync` **decides**; AURA-755 **transports**. This skill owns what is here, how it deviates, and what gets proposed — the judgement and the responsibility for it. AURA-755 owns where the canonical set physically lives, how it is fetched, and the central update history. The boundary is a value, not a rewrite: when `` `ai-sync` reference `` names a wiki, this skill's fetch mechanism follows the value (see "Resolving the reference") and nothing else about the skill changes. This repo itself stays its own git reference — it is the source of the blueprint, and comparing it against a published copy of itself would look like drift. Consumer repos are the ones that point the key at the wiki. This skill also does not bootstrap itself into a foreign repo — that import path is `aiSetup`, not this skill's concern.

## What this skill still cannot do

Named explicitly so a report never implies more than it checked:

- **The three-way comparison degrades when the seam cannot produce the requested version.** Y4 is fully built against git (this repo) and against `getBlueprintFiles` version pointers (wiki). An old git stamp after a consumer repo switches its reference to the wiki, or a pointer the store does not have, degrades to "original changed, please review" — that is the honest answer, not a gap this skill can close by guessing.
- **Origin detection stops at the filename.** Per "Recognising a central origin", a `project/` file renamed as part of its adaptation is indistinguishable from one that was always local. That is deliberate — the alternative is guessing by content similarity and telling owners their own rules are drift — but it means such a file is silently treated as local until someone records it in `adaptations.md`.

## Anti-patterns

- **Reporting a structural finding** ("no `@import` line", "not in the rule map", "wrong attach mode", "missing `adaptations.md` row"). That is `ai-setup`'s Block D. If you notice one in passing, do not include it in this skill's report — say nothing, or point the user at `/ai-setup`.
- **Turning Y5 into a question.** The missing log row belongs to `ai-setup` D6. This skill states that the item is not comparable and moves on; it does not interrogate the owner about a forgotten entry, and it writes nothing to `decisions.md` about it.
- **Inferring an origin from content similarity.** Filename identity or a recorded row — nothing else. A false positive here accuses an owner's genuinely local rule of being drift.
- **Hardcoding the central location.** Never write a repo path, a wiki slug, or a host name into this file as the comparison target. Read `` `ai-sync` reference `` every run.
- **Hardcoding the retrieval mechanism.** Never write a git command, a wiki path, or a store-specific version call into Y4's own reasoning — go through the retrieval seam so a carrier change only touches that one section.
- **Treating Y3's fast exit as optional.** Doing a full diff for every `project/`-with-origin item on every run defeats the point of Y3 and makes the skill too slow to run habitually.
- **Auto-resolving a Y4 conflict, ever** — including "obviously" trivial ones. A skill that merges a collision "helpfully" destroys the intent someone put into the adaptation. Report and stop; only a human resolves it.
- **Asserting a three-way comparison when the seam degraded.** If the source version could not be fetched, say "original changed, please review" — never label a two-way fallback as three-way.
- **Guessing at Y6/Y7 instead of asking or stating both outcomes.** A deliberate removal and a genuinely new central item look identical from the filesystem alone; only `decisions.md` — or a direct question, logged afterwards — tells them apart.
- **Proposing a reinstatement for something `decisions.md` already recorded as deliberately removed.**
- **Applying part of a Y8 bundle.** A rejected collective proposal leaves nothing applied, not "the safe-looking half". Approval is per bundle, not per item inside it.
- **Adopting, reverting, or otherwise writing a rule/skill body without explicit approval.** This skill proposes; nothing is caught up silently. Y6's `decisions.md` entry is the narrow exception — it records a fact, not an action — everything else waits for Y8's single approval.
- **Comparing against the reference without checking whether it is even set**, and silently treating an absent key as "nothing to do" instead of reporting the missing configuration.
