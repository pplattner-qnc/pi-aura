---
type: ticket
subtype: feature
title: Rewrite the aura skill file
status: stable
workflow_state: ready
blocked_by:
- mention-machinery-mcp
- feedback-mcp-submission
- remove-cli-rest-surface
- rest-library-consumer-rule
- engineering-surfaces-move-out
size: l
---

## What to build

The aura skill file, rewritten per the mcp-inventory report's outline so it teaches the live 120-tool server (build 2026-10-12, commit 4aa37833):

- The tool count becomes 120 with the build identity cited once, so future drift is detectable.
- The ten mcp* tools stay listed with three one-line corrections: the opinion artifact kind that replaced review, the base64 upload description with its size limit, and the artifact mode renamed to whole with the section and whole-body character limits and the expected-version contract.
- The "left MCP entirely" paragraph becomes the per-capability scorecard: back (the three capacity tools, board summary, owner and crew search), half back (Jira and Asana reads, wiki file reads, memory browse plus ingest), still absent (notification writes, the review-turned-opinion flow beyond its listing filter, skills import, wiki upload).
- The response-format contract is added: compact is the default, detail on the declaring tools, full on the two task reads; the tiering is MCP-only and not part of the HTTP API; the permission apparatus is excluded from every tier and reachable by the same PAT through REST.
- The new tool families get bullet-level coverage per the confirmed placement map (families with usecase sections stay index pointers to them; single-call families get their one-line entries).
- Threaded comments become flat per the live description; the contradictory capacity sentences resolve to the current truth; the stale feedback tool-name token is fixed to the current naming.
- aiSetup and getBlueprintFiles are not mentioned at all.
- REST-only capabilities get UI pointers, at most a non-teaching note that the REST API exists, and the file-workflow pattern taught is codemode plus the write tool (download an artifact by reading it through MCP, then writing it to disk).

The two-layer citation policy applies: tool contracts cite the introspection evidence; semantics and process cite the wiki sources the planning record identified. No em-dashes in any touched prose.

## Acceptance criteria

- [ ] Every claim in the skill file matches the live server as recorded in the planning evidence; the tool count, the build identity, the scorecard, the response-format contract, and the kind list are verified rows from the drift report.
- [ ] The audit's per-claim drift table shows no unaddressed row for the skill surface.
- [ ] No passage teaches REST or CLI access; the codemode pattern is the taught file workflow.
- [ ] The two expected-dead tools are absent.
- [ ] The file contains no em-dash in its own prose.

## Blocked by

- mention-machinery-mcp
- feedback-mcp-submission
- remove-cli-rest-surface
- rest-library-consumer-rule
- engineering-surfaces-move-out

## Implementation notes

Landed as merge f94bb72 on task/aura-skill-rewrite (404 insertions / 55 deletions over exactly the skill file and the guard). The skill file now teaches the live 120-tool server with the build identity cited exactly once as the drift anchor; the ten mcp* one-liners with the three corrections (OPINION replacing REVIEW, the base64 upload with its 10 MB limit, the whole mode with its character limits, the expected-version contract, and the confirm_full_replace destructive-replace gate); the leave-and-return scorecard (the back, half-back, and still-absent sets with their Aura UI pointers); the response-format contract with the permission exclusion as a non-teaching same-PAT note; the new families at bullet level; flat comments; the corrected feedback tool naming; and no mention of aiSetup or getBlueprintFiles. Eight content guards in the consolidated guard pin the rewrite's load-bearing facts (count, build identity's single occurrence, mcp* list, kind list, scorecard tiers, response-format contract, codemode pattern, absence pins for the expected-dead tools and em-dashes); the absence pins were born-green and their power was verified by injection probes.

Three handoffs for the remaining documentation tickets: the codemode bullet points at artifact-management.md for the full walkthrough, so ticket 8 must deliver it there (and the usecase table row label still reads "review", an index label to fix); the development-process paragraph defers the concrete split status series to ticket 9's workflow-phases.md; and one pi-side render sentence (the tool-name prefix) is inferred client-side behavior, guard-pinned so a pi upgrade that changes the rendering fails the suite rather than silently staling the sentence. Two deliberate evidence-driven readings recorded by the deviation report: the response-format REST note omits the server's example endpoint (the non-teaching reading), and the upload one-liner asserts nothing about artifact creation because introspection could not confirm it (the drift report's open item stands until a live probe or the REST doc resolves it).
