# Aura REST API Reference

Auto-generated from `packages/shared/openapi/openapi.yaml` by `task gen-rest-doc`.
Do not edit by hand — regenerate with `task build`.

## Artifacts

### `acceptArtifactMemory`

`POST` `/artifacts/{id}/accept-memory`

**Summary:** Artifacts: Accept into memory

**Description:** Explicit validation signal (D9) for aura-native memory ingest. Enqueues Lane A
embed + optional KG extract for the artifact's latest version body. Owner-only.
Idempotent when content hash is unchanged.


**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Artifact UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Content unchanged — ingest skipped | `AcceptArtifactMemoryResponse` |
| 202 | Memory ingest enqueued | `AcceptArtifactMemoryResponse` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `addArtifactReviewer`

`POST` `/artifacts/{id}/review-reviewers`

**Summary:** Artifacts: Add reviewer mid-run

**Description:** Adds a reviewer to a running review. Creates a new ArtifactReviewAssignment row for (artifactId, version, userId) if not already present. Notifies the newly added reviewer. Requires EDIT permission.


**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Artifact UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `ArtifactReviewAddReviewerRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 201 | Created — reviewer added |  |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Reviewer already assigned for this version |  |
| 500 | Internal server error. | `ProblemDetail` |

---

### `cancelArtifactReview`

`POST` `/artifacts/{id}/review-cancel`

**Summary:** Artifacts: Cancel review

**Description:** Cancels the running review for a specific version. Deletes all ArtifactReviewAssignment and ArtifactApproval rows for (artifactId, version) and sets reviewState back to UNCHECKED. Notifies all still-pending reviewers (those without a decision). Requires EDIT permission.


**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Artifact UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `ArtifactReviewVersionRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | No Content |  |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `deleteArtifact`

`DELETE` `/artifacts/{id}`

**Summary:** Artifacts: Delete (soft-delete, owner-only)

**Description:** Soft-deletes an artifact by setting status to DELETED (no data is removed). Owner-only (Permission MANAGE) — a task member with EDIT access gets 404. 404 if the artifact does not exist, is already deleted, or is not owned by the current user.

**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Artifact UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | Artifact soft-deleted |  |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getArtifact`

`GET` `/artifacts/{id}`

**Summary:** Artifacts: Get detail

**Description:** Returns the detail of an artifact including its latest version body. 404 when the artifact does not exist (or is inactive/deleted); 403 (ANW-7662) when it exists but the caller lacks access — naming the owner in `meta`.

**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Artifact UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `ArtifactDetail` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access. | `AccessDeniedProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getArtifactAccessOverview`

`GET` `/artifacts/{id}/access-overview`

**Summary:** Artifacts: Access overview (flat)

**Description:** Returns a flat, deduplicated list of users who have access to this artifact (owner + direct members of linked tasks), for the share modal (ANW-7754). Requires READ access on the artifact. Purely informational — no mutation affordances.


**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Artifact UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `ArtifactAccessOverview` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getArtifactApprovals`

`GET` `/artifacts/{id}/approvals`

**Summary:** Artifacts: Get approval status

**Description:** Returns the approval/review status for a specific version of an artifact. Includes X/Y count, list of deciders, and pending reviewers. Defaults to latest version.

**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Artifact UUID |

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `version` | `integer` | no |  |  | Version to query; defaults to latest |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `ArtifactApprovalsResponse` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getArtifactReview`

`GET` `/artifacts/{id}/review`

**Summary:** Artifacts: Get review overview

**Description:** Returns the current review state: the version under review (IN_REVIEW or latest), per-person status for each assigned reviewer, and the list of review artifacts linked via reviewOf for this run. Requires at minimum READ access.


**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Artifact UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `ArtifactReviewOverview` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getArtifactReviewPreview`

`GET` `/artifacts/{id}/review-preview`

**Summary:** Artifacts: Preview review recipients

**Description:** Returns the deduplicated list of users who would be notified and the linked tasks affected, for the given roles and explicitly added users. Read-only — no notifications sent. The calling user is excluded from the reviewers list (matching actual dispatch behaviour).


**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Artifact UUID |

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `roles` | `string` | no |  |  | Comma-separated list of TaskRole enum values to resolve reviewers from (e.g. "OWNER,CONTRIBUTOR") |
| `user_ids` | `string` | no |  |  | Comma-separated list of user UUIDs to include as explicit reviewers |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `ArtifactReviewPreview` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getArtifactReviseContext`

`GET` `/artifacts/{id}/review/revise-context`

**Summary:** Artifacts: Get ReviseBot context

**Description:** Returns the review artifacts linked to the current IN_REVIEW run of this artifact (via reviewOfArtifactId + reviewOfVersion). Read-only data contract for the ReviseBot (ANW-7116). Requires at minimum READ access.


**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Artifact UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `ArtifactReviseContext` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getArtifactVersion`

`GET` `/artifacts/{id}/versions/{n}`

**Summary:** Artifacts: Get version detail

**Description:** Returns the full body and metadata of a specific artifact version. 400 for non-numeric version, 404 for unknown artifact UUID or version number.

**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Artifact UUID |
| `n` | `integer` | yes | Version number |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `ArtifactVersionDetail` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `grantArtifactAccess`

`POST` `/artifacts/{id}/grants`

**Summary:** Artifacts: Grant or update access

**Description:** Upserts an entry in the artifact's own access list (S3, AURA-923): creates it if the principal has none yet, or changes its level if it already does. Requires MANAGE permission on the artifact. Returns the updated access overview so the share dialog can be refreshed from a single response.


**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Artifact UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `ArtifactGrantRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK — updated access overview | `ArtifactAccessOverview` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 422 | Unprocessable Entity — request is well-formed but semantically invalid. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listArtifacts`

`GET` `/artifacts`

**Summary:** Artifacts: List all (paginated)

**Description:** Returns paginated artifacts owned by or shared with the authenticated user.

**Tags:** Artifacts

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `q` | `string` | no |  |  | Search query (full-text filter across relevant fields) |
| `sort_by` | `string` | no |  |  | Field to sort by |
| `sort_dir` | `string` | no |  |  | Sort direction |
| `shared` | `boolean` | no |  |  | When true, returns only artifacts shared via task cascade (not directly owned) |
| `owned` | `boolean` | no |  |  | When true, returns only artifacts directly owned by the current user (no task cascade) |
| `broad_shared` | `boolean` | no |  |  | When true, returns only artifacts of a task carrying a direct company-wide or user access grant (excludes owned, direct-membership, and ancestor-membership artifacts, which surface in the default list instead) |
| `pending_review` | `boolean` | no |  |  | When true, returns only artifacts where the current user has an open review obligation for the current version |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `ArtifactList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listArtifactTasks`

`GET` `/artifacts/{id}/tasks`

**Summary:** Artifacts: List linked tasks

**Description:** Returns the non-paginated list of tasks linked to this artifact, sorted by updatedAt DESC. 404 if artifact not found or not owned by the current user.

**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Artifact UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `ArtifactTaskList` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listArtifactVersions`

`GET` `/artifacts/{id}/versions`

**Summary:** Artifacts: List versions

**Description:** Returns all versions of an artifact sorted by version DESC, without body. User-scoped — 404 if not found or not owned by the current user.

**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Artifact UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `ArtifactVersionList` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listChatArtifacts`

`GET` `/chats/{id}/artifacts`

**Summary:** Chats: List artifacts

**Description:** Returns the non-paginated list of artifacts linked to this chat, sorted by updatedAt DESC. 404 if chat not found or not owned by the current user.

**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Chat UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `ChatArtifactList` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `overrideArtifactReview`

`POST` `/artifacts/{id}/review-override`

**Summary:** Artifacts: Override review (force approved)

**Description:** Forces the artifact version to APPROVED regardless of the current review state. Keeps all ArtifactReviewAssignment and ArtifactApproval rows intact so the approval can be reopened later. Notifies still-pending reviewers. Records artifact.review_overridden activity. Requires EDIT permission.


**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Artifact UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `ArtifactReviewVersionRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | No Content |  |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `removeArtifactReviewer`

`DELETE` `/artifacts/{id}/review-reviewers/{userId}`

**Summary:** Artifacts: Remove reviewer mid-run

**Description:** Removes a reviewer from the running review. Deletes the ArtifactReviewAssignment and any ArtifactApproval row for this user and version. Re-evaluates quorum immediately — removing the last pending reviewer can close the review. Requires EDIT permission.


**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Artifact UUID |
| `userId` | `string/uuid` | yes | UUID of the user to remove |

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `version` | `integer` | yes |  |  | Version number of the review run |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | No Content |  |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `reopenArtifactReview`

`POST` `/artifacts/{id}/review-reopen`

**Summary:** Artifacts: Reopen approved review

**Description:** Reopens an approved review run for a specific version: sets reviewState from APPROVED back to IN_REVIEW while keeping all ArtifactReviewAssignment and ArtifactApproval rows intact. Inverse of review-override. Requires EDIT permission.


**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Artifact UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `ArtifactReviewVersionRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | No Content |  |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Conflict — resource already exists. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `requestArtifactReview`

`POST` `/artifacts/{id}/review-request`

**Summary:** Artifacts: Request review

**Description:** Triggers the review obligation for an artifact. The artifact's current status must have triggersReview=true and at least one review role. Notifies all role-holders in linked tasks via SSE (excluding the actor). Records artifact.review_requested activity.

**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Artifact UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | No Content |  |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 422 | Unprocessable Entity — request is well-formed but semantically invalid. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `revokeArtifactAccess`

`DELETE` `/artifacts/{id}/grants`

**Summary:** Artifacts: Revoke access

**Description:** Removes the matching entry from the artifact's own access list, if present (S3, AURA-923). Requires MANAGE permission on the artifact. Idempotent — revoking an entry that does not exist still returns 200 with the current overview. Returns the updated access overview.


**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Artifact UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `ArtifactGrantRevokeRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK — updated access overview | `ArtifactAccessOverview` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 422 | Unprocessable Entity — request is well-formed but semantically invalid. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `startArtifactReview`

`POST` `/artifacts/{id}/review-start`

**Summary:** Artifacts: Start review

**Description:** Starts a review for a specific version of an artifact. Resolves reviewers from roles and explicit userIds, creates ArtifactReviewAssignment rows, sets reviewState to IN_REVIEW, and notifies all assigned reviewers (except the actor). If the version already has a completed run (APPROVED or NEEDS_REVISION), the old assignments and decisions are cleared first. Requires EDIT permission.


**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Artifact UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `ArtifactReviewStartRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 201 | Created — review run started |  |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 422 | Unprocessable Entity — request is well-formed but semantically invalid. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `submitArtifactDecision`

`POST` `/artifacts/{id}/decisions`

**Summary:** Artifacts: Submit approval/rejection decision

**Description:** Submits or updates an APPROVED or REJECTED decision for a specific version. Version-bound and idempotent (upsert). After all role-holders decide, the artifact is auto-transitioned to the isApproved or isRevision status. Bot-callable.

**Tags:** Artifacts

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | Artifact UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `ArtifactDecisionRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | No Content |  |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

## Asana

### `confirmAsanaLink`

`POST` `/integrations/asana/link`

**Summary:** Asana: Confirm a proposed link

**Description:** Confirms an `asana_propose_link` chat-tool proposal identified by `toolCallId`: sets the Asana link on the task the proposal targeted. Idempotent — confirming the same proposal twice returns the existing link instead of erroring. Returns 409 when the Asana object is already linked to a different task.

**Tags:** Asana

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema (inline): `{"type":"object","required":["toolCallId"],"properties":{"toolCallId":{"type":"string","format":"uuid","description":"UUID of the ChatToolCall record created by asana_propose_link"}}}`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Link confirmed (or already confirmed for this toolCallId) | `AsanaLinkResult` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | The Asana object is already linked to a different task | `AsanaLinkConflict` |

---

### `getAsanaStatus`

`GET` `/integrations/asana/status`

**Summary:** Asana: Connection status

**Description:** Returns whether the authenticated user has a connected Asana account. When a PAT is stored, validates it against Asana's `GET /users/me` so "token invalid" is distinguishable from "not connected".

**Tags:** Asana

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Asana connection status | `AsanaStatus` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |

---

### `getAsanaTask`

`GET` `/asana-tasks/{gid}`

**Summary:** Asana Tasks: Get locally mirrored detail

**Description:** Returns the full detail of a single locally mirrored Asana task, addressed by gid. Project rows (Sagas) are not exposed (404). No Asana account is required.

**Tags:** Asana

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `gid` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Asana task detail | `AsanaTaskDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `listAsanaMirrorProjects`

`GET` `/asana-tasks/projects`

**Summary:** Asana: List mirrored projects (filter source)

**Description:** Distinct projects already seen by the Asana mirror, with a task count and per-project sync freshness (latest completed run: success, failure, or truncated). Reads only the local mirror — no Asana account is required. Backs the project filter dropdown; contrast with GET /asana-tasks/asana-projects, which reads live from Asana for the sync trigger selection.

**Tags:** Asana

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Distinct mirrored projects |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |

---

### `listAsanaProjects`

`GET` `/asana-tasks/asana-projects`

**Summary:** Asana: List own projects (sync trigger selection, admin)

**Description:** The caller's own Asana projects, read live from the Asana API, for the project picker used to trigger a sync. Requires MANAGE_ASANA_SYNC and a connected personal Asana token; a missing or invalid token is reported as `status`, never a 500.

**Tags:** Asana

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Project selection, or an explanation why none is available | `AsanaProjectSelection` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |

---

### `listAsanaTasks`

`GET` `/asana-tasks`

**Summary:** Asana Tasks: List locally mirrored

**Description:** Returns a paginated list of every locally mirrored Asana task row (resourceKind TASK); project rows (Sagas) are excluded, whether or not a sync has touched a given row. No Asana account is required to read this list.

**Tags:** Asana

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `q` | `string` | no |  |  | Search query (full-text filter across relevant fields) |
| `sort_by` | `string` | no |  |  | Field to sort by |
| `sort_dir` | `string` | no |  |  | Sort direction |
| `project_gid` | `string` | no |  |  | Filter by Asana project gid |
| `completed` | `boolean` | no |  |  | When false (the default), only tasks not yet completed are returned. Pass true to include completed tasks as well. |
| `gid` | `string` | no |  |  | Exact Asana task gid match, used to resolve a deep-link. Distinct from `q`, which searches with `contains` across name and gid. |
| `level` | `array` | no | form | true | Filter by derived Aura level, repeatable. |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Paginated list of mirrored Asana tasks | `AsanaTaskList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |

---

### `triggerAsanaSync`

`POST` `/asana-tasks/sync`

**Summary:** Asana: Trigger project sync (admin)

**Description:** Triggers a background sync that mirrors all member tasks of a given Asana project. Returns 409 if a sync for the same project is already running. Requires ADMIN role.

**Tags:** Asana

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema (inline): `{"type":"object","required":["project_gid"],"properties":{"project_gid":{"type":"string","description":"Asana project gid to sync"}}}`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 202 | Sync enqueued |  |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 409 | A sync for this project is already running | `ProblemDetail` |

---

## Boards

### `getBoardBriefing`

`GET` `/boards/briefing`

**Summary:** Boards: AI-generated personal briefing

**Description:** Returns a short AI-generated situation report for the authenticated user's personal board. Cached with a content-hash signature — returns stored text without an LLM call when the user's situation has not changed.


**Tags:** Boards

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `locale` | `string` | no |  |  | Locale code for the generated text (e.g. 'de', 'en'). |
| `refresh` | `boolean` | no |  |  | When true, bypass the signature/TTL cache and regenerate the briefing via a fresh LLM call.
 |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `BoardBriefing` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getBoardSummary`

`GET` `/boards`

**Summary:** Boards: Personal attention summary

**Description:** Aggregates personal attention projections for the authenticated user — waiting_on_me, waiting_on_others, and overdue (yellow/red traffic light against TaskPhaseGoal deadlines). Notifications are NOT included; use GET /notifications. No new DB model — pure reads over existing tables.


**Tags:** Boards

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `BoardSummary` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

## Capacity

### `getCapacitySettings`

`GET` `/capacity/settings`

**Summary:** Capacity: Get company base capacity setting

