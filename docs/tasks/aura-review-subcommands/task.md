---
kind: task
slug: aura-review-subcommands
title: Re-implement the 6 `aura.mjs artifact review-*` subcommands on main's AuraClient
type: feature
status: done
blocked_by:
- openapi-spec-bump
map: aura-mcp-doc-salvage
slices:
- add-review-verbs-to-aura-client
- wire-aura-mjs-review-subcommands
- verify-and-build
---

## Outcome

`scripts/src/aura.ts` exposes the 6 `artifact review-*` subcommands the
salvaged docs reference (see `docs/tasks/maps/aura-mcp-doc-salvage/dangling-review-cli-refs.md`),
implemented on main's `AuraClient` (not the dropped `restClient`). The doc
references become truthful.

## Scope

- Add review/approval **verbs** to the `AuraClient` interface in
  `packages/shared/src/aura-client.ts` (the interface currently has the types
  `ArtifactReview`, `ArtifactApprovals`, `ReviewerStatus`, `OpenReview`,
  `ApprovalDecision` but a `// reviews / approvals` section with no verbs).
  Verbs needed (mapped to REST):
  - `getArtifactReview(id): Promise<ArtifactReview>` → `GET /artifacts/{id}/review`
  - `getArtifactApprovals(id): Promise<ArtifactApprovals>` → `GET /artifacts/{id}/approvals`
  - `requestArtifactReview(id): Promise<void>` → `POST /artifacts/{id}/review-request`
  - `startArtifactReview(input): Promise<...>` → `POST /artifacts/{id}/review-start` (version, roles[], user_ids[], deadline?)
  - `submitArtifactDecision(id, version, decision): Promise<...>` → `POST /artifacts/{id}/decisions`
  - `reopenArtifactReview(id): Promise<void>` → `POST /artifacts/{id}/review-reopen`
- Implement them in `HeyApiAuraClient` (`packages/shared/src/hey-api-aura-client.ts`)
  via the generated SDK methods (now codegen-current after `openapi-spec-bump`).
- Wire the 6 `aura.mjs artifact review-*` subcommands in `scripts/src/aura.ts`:
  - `review-get <id>`, `review-approvals <id>`, `review-request <id>`,
    `review-start <id> --version V --roles R[,R] --user-ids U[,U] [--deadline D]`,
    `review-decide <id> --version V --decision APPROVED|REJECTED`,
    `review-reopen <id>`. Each calls the `AuraClient` verb and prints a
    compact summary; update USAGE.
- Keep the existing artifact/wiki/upload subcommands untouched.

## Out of scope

- Re-implementing the dropped `restClient` (use `AuraClient`).
- The fetcher migration or `markAllNotificationsRead` (already on main).
- Doc changes (the docs already reference these subcommands; this task makes
  them real — no doc edits needed unless a subcommand's flags diverge from the
  doc, in which case fix the doc to match).

## Acceptance criteria

- All 6 subcommands work via `AuraClient` (created via
  `createDefaultAuraClient()` like the other `aura.ts` subcommands).
- `aura.mjs artifact review-get <id>` prints compact review state; the others
  print confirmations / decisions; errors to stderr + exit 1 (mirror existing
  `fail()`).
- `AuraClient` interface has the 6 review verbs; `HeyApiAuraClient`
  implements them via the generated SDK.
- `cd packages/shared && npm test` green (add tests for the new verbs);
  `cd scripts && npm run typecheck && npm run build` green; `dist/aura.mjs`
  rebuilt + committed and contains the review-* dispatch.
- The doc references in `artifact-management.md` + `review-modes.md` now point
  at real subcommands (grep the bundle for `review-get` etc.).

## Dependencies

- **openapi-spec-bump** — the codegen types must be current before wiring the
  verbs (the review operationIds must exist in the generated SDK).

## Slice list

- slice: add-review-verbs-to-aura-client (interface + HeyApiAuraClient impl +
  tests)
