// AuraClient interface + expressive domain types.
//
// This module owns the vocabulary the scripts (aura.ts, aura-digest.ts) and
// the /aura extension see when talking to Aura's REST API. It declares pure
// hand-written domain types — NO imports from ./generated/* (Q8: generated
// types never leak into the interface). Mapping to/from generated types
// happens only in the implementation (slice 3, HeyApiAuraClient).
//
// Field sets are the subset the scripts actually read + structurally required
// ones; loose tails use a bounded index signature where the API is genuinely
// open-ended (mirrors scripts/src/types.ts' defensive style).

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

export type ArtifactKind = "PLAN" | "REVIEW" | "GENERIC";

export interface Artifact {
  id: string;
  title: string;
  latest_version: number;
  version?: number;
  body?: string;
  summary: string | null;
  kind: ArtifactKind;
  created_at: string;
  updated_at: string;
  [k: string]: unknown;
}

export interface CreateArtifactInput {
  title: string;
  body: string;
  summary?: string;
  kind?: ArtifactKind;
}

export interface UpdateArtifactInput {
  id: string;
  mode: "section" | "whole";
  body: string;
  summary?: string;
  target_heading?: string;
  expected_version?: number;
  confirm_full_replace?: boolean;
}

export interface UpdateArtifactResult {
  status: string;
  id: string;
  title: string;
  version: number;
  mode: "section" | "whole";
  affected_heading?: string;
}

export interface ArtifactListItem {
  id: string;
  title: string;
  latest_version: number;
  created_at: string;
  updated_at: string;
  kind: ArtifactKind;
  pending_for_me?: boolean;
  [k: string]: unknown;
}

export interface ArtifactList {
  items: ArtifactListItem[];
  pagination: Pagination;
}

