/**
 * Logic tests for the pure helpers in the `aura-feedback` extension.
 *
 * Run with:
 *   node --experimental-strip-types extensions/aura-feedback.test.ts
 *
 * Covers the pure, pi-session-free surface only: payload validation, the
 * `source: "MCP"` forcing in {@link buildSendPayload}, log-entry shape and
 * serialization, and the tool-result text formatters. The interactive prompt
 * (confirm/edit/comment screens) and the live Aura `POST /feedback` call are
 * exercised by the pi runtime once settings + a PAT are configured, mirroring
 * how the rest of the extension suite is verified.
 */

import assert from "node:assert/strict";
import {
  buildLogEntry,
  buildSendPayload,
  formatCreatedResultText,
  formatEditedResultText,
  formatRejectedResultText,
  serializeLogEntry,
  validatePayload,
} from "./aura-feedback.ts";
import type { CreateFeedbackInput, FeedbackDetail } from "@pi-aura/shared/aura-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validInput(overrides: Partial<CreateFeedbackInput> = {}): CreateFeedbackInput {
  return {
    title: "A short feedback title",
    body: "x".repeat(50), // meets the 50-char floor
    is_anonymous: false,
    notify_author: false,
    ...overrides,
  };
}

function createdRow(overrides: Partial<FeedbackDetail> = {}): FeedbackDetail {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    title: "A short feedback title",
    body: "x".repeat(50),
    source: "MCP",
    status: "NEW",
    is_anonymous: false,
    notify_author: false,
    created_at: "2025-09-01T10:00:00.000Z",
    updated_at: "2025-09-01T10:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validatePayload
// ---------------------------------------------------------------------------

{
  assert.equal(validatePayload(validInput()), null, "valid payload passes");

  const noTitle = validatePayload({ title: "", body: "x".repeat(50) });
  assert.ok(noTitle && noTitle.includes("title"), "empty title fails mentioning title");

  const longTitle = validatePayload({ title: "y".repeat(121), body: "x".repeat(50) });
  assert.ok(longTitle && longTitle.includes("120"), "overlong title mentions 120");

  const shortBody = validatePayload({ title: "ok", body: "short" });
  assert.ok(shortBody && shortBody.includes("50"), "short body mentions 50");

  const badTypes = validatePayload({ title: 42 as unknown as string, body: "x".repeat(50) });
  assert.ok(badTypes && badTypes.includes("title"), "non-string title fails");
  assert.equal(
    validatePayload({ title: "ok", body: 99 as unknown as string }),
    "body is 0 characters; minimum is 50",
    "non-string body reports 0 chars",
  );
}

// ---------------------------------------------------------------------------
// buildSendPayload — always forces source: "MCP"
// ---------------------------------------------------------------------------

{
  const out = buildSendPayload(validInput());
  assert.equal(out.source, "MCP", "source forced to MCP");
  assert.equal(out.title, "A short feedback title", "title preserved");
  assert.equal(out.body, "x".repeat(50), "body preserved");
  assert.equal(out.is_anonymous, false, "is_anonymous preserved");
  assert.equal(out.notify_author, false, "notify_author preserved");

  // Even if the caller tried to set a different source, it is overwritten.
  const sneaky = buildSendPayload({ ...validInput(), source: "UI" } as CreateFeedbackInput);
  assert.equal(sneaky.source, "MCP", "caller's source overwritten to MCP");
}

// ---------------------------------------------------------------------------
// buildLogEntry + serializeLogEntry
// ---------------------------------------------------------------------------

{
  const payload = buildSendPayload(validInput({ is_anonymous: true }));
  const created = createdRow({ is_anonymous: true, notify_author: false });
  const now = new Date("2025-09-01T12:34:56.789Z");
  const entry = buildLogEntry(payload, created, now);

  assert.equal(entry.timestamp, "2025-09-01T12:34:56.789Z", "timestamp is ISO UTC");
  assert.equal(typeof entry.timestamp_local, "string", "timestamp_local present");
  assert.equal(entry.uuid, created.id, "uuid is the created row id");
  assert.deepEqual(
    entry.payload,
    {
      title: payload.title,
      body: payload.body,
      is_anonymous: true,
      notify_author: false,
      source: "MCP",
    },
    "payload records the sent fields + MCP source",
  );
  assert.equal(entry.created, created, "created row included verbatim");

  const line = serializeLogEntry(entry);
  assert.equal(line.includes("\n"), false, "serialized entry is a single line");
  // Round-trips through JSON.
  const parsed = JSON.parse(line) as { uuid: string; payload: { source: string } };
  assert.equal(parsed.uuid, created.id, "parsed uuid matches");
  assert.equal(parsed.payload.source, "MCP", "parsed source is MCP");
}

// ---------------------------------------------------------------------------
// formatCreatedResultText / formatEditedResultText
// ---------------------------------------------------------------------------

{
  const created = createdRow();
  const createdText = formatCreatedResultText(created);
  assert.ok(createdText.includes(created.id), "created text names the UUID");
  assert.ok(createdText.includes("NEW"), "created text names the status");
  assert.ok(createdText.includes(".pi/aura/feedback.jsonl"), "created text names the log path");

  const editedText = formatEditedResultText(created);
  assert.ok(editedText.includes(created.id), "edited text names the UUID");
  assert.ok(editedText.includes("edited"), "edited text mentions the edit");
}

// ---------------------------------------------------------------------------
// formatRejectedResultText — No vs Refine
// ---------------------------------------------------------------------------

{
  const noNoComment = formatRejectedResultText("no", undefined);
  assert.ok(noNoComment.includes("rejected"), "no-without-comment says rejected");
  assert.ok(!noNoComment.includes("comment"), "no-without-comment has no comment prose");

  const noWithComment = formatRejectedResultText("no", "  already filed  ");
  assert.ok(
    noWithComment.includes("already filed"),
    "no-with-comment trims and includes the comment",
  );
  assert.ok(noWithComment.includes("rejected"), "no-with-comment still says rejected");

  const refineNoComment = formatRejectedResultText("refine", undefined);
  assert.ok(
    refineNoComment.includes("refine"),
    "refine-without-comment tells the agent to refine",
  );
  assert.ok(
    refineNoComment.includes("aura_feedback"),
    "refine-without-comment points at aura_feedback",
  );

  const refineWithComment = formatRejectedResultText("refine", "be more specific");
  assert.ok(
    refineWithComment.includes("be more specific"),
    "refine-with-comment includes the user's feedback",
  );
  assert.ok(
    refineWithComment.includes("aura_feedback"),
    "refine-with-comment points at aura_feedback",
  );
}

console.log("all aura-feedback tests passed");
