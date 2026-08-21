# Review Modes

> Canonical reference: `getKnowledgeNodeByPath({ slug: "knowledge-hub", path: "prozesse/how-we-work-in-aura-a-practical-guide" })`

Three modes for alignment and review work. Choose based on the situation.

## Mode 1 — Async solo (default)

Best for: routine reviews, straightforward feedback.

- **Short comment:** Write directly on the artifact via `createComment`.
- **Longer feedback:** Open a review chat. State your lens. Reference wiki
  pages. Ask the AI for structured comparison. Comment on relevant passages.
- **Voice:** Record thinking aloud, send recording, review/correct AI transcript.

## Mode 2 — Sync multi-perspective

Best for: several Stakeholders with potentially conflicting views.

- One person hosts, shares screen, drives review chat, activates voice recording.
- Others join — spoken contributions are transcribed and included.
- Group surfaces tensions and agrees on conclusions in the same session.

## Mode 3 — Sync Owner + Stakeholder

Best for: breaking async ping-pong that has gone on too long.

- Owner invites Stakeholder to a short joint session.
- Open review chat, activate voice recording, discuss directly.
- Close by confirming the agreed outcome in the chat — that becomes the record.

> A 20-minute call with a clear conclusion beats three days of messages.

## Agent guidance

- **Default to Mode 1.** Post comments on artifacts with `createComment`,
  setting `is_ai_generated: true`.
- **Reference artifacts and wiki pages** in comments to provide context.
- **Suggest Mode 3** when a comment thread shows extended back-and-forth
  without convergence.
- **Always set deadlines** when requesting reviews on behalf of an Owner.

## Relevant MCP tools

| Action | Tool |
|---|---|
| Comment on artifact | `createComment` with `entity_type: "ARTIFACT"` |
| Comment on task | `createComment` with `entity_type: "TASK"` |
| List comments | `listComments` |

> **Artifact review workflow tools are not available via MCP after the
> aura-mcp-dev overhaul.** The gone tools — `requestArtifactReview` (not
> available via MCP), `getArtifactReview` (not available via MCP),
> `submitArtifactDecision` (not available via MCP), `startArtifactReview`
> (not available via MCP), `reopenArtifactReview` (not available via MCP),
> `getArtifactApprovals` (not available via MCP) — have REST endpoints in
> `openapi-new.yaml`. Use `aura.mjs artifact review-*` subcommands, or the
> REST endpoints (`/artifacts/{id}/review-request`, `/artifacts/{id}/review`,
> `/artifacts/{id}/decisions`, `/artifacts/{id}/approvals`).
