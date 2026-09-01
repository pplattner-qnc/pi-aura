---
kind: slice
slug: 2-rest-call-invoker
title: rest call — generic OpenAPI operation invoker with auth reuse
task: ../task.md
mode: afk
status: todo
size: m
blocked_by: [1-loader-list-describe]
---

## End-to-end behavior

The agent can invoke **any** REST operation by `operationId` without
hand-crafting a `fetch`. `node aura.mjs rest call <operationId> [--param
name=val …] [--body-file F]` resolves the operation in the loader's index,
fills path params from `--param`, serializes query params, sends a JSON
body (from `--body-file` or `--body`), reuses the existing
`createDefaultAuraClient()` credential path for the base URL + bearer
token, and prints the raw JSON response. A missing required param produces
a clear error naming the param and the operation; an unknown `operationId`
lists the closest matches.

This is the escape hatch the task exists to provide: capacity today,
notifications-write or owner/crew search tomorrow — every REST operation
the Aura MCP server dropped, callable with one command and one auth story.

## What this slice delivers

- A **generic invoker** in `@pi-aura/shared` (or `scripts/src/rest-call.ts`
  importing the shared loader) that takes a parsed operation + provided
  params + body and produces a `fetch` request: path-fill, query
  serialization, JSON body.
  - **Path params:** fill `{name}` from `--param name=val`. Missing a
    required path param → error naming it + the operation. Extra path
    params not in the template → error.
  - **Query params:** serialize provided query params. Handle the subset the
    Aura API uses: scalar, and `array` with `style: form` (default,
    comma-separated) — read the `style`/`explode` from the OpenAPI param
    when present; default to `form`/no-explode. Fail loudly if an
    unsupported `style` (e.g. `spaceDelimited`, `pipeDelimited`) is hit.
  - **Body:** from `--body-file <path>` (JSON) or `--body <json-string>`.
    Set `Content-Type: application/json`. If the operation declares a
    required requestBody and none is given → error. If the operation
    declares no requestBody and one is given → error (loud, no silent
    send).
- **Auth reuse:** a small shared helper (in `@pi-aura/shared`, e.g.
  `packages/shared/src/aura-credentials.ts`) that returns `{ baseUrl, pat }`
  by calling `loadAuraClientSettings()` + `createKeyring().getSecret(...)`
  — the **same primitives** `createDefaultAuraClient()` uses. The invoker
  sets `Authorization: Bearer <pat>` and fetches against `${baseUrl}${path}`.
  Do **not** call `createDefaultAuraClient()` directly — it returns the
  typed `AuraClient` (21 methods), which is useless for a 273-op invoker;
  reuse the *credential path*, not the typed client. The helper must throw
  the same actionable errors as `createDefaultAuraClient()` for missing
  baseUrl / missing PAT (refactor `createDefaultAuraClient()` to use the
  new helper, so there is exactly one credential resolution path).
- A **`rest call`** subcommand in `scripts/src/aura.ts` that wires the
  loader + credential helper + invoker, prints the raw JSON response to
  stdout (pretty-printed if small, raw otherwise — mirror the existing
  inline-result style), and exits non-zero on HTTP error (print status +
  the response body).
- Unknown `operationId` → clear error listing the closest matches (from
  the loader id list; same mechanism as slice 1's `describe`).
- The `USAGE` block gains the `rest call` line.

## Acceptance criteria

- `node aura.mjs rest call updateTaskMemberCapacity --param uuid=<id>
  --param userIdOrUuid=me --body-file capacity.json` issues an
  authenticated `PATCH` to `/tasks/<id>/members/me/capacity` with the JSON
  body and prints the response.
- A missing required path param (e.g. omitting `uuid`) → error naming
  `uuid` and `updateTaskMemberCapacity`, exit code 2; no request is sent.
- An unknown `operationId` → error listing the closest matches.
- A `--body-file` that isn't valid JSON → clear error, exit 2.
- A query array param serializes comma-separated (the Aura default); a
  param with an unsupported `style` → loud error naming the style.
- Auth: when no PAT is stored, the invoker throws the actionable
  `No Aura PAT found … /aura secrets discover` error (proves the credential
  reuse), never a raw 401.
- `task typecheck` + `tsx --test` pass for both packages; `task build`
  succeeds; the committed `aura.mjs` runs `rest call` against a mocked
  fetch.

## Test plan

### Seams (test only at these)
- The invoker's `buildRequest(op, params, body)` → `{ method, url, headers,
  body }` (pure; no network, no auth). Tested against fixture operations
  (path-fill, query serialize, body attach, missing-param errors).
- The credential helper → `{ baseUrl, pat }` (mock the settings file + a
  fake keyring; assert it reuses the same path as
  `createDefaultAuraClient`, i.e. both call `loadAuraClientSettings` +
  `createKeyring().getSecret`).
- `rest call` end-to-end → stdout + exit code, with `fetch` mocked (assert
  method, url, Authorization header, body, and the printed JSON).

### Failure modes / edge cases
- Missing required path param → error, no fetch.
- Extra `--param` not in the operation → error (loud).
- Operation with required requestBody, no body given → error.
- Operation with no requestBody, body given → error.
- Unsupported query `style` → loud error naming the style + operation.
- `--body` and `--body-file` both given → error (mutually exclusive).
- HTTP error response (e.g. 400/403) → print status + body, exit 1.
- Missing baseUrl / missing PAT → actionable error (proves credential
  reuse), not a crash.

### Scenarios
- `updateTaskMemberCapacity` PATCH with both path params + body → correct
  request shape + printed response.
- A GET with query params (e.g. a list op with `page`/`limit`) → query
  serialized, no body, no `Content-Type`.
- A POST with a body and no path params → body attached, no path fill.

## Constraints and dependencies

- **One auth story:** the credential helper is the single resolution path;
  `createDefaultAuraClient()` is refactored to call it. No second
  credential path.
- **Raw fetch, not the typed client:** the invoker does `fetch()` itself;
  it must not construct a `HeyApiAuraClient` or import the generated SDK.
- **No response validation:** print the raw JSON; do not validate against
  the OpenAPI response schema (out of scope).
- **No pagination auto-follow, no retry/backoff** (out of scope).
- **No full `$ref` resolution for request bodies:** resolve the body
  schema's *name* (e.g. `TaskMemberCapacityUpdate`) for the
  `Content-Type`/shape display in `describe` (slice 1) but the invoker
  itself does not validate the body against the schema — it sends what the
  user provides.
- Reuse the loader from slice 1 unchanged; if the index needs an extra
  field for the invoker (e.g. query `style`/`explode`), add it to the loader
  in this slice and update slice 1's tests if needed.
- Do NOT implement `rest search`, code-side tags, the FTS index, or the
  embedding leg here.