- slice: wire-aura-mjs-review-subcommands (the 6 subcommands in aura.ts +
  USAGE)
- slice: verify-and-build (gate + build + commit dist)

## Test plan

- `packages/shared` `tsx --test`: mock the generated SDK, assert each verb
  calls the right path/method/params.
- `scripts`: typecheck + build; grep the built `dist/aura.mjs` for the
  review-* dispatch.
- Manual smoke test (user, needs live PAT): `node skills/aura/dist/aura.mjs
  artifact review-get <real-id>` prints review state.

## Implementation notes

### slice: add-review-verbs-to-aura-client (landed)

- Added 4 new review/approval verbs to the `AuraClient` interface and
  `HeyApiAuraClient` implementation (`requestArtifactReview`,
  `startArtifactReview`, `submitArtifactDecision`, `reopenArtifactReview`).
  `getArtifactReview` and `getArtifactApprovals` were already implemented on
  main from the `openapi-spec-bump` slice; only 4 verbs were new. Tests cover
  all 6 for completeness.
- New expressive domain input types added to `aura-client.ts`:
  `ReviewerRole`, `StartArtifactReviewInput`,
  `SubmitArtifactDecisionInput` — no generated types leak into the public
  interface (generated types are aliased `G*` and used only at cast
  boundaries inside `hey-api-aura-client.ts`).
- `hey-api-aura-client.ts` extracts `sdkErrorMessage` + `unwrapVoid` helpers
  to handle the 204/void endpoints without duplicating the error-check logic.
- Unit tests in `packages/shared/test/review-verbs.test.ts` (+529, new) mock
  the generated SDK via `mock.method` on the injected `@hey-api/client-fetch`
  Client instance (intercepts `.get`/`.post`). 23 tests pass.

**Divergence — `reopenArtifactReview` signature:** the slice doc's verb↔REST
  table listed `reopenArtifactReview(id): Promise<void>` (only `id`). The
  generated SDK method `reopenArtifactReview` requires
  `body: ArtifactReviewVersionRequest` (`{ version: number }`), and
  `openapi.yaml` confirms `POST /artifacts/{id}/review-reopen` has a
  **required** requestBody of type `ArtifactReviewVersionRequest` with
  `version` required (the server needs the version to know which review run
  to reopen). The interface was widened to
  `reopenArtifactReview(id: string, version: number): Promise<void>` to
  match the actual REST contract. **Slice 2 (wire the `aura.mjs` subcommand)
  must add a `--version` flag to `review-reopen` and pass it through**, and the
  salvaged doc example `artifact review-reopen <artifact-uuid>` should be
  updated to `artifact review-reopen <artifact-uuid> --version <version>`.

**Residual risk:** `unwrapVoid` treats `res.error === undefined` as success
  and does not inspect `res.data`; correct for 201-with-body/204 endpoints, but
  would silently swallow a 4xx/5xx whose error shape `@hey-api/client-fetch`
  does not populate into `res.error`. Low risk (the SDK populates `error` on
  non-2xx), but noted.

### slice: wire-aura-mjs-review-subcommands (landed)

- Wired all 6 `artifact review-*` subcommands into `scripts/src/aura.ts`
  under the existing `artifact` group, each calling its `AuraClient` verb via
  the client constructed once at the top of `main()` (`createDefaultAuraClient()`,
  line ~406) and passed to each handler — exactly the existing pattern used by
  `artifact get`/`wiki`.
- New helpers: `parseCsv` (comma→trimmed array) for `--roles`/`--user-ids`,
  plus dedicated async functions `reviewGet`/`reviewApprovals`/`reviewRequest`/
  `reviewStart`/`reviewDecide`/`reviewReopen` for the summaries.
- Arg parsing matches the slice spec: `--version` validated with
  `Number.isFinite`; `--roles`/`--user-ids` via `parseCsv`; `--deadline`
  optional string; `--decision` validated APPROVED|REJECTED case-insensitively
  (`.toUpperCase()`). Missing required flags / `<id>` → `fail(..., true)` →
  exit 2 (usage). Verb errors propagate to the top-level catch → exit 1.
