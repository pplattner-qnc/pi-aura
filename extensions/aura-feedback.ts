/**
 * Aura Feedback Extension
 *
 * Registers an unadvertised `aura_feedback` tool the LLM can call to *propose*
 * a feedback submission to the Aura maintainers. Unlike the raw
 * `aura-mcp-dev_createFeedback` MCP tool — which submits directly with no
 * human sign-off — this tool always shows an interactive prompt first so the
 * user reviews what the agent wants to send and decides how to proceed.
 *
 * Tool parameters mirror the `POST /feedback` body (`FeedbackCreate` in
 * `openapi.yaml`) **minus** `source`: the extension always sends
 * `source: "MCP"` so the row records its true origin. The `is_anonymous` and
 * `notify_author` fields are exposed as checkboxes in the prompt.
 *
 * Interactive flow (TUI only; non-interactive modes get a clear error result):
 *
 *   1. Confirm screen — shows the proposed `title` + `body` as text and two
 *      checkboxes (`is_anonymous`, `notify_author`) below. Four actions:
 *        - Yes     → submit as-is, append to the local log, return the UUID.
 *        - No      → do not send; user may add an optional comment; the LLM
 *                    gets a "rejected" result (with the comment if any).
 *        - Refine  → like No, but the comment is required and the LLM is told
 *                    to refine the proposal per the user's feedback (which
 *                    should lead to another `aura_feedback` call).
 *        - Edit    → open the edit screen.
 *
 *   2. Edit screen — all four fields editable (title/body text inputs, the two
 *      flags as checkboxes), Submit + Cancel at the bottom.
 *        - Submit  → same as Yes, but with the edited payload, and the result
 *                    names the edited fields so the LLM knows what changed.
 *        - Cancel  → same as No without a comment.
 *
 * On a successful submit the extension:
 *   - POSTs to `/feedback` via the shared AuraClient (baseUrl + PAT from
 *     settings.json + keyring, the same path every other Aura call uses);
 *   - appends one JSON line to `~/.pi/aura/feedback.jsonl` containing the sent
 *     payload, the created row (full `FeedbackDetail`), a local-timestamp
 *     string, and the created UUID; and
 *   - returns a tool result naming the UUID and that it was created.
 *
 * The tool is deliberately not advertised in the system prompt (no
 * `promptSnippet` / `promptGuidelines`): it stays available at all times but
 * is surfaced to the agent only through the `aura` skill's feedback section.
 * See `skills/core/aura/SKILL.md` → "Submitting feedback about Aura" and
 * `skills/core/aura/resources/usecases/feedback-submission.md`.
 *
 * One concern per extension — this file owns the feedback-proposal tool and
 * its interactive sign-off; it does not touch the `@AURA-<number>` overlay
 * (`aura-tasks.ts`), the skill reminder (`aura-skill-instruction.ts`), or the
 * engineering-rules dispatch.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  Editor,
  type EditorTheme,
  Key,
  matchesKey,
  Text,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type {
  CreateFeedbackInput,
  FeedbackDetail,
} from "@pi-aura/shared/aura-client";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Local JSONL log of every feedback row this extension successfully created.
 *  One JSON object per line (see {@link buildLogEntry}). Appended to, never
 *  rewritten, so concurrent sessions don't clobber each other. */
const FEEDBACK_LOG_PATH = join(homedir(), ".pi", "aura", "feedback.jsonl");

/** The tool always sends `source: "MCP"` regardless of the caller — the row
 *  records its true origin. This constant is the single source of truth for
 *  that decision so the parameter schema, the confirm screen, and the API
 *  call can't drift apart. */
const FEEDBACK_SOURCE: "MCP" = "MCP";

/** The four actions on the confirm screen. The order is fixed so the
 *  arrow-key index maps 1:1 to the rendered list. */
const CONFIRM_ACTIONS = ["Yes", "No", "Refine", "Edit"] as const;
type ConfirmAction = (typeof CONFIRM_ACTIONS)[number];

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/** The payload the extension sends to `POST /feedback`, derived from the
 *  (possibly user-edited) tool parameters. `source` is forced to `"MCP"`. */
export function buildSendPayload(
  input: CreateFeedbackInput,
): CreateFeedbackInput {
  return {
    title: input.title,
    body: input.body,
    is_anonymous: input.is_anonymous,
    notify_author: input.notify_author,
    source: FEEDBACK_SOURCE,
  };
}