**Description:** T18 · S27 (ANW-7772): read the firm-wide base capacity percentage and optional explanation note. Leadership/Admin.

**Tags:** Capacity

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Company capacity settings | `CapacitySettings` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getMyCapacity`

`GET` `/capacity/me`

**Summary:** Capacity: My own capacity

**Description:** T18 · S27 (ANW-7772): the logged-in user's own capacity — KPI values (committed / free / utilization) plus their active tasks and commitments.

**Tags:** Capacity

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | The user's own capacity summary | `CapacityPersonal` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getTaskMemberCapacity`

`GET` `/tasks/{uuid}/members/{userIdOrUuid}/capacity`

**Summary:** Tasks: Get member capacity (cross-task)

**Description:** T18 · S27 (ANW-7772): person-scoped capacity for a task member — KPI values plus all active-task commitments. Used by the inline-edit modal so an editor can preview how a change affects total utilization. Auth matches the PATCH: self, or TASK_MANAGE_MEMBERS / Leadership-Admin override.

**Tags:** Capacity

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |
| `userIdOrUuid` | `string` | yes | User integer ID or UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Person capacity for the target member | `CapacityPersonal` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listLeadershipCapacity`

`GET` `/capacity/leadership`

**Summary:** Capacity: Leadership overview (paginated, person-centric)

**Description:** T18 · S27 (ANW-7772): company-wide, person-centric capacity/participation overview for Leadership/Admin. Shows only direct role assignments on active (non-archived, non-DONE/DISCARDED) tasks.

**Tags:** Capacity

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page (default 200 — company roster typically fits on one page) |
| `q` | `string` | no |  |  | Search query (full-text filter across relevant fields) |
| `sort_by` | `string` | no |  |  | Field to sort by (default utilization) |
| `sort_dir` | `string` | no |  |  | Sort direction |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Person-centric capacity overview | `CapacityLeadershipList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `readCapacity`

`GET` `/capacity/read`

**Summary:** Capacity: Read capacity with a scope (me, person, group, or company)

**Description:** AURA-1722: one read tool for capacity. scope=me returns the caller's own row (one-row list, works for everyone); scope=person returns one person's row (yourself always; a foreign person requires LEAD of a common group or VIEW_CAPACITY_OVERVIEW); scope=group returns the members of a group the caller leads (omit group_uuid for 'my team' — every group where the caller is LEAD; a member with no active task appears at 0% with an empty task list); scope=company returns the firm-wide, person-centric overview (Leadership/Admin, paginated). The scope-dependent capability gate is enforced inside the operation — a refusal is a structured error, never an empty list. 'No lead role' (scope=group without group_uuid) returns NO_LEAD_ROLE, distinguishable from 'group exists but has no members' which returns an empty list.

**Tags:** Capacity

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `scope` | `string` | yes |  |  | Whose capacity to read — "me" for the caller's own row, "person" for one person (pass person_uuid), "group" for a group the caller leads (pass group_uuid, or omit for "my team"), "company" for the firm-wide overview (Leadership/Admin). |
| `person_uuid` | `string/uuid` | no |  |  | Target person UUID — required for scope=person, ignored otherwise. |
| `group_uuid` | `string/uuid` | no |  |  | Target group UUID for scope=group. Omit for "my team" — every group where the caller is LEAD. Ignored for other scopes. |
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Items per page for scope=company (default 20, max 100). Ignored for other scopes. |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | A scoped capacity read — a one-row list for scope=me/person, the roster for scope=group, a paginated overview for scope=company. | `CapacityReadResponse` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `updateCapacitySettings`

`PATCH` `/capacity/settings`

**Summary:** Capacity: Update company base capacity setting

**Description:** T18 · S27 (ANW-7772): set the firm-wide base capacity (10% steps, 10..100) and optional explanation note. Requires MANAGE_CAPACITY_SETTINGS (Leadership/Admin).

**Tags:** Capacity

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema (inline): `{"type":"object","required":["base_capacity_percent"],"properties":{"base_capacity_percent":{"type":"integer","enum":[10,20,30,40,50,60,70,80,90,100]},"base_capacity_note":{"type":"string","nullable":true,"description":"Empty string or null clears the override (falls back to localized default)."}}}`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Updated company capacity settings | `CapacitySettings` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `updateTaskMemberCapacity`

`PATCH` `/tasks/{uuid}/members/{userIdOrUuid}/capacity`

**Summary:** Tasks: Set member capacity commitment

**Description:** T18 · S27 (ANW-7772): set/change/remove a core-team member's capacity commitment on a task. A member may set their own; owners and Leadership/Admin (system override) may set any core-team member's. Returns the updated task detail.

**Tags:** Capacity

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |
| `userIdOrUuid` | `string` | yes | User integer ID or UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskMemberCapacityUpdate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Capacity updated; returns updated task detail | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

## Chats

### `listChats`

`GET` `/chats`

**Summary:** Chats: List all

**Description:** Returns paginated chats owned by or shared with the authenticated user.

**Tags:** Chats

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `q` | `string` | no |  |  | Search query (full-text filter across relevant fields) |
| `sort_by` | `string` | no |  |  | Field to sort by |
| `sort_dir` | `string` | no |  |  | Sort direction |
| `status` | `string` | no |  |  | Filter by chat status |
| `shared` | `boolean` | no |  |  | When true, returns only chats shared via task cascade (not directly owned) |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `ChatList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `setChatVisibility`

`PUT` `/chats/{id}/visibility`

**Summary:** Chats: Set visibility

**Description:** Owner-only toggle between PRIVATE and PUBLIC. Setting PUBLIC is rejected with 400 when the chat has no task link. Not reverted automatically when a later-removed last task link would otherwise apply (see ANW-7161).


**Tags:** Chats

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes |  |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `ChatVisibilityUpdate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Updated chat | `Chat` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

## Comments

### `createComment`

`POST` `/comments`

**Summary:** Comments: Create

**Description:** Creates a new comment on an entity. Caller must have at least READ access.

**Tags:** Comments

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `CreateCommentRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 201 | Comment created | `Comment` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `deleteComment`

`DELETE` `/comments/{uuid}`

**Summary:** Comments: Delete

**Description:** Hard-deletes a comment. Allowed for the comment author or a user with MANAGE permission on the entity. Mentions are cascade-deleted.

**Tags:** Comments

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | Deleted |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getCommentImage`

`GET` `/comments/images/{id}`

**Summary:** Comments: Get image

**Description:** Returns the binary image. Requires READ access on the parent entity.

**Tags:** Comments

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Image binary |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listComments`

`GET` `/comments`

**Summary:** Comments: List for an entity

**Description:** Returns paginated flat comments for a given entity, ordered by createdAt according to sort_dir (default DESC). The caller must have at least READ access to the entity.

**Tags:** Comments

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `entity_type` | `string` | yes |  |  | The entity type to filter by |
| `entity_id` | `string/uuid` | yes |  |  | The public UUID of the entity |
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `sort_dir` | `string` | no |  |  | Sort direction |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `CommentList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listMentionCandidates`

`GET` `/comments/mention-candidates`

**Summary:** Comments: Mention candidates

**Description:** Returns users that can be @-mentioned in a comment, with a has_access flag per candidate relative to the target entity.

**Tags:** Comments

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `entity_type` | `string` | yes |  |  |  |
| `entity_id` | `string/uuid` | yes |  |  |  |
| `q` | `string` | no |  |  | Search query (full-text filter across relevant fields) |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK |  |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `updateComment`

`PATCH` `/comments/{uuid}`

**Summary:** Comments: Update

**Description:** Updates the body and mentions of an existing comment. Only the comment author may update their own comment.

**Tags:** Comments

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes |  |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `PatchCommentRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Updated comment | `Comment` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `uploadCommentImage`

`POST` `/comments/images`

**Summary:** Comments: Upload image

**Description:** Uploads an image for use in a comment or a task description. The image is entity-scoped. For comments, it is linked once the comment is saved (commentId set on submit). For TASK entities a missing commentId means the image is bound to the task description (not an orphan); a future sweep must check the task description for the image URL before deleting. Comment uploads that stay unlinked (commentId null after abandon) may still be cleaned by a periodic sweep.

**Tags:** Comments

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `entity_type` | `string` | yes |  |  |  |
| `entity_id` | `string/uuid` | yes |  |  |  |

**Request body:**

- Content-Type: `multipart/form-data`
- Required: yes
- Schema (inline): `{"type":"object","required":["file"],"properties":{"file":{"type":"string","format":"binary"}}}`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 201 | Uploaded image | `CommentImageResponse` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 413 | Payload too large (exceeds 10 MB) |  |
| 415 | Unsupported media type (only JPEG, PNG, WebP allowed) |  |
| 500 | Internal server error. | `ProblemDetail` |

---

## Feedback

### `changeFeedbackStatus`

`PATCH` `/feedback/{uuid}/status`

**Summary:** Feedback: Change status

**Description:** Triage a feedback entry. DISCARDED requires discard_reason. Requires VIEW_FEEDBACK.

**Tags:** Feedback

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Feedback UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `FeedbackStatusChange`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Updated | `FeedbackDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `confirmFeedback`

`POST` `/feedback/confirm`

**Summary:** Feedback: Confirm a chat proposal

**Description:** Creates the feedback row for a feedback_propose tool call owned by the caller. Idempotent on toolCallId. Requires SUBMIT_FEEDBACK.


**Tags:** Feedback

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `FeedbackConfirm`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Already created for this toolCallId | `FeedbackConfirmResult` |
| 201 | Created | `FeedbackConfirmResult` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `createFeedback`

`POST` `/feedback`

**Summary:** Feedback: Create

**Description:** Submits a feedback entry. Requires SUBMIT_FEEDBACK. Anonymous submissions store no authorId.


**Tags:** Feedback

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `FeedbackCreate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 201 | Created | `FeedbackDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getFeedback`

`GET` `/feedback/{uuid}`

**Summary:** Feedback: Get detail

**Description:** Returns one feedback entry. Requires VIEW_FEEDBACK.

**Tags:** Feedback

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Feedback UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `FeedbackDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `linkFeedbackTask`

`POST` `/feedback/{uuid}/tasks`

**Summary:** Feedback: Link a task

**Description:** Attaches a task that addresses this feedback. Linking an already-DONE task resolves the entry immediately. Requires VIEW_FEEDBACK.


**Tags:** Feedback

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Feedback UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `FeedbackTaskLink`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Linked | `FeedbackDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `linkRelatedFeedback`

`POST` `/feedback/{uuid}/related`

**Summary:** Feedback: Link a related entry

**Description:** Creates a canonical undirected relation. Self-links are rejected. Requires VIEW_FEEDBACK.

**Tags:** Feedback

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Feedback UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `FeedbackRelatedLink`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Linked | `FeedbackDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listFeedback`

`GET` `/feedback`

**Summary:** Feedback: List (paginated)

**Description:** Returns paginated feedback. Default hides discarded entries. Requires VIEW_FEEDBACK (Leadership/Admin). Callers without the capability receive 403, not an empty list.


**Tags:** Feedback

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `q` | `string` | no |  |  | Search query (full-text filter across relevant fields) |
| `sort_by` | `string` | no |  |  | Field to sort by |
| `sort_dir` | `string` | no |  |  | Sort direction |
| `status` | `string` | no |  |  | Exact status filter. When omitted, discarded entries are hidden. |
| `source` | `string` | no |  |  | Filter by how the entry arrived |
| `tags` | `string` | no |  |  | Comma-separated tag slugs to filter by. |
| `tag_match` | `string` | no |  |  | Whether all (AND) or any (OR) of the given tag slugs must match. Default all. |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Paginated feedback list | `FeedbackList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `unlinkFeedbackTask`

`DELETE` `/feedback/{uuid}/tasks`

**Summary:** Feedback: Unlink a task

**Description:** Removes the feedback-task link. Requires VIEW_FEEDBACK.

**Tags:** Feedback

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Feedback UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `FeedbackTaskLink`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Unlinked | `FeedbackDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `unlinkRelatedFeedback`

`DELETE` `/feedback/{uuid}/related`

**Summary:** Feedback: Unlink a related entry

**Description:** Removes the canonical relation. Requires VIEW_FEEDBACK.

**Tags:** Feedback

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Feedback UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `FeedbackRelatedLink`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Unlinked | `FeedbackDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

## Glossary

### `approveGlossaryEntry`

`POST` `/glossary/{uuid}/approve`

**Summary:** Glossary: Approve a pending proposal (admin-only)

**Description:** Transitions a PENDING entry to APPROVED and triggers embedding. Idempotent when the entry is already APPROVED. Requires MANAGE_GLOSSARY capability (ADMIN only).

**Tags:** Glossary

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `GlossaryEntry` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `createGlossaryEntry`

`POST` `/glossary`

**Summary:** Glossary: Create

**Description:** Creates a new glossary entry and triggers embedding.

**Tags:** Glossary

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `GlossaryEntryCreate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 201 | Created | `GlossaryEntry` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 409 | Term already exists | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `deleteGlossaryEntry`

`DELETE` `/glossary/{uuid}`

**Summary:** Glossary: Delete

**Description:** Deletes a glossary entry and removes its embeddings.

**Tags:** Glossary

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | Deleted |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getGlossaryEntry`

`GET` `/glossary/{uuid}`

**Summary:** Glossary: Get detail

**Tags:** Glossary

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `GlossaryEntry` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listGlossaryEntries`

`GET` `/glossary`

**Summary:** Glossary: List (paginated)

**Description:** Returns paginated glossary entries. Accessible to all authenticated users.

**Tags:** Glossary

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `q` | `string` | no |  |  | Search query (full-text filter across relevant fields) |
| `sort_by` | `string` | no |  |  | Field to sort by |
| `sort_dir` | `string` | no |  |  | Sort direction |
| `category` | `string` | no |  |  | Filter by category |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `GlossaryList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listPendingGlossaryEntries`

`GET` `/glossary/pending`

**Summary:** Glossary: List pending proposals (admin-only)

**Description:** Returns all glossary entries awaiting review. Requires MANAGE_GLOSSARY capability (ADMIN only).

**Tags:** Glossary

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `GlossaryPendingList` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `rejectGlossaryEntry`

`POST` `/glossary/{uuid}/reject`

**Summary:** Glossary: Reject a pending proposal (admin-only)

**Description:** Deletes a PENDING entry (it was never embedded). Requires MANAGE_GLOSSARY capability (ADMIN only).

**Tags:** Glossary

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | Rejected and deleted |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Entry is not pending | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `updateGlossaryEntry`

`PATCH` `/glossary/{uuid}`

**Summary:** Glossary: Update

**Description:** Updates a glossary entry and re-embeds it.

**Tags:** Glossary

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes |  |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `GlossaryEntryUpdate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `GlossaryEntry` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Term already exists | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

## Health

### `getHealth`

`GET` `/health`

**Summary:** Health: Status check

**Tags:** Health

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK |  |

---

### `systemHealth`

`GET` `/system/health`

**Summary:** System: Health and build identity

**Description:** Authenticated health check with process uptime and the current build identity (hash, tag, timestamps). Distinct from the unauthenticated Docker `/health` probe.

**Tags:** Health

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Health status, uptime in seconds, and optional build block |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

## JiraIssues

### `getJiraIssue`

`GET` `/jira-issues/{cloudId}/{issueKey}`

**Summary:** Jira Issues: Get locally mirrored detail (admin)

**Description:** Returns the full detail of a single locally mirrored Jira issue, addressed by cloudId + issueKey. Requires ADMIN role.

**Tags:** JiraIssues

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `cloudId` | `string` | yes |  |
| `issueKey` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Jira issue detail | `JiraIssueDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `listJiraIssues`

`GET` `/jira-issues`

**Summary:** Jira Issues: List locally mirrored (admin)

**Description:** Returns a paginated list of all locally mirrored Jira issues. Requires ADMIN role.

