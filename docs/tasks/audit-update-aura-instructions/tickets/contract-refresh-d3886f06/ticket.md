---
type: ticket
subtype: feature
title: Refresh the shipped contracts to the full live schemas and the new build identity
status: stable
workflow_state: ready
blocked_by: []
size: m
---

## What to build

The drift-detection loop's first real cycle: the live Aura server moved to build d3886f06 (untagged, 2026-11-09 14:59:59) from the audited 4aa37833 (2026-10-12), and the shipped contract's semantics defeated the operator's ruling: the contract data records only the parameters the typed methods send (listTasks 6 of the server's 20, listArtifacts 5 of 7), so the self-check's cosmetic warnings fire against any server, including the audited one, turning real drift signal into permanent noise.

- Re-audit the live server: capture a fresh full introspection (describeNamespace plus describeTool per tool) of build d3886f06, diff it against the effort's recorded dump of 4aa37833 (tool count, per-tool parameter sets, descriptions, the instructions string), and record the diff in the ticket's .work directory. The tool count is verified unchanged at 120; the diff decides whether any taught claim beyond the build identity moved.
- Rewrite the shipped contract data so each of the ten covered tools records its complete schema from the fresh audit (every parameter, its type, requiredness, enum values, default, description), not the sent subset. The typed methods keep sending exactly what they send; only the contract data grows to the full schema, so a cosmetic warning henceforth means the server actually changed since the audit, per the operator's ruling.
- Re-derive the provenance guard from the fresh dump (the shipped contracts must match the recorded audit verbatim, full-scope now, not subset-scope).
- Update the build identity everywhere it is cited as the drift anchor: the skill file's build line (currently 2026-10-12, commit 4aa37833) and its guard pin; extend the architecture's contract description if it names the subset semantics.
- Fold any real surface change the diff reveals into the taught claims (only if the diff shows changed parameters or descriptions in the ten covered tools or the taught families; the known parameter additions on listTasks and listArtifacts all existed in 4aa37833, so the expectation is identity-only).

## Acceptance criteria

- [ ] A fresh introspection record of d3886f06 exists in the ticket's .work directory, with a written diff against the 4aa37833 record.
- [ ] The shipped contract for every covered tool records the complete server schema; the self-check runs clean (no cosmetic warnings) against the current live server.
- [ ] A simulated added server parameter still warns, and a simulated removed or retyped core parameter still fails fast: the drift gate keeps its discriminating power, verified by the existing fake-caller tests extended to the full-schema contract.
- [ ] The provenance guard cross-checks the full contracts against the fresh record and passes.
- [ ] The skill file's build identity cites d3886f06 (or the current build at implementation time) exactly once; its guard pin matches; no other file cites the old build identity as current.
- [ ] Any real surface change the diff reveals is reflected in the taught claims.
- [ ] Full gate green: shared suite, ten extension suites, typecheck.

## Blocked by

None (can start immediately).
