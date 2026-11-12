# Review Modes

> Canonical reference: `getKnowledgeNodeByPath({ slug: "knowledge-hub", path: "way-of-working-and-structures/1-4-alignment-review-escalation" })`

Three modes for alignment and review work. Choose based on the situation.

## Mode 1: Async solo (default)

Best for: routine reviews, straightforward feedback.

- **Short comment:** Write directly on the artifact via `createComment`.
- **Longer feedback:** Open a review chat. State your lens. Reference wiki
  pages. Ask the AI for structured comparison. Comment on relevant passages.
- **Voice:** Record thinking aloud, send recording, review/correct AI transcript.

## Mode 2: Sync multi-perspective

Best for: several Stakeholders with potentially conflicting views.

- One person hosts, shares screen, drives review chat, activates voice recording.
- Others join: spoken contributions are transcribed and included.
- Group surfaces tensions and agrees on conclusions in the same session.

## Mode 3: Sync Owner + Stakeholder

Best for: breaking async ping-pong that has gone on too long.

- Owner invites Stakeholder to a short joint session.
- Open review chat, activate voice recording, discuss directly.
- Close by confirming the agreed outcome in the chat: that becomes the record.

> A 20-minute call with a clear conclusion beats three days of messages.

## Opinions, not reviews

Asking someone to look at a document used to be called a review and looked
like an approval. It is now what it always was: asking for an **opinion**
(v18). The flow:

- The reader answers on a **graded scale**, from "Looks good" through
  "Neutral" to "Rethink the approach", optionally with a written reason.
- **Nothing is locked and there are no rounds**: an opinion never blocks the
  artifact, and the author can simply act on it and move on.
- The author can **edit a submitted opinion** afterwards (v19), so a
  mis-click is not permanent.

The actual approvals now happen in the **quality gates**, the formal
discipline sign-offs at Alignment and Review (see
[workflow-phases.md](workflow-phases.md)); an opinion is input to that
decision, not the decision itself.

## Agent guidance

- **Default to Mode 1.** Post comments on artifacts with `createComment`,
  setting `is_ai_generated: true`.
- **Reference artifacts and wiki pages** in comments to provide context.
- **Suggest Mode 3** when a comment thread shows extended back-and-forth
  without convergence.
- **Always set deadlines** when requesting input on behalf of an Owner.

## Relevant MCP tools

| Action | Tool |
|---|---|
| Comment on artifact | `createComment` with `entity_type: "ARTIFACT"` |
| Comment on task | `createComment` with `entity_type: "TASK"` |
| List comments | `listComments` |
| Find artifacts with an open opinion request | `listArtifacts` with `opinion_requested: true` |

The opinions flow itself has no MCP write path: giving, requesting, or
editing an opinion happens in the **Aura UI**. On MCP the flow is visible
only as the `opinion_requested` filter on `listArtifacts` (the artifacts
where the caller has an open opinion request, neither withdrawn nor
answered).