**Tags:** JiraIssues

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `q` | `string` | no |  |  | Search query (full-text filter across relevant fields) |
| `sort_by` | `string` | no |  |  | Field to sort by |
| `sort_dir` | `string` | no |  |  | Sort direction |
| `team_id` | `string` | no |  |  | Filter by team UUID (from JiraTeam / customfield_10001) |
| `status_category` | `string` | no |  |  | Comma-separated status category keys to filter by (e.g. "new,indeterminate"). No server-side default — omitting this parameter returns all categories. |
| `issue_key` | `string` | no |  |  | Exact issue key match (e.g. "ANW-7896"), used to resolve the ?issue=<key> deep-link. Distinct from `q`, which searches with `contains` across issueKey, summary, and status — a prefix would otherwise match unrelated tickets. |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Paginated list of Jira issues | `JiraIssueList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |

---

### `triggerJiraSync`

`POST` `/jira-issues/sync`

**Summary:** Jira Issues: Trigger topic sync (admin)

**Description:** Triggers a background sync that mirrors all Jira issues for a given team/topic. Returns 409 if a sync for the same topic is already running. Requires ADMIN role.

**Tags:** JiraIssues

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema (inline): `{"type":"object","required":["team_id"],"properties":{"team_id":{"type":"string","format":"uuid","description":"Team UUID to sync (from JiraTeam / customfield_10001)"}}}`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 202 | Sync enqueued |  |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 409 | A sync for this topic is already running | `ProblemDetail` |

---

## knowledge

### `createKnowledgeNode`

`POST` `/knowledge/spaces/{slug}/nodes`

**Summary:** Create a folder or document node

**Tags:** knowledge

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `slug` | `string` | yes |  |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `KnowledgeNodeCreate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 201 | Created node | `KnowledgeNode` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Conflict — resource already exists. | `ProblemDetail` |

---

### `createKnowledgeSpace`

`POST` `/knowledge/spaces`

**Summary:** Create a knowledge space

**Tags:** knowledge

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `KnowledgeSpaceCreate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 201 | Created knowledge space | `KnowledgeSpace` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 409 | Conflict — resource already exists. | `ProblemDetail` |

---

### `deleteKnowledgeNode`

`DELETE` `/knowledge/nodes/{uuid}`

**Summary:** Delete a node (cascades to children, versions and file assets)

**Description:** Deletes the node and, for a folder, its whole subtree. File assets in that subtree lose their stored objects too — the DB cascade alone would leave the blobs behind.

**Tags:** knowledge

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | Deleted |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `deleteKnowledgeSpace`

`DELETE` `/knowledge/spaces/{slug}`

**Summary:** Delete a knowledge space (cascades to all nodes)

**Tags:** knowledge

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `slug` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | Deleted |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `downloadKnowledgeFile`

`GET` `/knowledge/nodes/{uuid}/file`

**Summary:** Download the bytes of a FILE node

**Description:** Streams the stored bytes byte-identically. Responds with Content-Disposition attachment unless inline=true is requested.

**Tags:** knowledge

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes |  |

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `inline` | `boolean` | no |  |  | Serve with Content-Disposition inline (for previews) instead of attachment. |
| `version` | `integer` | no |  |  | Fetch a specific past version by its number instead of the current one (AURA-1644). |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | File bytes |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `getKnowledgeNode`

`GET` `/knowledge/nodes/{uuid}`

**Summary:** Get a single node (includes body for documents)

**Tags:** knowledge

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Knowledge node | `KnowledgeNode` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `getKnowledgeNodeByPath`

`GET` `/knowledge/spaces/{slug}/nodes/by-path`

**Summary:** Get a knowledge node by its slug path within a space

**Description:** Resolves a document node by traversing the slug hierarchy. Returns the full node including body, suitable for rendering the document view.

**Tags:** knowledge

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `slug` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | The resolved node | `KnowledgeNode` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `getKnowledgeNodeImage`

`GET` `/knowledge/nodes/{uuid}/images/{imageId}`

**Summary:** Serve an image for a knowledge node

**Tags:** knowledge

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes |  |
| `imageId` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Image binary |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `getKnowledgeNodeVersion`

`GET` `/knowledge/nodes/{uuid}/versions/{version}`

**Summary:** Get a specific version of a document node

**Tags:** knowledge

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |
| `version` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Version detail | `KnowledgeVersion` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `getKnowledgeSpace`

`GET` `/knowledge/spaces/{slug}`

**Summary:** Get a knowledge space by slug

**Tags:** knowledge

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `slug` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Knowledge space | `KnowledgeSpace` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `getKnowledgeTree`

`GET` `/knowledge/spaces/{slug}/nodes`

**Summary:** Get the full node tree for a space

**Description:** Returns the complete tree of folders and documents (body omitted — load via GET /knowledge/nodes/{uuid}). The optional `depth` and `max_nodes` bound the answer; omitted, the whole tree comes back.

**Tags:** knowledge

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `slug` | `string` | yes |  |

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `depth` | `integer` | no |  |  | Maximum tree depth below the roots. Omitted returns every level. |
| `max_nodes` | `integer` | no |  |  | Maximum number of nodes in the answer. Omitted returns all of them. |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Node tree | `KnowledgeTree` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `listKnowledgeFiles`

`GET` `/knowledge/spaces/{slug}/files`

**Summary:** List the file nodes of a space

**Description:** Returns the FILE nodes of a space with their asset metadata and their slug path. Optionally scoped to a single folder via parent_id.

**Tags:** knowledge

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `slug` | `string` | yes |  |

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `q` | `string` | no |  |  | Search query (full-text filter across relevant fields) |
| `sort_dir` | `string` | no |  |  | Sort direction |
| `sort_by` | `string` | no |  |  | Sort field |
| `parent_id` | `string/uuid` | no |  |  | Only list files directly inside this folder node. |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | List of files | `KnowledgeFileList` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `listKnowledgeFileVersions`

`GET` `/knowledge/nodes/{uuid}/file/versions`

**Summary:** List all versions of a FILE node's asset

**Description:** Newest first. Each entry carries its own checksum and provenance (AURA-1644) — download a specific one via GET /knowledge/nodes/{uuid}/file?version=N.

**Tags:** knowledge

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Version list | `KnowledgeFileVersionList` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `listKnowledgeNodeVersions`

`GET` `/knowledge/nodes/{uuid}/versions`

**Summary:** List all versions of a document node

**Tags:** knowledge

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Version list | `KnowledgeVersionList` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `listKnowledgeSpaces`

`GET` `/knowledge/spaces`

**Summary:** List knowledge spaces

**Description:** Returns all knowledge spaces (topics). Accessible to all authenticated users.

**Tags:** knowledge

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | List of knowledge spaces | `KnowledgeSpaceList` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |

---

### `restoreKnowledgeNodeVersion`

`POST` `/knowledge/nodes/{uuid}/versions/{version}/restore`

**Summary:** Restore a document node to a previous version (creates new version)

**Tags:** knowledge

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |
| `version` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Node after restore | `KnowledgeNode` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `saveKnowledgeNodeBody`

`PUT` `/knowledge/nodes/{uuid}/body`

**Summary:** Save document body (creates a new version)

**Tags:** knowledge

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `KnowledgeNodeBodySave`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Updated node | `KnowledgeNode` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `updateKnowledgeNode`

`PATCH` `/knowledge/nodes/{uuid}`

**Summary:** Rename, move or reorder a node

**Tags:** knowledge

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `KnowledgeNodeUpdate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Updated node | `KnowledgeNode` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `updateKnowledgeSpace`

`PATCH` `/knowledge/spaces/{slug}`

**Summary:** Update a knowledge space

**Tags:** knowledge

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `slug` | `string` | yes |  |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `KnowledgeSpaceUpdate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Updated knowledge space | `KnowledgeSpace` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `uploadKnowledgeFile`

`POST` `/knowledge/spaces/{slug}/files`

**Summary:** Upload a file into a space (creates or replaces a FILE node)

**Description:** Uploads a file as a FILE node. The node slug is the normalised file name including its extension; title and asset filename keep the verbatim name. When a FILE node with the same slug already exists in the target folder, its content is replaced (same node, same path, new bytes, no version). A collision with a FOLDER or DOCUMENT is a 409.

**Tags:** knowledge

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `slug` | `string` | yes |  |

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `parent_id` | `string/uuid` | no |  |  | Folder node to upload into. Omit for the space root. |

**Request body:**

- Content-Type: `multipart/form-data`
- Required: yes
- Schema (inline): `{"type":"object","required":["file"],"properties":{"file":{"type":"string","format":"binary"}}}`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Existing file replaced | `KnowledgeFile` |
| 201 | File created | `KnowledgeFile` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Conflict — resource already exists. | `ProblemDetail` |
| 413 | Payload too large (exceeds 50 MB) |  |

---

### `uploadKnowledgeNodeImage`

`POST` `/knowledge/nodes/{uuid}/images`

**Summary:** Upload an image for a knowledge node

**Tags:** knowledge

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes |  |

**Request body:**

- Content-Type: `multipart/form-data`
- Required: yes
- Schema (inline): `{"type":"object","required":["file"],"properties":{"file":{"type":"string","format":"binary"}}}`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 201 | Image uploaded successfully | `KnowledgeNodeImage` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 413 | Payload too large (exceeds 10 MB) |  |
| 415 | Unsupported media type |  |

---

## Knowledge

### `saveKnowledgeNodeFrontmatter`

`PUT` `/knowledge/nodes/{uuid}/frontmatter`

**Summary:** Save (replace) the front matter of a wiki page

**Tags:** Knowledge

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes |  |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema (inline): `{"type":"object","required":["raw"],"properties":{"raw":{"type":"string","nullable":true,"description":"YAML string. Null or empty string clears the front matter."}}}`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Updated node with new front matter. | `KnowledgeNode` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `searchKnowledge`

`GET` `/knowledge/search`

**Summary:** Search wiki, repository and skill knowledge spaces

**Description:** Hybrid search over knowledge pages — literal (German full-text plus a trigram fallback for compound words) and semantic, merged into one ranked list via reciprocal rank fusion. Restricted to the caller's readable spaces.

**Tags:** Knowledge

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `query` | `string` | yes |  |  |  |
| `space_slug` | `string` | no |  |  | Restrict the search to one knowledge space. Omit to search every space the caller may read. |
| `limit` | `integer` | no |  |  |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Matching knowledge pages | `KnowledgeSearchList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |

---

## llm-turns

### `getLlmTurnPayload`

`GET` `/llm-turns/{uuid}/payload`

**Summary:** LLM Turns: Get payload

**Description:** Loads the full payload (system prompt, messages, raw response) of a single turn from S3. Owner sees their own turns; ADMIN sees all. Returns 404 if the turn has no payload (old row or a write-time S3 failure).

**Tags:** llm-turns

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `LlmTurnPayload` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listLlmTurns`

`GET` `/llm-turns`

**Summary:** LLM Turns: List

**Description:** Returns paginated LLM turns. Filtered by message_id or chat_id. Owner sees their own turns; ADMIN sees all.

**Tags:** llm-turns

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `sort_dir` | `string` | no |  |  | Sort direction |
| `sort_by` | `string` | no |  |  | Field to sort by |
| `message_id` | `string/uuid` | no |  |  | Filter by chat message UUID |
| `chat_id` | `string/uuid` | no |  |  | Filter by chat UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `LlmTurnList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

## MCP

### `aiSetup`

`GET` `/mcp/blueprint/setup`

**Summary:** Bootstrap an empty house repository from the wiki blueprint

**Description:** Call this when the current repository has no Aura control layer yet (no AGENTS.md, no .agents/skills, no .cursor/rules/anwaltde) and you need to set it up. Returns the current ai-setup skill text, the current blueprint manifest, and a short instruction to fetch missing blocks via getBlueprintFiles. Does not write any files. Do not call this to check whether an already-set-up repo is up to date — that is ai-sync.


**Tags:** MCP

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Current ai-setup skill, inline manifest, and fetch instruction | `AiSetupResponse` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `createMcpAccessToken`

`POST` `/me/mcp-tokens`

**Summary:** Me: Create MCP access token

**Description:** Creates a new MCP access token. The plaintext token is returned once in the response and cannot be retrieved again.

**Tags:** MCP

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `CreateMcpAccessTokenRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 201 | Created | `CreateMcpAccessTokenResponse` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getBlueprintFiles`

`GET` `/mcp/blueprint/files`

**Summary:** Fetch house-blueprint files by path

**Description:** Fetch one file or every file in a skill directory from the house blueprint (engineering-foundation, path under blueprint/ only). File vs directory is decided by the node, not by a flag. Pass an optional version stamp (sha256 checksum or integer version) to pin a specific revision; omit it for current. Use when ai-setup or ai-sync needs the bytes of a named building block. Do not use this for Aura product skills (mcpGetSkill) or for wiki pages outside blueprint/.


**Tags:** MCP

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `path` | `string` | yes |  |  | Slash-separated path under blueprint/ (file or skill directory). |
| `version` | `string` | no |  |  | Optional version pointer — sha256:<hex> checksum or integer latest_version. |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | JSON-safe file payloads with checksum and provenance | `GetBlueprintFilesResponse` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `listMcpAccessTokens`

`GET` `/me/mcp-tokens`

**Summary:** Me: List MCP access tokens

**Description:** Returns active MCP access tokens for the authenticated user. Token secrets are never included.

**Tags:** MCP

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `McpAccessTokenList` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `mcpAnswerQuestion`

`POST` `/mcp/questions/{id}/answer`

**Summary:** MCP: Answer question

**Description:** Saves an answer and marks the question ANSWERED. Requires EDIT access; no chatbot guard.

**Tags:** MCP

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes |  |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `McpAnswerQuestionRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `McpQuestionDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `mcpCreateArtifact`

`POST` `/mcp/artifacts`

**Summary:** MCP: Create artifact

**Description:** Creates a Markdown artifact without an Aura chat (source MCP). Embedding runs fire-and-forget. Server limit: body max 200,000 characters. A large body has to be emitted as a single tool argument and may exceed the calling agent's output budget long before that limit — for large content, create a short seed here and fill it in via mcpUpdateArtifact mode "section", or send the payload from a file to PATCH /api/mcp/artifacts/{id} with an MCP PAT.


**Tags:** MCP

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `McpCreateArtifactRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 201 | Created | `ArtifactDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `mcpCreateTask`

`POST` `/mcp/tasks`

**Summary:** MCP: Create task

**Description:** Creates a planning task for the PAT owner without linking an Aura chat. Call search first to avoid duplicates.

**Tags:** MCP

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `McpCreateTaskRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 201 | Created | `McpTaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `mcpCreateUploadDocument`

`POST` `/mcp/upload-documents`

**Summary:** MCP: Upload document (base64)

**Description:** Ingests a file from base64 content. Maximum 10 MB per request.

**Tags:** MCP

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `McpCreateUploadDocumentRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 201 | Created | `McpUploadDocumentDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 413 | Payload exceeds 10 MB MCP limit | `ProblemDetail` |
| 415 | Unsupported media type | `ProblemDetail` |

---

### `mcpExpandGraph`

`POST` `/mcp/graph/expand`

**Summary:** MCP: Expand knowledge graph

**Tags:** MCP

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `McpGraphExpandRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `McpGraphExpandResponse` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `mcpGetArtifact`

`GET` `/mcp/artifacts/{id}`

**Summary:** MCP: Get artifact

**Tags:** MCP

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `ArtifactDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `mcpGetKnowledgeDocument`

`GET` `/mcp/knowledge/documents/{id}`

**Summary:** MCP: Get knowledge document

**Tags:** MCP

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `McpKnowledgeDocument` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `mcpGetQuestion`

`GET` `/mcp/questions/{id}`

**Summary:** MCP: Get question

**Tags:** MCP

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `McpQuestionDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `mcpGetRepoDocument`

`GET` `/mcp/repo-documents`

**Summary:** MCP: Get repository document

**Tags:** MCP

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `repo_slug` | `string` | yes |  |  |  |
| `path` | `string` | yes |  |  |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `McpRepoDocument` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `mcpGetSkill`

`GET` `/mcp/skills/{id}`

**Summary:** MCP: Get skill

**Tags:** MCP

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `McpSkillDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `mcpGetUploadDocument`

`GET` `/mcp/upload-documents/{id}`

**Summary:** MCP: Get upload document

**Tags:** MCP

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `McpUploadDocumentDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `mcpLinkArtifactToTask`

`POST` `/mcp/tasks/{id}/artifacts`

**Summary:** MCP: Link artifact to task

**Tags:** MCP

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes |  |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `McpLinkArtifactRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `McpLinkArtifactResponse` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `mcpLinkUploadToTask`

