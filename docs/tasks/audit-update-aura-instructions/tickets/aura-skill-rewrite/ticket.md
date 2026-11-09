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