/** Validate the payload the agent proposed against the same hard limits the
 *  API enforces (`title` 1–120, `body` ≥ 50). Returns `null` when valid, or
 *  the first failing constraint as a human-readable string. Exported so the
 *  tool can fail fast before opening the interactive prompt. */
export function validatePayload(input: {
  title?: unknown;
  body?: unknown;
}): string | null {
  const title = typeof input.title === "string" ? input.title : "";
  const body = typeof input.body === "string" ? input.body : "";
  if (title.length < 1) return "title is required (1–120 characters)";
  if (title.length > 120) return `title is ${title.length} characters; max is 120`;
  if (body.length < 50) return `body is ${body.length} characters; minimum is 50`;
  return null;
}

/** Build the JSON object appended to `~/.pi/aura/feedback.jsonl` for a
 *  successful submission. The timestamp is a local-time ISO string so the log
 *  is greppable without UTC arithmetic; the full created row is included so
 *  the log is self-contained for later triage. */
export function buildLogEntry(
  payload: CreateFeedbackInput,
  created: FeedbackDetail,
  now: Date = new Date(),
): Record<string, unknown> {
  return {
    timestamp: now.toISOString(),
    timestamp_local: now.toLocaleString(),
    uuid: created.id,
    payload: {
      title: payload.title,
      body: payload.body,
      is_anonymous: payload.is_anonymous ?? false,
      notify_author: payload.notify_author ?? false,
      source: FEEDBACK_SOURCE,
    },
    created,
  };
}

/** Serialize a log entry as one compact JSON line. Exported so the exact
 *  wire format is pinned independently of the filesystem seam. */
export function serializeLogEntry(entry: Record<string, unknown>): string {
  return JSON.stringify(entry);
}

/** The tool-result text returned to the LLM on a successful submission.
 *  Names the UUID and that the row was created, and notes the local log path
 *  so the agent can point the user at it. */
export function formatCreatedResultText(created: FeedbackDetail): string {
  return [
    `Feedback created in Aura (UUID ${created.id}, status ${created.status}).`,
    `Logged to ${FEEDBACK_LOG_PATH}.`,
  ].join("\n");
}

/** The tool-result text returned to the LLM when the user rejected the
 *  proposal (No / Refine / Edit-Cancel). `refine` flips the tone to an
 *  explicit instruction to refine the proposal per the user's comment. */
export function formatRejectedResultText(
  action: "no" | "refine",
  comment: string | undefined,
): string {
  const trimmed = comment?.trim() || undefined;
  if (action === "refine") {
    return trimmed
      ? `The user rejected this feedback proposal and asked you to refine it. Refine the proposal according to the user's feedback and propose it again with aura_feedback. User's feedback: ${trimmed}`
      : "The user rejected this feedback proposal and asked you to refine it. Ask the user what to change, then propose again with aura_feedback.";
  }
  return trimmed
    ? `The user rejected this feedback proposal and did not want it sent to Aura. User's comment: ${trimmed}`
    : "The user rejected this feedback proposal and did not want it sent to Aura.";
}

/** The tool-result text returned to the LLM when the user edited the
 *  payload and then submitted. Same as the created text, plus a note that
 *  the payload was edited, so the agent doesn't assume its original
 *  proposal was sent verbatim. */