`POST` `/mcp/tasks/{id}/uploads`

**Summary:** MCP: Link upload to task

**Tags:** MCP

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes |  |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `McpLinkUploadRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `McpLinkUploadResponse` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `mcpListCodeRepositories`

`GET` `/mcp/code-repositories`

**Summary:** MCP: List code-search-enabled repositories

**Description:** Returns repositories with codeSearchEnabled=true for intersection with repo-mcp allowlist.

**Tags:** MCP

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `McpCodeRepositoryList` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |

---

### `mcpUnifiedSearch`

`POST` `/mcp/search`

**Summary:** MCP: Unified semantic search

**Description:** Same as POST /search but authenticated via MCP Personal Access Token (Bearer). Used by the native /mcp route and external MCP clients.

**Tags:** MCP

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `UnifiedSearchRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `UnifiedSearchResponse` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |
| 503 | Embedding provider unavailable | `ProblemDetail` |

---

### `mcpUpdateArtifact`

`PATCH` `/mcp/artifacts/{id}`

**Summary:** MCP: Update artifact

**Description:** Updates an artifact body. Server limits: body max 200,000 characters in mode "whole", 50,000 in mode "section". Prefer mode "section" (target_heading + section body) for large or multi-part edits: a whole body has to be emitted as a single tool argument and may exceed the calling agent's output budget long before the server limit. For very large content, send the payload from a file to PATCH /api/mcp/artifacts/{id} with an MCP PAT (same JSON body).


**Tags:** MCP

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes |  |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `McpUpdateArtifactRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `McpUpdateArtifactResponse` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `mcpWikiSearch`

`GET` `/mcp/wiki-search`

**Summary:** MCP: Search the wiki (literal + semantic)

**Description:** Searches Wiki, Repository and Skill knowledge spaces for pages matching the query, combining a literal (German full-text plus a trigram fallback for compound words) and a semantic search and merging both into one ranked list. Restricted to the caller's readable spaces.

**Tags:** MCP

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `query` | `string` | yes |  |  |  |
| `space_slug` | `string` | no |  |  |  |
| `limit` | `integer` | no |  |  |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `McpWikiSearchResponse` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |

---

### `revokeMcpAccessToken`

`DELETE` `/me/mcp-tokens/{id}`

**Summary:** Me: Revoke MCP access token

**Description:** Revokes an MCP access token owned by the authenticated user. Idempotent for already-revoked tokens returns 404.

**Tags:** MCP

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `McpAccessTokenRevokeResponse` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

## Memory

### `getMemoryEntitySource`

`GET` `/memory/entities/{stable_id}/source`

**Summary:** Memory: Resolve navigable source for an entity

**Description:** Returns an internal route or external URL for jumping to the operative source behind a memory-graph node (task, Jira issue, or related doc).

**Tags:** Memory

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `stable_id` | `string` | yes | Entity stable ID (e.g. "task:{uuid}" or "jira:anw-1234") |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `MemoryEntitySource` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getMemoryGraph`

`GET` `/memory/graph`

**Summary:** Memory: Graph expansion from anchor

**Description:** Returns access-filtered nodes and edges for a knowledge-graph anchor. Default trust filter includes only confirmed edges; set include_candidates to also return candidate edges. Edge line_style distinguishes provenance (solid = structural/source, dashed = inferred/candidate).

**Tags:** Memory

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `anchor` | `string` | yes |  |  | Entity stable ID to expand from (e.g. "service:plai-api") |
| `depth` | `integer` | no |  |  | Traversal depth (1 = direct neighbours, 2 = two hops) |
| `include_candidates` | `boolean` | no |  |  | When true, include candidate (inferred) edges in addition to confirmed |
| `include_superseded` | `boolean` | no |  |  | When true, include superseded edges in addition to current edges |
| `entity_type` | `string` | no |  |  | Filter to entities or nodes of this wiki-graph type |
| `edge_origin` | `string` | no |  |  | Filter edges by provenance origin (knowledge graph vs mirrored operational links) |
| `fact_layer` | `string` | no |  |  | Filter edges by fact layer |
| `confidence_min` | `string` | no |  |  | Minimum confidence threshold for edges |
| `status` | `string` | no |  |  | Filter edges by trust status |
| `sensitivity` | `string` | no |  |  | Filter edges or entities by memory sensitivity label |
| `predicate` | `string` | no |  |  | Filter edges to this predicate name |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `MemoryGraph` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getMemoryMap`

`GET` `/memory/map`

**Summary:** Memory: Cluster map overview

**Description:** Returns an aggregated cluster overview of the knowledge graph for the Memory Explorer map mode. Entities must have at least one confirmed edge (Explorer trust default). Connected components become clusters; cross-cluster confirmed edges are aggregated as meta_edges. Top-level responses cap at ~25 clusters; additional components contribute to hidden_count.

**Tags:** Memory

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `level` | `string` | no |  |  | Map detail level — overview (default) or drill into a cluster |
| `cluster_id` | `string` | no |  |  | Cluster identifier for drill-level requests (e.g. "cc:7") |
| `include_candidates` | `boolean` | no |  |  | When true, include candidate (inferred) edges in addition to confirmed |
| `include_superseded` | `boolean` | no |  |  | When true, include superseded edges in addition to current edges |
| `entity_type` | `string` | no |  |  | Filter to entities or nodes of this wiki-graph type |
| `edge_origin` | `string` | no |  |  | Filter edges by provenance origin (knowledge graph vs mirrored operational links) |
| `fact_layer` | `string` | no |  |  | Filter edges by fact layer |
| `confidence_min` | `string` | no |  |  | Minimum confidence threshold for edges |
| `status` | `string` | no |  |  | Filter edges by trust status |
| `sensitivity` | `string` | no |  |  | Filter edges or entities by memory sensitivity label |
| `predicate` | `string` | no |  |  | Filter edges to this predicate name |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `MemoryMap` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listMemoryEntities`

`GET` `/memory/entities`

**Summary:** Memory: Entity list (faceted, paginated)

**Description:** Returns a paginated, access-filtered list of knowledge-graph entities for the Memory Explorer table entry point. Supports the shared explorer filter vocabulary plus standard list query parameters.

**Tags:** Memory

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `q` | `string` | no |  |  | Search query (full-text filter across relevant fields) |
| `sort_by` | `string` | no |  |  | Field to sort by |
| `sort_dir` | `string` | no |  |  | Sort direction |
| `entity_type` | `string` | no |  |  | Filter to entities or nodes of this wiki-graph type |
| `edge_origin` | `string` | no |  |  | Filter edges by provenance origin (knowledge graph vs mirrored operational links) |
| `fact_layer` | `string` | no |  |  | Filter edges by fact layer |
| `include_candidates` | `boolean` | no |  |  | When true, include entities only reachable via candidate edges |
| `include_superseded` | `boolean` | no |  |  | When true, include entities only reachable via superseded edges |
| `confidence_min` | `string` | no |  |  | Minimum confidence threshold for edges |
| `status` | `string` | no |  |  | Filter edges by trust status |
| `sensitivity` | `string` | no |  |  | Filter edges or entities by memory sensitivity label |
| `predicate` | `string` | no |  |  | Filter to entities linked by this predicate |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `MemoryEntityList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `reportMemoryEntityQuestion`

`POST` `/memory/entities/{stable_id}/report-question`

**Summary:** Memory: Report entity as questionable

**Description:** Creates or reuses an open question linked to the knowledge entity. Does not modify graph edges — corrections flow through OpenQuestion only.

**Tags:** Memory

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `stable_id` | `string` | yes | Entity stable ID to flag as questionable |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Existing open question reused for this user and entity | `MemoryReportedQuestion` |
| 201 | New open question created | `MemoryReportedQuestion` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

## Notifications

### `getNotificationPreferences`

`GET` `/notifications/preferences`

**Summary:** Notifications: Get preference matrix

**Description:** Returns the effective preference matrix (all registered types × channels), merging registry defaults with stored user rows. Absence of a stored row means the registry default applies.

**Tags:** Notifications

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `NotificationPreferencesMatrix` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listNotifications`

`GET` `/notifications`

**Summary:** Notifications: List (paginated)

**Description:** Returns paginated notifications for the authenticated user, newest first.

**Tags:** Notifications

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `sort_by` | `string` | no |  |  | Field to sort by |
| `sort_dir` | `string` | no |  |  | Sort direction |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `NotificationList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `markAllNotificationsRead`

`POST` `/notifications/read-all`

**Summary:** Notifications: Mark all as read

**Description:** Marks all unread notifications for the authenticated user as read. Idempotent.

**Tags:** Notifications

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK — returns updated unread count (always 0) | `NotificationReadResult` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `markNotificationRead`

`POST` `/notifications/{id}/read`

**Summary:** Notifications: Mark one as read

**Description:** Marks a single notification as read. Idempotent — calling it a second time returns 200 with no error.

**Tags:** Notifications

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `NotificationReadResult` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `updateNotificationPreferences`

`PUT` `/notifications/preferences`

**Summary:** Notifications: Update preferences

**Description:** Saves deviations from defaults. Rows matching the registry default are deleted (sparse storage); rows differing from defaults are upserted.

**Tags:** Notifications

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `NotificationPreferencesUpdate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK — returns the updated effective preference matrix | `NotificationPreferencesMatrix` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

## OntologyProposals

### `approveOntologyProposal`

`POST` `/ontology-proposals/{uuid}/approve`

**Summary:** Ontology: Approve proposal (admin)

**Description:** Enqueues KG_ONTOLOGY_APPLY for a pending proposal. Requires ADMIN role.

**Tags:** OntologyProposals

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Approval accepted | `OntologyProposalApproveResult` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `listOntologyProposals`

`GET` `/ontology-proposals`

**Summary:** Ontology: List proposals (admin)

**Description:** Returns paginated ontology proposals for human review. Requires ADMIN role.

**Tags:** OntologyProposals

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `status` | `string` | no |  |  |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Paginated ontology proposals | `OntologyProposalList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |

---

### `rejectOntologyProposal`

`POST` `/ontology-proposals/{uuid}/reject`

**Summary:** Ontology: Reject proposal (admin)

**Description:** Marks a pending proposal as rejected without changing the graph. Requires ADMIN role.

**Tags:** OntologyProposals

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Proposal rejected | `OntologyProposalRejectResult` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

## Processes

### `listProcesses`

`GET` `/processes`

**Summary:** Processes: List registered processes (admin)

**Description:** Returns the catalog of all registered background processes. Requires ADMIN role.

**Tags:** Processes

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Process catalog | `ProcessCatalogList` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |

---

## Projects

### `assignTaskToProject`

`POST` `/projects/{uuid}/tasks`

**Summary:** Projects: Assign task

**Description:** Assigns a task to the project. Requires EDIT on the task (TASK_MANAGE_LINKS tier). Idempotent. Rejects if the task already inherits the project from an ancestor. When assigning an ancestor, absorbs redundant descendant assignments in the same transaction. Rejects assigning to an archived project.


**Tags:** Projects

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Project UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `ProjectTaskAssign`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Assignment result | `ProjectTaskAssignResult` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access. | `AccessDeniedProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Conflict — resource already exists. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `createProject`

`POST` `/projects`

**Summary:** Projects: Create

**Description:** Creates a project. Leadership/Admin only. Title is case-insensitive unique.

**Tags:** Projects

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `ProjectCreate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 201 | Created | `ProjectDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 409 | Conflict — resource already exists. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `deleteProject`

`DELETE` `/projects/{uuid}`

**Summary:** Projects: Hard delete

**Description:** Permanently deletes the project and all its link rows (cascade). Leadership/Admin only.

**Tags:** Projects

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | Deleted |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getProject`

`GET` `/projects/{uuid}`

**Summary:** Projects: Get detail

**Description:** Returns project detail including linked repositories.

**Tags:** Projects

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Project UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `ProjectDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getProjectTaskTree`

`GET` `/projects/{uuid}/tasks`

**Summary:** Projects: Task tree

**Description:** Nested task tree for a project. Roots are directly assigned tasks with no assigned ancestor in the same project (after viewer visibility filtering). Leadership/Admin see all; others see only tasks from taskViewerAccessWhere. Archived tasks are excluded; done tasks are included.


**Tags:** Projects

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Nested task tree | `ProjectTaskTree` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `linkRepositoryToProject`

`POST` `/projects/{uuid}/repositories`

**Summary:** Projects: Link repository

**Description:** Links a repository to a project (informational). Leadership/Admin only. Idempotent.

**Tags:** Projects

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes |  |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `ProjectRepositoryLink`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Project detail after link | `ProjectDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listProjects`

`GET` `/projects`

**Summary:** Projects: List (paginated)

**Description:** Returns paginated projects. Default hides archived projects (`archived=false`). `task_count` is viewer-scoped (Leadership/Admin see all; others see only tasks reachable via taskViewerAccessWhere).


**Tags:** Projects

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `q` | `string` | no |  |  | Search query (full-text filter across relevant fields) |
| `sort_by` | `string` | no |  |  | Field to sort by |
| `sort_dir` | `string` | no |  |  | Sort direction |
| `archived` | `string` | no |  |  | Archive filter. `false` (default) = non-archived only; `true` = archived only; `all` = both.
 |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Paginated project list | `ProjectList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `unassignTaskFromProject`

`DELETE` `/projects/{uuid}/tasks/{taskUuid}`

**Summary:** Projects: Unassign task

**Description:** Removes the direct task↔project assignment. Requires EDIT on the task.

**Tags:** Projects

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Project UUID |
| `taskUuid` | `string/uuid` | yes | Task UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | Unassigned |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access. | `AccessDeniedProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `unlinkRepositoryFromProject`

`DELETE` `/projects/{uuid}/repositories/{repositoryUuid}`

**Summary:** Projects: Unlink repository

**Description:** Removes a repository link from a project. Leadership/Admin only.

**Tags:** Projects

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes |  |
| `repositoryUuid` | `string/uuid` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Project detail after unlink | `ProjectDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `updateProject`

`PATCH` `/projects/{uuid}`

**Summary:** Projects: Update

**Description:** Updates title, description, and/or archive flag. Leadership/Admin only.

**Tags:** Projects

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes |  |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `ProjectUpdate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Updated | `ProjectDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Conflict — resource already exists. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

## Repositories

### `createRepository`

`POST` `/repositories`

**Summary:** Repositories: Create

**Description:** Creates a new repository entry. Admin only.

**Tags:** Repositories

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `RepositoryCreate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 201 | Created | `Repository` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 409 | Conflict — resource already exists. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `deleteRepository`

`DELETE` `/repositories/{source}/{workspace}/{slug}`

**Summary:** Repositories: Delete

**Description:** Deletes a repository entry. Admin only.

**Tags:** Repositories

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `source` | `string` | yes | Repository source |
| `workspace` | `string` | yes | Repository workspace |
| `slug` | `string` | yes | Repository slug |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | No Content |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `disableRepositoryCodeSearch`

`DELETE` `/repositories/{source}/{workspace}/{slug}/code-search`

**Summary:** Repositories: Disable code search

**Description:** Disables code search for the repository. Sets codeSearchEnabled=false and deletes all RepositoryCodeCheckout rows for this repository. Requires the MANAGE_REPOSITORIES capability.

**Tags:** Repositories

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `source` | `string` | yes | Repository source |
| `workspace` | `string` | yes | Repository workspace |
| `slug` | `string` | yes | Repository slug |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | Code search disabled |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `enableRepositoryCodeSearch`

`POST` `/repositories/{source}/{workspace}/{slug}/code-search`

**Summary:** Repositories: Enable code search

**Description:** Enables code search for the repository. Sets codeSearchEnabled=true and creates a RepositoryCodeCheckout row for the default branch with status NOT_CLONED. Requires the MANAGE_REPOSITORIES capability.

**Tags:** Repositories

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `source` | `string` | yes | Repository source |
| `workspace` | `string` | yes | Repository workspace |
| `slug` | `string` | yes | Repository slug |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Code search enabled |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `getRepository`

`GET` `/repositories/{source}/{workspace}/{slug}`

**Summary:** Repositories: Get detail

**Description:** Returns the repository detail. Available to all authenticated users.

**Tags:** Repositories

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `source` | `string` | yes | Repository source |
| `workspace` | `string` | yes | Repository workspace |
| `slug` | `string` | yes | Repository slug |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `RepositoryDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getRepositoryRunStatus`

`GET` `/repositories/{source}/{workspace}/{slug}/run-status`

**Summary:** Repositories: Get current run status

**Description:** Returns only the latest run summaries (doc, ingest, code checkout) for a single repository. Intended for focused polling while a run is active — avoids reloading the full list. Available to all authenticated users with VIEW_REPOSITORIES capability.

**Tags:** Repositories

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `source` | `string` | yes | Repository source |
| `workspace` | `string` | yes | Repository workspace |
| `slug` | `string` | yes | Repository slug |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `RepositoryRunStatus` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getRepositorySyncHistory`

