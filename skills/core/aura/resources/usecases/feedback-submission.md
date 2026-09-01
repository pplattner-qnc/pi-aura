# Submitting feedback about Aura

When you hit a problem with **Aura itself** — a bug, a missing feature, or workflow friction caused by Aura (not by the way *we* use Aura) — propose it as feedback to the Aura maintainers. The agent never submits feedback directly; every proposal goes through an interactive user sign-off first.

## The sanctioned tool: `aura_feedback`

The `aura_feedback` tool is the only sanctioned way to submit this kind of feedback. It is **undocumented by design**: it is available at all times but is not advertised in the system prompt, so you won't see it under "Available tools". The `aura` skill points you at it (this section).

### Parameters

The tool takes the same fields as the feedback creation API call (`POST /feedback`), **except `source`** — the tool always sends `source: "MCP"` internally so the row records its true origin:

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | 1–120 characters. Summarize the issue concisely. |
| `body` | string | yes | ≥ 50 characters. Describe the issue, what you expected, and what happened. |
| `is_anonymous` | boolean | no | When true, the row is stored without an authorId. Default false. |
| `notify_author` | boolean | no | Notify the author when a linked task is done. Forced false for anonymous entries. Default false. |

### The interactive sign-off

When you call `aura_feedback`, the user gets an interactive prompt — this is the whole reason the tool exists. The prompt shows the proposed **title** and **body** as text and two **checkboxes** (`is_anonymous`, `notify_author`) below. The user can answer with four actions:

- **Yes** — send the feedback to Aura as-is. The row is created and the tool returns the created UUID.
- **No** — do not send. The user may leave an optional comment; the tool returns a "rejected" result (with the comment if there was one).
- **Refine** — do not send. A comment is **required**; the tool returns an explicit instruction for you to refine the proposal according to the user's feedback, which should lead to another `aura_feedback` call down the line.
- **Edit** — open a second screen where the user can edit all four fields manually (title/body as text, the two flags as checkboxes), then choose **Submit** or **Cancel** at the bottom. **Submit** behaves like Yes but with the edited payload, and the result notes that the payload was edited. **Cancel** behaves like No without a comment.

The tool validates the payload against the same hard limits the API enforces (`title` 1–120, `body` ≥ 50) **before** opening the prompt, so a too-short `body` fails fast with a clear message instead of wasting the user's time.

## Do not use the raw MCP tool

The `aura-mcp-dev_createFeedback` MCP tool wraps the same `POST /feedback` endpoint, but it **submits directly with no interactive sign-off**. That is exactly the gap `aura_feedback` fills. Use `aura_feedback` for every maintainer-bound feedback proposal; leave `createFeedback` for cases where a human has already explicitly approved the exact payload out-of-band (rare).

## The local log: `~/.pi/aura/feedback.jsonl`

On every successful submission, `aura_feedback` appends one JSON line to `~/.pi/aura/feedback.jsonl`. The directory is created on first use. The file is append-only, so concurrent sessions don't clobber each other. Each line is a self-contained record:

```json
{
  "timestamp": "2025-09-01T12:34:56.789Z",
  "timestamp_local": "9/1/2025, 14:34:56",
  "uuid": "11111111-2222-3333-4444-555555555555",
  "payload": {
    "title": "...",
    "body": "...",
    "is_anonymous": false,
    "notify_author": false,
    "source": "MCP"
  },
  "created": { "id": "...", "status": "NEW", ... }
}
```

- `timestamp` is an ISO string (UTC); `timestamp_local` is the same instant in the user's local time zone, for quick human reads.
- `uuid` is the created feedback row's id — the same value the tool returns.
- `payload` is exactly what was sent to Aura (always with `source: "MCP"`).
- `created` is the full created row the API returned (`FeedbackDetail`).

### Reading the log with `jq`

```bash
# Every submission, newest last (append-only, so tail is newest):
tail -n 20 ~/.pi/aura/feedback.jsonl | jq .

# Just the UUID + title + local timestamp of the last 10:
tail -n 10 ~/.pi/aura/feedback.jsonl | jq -c '{uuid, title: .payload.title, when: .timestamp_local}'

# Find a specific submission by UUID (e.g. to recall what was sent):
jq -c 'select(.uuid == "11111111-2222-3333-4444-555555555555")' ~/.pi/aura/feedback.jsonl

# Count submissions, grouped by status of the created row:
jq -r '.created.status' ~/.pi/aura/feedback.jsonl | sort | uniq -c

# All anonymous submissions:
jq -c 'select(.payload.is_anonymous == true)' ~/.pi/aura/feedback.jsonl
```

### Plain bash (no jq)

```bash
# Confirm the log exists and is non-empty:
test -s ~/.pi/aura/feedback.jsonl && echo "has entries" || echo "no entries yet"

# Last line raw:
tail -n 1 ~/.pi/aura/feedback.jsonl

# Pull the UUID out of the last line with grep (jq is easier; this is a fallback):
tail -n 1 ~/.pi/aura/feedback.jsonl | grep -oE '"uuid":"[^"]+"' | head -1
```

## What this tool is not for

`aura_feedback` is for feedback **about Aura** — the product, its features, or its workflow friction. It is not a general-purpose channel for:

- Feedback about *this repo's* skills, rules, or setup (use those owners).
- Questions directed at you (use `mcpAnswerQuestion` / the questions workflow).
- Filing a task for work you want done (use the task management use case).
- Triaging an inbound planning signal (use the signals use case).

If you're unsure whether something is "Aura itself" vs. "how we use Aura", default to proposing it via `aura_feedback` and let the user decide with **No**/**Refine** — the sign-off is the safety net.