export function formatEditedResultText(created: FeedbackDetail): string {
  return [
    `Feedback created in Aura (UUID ${created.id}, status ${created.status}) — the user edited the payload before submitting.`,
    `Logged to ${FEEDBACK_LOG_PATH}.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Tool parameter schema
// ---------------------------------------------------------------------------

/** Parameters mirror `FeedbackCreate` minus `source`. The `description`
 *  strings double as the tool's contract for the LLM (the tool has no
 *  `promptSnippet`, so the LLM only sees these when it reads the `aura`
 *  skill's feedback section). */
const AuraFeedbackParams = Type.Object({
  title: Type.String({
    description:
      "Short title of the feedback, 1–120 characters. Summarize the issue concisely.",
  }),
  body: Type.String({
    description:
      "The feedback text itself. At least 50 characters so the report is usable by the Aura maintainers. Describe the issue, what you expected, and what happened.",
  }),
  is_anonymous: Type.Optional(
    Type.Boolean({
      description:
        "When true, the row is stored without an authorId even though the actor is known. Default false.",
    }),
  ),
  notify_author: Type.Optional(
    Type.Boolean({
      description:
        "Whether to notify the author when a linked task is done. Forced false for anonymous entries. Default false.",
    }),
  ),
});

interface AuraFeedbackInput {
  title: string;
  body: string;
  is_anonymous?: boolean;
  notify_author?: boolean;
}

/** Shape stored in the tool result `details` for branching/session restore. */
interface AuraFeedbackDetails {
  outcome: "created" | "rejected" | "refined";
  /** The payload actually sent (after any user edits). Present on `created`. */
  sentPayload?: CreateFeedbackInput;
  /** The created row. Present on `created`. */
  created?: FeedbackDetail;
  /** The user's comment. Present on `rejected`/`refined` when given. */
  comment?: string;
  /** Whether the user edited the payload before submitting. */
  edited?: boolean;
}

// ---------------------------------------------------------------------------
// Extension factory
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI): void {
  pi.registerTool({
    name: "aura_feedback",
    label: "Aura Feedback",
    description:
      "Propose a feedback submission to the Aura maintainers (bugs, missing features, or workflow friction caused by Aura itself — not by how it is used). " +
      "Shows the user an interactive prompt to sign off on the title, body, anonymous, and notify-me fields before anything is sent to Aura. " +
      "Do not use the aura-mcp-dev_createFeedback MCP tool for this — it submits directly with no human sign-off.",
    // Deliberately no promptSnippet/promptGuidelines: the tool is available at
    // all times but not advertised in the system prompt. The `aura` skill's
    // feedback section is the only thing that tells the agent this exists.
    parameters: AuraFeedbackParams,
    // Sequential so the interactive prompt doesn't race sibling tool calls.
    executionMode: "sequential",

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const input = params as AuraFeedbackInput;

      // Fail fast on validation before opening the prompt — saves the user a
      // round-trip and keeps the API's hard limits as a local guard.
      const validationError = validatePayload(input);
      if (validationError) {
        return {
          content: [
            { type: "text", text: `Invalid feedback proposal: ${validationError}` },
          ],
          details: { outcome: "rejected" } as AuraFeedbackDetails,
        };
      }

      // Non-interactive modes can't show the sign-off prompt. Refuse rather
      // than silently submitting something the user never saw.
      if (ctx.mode !== "tui") {
        return {
          content: [
            {
              type: "text",
              text: "aura_feedback requires interactive (TUI) mode so the user can sign off on the submission. It was called in a non-interactive context; nothing was sent.",
            },
          ],
          details: { outcome: "rejected" } as AuraFeedbackDetails,
        };
      }

      // The working payload — the confirm screen reads from this, the edit
      // screen mutates it. Starts as the agent's proposal.
      const payload: AuraFeedbackInput = {
        title: input.title,
        body: input.body,
        is_anonymous: input.is_anonymous ?? false,
        notify_author: input.notify_author ?? false,
      };

      // Run the two-screen flow. Returns the user's decision; on a submit it
      // also carries the (possibly edited) payload.
      const decision = await runFeedbackPrompt(ctx, payload);
      if (!decision) {
        // Escaped at the top level — treat as a No without a comment.
        return {
          content: [
            { type: "text", text: formatRejectedResultText("no", undefined) },
          ],
          details: { outcome: "rejected" } as AuraFeedbackDetails,
        };
      }

      if (decision.action === "no" || decision.action === "refine") {
        const comment = decision.comment;
        return {
          content: [
            {
              type: "text",
              text:
                decision.action === "refine"
                  ? formatRejectedResultText("refine", comment)
                  : formatRejectedResultText("no", comment),
            },
          ],
          details: {
            outcome: decision.action === "refine" ? "refined" : "rejected",
            comment,
          } as AuraFeedbackDetails,
        };
      }

      // decision.action === "submit" — send to Aura.
      const sendPayload = buildSendPayload(decision.payload);
      try {
        const created = await createFeedbackInAura(sendPayload);

        // Append to the local JSONL log (best-effort: a log failure must not
        // turn a successful submission into an error result for the LLM).
        try {
          await appendFeedbackLog(sendPayload, created);
        } catch (logErr) {
          // Surface in the result text but do not fail the tool — the row
          // exists in Aura either way.
          const logNote = ` (WARNING: failed to log locally: ${
            logErr instanceof Error ? logErr.message : String(logErr)
          })`;
          return {
            content: [
              {
                type: "text",
                text:
                  (decision.edited
                    ? formatEditedResultText(created)
                    : formatCreatedResultText(created)) + logNote,
              },
            ],
            details: {
              outcome: "created",
              sentPayload: sendPayload,
              created,
              edited: decision.edited,
            } as AuraFeedbackDetails,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: decision.edited
                ? formatEditedResultText(created)
                : formatCreatedResultText(created),
            },
          ],
          details: {
            outcome: "created",
            sentPayload: sendPayload,
            created,
            edited: decision.edited,
          } as AuraFeedbackDetails,
        };
      } catch (err) {
        // The API call failed — report it to the LLM as an error so it can
        // surface the failure to the user. Do not throw (throwing marks the
        // whole tool execution as failed, which is fine, but we want the
        // message to be specific about what went wrong).
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `Failed to submit feedback to Aura: ${msg}. The user had already approved the submission; nothing was logged locally.`,
            },
          ],
          details: {
            outcome: "rejected",
            sentPayload: sendPayload,
            edited: decision.edited,
          } as AuraFeedbackDetails,
        };
      }
    },

    renderCall(args, theme, _context) {
      const a = args as AuraFeedbackInput;
      let text = theme.fg("toolTitle", theme.bold("aura_feedback "));
      const title = a?.title ?? "";
      text += theme.fg("muted", title.length > 60 ? title.slice(0, 57) + "…" : title);
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme, _context) {
      const details = result.details as AuraFeedbackDetails | undefined;
      const fallback = result.content[0];
      if (!details) {
        return new Text(fallback?.type === "text" ? fallback.text : "", 0, 0);
      }
      if (details.outcome === "created") {
        const uuid = details.created?.id ?? "?";
        return new Text(
          theme.fg("success", "✓ Created ") +
            theme.fg("accent", uuid) +
            (details.edited ? theme.fg("dim", " (edited)") : ""),
          0,
          0,
        );
      }
      if (details.outcome === "refined") {
        return new Text(theme.fg("warning", "↻ Refine requested"), 0, 0);
      }
      return new Text(theme.fg("warning", "✗ Rejected"), 0, 0);
    },
  });
}

// ---------------------------------------------------------------------------
// Interactive prompt (two screens)
// ---------------------------------------------------------------------------

type Decision =
  | { action: "submit"; payload: AuraFeedbackInput; edited: boolean }
  | { action: "no"; comment?: string }
  | { action: "refine"; comment?: string };

/** Drive the confirm → (optional) edit screens. Returns `null` only when the
 *  user escapes from the confirm screen before choosing an action (treated
 *  as a No-without-comment by the caller). */
async function runFeedbackPrompt(
  ctx: ExtensionContext,
  payload: AuraFeedbackInput,
): Promise<Decision | null> {
  // Re-enter the confirm screen after a Cancel from the edit screen (so the
  // user doesn't lose their place). The loop exits on any non-cancel action.
  for (;;) {
    const confirmResult = await confirmScreen(ctx, payload);
    if (confirmResult === "Edit") {
      const editResult = await editScreen(ctx, payload);
      if (editResult === "cancel") {
        continue; // back to confirm
      }
      return { action: "submit", payload: editResult.payload, edited: editResult.edited };
    }
    if (confirmResult === "Yes") {
      return { action: "submit", payload, edited: false };
    }
    if (confirmResult === "No" || confirmResult === "Refine") {
      const comment = await commentScreen(ctx, confirmResult === "Refine" ? "refine" : "no", payload);
      return { action: confirmResult === "Refine" ? "refine" : "no", comment };
    }
    // escape
    return null;
  }
}

// ---------------------------------------------------------------------------
// Confirm screen — Yes / No / Refine / Edit
// ---------------------------------------------------------------------------

async function confirmScreen(
  ctx: ExtensionContext,
  payload: AuraFeedbackInput,
): Promise<ConfirmAction | "escape"> {
  return ctx.ui.custom<ConfirmAction | "escape">((tui, theme, _kb, done) => {
    let index = 0; // selected action index (0=Yes … 3=Edit)
    let cachedLines: string[] | undefined;

    function refresh() {
      cachedLines = undefined;
      tui.requestRender();
    }

    function handleInput(data: string) {
      if (matchesKey(data, Key.up)) {
        index = (index - 1 + CONFIRM_ACTIONS.length) % CONFIRM_ACTIONS.length;
        refresh();
        return;
      }
      if (matchesKey(data, Key.down)) {
        index = (index + 1) % CONFIRM_ACTIONS.length;
        refresh();
        return;
      }
      if (matchesKey(data, Key.enter)) {
        done(CONFIRM_ACTIONS[index]);
        return;
      }
      if (matchesKey(data, Key.escape)) {
        done("escape");
      }
    }

    function render(width: number): string[] {
      if (cachedLines) return cachedLines;
      const lines: string[] = [];
      const renderWidth = Math.max(1, width);

      function addWrapped(text: string) {
        lines.push(...wrapTextWithAnsi(text, renderWidth));
      }
      function addWrappedWithPrefix(prefix: string, text: string) {
        const prefixWidth = visibleWidth(prefix);
        if (prefixWidth >= renderWidth) {
          addWrapped(prefix + text);
          return;
        }
        const wrapped = wrapTextWithAnsi(text, renderWidth - prefixWidth);
        const cont = " ".repeat(prefixWidth);
        for (let i = 0; i < wrapped.length; i++) {
          lines.push(`${i === 0 ? prefix : cont}${wrapped[i]}`);
        }
      }

      lines.push(theme.fg("accent", "─".repeat(renderWidth)));
      addWrappedWithPrefix(" ", theme.fg("text", theme.bold("Proposed Aura feedback")));
      lines.push("");
      addWrappedWithPrefix(" ", theme.fg("muted", "Title:"));
      addWrappedWithPrefix("   ", theme.fg("text", payload.title));
      lines.push("");
      addWrappedWithPrefix(" ", theme.fg("muted", "Body:"));
      for (const line of payload.body.split("\n")) {
        addWrappedWithPrefix("   ", theme.fg("text", line));
      }
      lines.push("");
      addWrappedWithPrefix(" ", theme.fg("muted", "Options:"));
      addWrappedWithPrefix(
        "   ",
        theme.fg(
          payload.is_anonymous ? "accent" : "dim",
          `[${payload.is_anonymous ? "x" : " "}] anonymous`,
        ) +
          "  " +
          theme.fg(
            payload.notify_author ? "accent" : "dim",
            `[${payload.notify_author ? "x" : " "}] notify me when linked task is done`,
          ),
      );
      lines.push("");
      addWrappedWithPrefix(" ", theme.fg("muted", "Choose an action:"));
      for (let i = 0; i < CONFIRM_ACTIONS.length; i++) {
        const selected = i === index;
        const prefix = selected ? theme.fg("accent", "> ") : "  ";
        const desc = CONFIRM_ACTION_DESCRIPTIONS[CONFIRM_ACTIONS[i]];
        addWrappedWithPrefix(prefix, theme.fg(selected ? "accent" : "text", `${CONFIRM_ACTIONS[i]}`));
        addWrappedWithPrefix("     ", theme.fg("dim", desc));
      }
      lines.push("");
      addWrappedWithPrefix(
        " ",
        theme.fg("dim", "↑↓ navigate • Enter select • Esc cancel"),
      );
      lines.push(theme.fg("accent", "─".repeat(renderWidth)));

      cachedLines = lines;
      return lines;
    }

    return { render, invalidate: () => { cachedLines = undefined; }, handleInput };
  });
}

const CONFIRM_ACTION_DESCRIPTIONS: Record<ConfirmAction, string> = {
  Yes: "Send the feedback to Aura as shown.",
  No: "Don't send. You can leave a comment for the agent.",
  Refine: "Don't send. A comment is required so the agent can refine the proposal.",
  Edit: "Open the fields for editing before deciding.",
};

// ---------------------------------------------------------------------------
// Edit screen — title / body / anonymous / notify + Submit / Cancel
// ---------------------------------------------------------------------------

/** The editable field that currently has focus. */
type EditField = "title" | "body" | "anonymous" | "notify";

interface EditResult {
  payload: AuraFeedbackInput;
  edited: boolean;
}

async function editScreen(
  ctx: ExtensionContext,
  initial: AuraFeedbackInput,
): Promise<EditResult | "cancel"> {
  return ctx.ui.custom<EditResult | "cancel">((tui, theme, _kb, done) => {
    // Working copy.
    const work: AuraFeedbackInput = {
      title: initial.title,
      body: initial.body,
      is_anonymous: initial.is_anonymous ?? false,
      notify_author: initial.notify_author ?? false,
    };
    let field: EditField = "title";
    let actionFocus: "submit" | "cancel" | null = null; // null = a field is focused
    let cachedLines: string[] | undefined;

    const editorTheme: EditorTheme = {
      borderColor: (s) => theme.fg("accent", s),
      selectList: {
        selectedPrefix: (t) => theme.fg("accent", t),
        selectedText: (t) => theme.fg("accent", t),
        description: (t) => theme.fg("muted", t),
        scrollInfo: (t) => theme.fg("dim", t),
        noMatch: (t) => theme.fg("warning", t),
      },
    };

    // Two editors: title (single-line) and body (multi-line). Each holds its
    // own text so tabbing between fields preserves what was typed.
    const titleEditor = new Editor(tui, editorTheme);
    titleEditor.setText(work.title);
    const bodyEditor = new Editor(tui, editorTheme);
    bodyEditor.setText(work.body);

    function activeEditor(): Editor {
      return field === "title" ? titleEditor : bodyEditor;
    }

    function refresh() {
      cachedLines = undefined;
      tui.requestRender();
    }

    function edited(): boolean {
      return (
        titleEditor.getText() !== initial.title ||
        bodyEditor.getText() !== initial.body ||
        (work.is_anonymous ?? false) !== (initial.is_anonymous ?? false) ||
        (work.notify_author ?? false) !== (initial.notify_author ?? false)
      );
    }

    function commit() {
      work.title = titleEditor.getText();
      work.body = bodyEditor.getText();
    }

    function submit() {
      commit();
      done({ payload: work, edited: edited() });
    }

    titleEditor.onSubmit = () => {
      // Enter in the title field moves to the body rather than submitting —
      // a single-line field shouldn't end the whole form.
      commit();
      field = "body";
      refresh();
    };
    bodyEditor.onSubmit = () => {
      // Enter in the body field moves focus to the Submit action.
      commit();
      field = "body";
      actionFocus = "submit";
      refresh();
    };

    function handleInput(data: string) {
      // Global cancel.
      if (matchesKey(data, Key.escape)) {
        if (actionFocus !== null) {
          actionFocus = null;
          field = "body";
          refresh();
          return;
        }
        done("cancel");
        return;
      }

      // Action buttons focused: only Enter / Tab / arrows matter.
      if (actionFocus !== null) {
        if (matchesKey(data, Key.enter)) {
          if (actionFocus === "submit") submit();
          else done("cancel");
          return;
        }
        if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
          actionFocus = actionFocus === "submit" ? "cancel" : "submit";
          refresh();
          return;
        }
        if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
          actionFocus = actionFocus === "submit" ? "cancel" : "submit";
          refresh();
          return;
        }
        if (matchesKey(data, Key.up)) {
          actionFocus = null;
          field = "body";
          refresh();
          return;
        }
        if (matchesKey(data, Key.down)) {
          actionFocus = null;
          field = "title";
          refresh();
          return;
        }
        return; // ignore other keys while a button is focused
      }

      // A field is focused.
      // Tab / Shift-Tab cycles through the four fields and then Submit.
      if (matchesKey(data, Key.tab) || matchesKey(data, Key.down)) {
        commit();
        const order: EditField[] = ["title", "body", "anonymous", "notify"];
        const i = order.indexOf(field);
        if (i < order.length - 1) {
          field = order[i + 1];
        } else {
          actionFocus = "submit";
        }
        refresh();
        return;
      }
      if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.up)) {
        commit();
        const order: EditField[] = ["title", "body", "anonymous", "notify"];
        const i = order.indexOf(field);
        if (i > 0) {
          field = order[i - 1];
        } else {
          // wrap to the cancel button (above the title)
          actionFocus = "cancel";
        }
        refresh();
        return;
      }

      // Toggle checkboxes.
      if (field === "anonymous" || field === "notify") {
        if (matchesKey(data, Key.enter) || matchesKey(data, Key.space)) {
          if (field === "anonymous") work.is_anonymous = !work.is_anonymous;
          else work.notify_author = !work.notify_author;
          // If the user enables anonymous, notify is forced off by the API;
          // mirror that locally so the checkbox stays honest.
          if (field === "anonymous" && work.is_anonymous) work.notify_author = false;
          refresh();
          return;
        }
        return; // no text input for checkbox fields
      }

      // Text field — route to the editor.
      activeEditor().handleInput(data);
      refresh();
    }

    function render(width: number): string[] {
      if (cachedLines) return cachedLines;
      const lines: string[] = [];
      const renderWidth = Math.max(1, width);

      function addWrapped(text: string) {
        lines.push(...wrapTextWithAnsi(text, renderWidth));
      }
      function addWrappedWithPrefix(prefix: string, text: string) {
        const prefixWidth = visibleWidth(prefix);
        if (prefixWidth >= renderWidth) {
          addWrapped(prefix + text);
          return;
        }
        const wrapped = wrapTextWithAnsi(text, renderWidth - prefixWidth);
        const cont = " ".repeat(prefixWidth);
        for (let i = 0; i < wrapped.length; i++) {
          lines.push(`${i === 0 ? prefix : cont}${wrapped[i]}`);
        }
      }

      const focused = (f: EditField) => actionFocus === null && field === f;

      lines.push(theme.fg("accent", "─".repeat(renderWidth)));
      addWrappedWithPrefix(" ", theme.fg("text", theme.bold("Edit feedback fields")));
      lines.push("");

      // Title
      addWrappedWithPrefix(
        focused("title") ? theme.fg("accent", "▸ Title:") : theme.fg("muted", "  Title:"),
        "",
      );
      if (focused("title")) {
        for (const line of titleEditor.render(Math.max(1, renderWidth - 2))) {
          lines.push(` ${line}`);
        }
      } else {
        addWrappedWithPrefix("   ", theme.fg("dim", work.title || "(empty)"));
      }
      lines.push("");

      // Body
      addWrappedWithPrefix(
        focused("body") ? theme.fg("accent", "▸ Body (≥ 50 chars):") : theme.fg("muted", "  Body (≥ 50 chars):"),
        "",
      );
      if (focused("body")) {
        for (const line of bodyEditor.render(Math.max(1, renderWidth - 2))) {
          lines.push(` ${line}`);
        }
      } else {
        for (const line of (work.body || "(empty)").split("\n")) {
          addWrappedWithPrefix("   ", theme.fg("dim", line));
        }
      }
      lines.push("");

      // Anonymous checkbox
      addWrappedWithPrefix(
        focused("anonymous") ? theme.fg("accent", "▸ ") : "  ",
        theme.fg(
          work.is_anonymous ? "accent" : "dim",
          `[${work.is_anonymous ? "x" : " "}] anonymous`,
        ) + theme.fg("dim", "  (enter/space to toggle)"),
      );
      lines.push("");

      // Notify checkbox
      addWrappedWithPrefix(
        focused("notify") ? theme.fg("accent", "▸ ") : "  ",
        theme.fg(
          work.notify_author ? "accent" : "dim",
          `[${work.notify_author ? "x" : " "}] notify me when linked task is done`,
        ) +
          (work.is_anonymous ? theme.fg("dim", "  (forced off while anonymous)") : ""),
      );
      lines.push("");

      // Action buttons
      const submitStyled =
        actionFocus === "submit"
          ? theme.bg("selectedBg", theme.fg("text", " [Submit] "))
          : theme.fg("success", "  [Submit] ");
      const cancelStyled =
        actionFocus === "cancel"
          ? theme.bg("selectedBg", theme.fg("text", " [Cancel] "))
          : theme.fg("warning", "  [Cancel] ");
      addWrappedWithPrefix(" ", submitStyled + "  " + cancelStyled);
      lines.push("");
      addWrappedWithPrefix(
        " ",
        theme.fg(
          "dim",
          "Tab/↑↓ move field • Enter toggle/select • Esc cancel (or back from a button)",
        ),
      );
      lines.push(theme.fg("accent", "─".repeat(renderWidth)));

      cachedLines = lines;
      return lines;
    }

    return { render, invalidate: () => { cachedLines = undefined; }, handleInput };
  });
}

// ---------------------------------------------------------------------------
// Comment screen — free text the user leaves on No / Refine
// ---------------------------------------------------------------------------

async function commentScreen(
  ctx: ExtensionContext,
  action: "no" | "refine",
  payload: AuraFeedbackInput,
): Promise<string | undefined> {
  const prompt =
    action === "refine"
      ? "Refine requested — leave a comment for the agent (required to refine the proposal):"
      : "Rejected — leave an optional comment for the agent (or submit empty):";

  return ctx.ui.custom<string | undefined>((tui, theme, _kb, done) => {
    let cachedLines: string[] | undefined;
    const editorTheme: EditorTheme = {
      borderColor: (s) => theme.fg("accent", s),
      selectList: {
        selectedPrefix: (t) => theme.fg("accent", t),
        selectedText: (t) => theme.fg("accent", t),
        description: (t) => theme.fg("muted", t),
        scrollInfo: (t) => theme.fg("dim", t),
        noMatch: (t) => theme.fg("warning", t),
      },
    };
    const editor = new Editor(tui, editorTheme);

    function refresh() {
      cachedLines = undefined;
      tui.requestRender();
    }

    editor.onSubmit = (value) => {
      const trimmed = value.trim();
      if (action === "refine" && !trimmed) {
        // Refuse an empty refine comment — keep the user in the editor so
        // they can type one. (No action; just don't call done.)
        refresh();
        return;
      }
      done(trimmed || undefined);
    };

    function handleInput(data: string) {
      if (matchesKey(data, Key.escape)) {
        // Esc from the comment screen: for `no` this is "no comment"; for
        // `refine` we still need a comment, so treat Esc as "stay" unless the
        // editor is empty (then allow exit with a prompt to the caller that
        // refinement needs input — the caller's result text already tells the
        // agent to ask the user).
        if (action === "refine") {
          // Keep the requirement: Esc does nothing here. The user must type
          // something and press Enter.
          return;
        }
        done(undefined);
        return;
      }
      editor.handleInput(data);
      refresh();
    }

    function render(width: number): string[] {
      if (cachedLines) return cachedLines;
      const lines: string[] = [];
      const renderWidth = Math.max(1, width);
      function addWrapped(text: string) {
        lines.push(...wrapTextWithAnsi(text, renderWidth));
      }
      function addWrappedWithPrefix(prefix: string, text: string) {
        const prefixWidth = visibleWidth(prefix);
        if (prefixWidth >= renderWidth) {
          addWrapped(prefix + text);
          return;
        }
        const wrapped = wrapTextWithAnsi(text, renderWidth - prefixWidth);
        const cont = " ".repeat(prefixWidth);
        for (let i = 0; i < wrapped.length; i++) {
          lines.push(`${i === 0 ? prefix : cont}${wrapped[i]}`);
        }
      }

      lines.push(theme.fg("accent", "─".repeat(renderWidth)));
      addWrappedWithPrefix(" ", theme.fg("text", prompt));
      // Show what's being rejected for context.
      addWrappedWithPrefix(" ", theme.fg("muted", `Title: ${payload.title}`));
      lines.push("");
      addWrappedWithPrefix(" ", theme.fg("muted", "Comment:"));
      for (const line of editor.render(Math.max(1, renderWidth - 2))) {
        lines.push(` ${line}`);
      }
      lines.push("");
      addWrappedWithPrefix(
        " ",
        theme.fg("dim", action === "refine" ? "Enter to submit (comment required) • Esc disabled" : "Enter to submit • Esc to skip"),
      );
      lines.push(theme.fg("accent", "─".repeat(renderWidth)));

      cachedLines = lines;
      return lines;
    }

    return { render, invalidate: () => { cachedLines = undefined; }, handleInput };
  });
}

// ---------------------------------------------------------------------------
// Aura client + local log (dynamic-import seams, mirroring aura-tasks.ts)
// ---------------------------------------------------------------------------

/** Submit the payload via the shared AuraClient. The client is built from
 *  `~/.pi/agent/settings.json` (`aura.baseUrl`) + the OS keyring PAT — the
 *  same path every other Aura call uses — so this extension never handles
 *  credentials directly. Throws on auth/network/API errors (the caller
 *  turns the message into a tool result). */
async function createFeedbackInAura(payload: CreateFeedbackInput): Promise<FeedbackDetail> {
  // Dynamic import: @pi-aura/shared/aura-client uses .js extension specifiers
  // internally, which Node's experimental strip-types loader cannot resolve.
  // Pi's extension runtime handles static imports; the dynamic seam keeps the
  // unit-test entry point free of the client dependency (same pattern as
  // aura-tasks.ts importing createDefaultAuraClient).
  const { createDefaultAuraClient } = await import("@pi-aura/shared/aura-client");
  const client = await createDefaultAuraClient();
  return client.createFeedback(payload);
}

/** Append one JSON line to `~/.pi/aura/feedback.jsonl`, creating the parent
 *  directory if needed. Never throws into the caller's success path — the
 *  tool caller wraps this in try/catch and degrades to a warning. */
async function appendFeedbackLog(
  payload: CreateFeedbackInput,
  created: FeedbackDetail,
): Promise<void> {
  const entry = buildLogEntry(payload, created);
  const line = serializeLogEntry(entry) + "\n";
  await mkdir(dirname(FEEDBACK_LOG_PATH), { recursive: true });
  await appendFile(FEEDBACK_LOG_PATH, line, "utf8");
}