`GET` `/repositories/{source}/{workspace}/{slug}/sync-history`

**Summary:** Repositories: Get recent sync runs

**Description:** Returns the last 10 sync run timestamps for a repository. Requires VIEW_REPOSITORIES capability.

**Tags:** Repositories

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `source` | `string` | yes | Repository source |
| `workspace` | `string` | yes | Repository workspace |
| `slug` | `string` | yes | Repository slug |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `RepositorySyncHistory` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `listDocRunModels`

`GET` `/repositories/doc-run-models`

**Summary:** Repositories: List doc-run models

**Description:** Returns the list of bedrock models available for per-repository doc-runs, plus the current global default model ref.

**Tags:** Repositories

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `DocRunModelList` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listRepositories`

`GET` `/repositories`

**Summary:** Repositories: List all

**Description:** Returns all repositories. Available to all authenticated users.

**Tags:** Repositories

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `RepositoryList` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listRepositoryDocRuns`

`GET` `/repositories/{source}/{workspace}/{slug}/doc-runs`

**Summary:** Repositories: List documentation runs

**Description:** Returns the last 20 documentation runs for a repository, ordered newest first. Requires VIEW_REPOSITORIES capability.

**Tags:** Repositories

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `source` | `string` | yes | Repository source |
| `workspace` | `string` | yes | Repository workspace |
| `slug` | `string` | yes | Repository slug |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `DocRunList` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `syncRepository`

`POST` `/repositories/{source}/{workspace}/{slug}/sync`

**Summary:** Repositories: Sync document tree

**Description:** Accepts a full document-tree snapshot and upserts it into the database. Protected by service token (Authorization Bearer).

**Tags:** Repositories

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `source` | `string` | yes | Repository source |
| `workspace` | `string` | yes | Repository workspace |
| `slug` | `string` | yes | Repository slug |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `SyncPayload`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `SyncResult` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `triggerRepositoryCodeSync`

`POST` `/repositories/{source}/{workspace}/{slug}/code-sync`

**Summary:** Repositories: Trigger code sync

**Description:** Triggers an immediate code sync for the repository via repo-mcp. Returns 202 immediately; the sync runs asynchronously in repo-mcp. Observable via GET /repositories (latest_code_checkout). Requires the MANAGE_REPOSITORIES capability.

**Tags:** Repositories

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `source` | `string` | yes | Repository source |
| `workspace` | `string` | yes | Repository workspace |
| `slug` | `string` | yes | Repository slug |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 202 | Sync triggered; status visible via GET /repositories |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Code search not enabled for this repository |  |

---

### `triggerRepositoryDocRun`

`POST` `/repositories/{source}/{workspace}/{slug}/document`

**Summary:** Repositories: Trigger a documentation run

**Description:** Starts a fire-and-forget documentation run for the repository and returns immediately with the new run id. Progress is observable via the doc-runs endpoint. Requires the MANAGE_REPOSITORIES capability.

**Tags:** Repositories

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `source` | `string` | yes | Repository source |
| `workspace` | `string` | yes | Repository workspace |
| `slug` | `string` | yes | Repository slug |

**Request body:**

- Content-Type: `application/json`
- Required: no
- Schema: `DocRunTriggerRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 202 | Accepted — the run was created and is processing. | `DocRunTriggerResponse` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `triggerRepositoryIngestFromPr`

`POST` `/repositories/{source}/{workspace}/{slug}/ingest-from-pr`

**Summary:** Repositories: Trigger a manual PR ingest

**Description:** Starts an in-process ingest run that fetches .aura/docs/ documents from the aura/docs branch via the Bitbucket API and ingests them into the database and pgvector. Only available for BITBUCKET repositories. Returns immediately with the new run id; progress is observable via GET /repositories (latest_ingest_run). Requires the MANAGE_REPOSITORIES capability.

**Tags:** Repositories

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `source` | `string` | yes | Repository source |
| `workspace` | `string` | yes | Repository workspace |
| `slug` | `string` | yes | Repository slug |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 202 | Accepted — the ingest run was created and is processing. | `IngestRunTriggerResponse` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `updateRepository`

`PATCH` `/repositories/{source}/{workspace}/{slug}`

**Summary:** Repositories: Update

**Description:** Updates displayName and/or description of a repository. Admin only.

**Tags:** Repositories

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `source` | `string` | yes | Repository source |
| `workspace` | `string` | yes | Repository workspace |
| `slug` | `string` | yes | Repository slug |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `RepositoryPatch`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `Repository` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

## RouterMisses

### `listRouterMisses`

`GET` `/router-misses`

**Summary:** Router Misses: List (paginated, admin-only)

**Description:** Returns paginated unclassified intents captured by the router. Requires VIEW_ROUTER_MISSES capability (ADMIN only).

**Tags:** RouterMisses

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `q` | `string` | no |  |  | Search query (full-text filter across relevant fields) |
| `sort_by` | `string` | no |  |  | Field to sort by |
| `sort_dir` | `string` | no |  |  | Sort direction |
| `status` | `string` | no |  |  | Filter by intent status |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `RouterMissList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

## Runs

### `cancelRun`

`POST` `/runs/{uuid}/cancel`

**Summary:** Runs: Cancel a running run (admin)

**Description:** Sets the run status to CANCELLING and signals the pg-boss job to abort cooperatively. The worker sets CANCELLED once the process exits. Requires ADMIN role.

**Tags:** Runs

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Cancel accepted (status CANCELLING) or already CANCELLING (idempotent) | `CancelRunResult` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Run is already in a terminal state (SUCCEEDED, FAILED, or CANCELLED) | `ProblemDetail` |

---

### `getRun`

`GET` `/runs/{uuid}`

**Summary:** Runs: Get run detail (admin)

**Description:** Returns the full detail of a single run (AgentRun or ScriptRun). Requires ADMIN role.

**Tags:** Runs

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Run detail | `RunDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `listAgentRunEvents`

`GET` `/runs/{uuid}/events`

**Summary:** Runs: List structured events for a run

**Description:** Returns persisted agent-run events (reasoning, tool calls, …) for a given run. Pass afterSeq for lossless reconnect (returns only events with seq > afterSeq). Any authenticated user may access runs they can see.

**Tags:** Runs

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | List of agent run events | `AgentRunEventList` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `listRuns`

`GET` `/runs`

**Summary:** Runs: List all runs (admin)

**Description:** Returns a paginated list of all runs across all process kinds, read from the run_overview view. Requires ADMIN role.

**Tags:** Runs

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `status` | `string` | no |  |  | Filter by run status |
| `kind` | `string` | no |  |  | Filter by run kind (e.g. DOC_RUN, DOC_INGEST, SKILL_IMPORT) |
| `category` | `string` | no |  |  | Filter by run category (AGENT or SCRIPT) |
| `repository_id` | `integer` | no |  |  | Filter by repository ID |
| `trigger` | `string` | no |  |  | Filter by trigger type |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Paginated list of runs | `RunOverviewList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |

---

### `retryRun`

`POST` `/runs/{uuid}/retry`

**Summary:** Runs: Retry a failed run (admin)

**Description:** Resets a FAILED run to PENDING and re-queues its pg-boss job with the same run UUID. Requires ADMIN role.

**Tags:** Runs

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Retry accepted — run reset to PENDING and job re-queued | `RetryRunResult` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Run is not FAILED, or the job could not be re-queued | `ProblemDetail` |

---

## Search

### `unifiedSearch`

`POST` `/search`

**Summary:** Search: Unified semantic search

**Description:** Semantic search across one or more source types in a single request. Per-type authorization is enforced silently — unauthorized types are excluded from results without returning 403.

**Tags:** Search

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `UnifiedSearchRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `UnifiedSearchResponse` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |
| 503 | Embedding provider unavailable | `ProblemDetail` |

---

## Signals

### `createTaskFromSignal`

`POST` `/signals/{uuid}/create-task`

**Summary:** Signals: Create task from signal

**Description:** Creates an Aura task prefilled from the signal (summary + evidence). Idempotent when a primary task link already exists.

**Tags:** Signals

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK (existing link) or created | `SignalCreateTaskResponse` |
| 201 | Task created | `SignalCreateTaskResponse` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getSignal`

`GET` `/signals/{uuid}`

**Summary:** Signals: Get detail

**Description:** Returns a signal with evidence and review history.

**Tags:** Signals

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `SignalDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listSignals`

`GET` `/signals`

**Summary:** Signals: List inbox (paginated)

**Description:** Returns paginated planning signals for product intelligence review.

**Tags:** Signals

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `status` | `string` | no |  |  | Filter by signal status |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `SignalList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `reviewSignal`

`POST` `/signals/{uuid}/review`

**Summary:** Signals: Review (acknowledge, dismiss, snooze)

**Description:** Records a human review action and updates signal status.

**Tags:** Signals

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes |  |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `SignalReviewRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `SignalDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

## Skills

### `confirmSkillImport`

`POST` `/skills/import/confirm`

**Summary:** Confirm import of selected skills and start background indexing

**Tags:** Skills

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `SkillImportConfirmRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 202 | Import accepted; indexing started in background | `SkillImportRun` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | import_token not found or expired |  |

---

### `createSkill`

`POST` `/skills`

**Summary:** Create a skill

**Description:** Creates a new SKILL document in the canonical Skills space. Visibility defaults to PERSONAL.

**Tags:** Skills

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `SkillCreate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 201 | Created skill | `Skill` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |

---

### `deleteSkill`

`DELETE` `/skills/{uuid}`

**Summary:** Delete a skill (owner only)

**Tags:** Skills

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | Deleted |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `deleteSkillAsset`

`DELETE` `/skills/{uuid}/assets/{assetId}`

**Summary:** Delete a skill asset (owner only)

**Tags:** Skills

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |
| `assetId` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | Deleted |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `deleteSkillPlugin`

`DELETE` `/skills/plugins/{uuid}`

**Summary:** Delete a skill plugin (admin only)

**Description:** Deletes the plugin folder and every skill, reference document, embedding chunk and stored asset below it. Requires the MANAGE_SKILLS capability.

**Tags:** Skills

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Deleted | `SkillPluginDeleteResult` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `downloadSkillAsset`

`GET` `/skills/{uuid}/assets/{assetId}`

**Summary:** Download a skill asset

**Tags:** Skills

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |
| `assetId` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Asset binary content |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `getActiveSkillImportRun`

`GET` `/skills/import/runs/active`

**Summary:** Get the active skill import run for the current user

**Description:** Returns the most recent PENDING or RUNNING skill import run triggered by the current user, or null if no active run exists.

**Tags:** Skills

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Active run or null | `ActiveSkillImportRun` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |

---

### `getSkill`

`GET` `/skills/{uuid}`

**Summary:** Get a skill

**Tags:** Skills

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Skill detail including body | `Skill` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `getSkillImportRun`

`GET` `/skills/import/runs/{uuid}`

**Summary:** Poll the status of a skill import run

**Tags:** Skills

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Run status | `SkillImportRun` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `listSkillAssets`

`GET` `/skills/{uuid}/assets`

**Summary:** List assets attached to a skill

**Tags:** Skills

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Asset list | `SkillAssetList` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `listSkillPlugins`

`GET` `/skills/plugins`

**Summary:** List skill plugins

**Description:** Returns all top-level plugin folders in the Skills space with their skill counts.

**Tags:** Skills

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | List of skill plugins | `SkillPluginList` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |

---

### `listSkills`

`GET` `/skills`

**Summary:** List skills

**Description:** Returns a paginated list of skills visible to the current user (own PERSONAL + all PUBLIC).

**Tags:** Skills

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `q` | `string` | no |  |  | Exact text search on skill name/description |
| `visibility` | `string` | no |  |  | Filter by visibility scope |
| `plugin_id` | `string/uuid` | no |  |  | Filter by parent plugin folder UUID |
| `sort_by` | `string` | no |  |  |  |
| `sort_dir` | `string` | no |  |  |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Paginated list of skills | `SkillList` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |

---

### `saveSkillBody`

`PUT` `/skills/{uuid}/body`

**Summary:** Save skill body (owner only)

**Tags:** Skills

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `SkillBodySave`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Updated skill | `Skill` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `setSkillVisibility`

`PUT` `/skills/{uuid}/visibility`

**Summary:** Publish or retract a skill (owner only)

**Tags:** Skills

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `SkillVisibilityUpdate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Updated skill | `Skill` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `updateSkill`

`PATCH` `/skills/{uuid}`

**Summary:** Update skill metadata (title, frontmatter)

**Tags:** Skills

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `SkillUpdate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Updated skill | `Skill` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `uploadSkillAsset`

`POST` `/skills/{uuid}/assets`

**Summary:** Upload an asset to a skill (owner only)

**Tags:** Skills

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Request body:**

- Content-Type: `multipart/form-data`
- Required: yes
- Schema (inline): `{"type":"object","required":["file"],"properties":{"file":{"type":"string","format":"binary"}}}`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 201 | Created asset | `SkillAsset` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `validateSkillImport`

`POST` `/skills/import/validate`

**Summary:** Upload a plugin ZIP and receive a validation preview

**Tags:** Skills

**Request body:**

- Content-Type: `multipart/form-data`
- Required: yes
- Schema (inline): `{"type":"object","required":["file"],"properties":{"file":{"type":"string","format":"binary"}}}`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Preview of the ZIP contents | `PluginZipPreview` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 413 | ZIP too large |  |

---

## Tags

### `listTags`

`GET` `/tags`

**Summary:** Tags: List (paginated, with usage count)

**Description:** Returns paginated tags. Supports full-text search via `q` (prefix match on name/slug) for autocomplete and a paginated list view with usage counts.

**Tags:** Tags

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `q` | `string` | no |  |  | Search query (full-text filter across relevant fields) |
| `sort_by` | `string` | no |  |  | Field to sort by |
| `sort_dir` | `string` | no |  |  | Sort direction |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Paginated list of tags with usage counts | `TagList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

## Tasks

### `abortOwnerSearch`

`POST` `/tasks/{uuid}/owner-search/abort`

**Summary:** Tasks: Abort owner search

**Description:** Clears looking_for_owner_at, rejects open applications, and sets the given user as sole owner (T18 · S10, ANW-7748). Leadership-gated. Abort without an owner is not allowed.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `OwnerSearchAssign`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Owner search aborted; owner set | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Task is not in owner search, or has no owner to resume with. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `acceptTaskStoryPointEstimate`

`POST` `/tasks/{uuid}/story-points/accept`

**Summary:** Tasks: Accept a chat-proposed story-point estimate

**Description:** Writes the AI estimate that `task_estimate_story_points` proposed (trigger `chat`). Answers 409 HUMAN_OVERRIDE when a human correction is in effect. Requires task EDIT access.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID (must match the proposal) |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `StoryPointAcceptInput`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Task detail after the estimate was accepted | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Conflict — resource already exists. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `addTaskMember`

`POST` `/tasks/{uuid}/members`

**Summary:** Tasks: Add member

**Description:** Adds a user as a member of a task. Accepts userId (integer) or userUuid (UUID string).

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskMemberRef`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Member added; returns updated task detail | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Conflict — resource already exists. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `applyAsCrew`

`POST` `/tasks/{uuid}/crew-search/apply`

**Summary:** Tasks: Apply as crew

**Description:** Creates or refreshes a USER_TO_OWNER crew request while looking_for_crew_at is set (T18 · S11, ANW-7759). Open to any logged-in user — the company-wide access exception makes the marketplace transparent.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: no
- Schema: `TaskCrewRequestCreate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Crew application recorded | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Task is not looking for crew. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `applyForOwner`

`POST` `/tasks/{uuid}/owner-search/applications`