export interface ListArtifactsInput {
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Knowledge / wiki
// ---------------------------------------------------------------------------

export type KnowledgeNodeKind = "FOLDER" | "DOCUMENT" | "FILE";

export interface KnowledgeNode {
  id: string;
  space_id: string;
  space_slug?: string;
  kind: KnowledgeNodeKind;
  title: string;
  slug: string;
  latest_version: number;
  body?: string;
  [k: string]: unknown;
}

export interface SaveKnowledgeNodeBodyInput {
  uuid: string;
  body: string;
  summary?: string;
}

export interface WikiSearchInput {
  query: string;
  space_slug?: string;
  limit?: number;
}

export interface WikiSearchHit {
  id: string;
  space_slug: string;
  space_kind: string;
  title: string;
  url: string;
  heading_path: string[];
  excerpt: string;
  match_source: string;
}

export interface WikiSearchResult {
  items: WikiSearchHit[];
}

export interface KnowledgeTree {
  space_id: string;
  nodes: KnowledgeNode[];
}

export interface CreateKnowledgeNodeInput {
  space_slug: string;
  kind: "FOLDER" | "DOCUMENT";
  title: string;
  slug: string;
  parent_id?: string;
  order?: number;
}

// ---------------------------------------------------------------------------
// Upload documents
// ---------------------------------------------------------------------------

export interface UploadDocument {
  id: string;
  filename: string;
  mime_type: string;
  byte_size?: number;
  summary?: string;
  page_count?: number;
  ingest_status?: string;
  portal_url: string;
  pages: { page_number?: number; content?: string }[];
}

export interface CreateUploadDocumentInput {
  filename: string;
  content_base64: string;
  mime_type?: string;
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

export interface BoardBriefing {
  text?: string;
  generated_at?: string;
  [k: string]: unknown;
}

export interface BoardItem {
  kind?: string;
  task?: {
    uuid: string;
    human_key: string;
    title: string;
    status: string;
    status_type: string;
  };
  title?: string;
  since?: string;
  waiting_days?: number;
  link?: string;
  approvals_pending?: number;
  [k: string]: unknown;
}

export interface BoardBucket {
  count: number;
  items: BoardItem[];
}

export interface BoardSummary {
  overdue?: BoardBucket;
  waiting_on_me?: BoardBucket;
  waiting_on_others?: BoardBucket;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface Notification {
  id: string;
  type: string;
  read: boolean;
  created_at: string;
  [k: string]: unknown;
}

export interface NotificationList {
  items: Notification[];
  pagination: Pagination;
}

export interface ListNotificationsInput {
  limit?: number;
  sort_by?: string;
  sort_dir?: string;
  page?: number;
}

// ---------------------------------------------------------------------------
// My board — priority queue & capacity
// ---------------------------------------------------------------------------

export interface HumanKeyRef {
  id: string;
  title: string;
  level: string;
}

export interface PriorityQueueItem {
  id: string;
  human_key: string;
  title: string;
  status: string;
  status_type: string;
  level?: string;
  block: string;
  rank?: number;
  asap: boolean;
  blocked_by: string[];
  context_path: HumanKeyRef[];
  governing_date?: string;
  capacity_percent?: number;
}

export interface PriorityQueue {
  items: PriorityQueueItem[];
  total: number;
  unordered_count: number;
}

export interface CapacityTask {
  task_id: string;
  human_key: string;
  task_title: string;
  task_status: string;
  roles: string[];
  capacity_percent?: number;
  task_level?: string;
  hierarchy_path: HumanKeyRef[];
}

export interface Capacity {
  base_percent: number;
  committed_percent: number;
  free_percent: number;
  utilization_percent: number;
  over: boolean;
  base_capacity_note?: string;
  tasks: CapacityTask[];
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/** Provider hosting the repository: LOCAL, BITBUCKET, or GITHUB. */
export type RepositorySource = "LOCAL" | "BITBUCKET" | "GITHUB";

/** A repository linked to a task, with an optional feature branch.
 * Mirrors the Aura `TaskRepositoryRef`. `browse_url` is the provider-built
 * URL to the branch (null for LOCAL repos or when no branch is set). */
export interface TaskRepositoryRef {
  id: string;
  display_name: string;
  source: RepositorySource;
  workspace: string;
  slug: string;
  branch?: string | null;
  browse_url?: string | null;
}

export interface Task {
  id: string;
  human_key: string;
  title: string;
  description?: string;
  status: string;
  status_type: string;
  level?: string;
  jira_issues?: { issue_key: string; summary?: string }[];
  children?: { human_key: string; title?: string }[];
  /** Repositories linked to this task (Aura `TaskRepositoryRef`). */
  repositories?: TaskRepositoryRef[];
  /** Repositories linked to ancestor tasks (nearest-first, deduplicated). */
  inherited_repositories?: TaskRepositoryRef[];
  /** Suggested feature-branch name (ANW-7785); null only when human_key is missing. */
  suggested_branch?: string | null;
  [k: string]: unknown;
}

export interface TaskList {
  items: Task[];
  pagination: Pagination;
}

export interface ListTasksInput {
  role?: string;
  view?: string;
  status_slug?: string;
  limit?: number;
  page?: number;
  sort_by?: string;
  sort_dir?: string;
  status?: string;
  archived?: boolean;
  search?: string;
  tags?: string[];
  level?: string;
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Reviews / approvals
// ---------------------------------------------------------------------------

export interface OpenReview {
  user_id: string;
  user_name: string;
  decided: boolean;
}

export interface ApprovalDecision {
  user_name: string;
  decision: string;
  decided: boolean;
}

export interface ArtifactApprovals {
  version: number;
  latest_version: number;
  decided_count: number;
  total_required: number;
  open_reviews: OpenReview[];
  decisions: ApprovalDecision[];
}

export interface ReviewerStatus {
  user_id: string;
  user_name: string;
  status: string;
  [k: string]: unknown;
}

export interface ArtifactReview {
  version: number;
  review_state: string;
  reviewers: ReviewerStatus[];
  review_artifacts: { title?: string }[];
  initiator: { user_id: string; user_name: string } | null;
  review_started_at?: string;
  review_deadline_at?: string;
  is_initiator: boolean;
}

/** Task role whose members should be included as reviewers. */
export type ReviewerRole = "OWNER" | "CONTRIBUTOR" | "STAKEHOLDER";

/** Input for {@link AuraClient.startArtifactReview}. */
export interface StartArtifactReviewInput {
  id: string;
  version: number;
  roles: ReviewerRole[];
  user_ids: string[];
  deadline?: string;
}

/** Input for {@link AuraClient.submitArtifactDecision}. */
export interface SubmitArtifactDecisionInput {
  id: string;
  version: number;
  decision: "APPROVED" | "REJECTED";
}

// ---------------------------------------------------------------------------
// Blueprint files (house blueprint under engineering-foundation)
// ---------------------------------------------------------------------------

/** One file from the house blueprint (path under blueprint/ only).
 * `content` is utf8 or base64 per `encoding`; `checksum` is `sha256:<hex>`
 * over the raw bytes; `version` is the blueprint file version (integer). */
export interface BlueprintFile {
  /** Canonical slug path, lowercased (e.g. `blueprint/skills/ai-setup/skill.md`). */
  path: string;
  /** Verbatim upload name to write to disk (e.g. `SKILL.md`). */
  filename: string;
  encoding: "utf8" | "base64";
  content: string;
  /** SHA-256 over the raw bytes, prefixed `sha256:`. */
  checksum: string;
  version: number;
  provenance: {
    created_by_user_id: number | null;
    source_commit_sha: string | null;
  };
}

export interface GetBlueprintFilesInput {
  /** Slash-separated path under blueprint/ (file or skill directory). */
  path: string;
  /** Optional version pointer — `sha256:<hex>` checksum or integer latest_version. */
  version?: string;
}

export interface GetBlueprintFilesResult {
  ok: boolean;
  files: BlueprintFile[];
  error?: { code: string; detail: string };
}

// ---------------------------------------------------------------------------
// Knowledge node versions (for OLD_REMOTE reconstruction)
// ---------------------------------------------------------------------------

/** A specific historical version of a DOCUMENT node's body. */
export interface KnowledgeNodeVersion {
  id: string;
  node_id: string;
  version: number;
  body: string;
  summary: string | null;
  created_by_user_id: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// AuraClient interface — the ~21 exercised verbs
// ---------------------------------------------------------------------------

export interface AuraClient {
  // artifacts
  getArtifact(id: string): Promise<Artifact>;
  mcpCreateArtifact(input: CreateArtifactInput): Promise<Artifact>;
  mcpUpdateArtifact(input: UpdateArtifactInput): Promise<UpdateArtifactResult>;
  listArtifacts(opts?: ListArtifactsInput): Promise<ArtifactList>;
  // knowledge / wiki
  getKnowledgeNode(
    uuid: string,
    opts?: { includeBody?: boolean },
  ): Promise<KnowledgeNode>;
  getKnowledgeNodeByPath(
    spaceSlug: string,
    path: string,
    opts?: { includeBody?: boolean },
  ): Promise<KnowledgeNode>;
  saveKnowledgeNodeBody(input: SaveKnowledgeNodeBodyInput): Promise<KnowledgeNode>;
  mcpWikiSearch(input: WikiSearchInput): Promise<WikiSearchResult>;
  getKnowledgeTree(spaceSlug: string): Promise<KnowledgeTree>;
  createKnowledgeNode(input: CreateKnowledgeNodeInput): Promise<KnowledgeNode>;
  /** Fetch one file or every file in a skill directory from the house
   *  blueprint (engineering-foundation, path under blueprint/ only). Pass an
   *  optional `version` pin (sha256 checksum or integer version) to fetch a
   *  specific revision; omit for current. */
  getBlueprintFiles(input: GetBlueprintFilesInput): Promise<GetBlueprintFilesResult>;
  /** Get a specific (historical or current) version of a DOCUMENT node's
   *  body. `version` is the integer version number. */
  getKnowledgeNodeVersion(uuid: string, version: number): Promise<KnowledgeNodeVersion>;
  // upload documents
  mcpCreateUploadDocument(input: CreateUploadDocumentInput): Promise<UploadDocument>;
  mcpGetUploadDocument(id: string): Promise<UploadDocument>;
  // boards
  getBoardBriefing(opts?: { locale?: string; refresh?: boolean }): Promise<BoardBriefing>;
  getBoardSummary(): Promise<BoardSummary>;
  // notifications
  listNotifications(opts?: ListNotificationsInput): Promise<NotificationList>;
  // my board
  getMyPriorityQueue(): Promise<PriorityQueue>;
  getMyCapacity(): Promise<Capacity>;
  // lists
  listTasks(opts?: ListTasksInput): Promise<TaskList>;
  // reviews / approvals
  getArtifactApprovals(
    id: string,
    opts?: { version?: number },
  ): Promise<ArtifactApprovals>;
  getTaskByHumanKey(key: string): Promise<Task>;
  getArtifactReview(id: string): Promise<ArtifactReview>;
  requestArtifactReview(id: string): Promise<void>;
  startArtifactReview(input: StartArtifactReviewInput): Promise<void>;
  submitArtifactDecision(input: SubmitArtifactDecisionInput): Promise<void>;
  reopenArtifactReview(id: string, version: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// Slice 3 re-exports: HeyApiAuraClient + createDefaultAuraClient
// ---------------------------------------------------------------------------
// The impl lives in ./hey-api-aura-client.js (sibling file; keeps this
// interface file clean per arch spec open decision #2). Re-exported here so
// the single `@pi-aura/shared/aura-client` import path surfaces both the
// interface/types and the impl/factory.

export { HeyApiAuraClient, createDefaultAuraClient, AuraApiError } from "./hey-api-aura-client.js";
export type { HeyApiAuraClientOptions } from "./hey-api-aura-client.js";