- `USAGE` lists all 6 subcommands (lines 48–53).
- Diff purely additive: `git diff HEAD~1 HEAD` on `scripts/src/aura.ts` shows
  0 deleted lines (527 insertions across the 3 files: `aura.ts` + the two
  rebuilt `dist/*.mjs` bundles).
- `cd scripts && npm run typecheck && npm run build` green; the built
  `skills/aura/dist/aura.mjs` bundle contains all 6 `case "review-*"` branches
  (grep verified). `packages/shared` `npm test` still green (23/23).

**Divergence — `review-reopen` requires `--version`:** as documented in slice
  1's notes (the REST contract requires `version` in the reopen request body),
  the `review-reopen` subcommand requires `--version V`; the USAGE string
  reflects `artifact review-reopen <id> --version V`. The salvaged doc example
  `artifact review-reopen <artifact-uuid>` should be updated to
  `artifact review-reopen <artifact-uuid> --version <version>` — deferred to
  the dependent task per the slice's doc-edit constraints.

### slice: verify-and-build (landed)

Full gate verified on `slice/verify-and-build`:

- `cd packages/shared && npm test` — green (23/23 tests pass: 3 HeyApiAuraClient
  structural, 2 createDefaultAuraClient, 18 review-verb tests).
- `cd scripts && npm run typecheck` — green (`tsc --noEmit`, no errors).
- `cd scripts && npm run build` — green (esbuild bundles
  `skills/aura-digest/dist/aura-digest.mjs` + `skills/aura/dist/aura.mjs`).

**Bundle grep verification:** the built `skills/aura/dist/aura.mjs` contains
  all 6 review-* dispatch branches:
  `review-get`, `review-approvals`, `review-request`, `review-start`,
  `review-decide`, `review-reopen` (grep confirmed, 6/6).

**6 subcommands added** (in `scripts/src/aura.ts`):

| Subcommand | AuraClient verb |
|---|---|
| `artifact review-get <id>` | `getArtifactReview(id)` |
| `artifact review-approvals <id>` | `getArtifactApprovals(id)` |
| `artifact review-request <id>` | `requestArtifactReview(id)` |
| `artifact review-start <id> --version V --roles R[,R] --user-ids U[,U] [--deadline D]` | `startArtifactReview(input)` |
| `artifact review-decide <id> --version V --decision APPROVED|REJECTED` | `submitArtifactDecision(input)` |
| `artifact review-reopen <id> --version V` | `reopenArtifactReview(id, version)` |

**6 AuraClient verbs** (in `packages/shared/src/aura-client.ts` interface +
  `HeyApiAuraClient` impl):

| Verb | REST path | Method |
|---|---|---|
| `getArtifactReview(id)` | `/artifacts/{id}/review` | GET |
| `getArtifactApprovals(id, opts?)` | `/artifacts/{id}/approvals` | GET |
| `requestArtifactReview(id)` | `/artifacts/{id}/review-request` | POST |
| `startArtifactReview(input)` | `/artifacts/{id}/review-start` | POST |
| `submitArtifactDecision(input)` | `/artifacts/{id}/decisions` | POST |
| `reopenArtifactReview(id, version)` | `/artifacts/{id}/review-reopen` | POST |

**Manual live-Aura smoke test** (delegated to the user; needs live PAT):

> ```
> node skills/aura/dist/aura.mjs artifact review-get <real-artifact-uuid>
> ```
> Should print review state (version, review_state, reviewers, initiator).
> Requires the user's PAT in the keyring (`/aura secrets discover`,
> service: `aura`, name: `pat`) and `aura.baseUrl` in
> `~/.pi/agent/settings.json`. Not verified in this slice (mode afk for the
> gate; no live Aura instance available in CI).