**Summary:** Tasks: Apply as owner

**Description:** Applies (or re-applies after withdrawal) as owner while looking_for_owner_at is set (T18 · S10, ANW-7748). Open to any logged-in user — the company-wide access exception makes the marketplace transparent.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskOwnerApplicationCreate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Application recorded | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Task is not looking for an owner. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `assignOwnerFromSearch`

`POST` `/tasks/{uuid}/owner-search/owner`

**Summary:** Tasks: Assign owner during owner search

**Description:** Leadership manually sets the task owner while looking_for_owner_at is set (T18 · S10, ANW-7748) — an applicant (application = consent) or an audited override of a non-applicant. Accepts the chosen applicant, rejects the rest, clears looking_for_owner_at, notifies only the chosen owner. Does not change the workflow status.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `OwnerSearchAssign`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Owner assigned | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Task is not in owner search. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `attachTagToTask`

`POST` `/tasks/{uuid}/tags`

**Summary:** Tasks: Attach a tag

**Description:** Attaches a tag to a task by slug. Creates the tag if it does not exist yet (upsert-by-slug). Idempotent. Task must be owned by the current user.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskTagAttach`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Tag attached; returns updated task detail | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `batchUpsertTaskPhaseGoals`

`PUT` `/tasks/{uuid}/phase-goals`

**Summary:** Tasks: Batch-save phase goals (deadline + text) for intermediate goals

**Description:** Atomically upserts (or, for a cleared row, deletes) one or more phase-goal rows (T18 · S28, ANW-7516; frontend redesign). Each row's target status must be part of the task's resolved status series and must not already have been reached (i.e. its index in the series must be >= the task's current status), otherwise 400. A row with `deadline: null` and an empty `goal_description` deletes that phase goal instead of upserting it. Requires EDIT access.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskPhaseGoalBatchUpsert`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Phase goals saved; returns updated task detail | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `clearTaskAsap`

`DELETE` `/tasks/{uuid}/asap`

**Summary:** Tasks: Clear ASAP

**Description:** Owner-only (AURA-930 / AURA-1147, d-017). Removes the ASAP mark; the task keeps its rank untouched (d-012). Writes `task.asap_cleared` when the task was ASAP; a no-op otherwise.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | ASAP cleared | `TaskAsapState` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `confirmCrewRemoval`

`POST` `/tasks/{uuid}/crew-search/removal/confirm`

**Summary:** Tasks: Confirm crew removal

**Description:** Confirms a pending crew-removal proposal and removes the crew member's granted role (T18 · S11, ANW-7759).


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskCrewRemovalAction`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Crew removal confirmed | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | No pending crew removal exists. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `createAsanaTaskForTask`

`POST` `/tasks/{uuid}/asana-tasks/create`

**Summary:** Tasks: Create the Asana counterpart

**Description:** Creates the Asana object for a task and links it in the same step (S6, AURA-1423). Where it is created follows the nearest ancestor that is already linked to Asana: under a linked parent task it becomes a subtask, under a linked project it is created in that project. The caller's own connected Asana account is used (Settings → Integrations); there is no service account. Error responses carry a `type` discriminator: 409 when no account is connected (`not_connected`), the stored token is unusable (`token_invalid`) or the task already has an Asana object (`already_linked`); 422 when no target could be derived (`no_target`, nothing was created); 502 on an upstream Asana error (`error`) — including the case where the object was created but linking it failed, in which case the message names the created gid. Chat-free by design — no MCP or agent tool exposes this.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Asana object created and linked; returns updated task detail | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access. | `AccessDeniedProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Asana not connected, token invalid, or task already linked | `AsanaTaskCreateProblemDetail` |
| 422 | No Asana target could be derived from the task's ancestors | `AsanaTaskCreateProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |
| 502 | Upstream Asana error | `AsanaTaskCreateProblemDetail` |

---

### `createTask`

`POST` `/tasks`

**Summary:** Tasks: Create

**Description:** Creates a new task. The authenticated user is automatically set as the creator and first owner.

**Tags:** Tasks

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskCreate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 201 | Task created | `TaskListItem` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 422 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `createTaskJiraIssue`

`POST` `/tasks/{uuid}/jira-issues/create`

**Summary:** Tasks: Create and link a Jira issue

**Description:** Creates a Jira issue from the task's derived fields, mirrors it locally, and links it to the task — the same create → mirror → link chain the chat confirmation uses, guarded by a row lock so two concurrent clicks cannot create two issues (AURA-1239). On a race, returns 200 with `already_linked: true` instead of a duplicate. If the issue was created in Jira but the local link failed, still returns 201 with `linking_warning` set — the next sync repairs it.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskJiraIssueCreateRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Task was already linked by a concurrent request; no new issue was created | `TaskJiraIssueCreateResult` |
| 201 | Jira issue created and linked | `TaskJiraIssueCreateResult` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access. | `AccessDeniedProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Jira is not connected for this user | `TaskJiraIssueCreateProblemDetail` |
| 422 | Task is a saga, or the upstream Jira creation failed | `TaskJiraIssueCreateProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `createTaskRelation`

`POST` `/tasks/{uuid}/relations`

**Summary:** Tasks: Create a relation

**Description:** Creates a typed, directed relation from this task to another task. Self-edges (from == to) are rejected. Duplicate (from, to, type) triples are rejected with 409.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID (source of the relation) |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskRelationCreate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Relation created; returns updated task detail | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Relation already exists (duplicate) | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `debugTriggerTaskActivity`

`POST` `/tasks/{uuid}/activity/debug`

**Summary:** Tasks: DEBUG — fire sample activity event

**Description:** DEBUG only. Fires a sample task.status_changed activity event for human-test verification. Will be removed when the Timeline UI (ANW-7056) is delivered.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Activity event created |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `declineCrewRemoval`

`POST` `/tasks/{uuid}/crew-search/removal/decline`

**Summary:** Tasks: Decline crew removal

**Description:** Declines a pending crew-removal proposal and keeps the crew member's granted role in place (T18 · S11, ANW-7759).


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskCrewRemovalAction`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Crew removal declined | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | No pending crew removal exists. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `deleteTaskRelation`

`DELETE` `/tasks/{uuid}/relations/{id}`

**Summary:** Tasks: Delete a relation

**Description:** Removes a typed relation by its UUID. The relation must belong to the task identified by uuid.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID (source of the relation) |
| `id` | `string/uuid` | yes | Relation UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Relation deleted; returns updated task detail | `TaskDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `detachTagFromTask`

`DELETE` `/tasks/{uuid}/tags/{slug}`

**Summary:** Tasks: Detach a tag

**Description:** Removes the tag-task link. The tag itself is not deleted. Idempotent.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |
| `slug` | `string` | yes | Tag slug |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Tag detached; returns updated task detail | `TaskDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `discardTask`

`POST` `/tasks/{uuid}/discard`

**Summary:** Tasks: Discard

**Description:** Aborts a task to DISCARDED from any non-terminal status (T18 · S05, ANW-7525, matrix #16). Owner-only, reversible via the reopen endpoint. Ends Crew/Stakeholder membership (roles cleared, member row kept).


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskDiscard`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Task discarded | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Task is already in a terminal status. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `draftTaskRankReason`

`POST` `/tasks/{uuid}/rank-reason/draft`

**Summary:** Tasks: Draft an ordering rationale

**Description:** Owner-only (AURA-930 / AURA-1147, d-015). Generates a short rationale draft from the task's content via the utility model. Never persisted — the owner edits it and publishes via PUT rank-reason.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Draft generated | `TaskRankReasonDraft` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |
| 502 | The draft could not be generated. | `ProblemDetail` |

---

### `endCrewSearch`

`POST` `/tasks/{uuid}/crew-search/end`

**Summary:** Tasks: End crew search

**Description:** Clears looking_for_crew_at and closes open crew requests while keeping the task in its current workflow status (T18 · S11, ANW-7759). Requires task-level MANAGE access or a Leadership/Admin system override.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Crew search ended | `TaskDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Task is not in crew search. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `estimateTaskStoryPoints`

`POST` `/tasks/{uuid}/story-points/estimate`

**Summary:** Tasks: Run the AI story-point estimator

**Description:** Runs the STORY_POINT_ESTIMATE agent once and appends an AI history row (including a reasoned refusal). A technical abort writes no row. Requires task EDIT access. Only Stories and Sub-Tasks are eligible.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Task detail after the estimate was written | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |
| 502 | The estimate could not be generated. | `ProblemDetail` |

---

### `getAsanaCreateTargetForTask`

`GET` `/tasks/{uuid}/asana-tasks/create-target`

**Summary:** Tasks: Resolve where the Asana counterpart would be created

**Description:** Names the target the create dialog would write into (S6, AURA-1423), derived from the nearest ancestor that is already linked to Asana — the same resolution the write path runs, so preview and write cannot disagree. Reads only Aura's mirror: no Asana call, no connected account required. 409 (`already_linked`) when the task already has a counterpart, 422 (`no_target`) when no ancestor is linked or the linked ancestor belongs to no project.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Resolved Asana target | `AsanaCreateTarget` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access. | `AccessDeniedProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | The task already has an Asana counterpart | `AsanaTaskCreateProblemDetail` |
| 422 | No Asana target could be derived from the task's ancestors | `AsanaTaskCreateProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getMyPriorityQueue`

`GET` `/tasks/my-priority`

**Summary:** Tasks: My derived priority order

**Description:** AURA-930 / AURA-1146: the caller's work in the one order derived from every context ordering — ASAP first, then the depth-first walk of the ranked tree (sagas, then the root:unparented pseudo-context), then the freely choosable tasks below a deliberately unordered level, then everything without a rank. The set is the caller's active core-role memberships on living tasks. Not paginated: the whole queue is computed once and shared by the dashboard panel (capped at ten client-side) and the person slideover (which shows all of it). An optional `limit` bounds `items`; omitted, the whole queue comes back.

**Tags:** Tasks

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `limit` | `integer` | no |  |  | Maximum number of queue entries. Omitted returns the whole queue; `total` and `unordered_count` always describe the whole queue, so a bounded answer says how much it left out. |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | The caller's derived priority order | `MyPriorityQueue` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getPersonPriorityQueue`

`GET` `/tasks/members/{userIdOrUuid}/priority`

**Summary:** Tasks: A person's derived priority order, filtered to the caller's access

**Description:** AURA-930 / AURA-1148: the target person's complete derived priority order (same computation as `getMyPriorityQueue`), opened from the assignee name in the ordering dialog's card footer. Every task the caller may not read (d-022) is folded into an anonymous placeholder — its block and rank stay, so the sequence is complete and countable, but title, key, status and deadline never leave the server.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `userIdOrUuid` | `string` | yes | User integer ID or UUID of the target person. |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | The target person's derived priority order, as the caller may read it | `PersonPriorityQueue` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getTask`

`GET` `/tasks/{uuid}`

**Summary:** Tasks: Get detail

**Description:** Returns the full detail of a task including the member list. 404 when no task exists for the UUID; 403 (ANW-7662) when the task exists but the caller lacks (sufficient) access — `meta.reason` distinguishes no relationship at all (`no_access`) from insufficient permission for the action (`insufficient_permission`), and `meta.owners` names who can grant more access.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `TaskDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access. | `AccessDeniedProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getTaskBoard`

`GET` `/tasks/board`

**Summary:** Tasks: Board diagram data (unpaginated)

**Description:** Returns every task the caller can access — direct membership, ancestor membership (inherited) or a TaskAccessGrant, i.e. the same scope as GET /tasks?view=all — together with its hierarchy edges and typed relation edges in a single payload.

Deliberately NOT a paginated list (ANW-7802): the board renders one spatial diagram whose auto-layout can only be computed once every node and edge is known. Paging would either produce a layout that reshuffles with each page or force the client to walk all pages before drawing anything, so the 1–100 cap of the shared list-query schema does not apply here. The payload is bounded by the caller's access scope (low hundreds of tasks) and carries only the slim fields the board card needs, not the full TaskListItem.

Archived tasks (archivedAt set) and tasks with status DISCARDED are excluded; both filters are orthogonal and applied separately.

The caller's stored card positions and viewport (ANW-7805) ship with the same payload: fetching them separately would show every card first at its auto-layout spot and only then at its stored position, i.e. make the whole board visibly jump. Positions of tasks outside this payload are ignored (not returned, not deleted).

**Tags:** Tasks

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `TaskBoard` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getTaskByHumanKey`

`GET` `/tasks/by-key/{key}`

**Summary:** Tasks: Get by human-readable key

**Description:** Resolves a task via its human-readable identifier (e.g. "AURA-42", ANW-7570). 404 when the key is unknown or malformed; 403 (ANW-7662) when the task exists but the caller lacks access — naming the owner in `meta`. Returns the same payload as GET /tasks/{uuid} so opening a task by key costs a single request (ANW-7848).

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `key` | `string` | yes | Human-readable task identifier, e.g. "AURA-42" |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `TaskDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access. | `AccessDeniedProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getTaskByJiraKey`

`GET` `/tasks/by-jira-key/{key}`

**Summary:** Tasks: Get by Jira key

**Description:** Resolves a task via its linked Jira issue key. Matches the JiraIssue mirror for the key against the current user's connected Jira cloud site. 404 when the key is unknown, belongs to a different cloud site, or has no linked task; 403 (ANW-7662) when the task exists but the caller lacks access — naming the owner in `meta`. Returns the same detail shape as GET /mcp/tasks/{id}.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `key` | `string` | yes | Jira issue key, e.g. "ANW-7577" |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `McpTaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access. | `AccessDeniedProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getTaskCycleTimes`

`GET` `/tasks/{uuid}/cycle-times`

**Summary:** Tasks: Cycle times (stays on one task)

**Description:** Returns the derived stays of one task for the cycle-time display (AURA-1654): every PHASE interval in time order with duration computed at read time, the parallel owner/crew-search strand, and the reason of a status change joined from ActivityEvent. Not a list endpoint — a task typically has fewer than twenty intervals and the chronology needs them all. Whoever can read the task can read the durations; there is no extra capability.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `TaskCycleTimes` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getTaskGraph`

`GET` `/tasks/graph`

**Summary:** Tasks: Graph (nodes + edges, owner-scoped)

**Description:** Returns a renderer-agnostic { nodes, edges } graph for the authenticated user's tasks. Nodes are tasks and tags; edges are task-tag attachments and typed task-task relations. Honours the same filters as the task list (q, tags, tag_match). Task nodes carry a server-computed Louvain community for cluster colouring.

**Tags:** Tasks

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `q` | `string` | no |  |  | Search query (full-text filter across relevant fields) |
| `tags` | `string` | no |  |  | Comma-separated tag slugs to filter by |
| `tag_match` | `string` | no |  |  | Whether all (AND) or any (OR) of the given tag slugs must match (default all) |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `TaskGraph` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getTaskHierarchyGraph`

`GET` `/tasks/hierarchy-graph`

**Summary:** Tasks: Hierarchy Graph (directed tree, owner-scoped)

**Description:** Returns the owner's task tree as a directed { nodes, edges } graph. Nodes are tasks carrying their hierarchy level; edges point parent→child (directed). Reuses the same TaskGraph DTO as the tag graph. Only tasks owned by the authenticated user are included.

**Tags:** Tasks

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `TaskGraph` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getTaskJiraIssueDraft`

`GET` `/tasks/{uuid}/jira-issues/draft`

**Summary:** Tasks: Preview the Jira issue a task would create

**Description:** Derives the issue type, project, summary and description a Jira issue for this task would get, plus the allowed target statuses — so the "Create in Jira" dialog can render before the user commits (AURA-1239). Same derivation the chat's `jira_propose_issue` tool uses. The team is not derived: the user picks it in the dialog (AURA-1429).

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Draft issue fields | `TaskJiraIssueDraft` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access. | `AccessDeniedProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Task already has a linked Jira issue | `TaskJiraIssueDraftProblemDetail` |
| 422 | Task is a saga (no Jira equivalent) | `TaskJiraIssueDraftProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getTaskNeighborhood`

`GET` `/tasks/{uuid}/neighborhood`

**Summary:** Tasks: Hierarchy neighbourhood (scoped for the detail-view mini-map)

