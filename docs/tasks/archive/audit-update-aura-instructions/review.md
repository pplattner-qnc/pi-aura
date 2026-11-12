---
type: review
title: "Finalize review: audit-update-aura-instructions"
dispositioned: true
reconcile: "done: the final reconcile folded the two post-review landings (finalize-cleanup and contract-refresh-d3886f06) into the living architecture as entries 11 and 12 with the supporting sections updated (commit 1459a91), completing the per-level reconcile chain that ran through the implementation phase (levels 1 through 4 at commits df0c706, fb931e5, 8fc19e7) before this review's original record."
---

# Finalize review: audit-update-aura-instructions

Fixed point: 8ab1e9b. Diff reviewed: 8ab1e9b...HEAD on develop (the ten landings at review time; the two triage tickets landed after, each with its own chain verification: tdd, verify, deviation, all green). Ground truth established before the axis fanout: shared suite 197/197 pass at review time (172/172 after the two triage tickets), all ten extension suites pass, typecheck clean, working tree clean. Two read-only axis reviewers ran with fresh context; the aggregator verified each new finding in the tree before recording it. After the axis review, the operator reported the contract self-check firing live in production, which produced two further findings (13 and 14), verified against both the live server and the shipped contract source.

## The effort's claim (Spec axis, verified)

The claim elements check out in source: the skill file carries the live 120-tool count with the build identity exactly once, the corrected mcp* list, the scorecard, the response-format contract, and no mention of the two expected-dead tools; the five root documents are free of the 90-tool count, the old install pin, the retired config shape, and REST or CLI teaching; the capacity files teach the returned tools and the new model; the process files carry the split status series and the opinions flow; the retired vocabulary is pinned outright across the guard; the changelog carries the effort's entries. Every map or specification statement superseded by the operator's phase decisions (the pi MCP client reuse, the server registration, the release outside the effort) is sanctioned by the recorded decisions and the deviation reports; no unsanctioned misdescription was found. The unverifiable-from-repo items (the live-server truth of tool claims, the read-only probes) rest on the provenance guard and the gitignored evidence, as the architecture records. The one major finding (the retired flat status series surviving in one usecase file) and its enforcement gap are fixed by the cleanup ticket, which landed and closed out; the two-axis verdicts stand as OK with notes, both worst issues resolved.

## The delivered code (Standards axis, verified)

The new modules are sound: the contract comparison and the drift gate hold up under reading, no dangling imports of deleted modules exist, and the manifest, Taskfile, and README agree with the tree. The findings were convention debt and precision, not correctness, plus the one real design defect against the operator's drift-detection ruling (the contract subset), fixed by the contract-refresh ticket, which landed and closed out: the contracts now record the complete server schemas from a fresh audit of the new build, the provenance guard is both-directional, the live self-check runs clean, and the drift signal is real again.

## Production drift report (post-review, operator-sourced)

On the first fresh pi session after the landings, the contract self-check warned that listTasks drifted cosmetically (fourteen new optional parameters named) and listArtifacts (two). Verification: the live server had moved to build d3886f06 (untagged, 2026-11-09 14:59:59; the audited build was 4aa37833, 2026-10-12; tool count unchanged at 120), but every warned parameter already existed in the audited build's dump. The cause was the shipped contract's subset semantics: it recorded only the parameters the typed methods sent (listTasks six of twenty, listArtifacts five of seven), so the comparison flagged every unsent server-side optional parameter as new, and the warnings fired against any server, audited or not. The end-to-end chain (registration, construction, self-check, notify) worked as built; the signal was the defect. The address (the contract-refresh ticket) landed and closed out: the re-audit of the new build (identity-only diff, 120 tools unchanged), the contracts re-transcribed at complete schema scope so a warning once again means actual server change since the audit, the provenance guard re-derived both-directionally, and the build identity anchor updated with the old identity pinned absent.

## Disposition record (final)

Both implementation tickets landed and closed out: finalize-cleanup (findings 1 through 8) and contract-refresh-d3886f06 (findings 13 and 14). The informational findings are recorded and accepted by the operator with the ticket approval. The effort's frontier is empty; every review finding is resolved or recorded.

## Dispositions

- Major, Spec: task-management.md 79-84 still taught the retired pre-AURA-2211 flat status series, contradicting workflow-phases.md in the same package; pre-existing, absent from the usecase worklist, and the guard could not catch it.: ticket `finalize-cleanup`
- Minor, Spec: the guard's retired-flat-series ban read only workflow-phases.md, so the enforcement record could not catch the major finding; widen its scan scope.: ticket `finalize-cleanup`
- Minor, Standards: packages/shared/package.json carried the dead js-yaml dependency and @types/js-yaml devDependency (sole consumer deleted with the REST library); the removal guard missed them.: ticket `finalize-cleanup`
- Minor, Standards: packages/shared/src/index.ts kept the stale placeholder comment naming the retired AuraClient.: ticket `finalize-cleanup`
- Minor, Standards: em-dash rule breaches in code comments beyond the recorded list: cursor-rules.ts and the test files aura-mcp-client.test.ts and cursor-rules.test.ts, plus the carryovers in the interface modules, the Taskfile header, local-provider.ts, aura-skill-instruction.ts, and aura-tasks.ts.: ticket `finalize-cleanup`
- Minor, Standards: docs/testing.md attributed createInterface to the reference engine where it is the feedback factory's hook, and omitted logPath; the same doc's runtime-resolution sentence overstated the embed half, with the same phrasing in the Taskfile comment.: ticket `finalize-cleanup`
- Minor, Standards: wiki-knowledge.md's tree-bounds row said widen where the MCP defaults already equal the schema maxima, so passing the parameters can only narrow.: ticket `finalize-cleanup`
- Minor, Standards: the embed fixtures (src/embed/) had zero production consumers; the operator approved removal with the cleanup ticket.: ticket `finalize-cleanup`
- Informational, Standards: aura-health.test.ts imports aura-tasks.ts, breaking the name-beside-module convention; recorded and sanctioned in the effort's planning record.: informational (accepted)
- Informational, Standards: the identical items-extraction shape recurs across the three mention adapters (a small duplication, style-level).: informational (accepted)
- Informational, Standards: aura-mcp-client.ts hardcodes the client version 0.8.0, duplicating the manifest version; it drifts at the release cut, which is outside this effort per the recorded phase decision.: informational (accepted)
- Informational, Spec: the README's two-library-modules sentence is a compression, not a false claim (four non-manifest files ride along; nothing false is stated); recorded residual.: informational (accepted)
- Major, design defect against the operator's ruling: the shipped contracts recorded only the parameters the typed methods sent (listTasks six of twenty, listArtifacts five of seven), so the self-check's cosmetic warnings fired against any server including the audited one; the drift signal was permanent noise.: ticket `contract-refresh-d3886f06`
- Major, environment: the live Aura server moved to build d3886f06 (untagged, 2026-11-09 14:59:59) from the audited 4aa37833; tool count unchanged at 120, but the shipped build-identity anchor and the provenance record were stale, and the full surface diff against the audited dump was unrecorded.: ticket `contract-refresh-d3886f06`