**Description:** Returns the local hierarchy neighbourhood of one task as slim card-shaped nodes: the ancestor chain to the root, its siblings (children of its direct parent), and its direct children. Each node carries the fields the shared task card renders (human_key, title, status, level, owners, my_roles, looking_for_owner_at) plus parent_task_id for layout and archived_at for agent consumers. Only parent-child hierarchy edges are included (no semantic TaskRelation edges). Returns an empty graph if the task has neither a parent nor children, so callers can hide the map. Mirrored as the MCP tool of the same name — agents should treat this as the neighbourhood of one task, not the full-tenant hierarchy graph. An optional `depth` bounds the ancestor chain; omitted, it reaches the root.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `depth` | `integer` | no |  |  | Ancestor hops to include. Omitted returns the chain to the root. |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `TaskNeighborhoodGraph` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getTaskRankContext`

`GET` `/tasks/{uuid}/rank-context`

**Summary:** Tasks: Read the priority-ordering context

**Description:** Both zones of the priority-ordering context this task belongs to (AURA-930 / AURA-1145): the ordered zone first (rank ascending), the unordered set behind it. Also returns the expected-state fingerprint the matching PUT must carry, and whether the caller may reorder at all. `scope=siblings` (default) is the context this task itself sits in; `scope=children` is the context of its direct children (`task:<this>`).


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `scope` | `string` | no |  |  | Which priority-ordering context to address (AURA-930). `siblings` (default) is the context the named task itself sits in; `children` is the context of its direct children (`task:<this>`).
 |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Ordering context | `TaskRankContext` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `inviteCrew`

`POST` `/tasks/{uuid}/crew-search/invite`

**Summary:** Tasks: Invite crew

**Description:** Creates or refreshes an OWNER_TO_USER crew request while looking_for_crew_at is set (T18 · S11, ANW-7759). Requires task-level MANAGE access or a Leadership/Admin system override.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskCrewInvite`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Crew invitation recorded | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Task is not looking for crew. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `linkArtifactToTask`

`POST` `/tasks/{uuid}/artifacts`

**Summary:** Tasks: Link an artifact

**Description:** Links an artifact to a task via the TaskArtifact join table. Idempotent — returns 200 if already linked. Returns 404 if the artifact does not belong to the current user or the task is not found.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskArtifactAttach`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Artifact linked; returns updated task detail | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `linkAsanaTaskToTask`

`POST` `/tasks/{uuid}/asana-tasks`

**Summary:** Tasks: Link an Asana object

**Description:** Links an existing Asana object (project or task) to a task by gid or permalink URL (S5, AURA-1422). Idempotent — returns 200 if already linked. If the object is not yet mirrored, it is fetched using the current user's own connected Asana account (Settings → Integrations); an already-mirrored object never requires a token. Error responses carry a `type` discriminator: 409 when no Asana account is connected and the object is not mirrored (`not_connected`), when the stored token is no longer usable (`token_invalid`), or when another task already owns the object (`already_linked`); 404 when the gid does not exist in Asana (`not_found`); 502 on an upstream Asana error (`error`). A 403 comes from the per-object access layer instead and is discriminated by `meta.reason`. Chat-free by design — no MCP or agent tool exposes this.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskAsanaTaskAttach`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Asana object linked; returns updated task detail | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access. | `AccessDeniedProblemDetail` |
| 404 | Asana object not found | `AsanaTaskLinkProblemDetail` |
| 409 | Asana not connected, token invalid, or already linked | `AsanaTaskLinkProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |
| 502 | Upstream Asana error | `AsanaTaskLinkProblemDetail` |

---

### `linkChatToTask`

`POST` `/tasks/{uuid}/chats`

**Summary:** Tasks: Link a chat

**Description:** Links a chat to a task by setting Chat.taskId. Idempotent — returns 200 if already linked. Returns 404 if the chat does not belong to the current user.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskChatAttach`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Chat linked; returns updated task detail | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `linkJiraIssueToTask`

`POST` `/tasks/{uuid}/jira-issues`

**Summary:** Tasks: Link a Jira issue

**Description:** Fetches and mirrors the Jira issue by key, then creates an idempotent TaskJiraIssue link. Idempotent — returns 200 if already linked. Error responses carry a `type` discriminator: 409 when no Jira account is connected (`not_connected`), when the stored token is no longer usable (`token_invalid`), or when another task already owns the issue (`already_linked`); 404 when the issue key does not exist in Jira (`not_found`); 502 on an upstream Jira error (`error`). A 403 comes from the per-object access layer instead and is discriminated by `meta.reason`.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskJiraIssueAttach`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Jira issue linked; returns updated task detail | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access. | `AccessDeniedProblemDetail` |
| 404 | Jira issue not found | `JiraIssueLinkProblemDetail` |
| 409 | Jira not connected, token invalid, or already linked | `JiraIssueLinkProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |
| 502 | Upstream Jira error | `JiraIssueLinkProblemDetail` |

---

### `linkRepositoryToTask`

`POST` `/tasks/{uuid}/repositories`

**Summary:** Tasks: Link a repository

**Description:** Links a repository to a task via the TaskRepository join table. Idempotent — returns 200 if already linked. When `branch` is provided, it is stored (or updated) on the link (ANW-7785).

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskRepositoryAttach`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Repository linked; returns updated task detail | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listLookingForCrewTasks`

`GET` `/tasks/looking-for-crew`

**Summary:** Tasks: Crew-search pool (paginated, company-wide)

**Description:** Lists every task with looking_for_crew_at set (T18 · S11, ANW-7759). Company-wide read: visible to every logged-in user regardless of membership/grant. Read-only entry point — a row click opens the shared task detail where the crew-finding panel lives. Each item carries crew_need, crew_need_due_date, and crew_request_count.


**Tags:** Tasks

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `q` | `string` | no |  |  | Search query (full-text filter across relevant fields) |
| `sort_by` | `string` | no |  |  | Field to sort by |
| `sort_dir` | `string` | no |  |  | Sort direction |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Paginated crew-search pool | `TaskList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listLookingForOwnerTasks`

`GET` `/tasks/looking-for-owner`

**Summary:** Tasks: Owner-search pool (paginated, company-wide)

**Description:** Lists every task with looking_for_owner_at set (T18 · S10, ANW-7748). Company-wide read: visible to every logged-in user regardless of membership/grant. Read-only entry point — a row click opens the shared task detail where the owner-finding panel lives. Each item carries owner_goal, owner_goal_due_date, and owner_application_count.


**Tags:** Tasks

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `q` | `string` | no |  |  | Search query (full-text filter across relevant fields) |
| `sort_by` | `string` | no |  |  | Field to sort by |
| `sort_dir` | `string` | no |  |  | Sort direction |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Paginated owner-search pool | `TaskList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listTaskActivity`

`GET` `/tasks/{uuid}/activity`

**Summary:** Tasks: List activity events

**Description:** Returns paginated activity events for a task (TASK-scoped, newest first). Requires task membership.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  |  |
| `limit` | `integer` | no |  |  |  |
| `sort_dir` | `string` | no |  |  | Sort direction (default desc = newest first) |
| `type` | `string` | no |  |  | Filter to a single activity type code (e.g. "task.status_changed") to read the status-transition history without a second parallel log. |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Paginated list of activity events | `ActivityEventList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listTasks`

`GET` `/tasks`

**Summary:** Tasks: List (paginated)

**Description:** Returns paginated tasks the caller can see (membership, inherited access, and access grants). There is no default status filter; archived tasks are hidden unless archived=all or archived=true. related_to is member-scoped only and then applies status_slug, status_type, type, and archived.

**Tags:** Tasks

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `q` | `string` | no |  |  | Search query (full-text filter across relevant fields) |
| `sort_by` | `string` | no |  |  | Field to sort by |
| `sort_dir` | `string` | no |  |  | Sort direction |
| `status_slug` | `string` | no |  |  | Comma-separated TaskStatus values to filter by (e.g. "OPEN,IN_DEVELOPMENT") |
| `status_type` | `string` | no |  |  | Filter by status activity class, not by progress. Comma-separated; values: OPEN, WAITING, ACTIVE, TERMINAL. Note that OPEN is the single status OPEN (nobody has picked the task up yet) — it is not a synonym for "not finished"; for everything that is not finished, pass OPEN,WAITING,ACTIVE. A progress-based cut ("not deployed yet") cannot be expressed here, because the four classes cut across the status series — use status_slug with an explicit list of statuses for that. There is no value named "open": if a user asks for "the open tasks", ask which of the two readings they mean instead of guessing. |
| `type` | `string` | no |  |  | Comma-separated task types (FEATURE, BUG, IDEA, CHORE, DISCOVERY). Multiple values are OR. |
| `archived` | `string` | no |  |  | Archived visibility (orthogonal to status): false (default) hides archived, true only archived, all both |
| `view` | `string` | no |  |  | Tab filter: all member tasks (default), tasks where the user has no role (no_role), or tasks created by the current user (mine) |
| `role` | `string` | no |  |  | A TaskRole enum value — returns only tasks where the current user is a member with this role. Takes precedence over view when both are set. |
| `tags` | `string` | no |  |  | Comma-separated tag slugs to filter by |
| `tag_match` | `string` | no |  |  | Whether all (AND) or any (OR) of the given tag slugs must match (default all) |
| `level` | `string` | no |  |  | Filter by hierarchy level (SAGA, EPIC, STORY, SUBTASK) |
| `related_to` | `string/uuid` | no |  |  | Return tasks that are 1-hop neighbours of the task with this UUID (member-scoped) |
| `relation_type` | `string` | no |  |  | Restrict the related_to query to a specific relation type |
| `parent_task_id` | `string/uuid` | no |  |  | Return only direct children of the task with this UUID (member-scoped, other filters apply) |
| `parent_eligible` | `boolean` | no |  |  | When true, return only tasks that can act as a parent (have a level assigned and are not SUBTASK). Useful for parent-picker search in the create form. |
| `parent_eligible_for_level` | `string` | no |  |  | Level-dependent successor of parent_eligible (AURA-1226): keep only tasks whose level may act as parent for a task at this target level — SUBTASK yields STORY only, STORY yields EPIC/SAGA, EPIC yields SAGA only, SAGA yields no candidates at all. Takes precedence over parent_eligible when both are given. Used by the guided level-change dialog's candidate list. |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `TaskList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listTaskStoryPointEstimates`

`GET` `/tasks/{uuid}/story-points`

**Summary:** Tasks: List story-point history

**Description:** Append-only estimate history for a task, newest first. Readable with task READ access. Does not change the effective value.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `limit` | `integer` | no |  |  | Maximum number of history rows to return. |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | History listed | `StoryPointEstimateList` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `markTaskCommentsRead`

`POST` `/tasks/{uuid}/comments/read`

**Summary:** Tasks: Mark comments as read

**Description:** Advances the viewer's comment-read watermark for this task to the `last_rendered_at` timestamp (the `createdAt` of the newest comment actually rendered). Access is any viewer with READ on the task (membership not required). The watermark only moves forward.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `MarkTaskCommentsReadRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | Watermark advanced (or already at/past the given timestamp). |  |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `markTaskRead`

`POST` `/tasks/{uuid}/read`

**Summary:** Tasks: Mark as read

**Description:** Marks the task as read for the current user (idempotent). Sets readAt to now() only if it is currently null.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | Marked as read (or already was read). |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |

---

### `overrideCrewRemoval`

`POST` `/tasks/{uuid}/crew-search/removal/override`

**Summary:** Tasks: Override crew removal

**Description:** Leadership/Admin override: removes a crew member directly without the counterpart's confirmation, while still writing the audit trail (T18 · S11, ANW-7759).


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskCrewRemovalAction`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Crew removal overridden | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Target user is not an active crew member. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `previewTaskLevelCascade`

`GET` `/tasks/{uuid}/level-cascade-preview`

**Summary:** Tasks: Preview a level-change cascade

**Description:** Read-only dry run of the level-change cascade (AURA-1226): validates the
requested `level` (+ optional `parent_task_id`) exactly as `PATCH /tasks/{uuid}`
would, and — if the task already has a level and it would change — computes
which descendants would be re-leveled (and, per the simple take-over-or-reset
rule, whether their status resets to OPEN) plus which of them the caller lacks
`TASK_EDIT_CONTENT` on. Nothing is persisted. Powers the guided restructure
dialog's preview step before the actual submit.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `level` | `string` | yes |  |  | The level to preview moving this task to. |
| `parent_task_id` | `string` | no |  |  | New parent UUID to validate together with the level. Omit to keep the current parent; pass an empty string to explicitly clear it (e.g. promoting to SAGA, which takes no parent) — a query string cannot carry a real `null` the way the PATCH body can. |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | The cascade this level change would produce | `TaskLevelCascadePreview` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `proposeCrewRemoval`

`POST` `/tasks/{uuid}/crew-search/removal/propose`

**Summary:** Tasks: Propose crew removal

**Description:** Starts a consensual removal flow for a single crew member. May be initiated by the owner/manage side or by the crew member themselves (T18 · S11, ANW-7759).


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskCrewRemovalAction`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Crew removal proposed | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Target user is not an active crew member. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `proposeTaskStoryPointEstimate`

`POST` `/tasks/{uuid}/story-points/propose`

**Summary:** Tasks: Propose a story-point size without recording it

**Description:** Runs the STORY_POINT_ESTIMATE agent once and returns the result without writing a history row — the caller decides whether it becomes one. Requires task EDIT access. Only Stories and Sub-Tasks are eligible.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | The proposed size, unrecorded | `StoryPointProposal` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |
| 502 | The estimate could not be generated. | `ProblemDetail` |

---

### `recordTaskProgress`

`POST` `/tasks/{uuid}/activity`

**Summary:** Tasks: Record a progress activity event

**Description:** Records a task.progress activity event carrying an AI-generated free-text note plus a short skill-phase label (e.g. "implement", "refine", "wave 2/3"). Used by the local task-lifecycle skills to give continuous, low-effort visibility of local progress in the Aura Timeline. Marks the event is_ai_generated=true; the actor stays the calling user/PAT owner. Never triggers notifications.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema (inline): `{"type":"object","required":["note","phase"],"properties":{"note":{"type":"string","minLength":1,"maxLength":2000,"description":"Short, AI-written sentence describing what is happening."},"phase":{"type":"string","minLength":1,"maxLength":60,"description":"Short skill-phase label (e.g. \"implement\", \"refine\"), finer-grained than the Aura status."},"step":{"type":"string","minLength":1,"maxLength":60,"description":"Optional finer-grained step within the phase (e.g. \"wave 2/3\")."}}}`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Progress activity event created |  |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `removeTaskMember`

`DELETE` `/tasks/{uuid}/members/{userIdOrUuid}`

**Summary:** Tasks: Remove member

**Description:** Removes a user from the member list of a task. Returns 409 if trying to remove the last member, or the last owner (assign another owner first, or start an owner search).

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |
| `userIdOrUuid` | `string` | yes | User integer ID or UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Member removed; returns updated task detail | `TaskDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Conflict — resource already exists. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `reopenTask`

`POST` `/tasks/{uuid}/reopen`

**Summary:** Tasks: Reopen

**Description:** Reopens a DONE or DISCARDED task onto an owner-chosen ACTIVE status of its series (T18 · S05, ANW-7525, matrix #17 / reopen-after-DONE). Owner-only.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskReopen`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Task reopened | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Task is not in a reopenable status. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `reorderTaskRankContext`

`PUT` `/tasks/{uuid}/rank-context`

**Summary:** Tasks: Apply a new order to the context

**Description:** Writes the complete target order of the context in one transaction (AURA-930 / AURA-1145, d-016). Every task named in `ordered_task_ids` gets its position (1…n) in that order; every other living task in the context becomes unordered. Requires edit permission on the context. `expected_state` is the fingerprint the order was computed against — if the context has moved on, the save is rejected with 409 and the response carries the current context in `meta.context`. `scope` selects which context is addressed — siblings (default) or the children of the named task.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | UUID of a task in the context being reordered |

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `scope` | `string` | no |  |  | Which priority-ordering context to address (AURA-930). `siblings` (default) is the context the named task itself sits in; `children` is the context of its direct children (`task:<this>`).
 |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskRankContextOrder`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Order applied; the new context state | `TaskRankContext` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | The ordering changed since the client read it. `meta.context` holds the state that actually applies.
 | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `respondCrewRequest`

`POST` `/tasks/{uuid}/crew-search/respond`

**Summary:** Tasks: Respond to crew request

**Description:** Confirms or declines a pending crew request. USER_TO_OWNER requests are answered by the owner/manage side; OWNER_TO_USER requests are answered by the invited user (T18 · S11, ANW-7759).


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskCrewRespond`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Crew request answered | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | No matching pending crew request exists. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `saveTaskBoardLayout`

`PUT` `/tasks/board/layout`

**Summary:** Tasks: Save board card positions and viewport (bulk)

**Description:** Writes the caller's own board layout: card positions in bulk plus, optionally, the viewport. Deliberately narrow — the board's read path is GET /tasks/board; this endpoint only persists layout, never task data.

The first snapshot of a board covers several hundred positions and goes out as ONE call, not one request per card.

`mode` decides what happens to positions that already exist:
* `upsert` (default) — overwrite. Used for a single moved card and for
  Reset, which overwrites the stored snapshot (it never deletes it,
  otherwise the next session would start without positions).
* `create_only` — create missing positions, leave existing ones
  untouched. Used for the first snapshot: two tabs opened at the same
  time would otherwise overwrite each other's freshly written positions
  and the cards would jump on the next load.


Positions naming a task the caller cannot access (or that no longer exists) are skipped, not rejected: a snapshot of several hundred cards is written seconds after the board was read, and one task discarded in between must not fail the whole write.

**Tags:** Tasks

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskBoardLayoutWrite`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `TaskBoardLayoutWriteResult` |
| 400 | Bad request - the request payload is malformed or invalid. | `ProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `setTaskAsap`

`PUT` `/tasks/{uuid}/asap`

**Summary:** Tasks: Mark ASAP

**Description:** Owner-only (AURA-930 / AURA-1147, d-017). Marks the task ASAP; the response carries the current ASAP stock — the sole counter-pressure against inflation, since there is no cap and no expiry. Writes `task.asap_set`. Idempotent when already ASAP.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | ASAP set; the current stock | `TaskAsapState` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `setTaskMemberRoles`

`PUT` `/tasks/{uuid}/members/{userIdOrUuid}/roles`

**Summary:** Tasks: Set member roles

**Description:** Replaces all roles assigned to a task member (idempotent set-replace) with a fixed set of TaskRole enum values. Returns 409 if the replacement would remove the last owner (assign another owner first, or start an owner search).

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |
| `userIdOrUuid` | `string` | yes | User integer ID or UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskMemberRolesReplaceRequest`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Roles replaced; returns updated task detail | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Conflict — resource already exists. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `setTaskRankLock`

`PUT` `/tasks/{uuid}/rank-lock`

**Summary:** Tasks: Lock or unlock a priority-ordering context

**Description:** Owner-only (AURA-930 / AURA-1150, d-019): locks or unlocks the context this task anchors against reordering by anyone but its OWNER. The two root contexts ("root:sagas", "root:unparented") have no single owner and can never be locked — a lock attempt on one answers 403. ASAP is unaffected and stays owner-only regardless (S4). `scope=children` locks the children-context of the named task (its own `rankLockedAt`); `scope=siblings` (default) locks the context it sits in.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | UUID of a task in the context to lock or unlock |

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `scope` | `string` | no |  |  | Which priority-ordering context to address (AURA-930). `siblings` (default) is the context the named task itself sits in; `children` is the context of its direct children (`task:<this>`).
 |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema (inline): `{"type":"object","required":["locked"],"properties":{"locked":{"type":"boolean","description":"Target lock state."}}}`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Lock state applied; the current context state | `TaskRankContext` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `setTaskRankReason`

`PUT` `/tasks/{uuid}/rank-reason`

**Summary:** Tasks: Publish the ordering rationale

**Description:** Owner-only (AURA-930 / AURA-1147, d-004). Publishes the optional, always-visible rationale for the task's placement — including one edited from an LLM draft. Publishing is always attributed to the acting owner.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskRankReasonInput`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Rationale saved | `TaskRankReasonState` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `setTaskStoryPoints`

`POST` `/tasks/{uuid}/story-points`

**Summary:** Tasks: Set or withdraw a human story-point correction

**Description:** Appends a HUMAN history row (set or withdraw) and rewrites the cached effective value. Only Stories and Sub-Tasks are eligible. Requires task EDIT access. `key` null withdraws the human correction so the latest AI estimate with a value becomes effective again.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `StoryPointWriteInput`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Task detail with the new effective value | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `startCrewSearch`

`POST` `/tasks/{uuid}/crew-search`

**Summary:** Tasks: Start crew search

**Description:** Sets looking_for_crew_at on an Epic/Story (phase-preserving), stores the durable crew_need + optional crew_need_due_date, and leaves the workflow status unchanged (T18 · S11, ANW-7759). Requires task-level MANAGE access or a Leadership/Admin system override.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `CrewSearchRelease`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Crew search started | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 422 | Crew need missing or invalid. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `startOwnerSearch`

`POST` `/tasks/{uuid}/owner-search`

**Summary:** Tasks: Start owner search

**Description:** Sets looking_for_owner_at on an Epic/Story (phase-preserving), stores the durable owner_goal + owner_goal_due_date, and strips OWNER from the previous owner (T18 · S10, ANW-7748). Leadership-gated (RELEASE_OWNER_SEARCH). Goal and due date are required.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `OwnerSearchRelease`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Owner search started | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 422 | Owner goal or due date missing. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `suggestOwnerGoal`

`POST` `/tasks/{uuid}/owner-goal`

**Summary:** Tasks: Suggest owner goal (AI)

**Description:** Generates a one-sentence owner mandate via Claude Haiku from the task's title, description, scope, and linked PLAN body when present (T18 · S10, ANW-7748). Leadership-gated (RELEASE_OWNER_SEARCH). Does not persist — the client edits and submits via owner-search start.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Suggested one-sentence owner goal | `OwnerGoalSuggestion` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `unlinkArtifactFromTask`

`DELETE` `/tasks/{uuid}/artifacts/{artifactUuid}`

**Summary:** Tasks: Unlink an artifact

**Description:** Removes the artifact-task link. The artifact itself is not deleted.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |
| `artifactUuid` | `string/uuid` | yes | Artifact UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Artifact unlinked; returns updated task detail | `TaskDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `unlinkAsanaTaskFromTask`

`DELETE` `/tasks/{uuid}/asana-tasks/{asanaTaskUuid}`

**Summary:** Tasks: Unlink an Asana object

**Description:** Removes the Asana link from a task. The mirrored AsanaTask record itself is not deleted — it survives and reappears unlinked in /asana-tasks. Nothing is cleaned up on the Asana side.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |
| `asanaTaskUuid` | `string/uuid` | yes | AsanaTask UUID (the mirrored record's id, returned in asana_tasks[].id) |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Asana object unlinked; returns updated task detail | `TaskDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - per-object access denied (ANW-7662). `meta.reason` is `no_access` (no relationship to the object at all) or `insufficient_permission` (has some access, but not enough for this action); `meta.owners` names who can grant more access. | `AccessDeniedProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `unlinkChatFromTask`

`DELETE` `/tasks/{uuid}/chats/{chatUuid}`

**Summary:** Tasks: Unlink a chat

**Description:** Removes the chat-task link by setting Chat.taskId to null. The chat itself is not deleted.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |
| `chatUuid` | `string/uuid` | yes | Chat UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Chat unlinked; returns updated task detail | `TaskDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `unlinkJiraIssueFromTask`

`DELETE` `/tasks/{uuid}/jira-issues/{jiraIssueUuid}`

**Summary:** Tasks: Unlink a Jira issue

**Description:** Removes the Jira issue link from a task. The mirrored JiraIssue record itself is not deleted.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |
| `jiraIssueUuid` | `string/uuid` | yes | JiraIssue UUID (the mirrored record's id, returned in jira_issues[].id) |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Jira issue unlinked; returns updated task detail | `TaskDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `unlinkRepositoryFromTask`

`DELETE` `/tasks/{uuid}/repositories/{repositoryUuid}`

**Summary:** Tasks: Unlink a repository

**Description:** Removes the repository-task link. The repository itself is not deleted.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |
| `repositoryUuid` | `string/uuid` | yes | Repository UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Repository unlinked; returns updated task detail | `TaskDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `updateCrewSearch`

`PATCH` `/tasks/{uuid}/crew-search`

**Summary:** Tasks: Update crew search

**Description:** Updates crew_need and/or crew_need_due_date on a running crew search (AURA-1651). At least one field is required. The due date is a calendar day and may be cleared. Requires task-level MANAGE access or a Leadership/Admin system override.


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `CrewSearchUpdate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Crew search updated | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Task is not in crew search. | `ProblemDetail` |
| 422 | Neither field provided, or invalid due date. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `updateOwnerSearch`

`PATCH` `/tasks/{uuid}/owner-search`

**Summary:** Tasks: Update owner search

**Description:** Updates owner_goal and/or owner_goal_due_date on a running owner search (AURA-1651). At least one field is required. The due date is a calendar day and cannot be cleared. Leadership-gated (RELEASE_OWNER_SEARCH).


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `OwnerSearchUpdate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Owner search updated | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Task is not in owner search. | `ProblemDetail` |
| 422 | Neither field provided, or due date cleared. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `updateTask`

`PATCH` `/tasks/{uuid}`

**Summary:** Tasks: Update

**Description:** Updates title, description, level, parent, type, archived state and/or status of a task. Raising `level` to SAGA or EPIC requires the matching CREATE_SAGA / CREATE_EPIC capability (ANW-7864); otherwise responds 403. Promoting or demoting a task (e.g. SUBTASK → STORY) is a **single call** with both `level` and `parent_task_id` set together — a level-only change usually fails hierarchy validation on its own because the existing parent is no longer at a valid level for the new target. The default new parent when promoting is the current parent's own parent (the grandparent), which makes the promoted task a sibling of its former parent. If the level change would leave existing children with an invalid parent, they cascade one level in the same direction (AURA-1226) and their status is carried over where the target series still has it, otherwise reset to OPEN — the response's `HIERARCHY_ERROR` detail names any child this would push beyond the SAGA..SUBTASK depth limits instead of applying a partial change.

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskPatch`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Task updated | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `updateTaskMemberParticipation`

`PATCH` `/tasks/{uuid}/members/{userIdOrUuid}/participation`

**Summary:** Tasks: Update member participation

**Description:** Self-declared update of a task member's participation sentence and/or status. Authorization is intentionally loose in v1, matching the roles endpoint (any member may set any member's participation).

**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |
| `userIdOrUuid` | `string` | yes | User integer ID or UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskMemberParticipationUpdate`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Participation updated; returns updated task detail | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `withdrawCrewRequest`

`POST` `/tasks/{uuid}/crew-search/withdraw`

**Summary:** Tasks: Withdraw crew request

**Description:** Withdraws a pending crew request. USER_TO_OWNER requests are withdrawn by the applicant; OWNER_TO_USER requests are withdrawn by the owner/manage side (T18 · S11, ANW-7759).


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `TaskCrewWithdrawal`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Crew request withdrawn | `TaskDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | No matching pending crew request exists. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `withdrawOwnerApplication`

`DELETE` `/tasks/{uuid}/owner-search/applications`

**Summary:** Tasks: Withdraw own owner application

**Description:** Withdraws the acting user's own pending owner application (T18 · S10, ANW-7748).


**Tags:** Tasks

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string/uuid` | yes | Task UUID |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Application withdrawn | `TaskDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | No active application to withdraw. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

## UserGroups

### `addUserGroupMember`

`POST` `/user-groups/{uuid}/members`

**Summary:** UserGroups: Add member

**Description:** Adds a user to a group with a LEAD or MEMBER role. Rejects duplicates with 409. Leadership/Admin only.

**Tags:** UserGroups

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `UserGroupMemberAddInput`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | The updated user group with its members | `UserGroupDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 409 | Conflict — resource already exists. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `createUserGroup`

`POST` `/user-groups`

**Summary:** UserGroups: Create

**Description:** Creates a new user group. Leadership/Admin only (MANAGE_USER_GROUPS). The group grants no permissions.

**Tags:** UserGroups

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `UserGroupCreateInput`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | The created user group | `UserGroupDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `deleteUserGroup`

`DELETE` `/user-groups/{uuid}`

**Summary:** UserGroups: Delete

**Description:** Deletes a user group and cascades its memberships (users are not affected). Leadership/Admin only.

**Tags:** UserGroups

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | Deleted |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `getUserGroup`

`GET` `/user-groups/{uuid}`

**Summary:** UserGroups: Get detail (with members)

**Description:** Returns one user group including its members (user uuid, display name, email, role). Leadership/Admin only.

**Tags:** UserGroups

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | The user group with its members | `UserGroupDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `listUserGroups`

`GET` `/user-groups`

**Summary:** UserGroups: List (paginated)

**Description:** Returns paginated user groups with member and lead counts. Leadership/Admin only (MANAGE_USER_GROUPS).

**Tags:** UserGroups

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `q` | `string` | no |  |  | Search query (full-text filter across relevant fields) |
| `sort_by` | `string` | no |  |  | Field to sort by |
| `sort_dir` | `string` | no |  |  | Sort direction |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | Paginated list of user groups | `UserGroupList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `removeUserGroupMember`

`DELETE` `/user-groups/{uuid}/members/{userUuid}`

**Summary:** UserGroups: Remove member

**Description:** Removes a member from a group. Idempotent — a missing membership returns 404, never 500. Leadership/Admin only.

**Tags:** UserGroups

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |
| `userUuid` | `string` | yes |  |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 204 | Removed |  |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `updateUserGroup`

`PATCH` `/user-groups/{uuid}`

**Summary:** UserGroups: Update name/description

**Description:** Updates the name and/or description of a user group. Leadership/Admin only.

**Tags:** UserGroups

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `UserGroupUpdateInput`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | The updated user group with its members | `UserGroupDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `updateUserGroupMemberRole`

`PATCH` `/user-groups/{uuid}/members/{userUuid}`

**Summary:** UserGroups: Change member role

**Description:** Changes a member's role to LEAD or MEMBER. Multiple leads are allowed. Leadership/Admin only.

**Tags:** UserGroups

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `uuid` | `string` | yes |  |
| `userUuid` | `string` | yes |  |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `UserGroupMemberRoleInput`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | The updated user group with its members | `UserGroupDetail` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

## Users

### `listUsers`

`GET` `/users`

**Summary:** Users: List all

**Description:** Returns paginated users with optional search, filter and sort. Admin only.

**Tags:** Users

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `page` | `integer` | no |  |  | Page number (1-based) |
| `limit` | `integer` | no |  |  | Number of items per page |
| `q` | `string` | no |  |  | Search query (full-text filter across relevant fields) |
| `sort_by` | `string` | no |  |  | Field to sort by |
| `sort_dir` | `string` | no |  |  | Sort direction |
| `role` | `string` | no |  |  | Filter by user role |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `UserList` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `searchUsers`

`GET` `/users/search`

**Summary:** Users: Search (picker)

**Description:** Searches users by display name or email. Available to all authenticated users. Minimum 2 characters required.

**Tags:** Users

**Query parameters:**

| Name | Type | Required | Style | Explode | Description |
|------|------|----------|-------|---------|-------------|
| `q` | `string` | yes |  |  | Search query (minimum 2 characters) |

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK |  |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---

### `updateUser`

`PATCH` `/users/{id}`

**Summary:** Users: Update role

**Description:** Updates the role of a user. Admin only. Self-demotion is not allowed.

**Tags:** Users

**Path parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string/uuid` | yes | User UUID |

**Request body:**

- Content-Type: `application/json`
- Required: yes
- Schema: `UserUpdateInput`

**Responses:**

| Code | Description | Schema |
|------|-------------|--------|
| 200 | OK | `User` |
| 400 | Validation error - query parameters or body failed validation. | `ValidationProblemDetail` |
| 401 | Unauthorized - missing or invalid session. | `ProblemDetail` |
| 403 | Forbidden - insufficient permissions. | `ProblemDetail` |
| 404 | Resource not found. | `ProblemDetail` |
| 500 | Internal server error. | `ProblemDetail` |

---
