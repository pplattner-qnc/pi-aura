// HeyApiAuraClient — concrete AuraClient impl that delegates to the generated
// @hey-api/client-fetch SDK.
//
// This module imports generated types ONLY in private helpers; the public
// method signatures use the slice-2 domain types from ./aura-client.js (Q8:
// generated types never leak into the AuraClient interface).
//
// Each method maps domain input → generated SDK params/body, calls the
// matching generated SDK function with { client: this.client, ...params }
// (the `client` option overrides the default instance + its hardcoded
// baseUrl), unwraps the { data, error, response } shape, and returns `data`
// mapped to the domain output type — throwing on error.

import { createClient, type Client } from "@hey-api/client-fetch";
import type { Keyring } from "./keyring/index.js";
import { createKeyring } from "./keyring/index.js";
import { loadAuraClientSettings } from "./settings.js";
import type {
  Artifact,
  ArtifactApprovals,
  ArtifactList,
  ArtifactListItem,
  ArtifactReview,
  BlueprintFile,
  BoardBriefing,
  BoardSummary,
  Capacity,
  CapacityTask,
  CreateArtifactInput,
  CreateKnowledgeNodeInput,
  CreateUploadDocumentInput,
  GetBlueprintFilesInput,
  GetBlueprintFilesResult,
  KnowledgeNode,
  KnowledgeNodeVersion,
  KnowledgeTree,
  Notification,
  NotificationList,
  PriorityQueue,
  PriorityQueueItem,
  SaveKnowledgeNodeBodyInput,
  StartArtifactReviewInput,
  SubmitArtifactDecisionInput,
  Task,
  TaskList,
  UpdateArtifactInput,
  UpdateArtifactResult,
  UploadDocument,
  WikiSearchInput,
  WikiSearchResult,
  AuraClient,
} from "./aura-client.js";

// Generated SDK functions (the 21 exercised verbs).
import {
  getArtifact as genGetArtifact,
  mcpCreateArtifact as genMcpCreateArtifact,
  mcpUpdateArtifact as genMcpUpdateArtifact,
  listArtifacts as genListArtifacts,
  getKnowledgeNode as genGetKnowledgeNode,
  getKnowledgeNodeByPath as genGetKnowledgeNodeByPath,
  getKnowledgeNodeVersion as genGetKnowledgeNodeVersion,
  saveKnowledgeNodeBody as genSaveKnowledgeNodeBody,
  mcpWikiSearch as genMcpWikiSearch,
  getKnowledgeTree as genGetKnowledgeTree,
  createKnowledgeNode as genCreateKnowledgeNode,
  getBlueprintFiles as genGetBlueprintFiles,
  mcpCreateUploadDocument as genMcpCreateUploadDocument,
  mcpGetUploadDocument as genMcpGetUploadDocument,
  getBoardBriefing as genGetBoardBriefing,
  getBoardSummary as genGetBoardSummary,
  listNotifications as genListNotifications,
  getMyPriorityQueue as genGetMyPriorityQueue,
  getMyCapacity as genGetMyCapacity,
  listTasks as genListTasks,
  getArtifactApprovals as genGetArtifactApprovals,
  getTaskByHumanKey as genGetTaskByHumanKey,
  getArtifactReview as genGetArtifactReview,
  requestArtifactReview as genRequestArtifactReview,
  startArtifactReview as genStartArtifactReview,
  submitArtifactDecision as genSubmitArtifactDecision,
  reopenArtifactReview as genReopenArtifactReview,
} from "./generated/sdk.gen.js";

// Generated types — used ONLY inside private helpers / cast boundaries.
import type {
  ArtifactDetail as GArtifactDetail,
  ArtifactListItem as GArtifactListItem,
  ArtifactList as GArtifactList,
  ArtifactApprovalsResponse as GArtifactApprovalsResponse,
  ArtifactReviewOverview as GArtifactReviewOverview,
  ArtifactReviewPersonStatus as GReviewerStatus,
  ArtifactOpenReview as GOpenReview,
  ArtifactDecisionRequest as GArtifactDecisionRequest,
  ArtifactReviewStartRequest as GArtifactReviewStartRequest,
  ArtifactDecisionRecord as GApprovalDecision,
  BlueprintFile as GBlueprintFile,
  BoardSummary as GBoardSummary,
  BoardBriefing as GBoardBriefing,
  CapacityPersonal as GCapacityPersonal,
  CapacityTaskCommitment as GCapacityTaskCommitment,
  KnowledgeNode as GKnowledgeNode,
  KnowledgeTree as GKnowledgeTree,
  KnowledgeVersion as GKnowledgeVersion,
  McpUploadDocumentDetail as GUploadDocument,
  McpWikiSearchResponse as GWikiSearchResponse,
  MyPriorityItem as GMyPriorityItem,
  MyPriorityQueue as GMyPriorityQueue,
  Notification as GNotification,
  NotificationList as GNotificationList,
  Pagination as GPagination,
  TaskDetail as GTaskDetail,
  TaskListItem as GTaskListItem,
  TaskList as GTaskList,
  TaskJiraIssueRef as GTaskJiraIssueRef,
  TaskChildRef as GTaskChildRef,
  TaskHierarchyRef as GTaskHierarchyRef,
  PriorityBlockerRef as GPriorityBlockerRef,
  PriorityContextRef as GPriorityContextRef,
} from "./generated/types.gen.js";

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

/** Thrown when an SDK call returns a non-undefined `error`. Includes the HTTP
 * status and any server message so callers see a clear error. */
export class AuraApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(`Aura API error ${status}: ${message}`);
    this.name = "AuraApiError";
    this.status = status;
  }
}

/** Unwrap the SDK's { data, error, response } shape. Throw on error, return
 * the mapped data. The `mapper` converts the generated response (typed loosely
 * because @hey-api's RequestResult resolves `data` to `TData[keyof TData]`,
 * a union of response-body properties) to the domain type. */
async function unwrap<TDomain>(
  res: { data: unknown; error: unknown; response: Response },
  mapper: (d: unknown) => TDomain,
): Promise<TDomain> {
  if (res.error !== undefined) {
    const status = res.response?.status ?? 0;
    let msg = "unknown error";
    if (res.error && typeof res.error === "object" && "detail" in res.error) {
      msg = String((res.error as { detail: unknown }).detail);
    } else if (typeof res.error === "string") {
      msg = res.error;
    } else {
      msg = JSON.stringify(res.error);
    }
    throw new AuraApiError(status, msg);
  }
  if (res.data === undefined || res.data === null) {
    throw new AuraApiError(res.response?.status ?? 0, "empty response");
  }
  return mapper(res.data);
}

/** Extract a status + message from an SDK error response. */
function sdkErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "detail" in error) {
    return String((error as { detail: unknown }).detail);
  }
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}

/** Variant of {@link unwrap} for endpoints that return no body (HTTP 204 / 201 unknown).
 *  Checks for error then returns void; treats a null/undefined data as success. */
async function unwrapVoid(
  res: { data: unknown; error: unknown; response: Response },
): Promise<void> {
  if (res.error !== undefined) {
    const status = res.response?.status ?? 0;
    throw new AuraApiError(status, sdkErrorMessage(res.error));
  }
}

// ---------------------------------------------------------------------------
// Constructor options
// ---------------------------------------------------------------------------

export interface HeyApiAuraClientOptions {
  keyring: Keyring;
  baseUrl: string;
  /** Optional pre-validated PAT (avoids the double keyring read; open decision #3). */
  pat?: string;
}

// ---------------------------------------------------------------------------
// HeyApiAuraClient
// ---------------------------------------------------------------------------

export class HeyApiAuraClient implements AuraClient {
  private readonly keyring: Keyring;
  private readonly client: Client;
  private pat: string | null;

  constructor(opts: HeyApiAuraClientOptions) {
    this.keyring = opts.keyring;
    this.client = createClient({ baseUrl: opts.baseUrl });
    this.pat = opts.pat ?? null;

    // Attach a request interceptor that sets the bearer token lazily.
    this.client.interceptors.request.use(async (req) => {
      const pat = await this.ensurePat();
      req.headers.set("Authorization", `Bearer ${pat}`);
      return req;
    });
  }

  /** Lazily read the PAT from the keyring on first request, cache it. */
  private async ensurePat(): Promise<string> {
    if (this.pat !== null) return this.pat;
    const pat = await this.keyring.getSecret({ service: "aura", name: "pat" });
    if (pat === null) {
      throw new Error(
        "No Aura PAT found in the OS keyring. Run `/aura secrets discover` to store one (service: \"aura\", name: \"pat\").",
      );
    }
    this.pat = pat;
    return pat;
  }

  // -------------------------------------------------------------------------
  // Artifacts
  // -------------------------------------------------------------------------

  async getArtifact(id: string): Promise<Artifact> {
    const res = await genGetArtifact({ client: this.client, path: { id } });
    return unwrap(res, mapArtifact);
  }

  async mcpCreateArtifact(input: CreateArtifactInput): Promise<Artifact> {
    const res = await genMcpCreateArtifact({
      client: this.client,
      body: {
        title: input.title,
        body: input.body,
        summary: input.summary,
        kind: input.kind,
      },
    });
    return unwrap(res, mapArtifact);
  }

  async mcpUpdateArtifact(input: UpdateArtifactInput): Promise<UpdateArtifactResult> {
    const res = await genMcpUpdateArtifact({
      client: this.client,
      path: { id: input.id },
      body: {
        mode: input.mode,
        body: input.body,
        summary: input.summary,
        target_heading: input.target_heading,
        expected_version: input.expected_version,
        confirm_full_replace: input.confirm_full_replace,
      },
    });
    return unwrap(res, (d) => {
      const g = d as { status: string; id: string; title: string; version: number; mode: "section" | "whole"; affected_heading: string };
      return {
        status: g.status,
        id: g.id,
        title: g.title,
        version: g.version,
        mode: g.mode,
        affected_heading: g.affected_heading,
      };
    });
  }

  async listArtifacts(opts?: Record<string, unknown>): Promise<ArtifactList> {
    const res = await genListArtifacts({ client: this.client, query: opts });
    return unwrap(res, mapArtifactList);
  }

  // -------------------------------------------------------------------------
  // Knowledge / wiki
  // -------------------------------------------------------------------------

  async getKnowledgeNode(uuid: string, _opts?: { includeBody?: boolean }): Promise<KnowledgeNode> {
    // The generated getKnowledgeNode endpoint always returns the body for documents;
    // the includeBody opt is accepted for interface compatibility but not forwarded
    // (the REST API has no include_body query param for this endpoint).
    const res = await genGetKnowledgeNode({
      client: this.client,
      path: { uuid },
    });
    return unwrap(res as { data: unknown; error: unknown; response: Response }, mapKnowledgeNode);
  }

  async getKnowledgeNodeByPath(
    spaceSlug: string,
    path: string,
    _opts?: { includeBody?: boolean },
  ): Promise<KnowledgeNode> {
    // The generated getKnowledgeNodeByPath endpoint always returns the body;
    // the includeBody opt is accepted for interface compatibility but not forwarded.
    const res = await genGetKnowledgeNodeByPath({
      client: this.client,
      path: { slug: spaceSlug },
      query: { path },
    });
    return unwrap(res, mapKnowledgeNode);
  }

  async saveKnowledgeNodeBody(input: SaveKnowledgeNodeBodyInput): Promise<KnowledgeNode> {
    const res = await genSaveKnowledgeNodeBody({
      client: this.client,
      path: { uuid: input.uuid },
      body: { body: input.body, summary: input.summary },
    });
    return unwrap(res, mapKnowledgeNode);
  }

  async mcpWikiSearch(input: WikiSearchInput): Promise<WikiSearchResult> {
    const res = await genMcpWikiSearch({
      client: this.client,
      query: { query: input.query, space_slug: input.space_slug, limit: input.limit },
    });
    return unwrap(res, (d) => {
      const g = d as GWikiSearchResponse;
      return {
        items: g.items.map((h) => ({
          id: h.id,
          space_slug: h.space_slug,
          space_kind: h.space_kind,
          title: h.title,
          url: h.url,
          heading_path: h.heading_path,
          excerpt: h.excerpt,
          match_source: h.match_source,
        })),
      };
    });
  }

  async getKnowledgeTree(spaceSlug: string): Promise<KnowledgeTree> {
    const res = await genGetKnowledgeTree({
      client: this.client,
      path: { slug: spaceSlug },
    });
    return unwrap(res, (d) => {
      const g = d as GKnowledgeTree;
      return {
        space_id: g.space_id,
        nodes: g.nodes.map(mapKnowledgeNode),
      };
    });
  }

  async createKnowledgeNode(input: CreateKnowledgeNodeInput): Promise<KnowledgeNode> {
    const res = await genCreateKnowledgeNode({
      client: this.client,
      path: { slug: input.space_slug },
      body: {
        kind: input.kind,
        title: input.title,
        slug: input.slug,
        parent_id: input.parent_id,
        order: input.order,
      },
    });
    return unwrap(res, mapKnowledgeNode);
  }

  async getBlueprintFiles(input: GetBlueprintFilesInput): Promise<GetBlueprintFilesResult> {
    const res = await genGetBlueprintFiles({
      client: this.client,
      query: { path: input.path, version: input.version },
    });
    if (res.error !== undefined) {
      const status = res.response?.status ?? 0;
      throw new AuraApiError(status, sdkErrorMessage(res.error));
    }
    const g = (res.data ?? {}) as { ok?: boolean; files?: GBlueprintFile[]; error?: { code: string; detail: string } };
    // The endpoint returns ok:false with an error body on NOT_FOUND / FORBIDDEN;
    // surface that as a thrown error so callers can distinguish from an empty
    // file list (ok:true, files:[]).
    if (g.ok === false && g.error) {
      throw new AuraApiError(0, `${g.error.code}: ${g.error.detail}`);
    }
    const files = (g.files ?? []).map((f): BlueprintFile => ({
      path: f.path,
      filename: f.filename,
      encoding: f.encoding,
      content: f.content,
      checksum: f.checksum,
      version: f.version,
      provenance: {
        created_by_user_id: f.provenance.created_by_user_id,
        source_commit_sha: f.provenance.source_commit_sha,
      },
    }));
    return {
      ok: g.ok ?? true,
      files,
      error: g.error,
    };
  }

  async getKnowledgeNodeVersion(uuid: string, version: number): Promise<KnowledgeNodeVersion> {
    const res = await genGetKnowledgeNodeVersion({
      client: this.client,
      path: { uuid, version },
    });
    return unwrap(res, (d) => {
      const g = d as GKnowledgeVersion;
      return {
        id: g.id,
        node_id: g.node_id,
        version: g.version,
        body: g.body,
        summary: g.summary ?? null,
        created_by_user_id: g.created_by_user_id,
        created_at: g.created_at,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Upload documents
  // -------------------------------------------------------------------------

  async mcpCreateUploadDocument(input: CreateUploadDocumentInput): Promise<UploadDocument> {
    const res = await genMcpCreateUploadDocument({
      client: this.client,
      body: {
        filename: input.filename,
        content_base64: input.content_base64,
        mime_type: input.mime_type,
      },
    });
    return unwrap(res, mapUploadDocument);
  }

  async mcpGetUploadDocument(id: string): Promise<UploadDocument> {
    const res = await genMcpGetUploadDocument({ client: this.client, path: { id } });
    return unwrap(res, mapUploadDocument);
  }

  // -------------------------------------------------------------------------
  // Boards
  // -------------------------------------------------------------------------

  async getBoardBriefing(opts?: { locale?: string; refresh?: boolean }): Promise<BoardBriefing> {
    const res = await genGetBoardBriefing({
      client: this.client,
      query: opts,
    });
    return unwrap(res, (d) => {
      const g = d as GBoardBriefing;
      return {
        text: g.text,
        generated_at: g.generated_at,
      };
    });
  }

  async getBoardSummary(): Promise<BoardSummary> {
    const res = await genGetBoardSummary({ client: this.client });
    return unwrap(res, mapBoardSummary);
  }

  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------

  async listNotifications(opts?: Record<string, unknown>): Promise<NotificationList> {
    const res = await genListNotifications({ client: this.client, query: opts });
    return unwrap(res, mapNotificationList);
  }

  // -------------------------------------------------------------------------
  // My board
  // -------------------------------------------------------------------------

  async getMyPriorityQueue(): Promise<PriorityQueue> {
    const res = await genGetMyPriorityQueue({ client: this.client });
    return unwrap(res, mapPriorityQueue);
  }

  async getMyCapacity(): Promise<Capacity> {
    const res = await genGetMyCapacity({ client: this.client });
    return unwrap(res, mapCapacity);
  }

  // -------------------------------------------------------------------------
  // Lists
  // -------------------------------------------------------------------------

  async listTasks(opts?: Record<string, unknown>): Promise<TaskList> {
    const res = await genListTasks({ client: this.client, query: opts });
    return unwrap(res, mapTaskList);
  }

  // -------------------------------------------------------------------------
  // Reviews / approvals
  // -------------------------------------------------------------------------

  async getArtifactApprovals(id: string, opts?: { version?: number }): Promise<ArtifactApprovals> {
    const res = await genGetArtifactApprovals({
      client: this.client,
      path: { id },
      query: opts?.version !== undefined ? { version: opts.version } : undefined,
    });
    return unwrap(res, mapArtifactApprovals);
  }

  async getTaskByHumanKey(key: string): Promise<Task> {
    const res = await genGetTaskByHumanKey({ client: this.client, path: { key } });
    return unwrap(res, mapTask);
  }

  async getArtifactReview(id: string): Promise<ArtifactReview> {
    const res = await genGetArtifactReview({ client: this.client, path: { id } });
    return unwrap(res, mapArtifactReview);
  }

  async requestArtifactReview(id: string): Promise<void> {
    const res = await genRequestArtifactReview({ client: this.client, path: { id } });
    return unwrapVoid(res);
  }

  async startArtifactReview(input: StartArtifactReviewInput): Promise<void> {
    const res = await genStartArtifactReview({
      client: this.client,
      path: { id: input.id },
      body: {
        version: input.version,
        roles: input.roles as GArtifactReviewStartRequest["roles"],
        userIds: input.user_ids,
        deadline: input.deadline,
      },
    });
    return unwrapVoid(res);
  }

  async submitArtifactDecision(input: SubmitArtifactDecisionInput): Promise<void> {
    const res = await genSubmitArtifactDecision({
      client: this.client,
      path: { id: input.id },
      body: {
        version: input.version,
        decision: input.decision as GArtifactDecisionRequest["decision"],
      },
    });
    return unwrapVoid(res);
  }

  async reopenArtifactReview(id: string, version: number): Promise<void> {
    const res = await genReopenArtifactReview({
      client: this.client,
      path: { id },
      body: { version },
    });
    return unwrapVoid(res);
  }
}

// ---------------------------------------------------------------------------
// Private mappers: generated → domain
// ---------------------------------------------------------------------------

function mapPagination(p: unknown): { page: number; limit: number; total: number; [k: string]: unknown } {
  const d = p as GPagination;
  return { page: d.page, limit: d.limit, total: d.total, total_pages: d.total_pages };
}

function mapArtifact(d: unknown): Artifact {
  const g = d as GArtifactDetail;
  return {
    id: g.id,
    title: g.title,
    latest_version: g.latest_version,
    version: g.version,
    body: g.body,
    summary: g.summary,
    kind: g.kind,
    created_at: g.created_at,
    updated_at: g.updated_at,
  };
}

function mapArtifactListItem(d: unknown): ArtifactListItem {
  const g = d as GArtifactListItem;
  return {
    id: g.id,
    title: g.title,
    latest_version: g.latest_version,
    created_at: g.created_at,
    updated_at: g.updated_at,
    kind: g.kind,
    pending_for_me: g.pending_for_me,
  };
}

function mapArtifactList(d: unknown): ArtifactList {
  const g = d as GArtifactList;
  return {
    items: g.items.map(mapArtifactListItem),
    pagination: mapPagination(g.pagination),
  };
}

function mapKnowledgeNode(d: unknown): KnowledgeNode {
  const g = d as GKnowledgeNode;
  return {
    id: g.id,
    space_id: g.space_id,
    space_slug: g.space_slug,
    kind: g.kind,
    title: g.title,
    slug: g.slug,
    latest_version: g.latest_version,
    body: g.body,
    // Surface the provenance Aura carries on every node (used by the
    // engineering-sync manifest); kept off the named interface via the index
    // signature so callers opt in explicitly.
    updated_at: g.updated_at,
    body_hash: g.body_hash,
  } as KnowledgeNode;
}

function mapUploadDocument(d: unknown): UploadDocument {
  const g = d as GUploadDocument;
  return {
    id: g.id,
    filename: g.filename,
    mime_type: g.mime_type,
    byte_size: g.byte_size,
    summary: g.summary,
    page_count: g.page_count,
    ingest_status: g.ingest_status,
    portal_url: g.portal_url,
    pages: g.pages,
  };
}

function mapBoardBucketItem(d: {
  kind?: string;
  task?: { uuid: string; human_key: string; title: string; status: string; status_type: string };
  title?: string;
  since?: string;
  waiting_days?: number;
  link?: string;
  approvals_pending?: number;
}): {
  kind?: string;
  task?: { uuid: string; human_key: string; title: string; status: string; status_type: string };
  title?: string;
  since?: string;
  waiting_days?: number;
  link?: string;
  approvals_pending?: number;
} {
  return {
    kind: d.kind,
    task: d.task,
    title: d.title,
    since: d.since,
    waiting_days: d.waiting_days,
    link: d.link,
    approvals_pending: d.approvals_pending,
  };
}

function mapBoardSummary(d: unknown): BoardSummary {
  const g = d as GBoardSummary;
  return {
    overdue: g.overdue
      ? { count: g.overdue.count, items: g.overdue.items.map((i) => ({
          // BoardOverdueItem has task + deadline + days, not kind/title/since.
          kind: undefined,
          task: i.task ? { uuid: i.task.uuid, human_key: i.task.human_key, title: i.task.title, status: i.task.status, status_type: i.task.status_type } : undefined,
          title: i.task?.title ?? "",
          since: undefined,
          waiting_days: i.days !== undefined ? Math.abs(i.days) : undefined,
          link: undefined,
          approvals_pending: undefined,
        })) }
      : undefined,
    waiting_on_me: g.waiting_on_me
      ? { count: g.waiting_on_me.count, items: g.waiting_on_me.items.map(mapBoardBucketItem) }
      : undefined,
    waiting_on_others: g.waiting_on_others
      ? { count: g.waiting_on_others.count, items: g.waiting_on_others.items.map(mapBoardBucketItem) }
      : undefined,
  };
}

function mapNotification(d: unknown): Notification {
  const g = d as GNotification;
  return {
    id: g.id,
    type: g.type,
    read: g.read,
    created_at: g.created_at,
  };
}

function mapNotificationList(d: unknown): NotificationList {
  const g = d as GNotificationList;
  return {
    items: g.items.map(mapNotification),
    pagination: mapPagination(g.pagination),
  };
}

function mapHumanKeyRef(d: unknown): { id: string; title: string; level: string } {
  const g = d as GTaskHierarchyRef;
  return { id: g.id, title: g.title, level: g.level ?? "" };
}

function mapPriorityQueueItem(d: unknown): PriorityQueueItem {
  const g = d as GMyPriorityItem;
  return {
    id: g.id,
    human_key: g.human_key,
    title: g.title,
    status: g.status,
    status_type: g.status_type,
    level: g.level,
    block: g.block,
    rank: g.rank,
    asap: g.asap,
    blocked_by: g.blocked_by.map((b: GPriorityBlockerRef) => b.human_key),
    context_path: g.context_path.map((c: GPriorityContextRef) => mapHumanKeyRef(c)),
    governing_date: g.governing_date,
    capacity_percent: g.capacity_percent,
  };
}

function mapPriorityQueue(d: unknown): PriorityQueue {
  const g = d as GMyPriorityQueue;
  return {
    items: g.items.map(mapPriorityQueueItem),
    total: g.total,
    unordered_count: g.unordered_count,
  };
}

function mapCapacityTask(d: unknown): CapacityTask {
  const g = d as GCapacityTaskCommitment;
  return {
    task_id: g.task_id,
    human_key: g.human_key,
    task_title: g.task_title,
    task_status: g.task_status,
    roles: g.roles,
    capacity_percent: g.capacity_percent,
    task_level: g.task_level,
    hierarchy_path: g.hierarchy_path.map(mapHumanKeyRef),
  };
}

function mapCapacity(d: unknown): Capacity {
  const g = d as GCapacityPersonal;
  return {
    base_percent: g.base_percent,
    committed_percent: g.committed_percent,
    free_percent: g.free_percent,
    utilization_percent: g.utilization_percent,
    over: g.over,
    base_capacity_note: g.base_capacity_note,
    tasks: g.tasks.map(mapCapacityTask),
  };
}

function mapTask(d: unknown): Task {
  const g = d as GTaskDetail | GTaskListItem;
  const jira = "jira_issues" in g ? (g.jira_issues ?? []) : [];
  const children = "children" in g ? (g.children ?? []) : [];
  return {
    id: g.id,
    human_key: g.human_key,
    title: g.title,
    description: g.description,
    status: g.status,
    status_type: g.status_type,
    level: g.level,
    jira_issues: jira.map((j: GTaskJiraIssueRef) => ({ issue_key: j.issue_key, summary: j.summary })),
    children: children.map((c: GTaskChildRef) => ({ human_key: c.human_key, title: c.title })),
  };
}

function mapTaskList(d: unknown): TaskList {
  const g = d as GTaskList;
  return {
    items: g.items.map((t: GTaskListItem) => mapTask(t)),
    pagination: mapPagination(g.pagination),
  };
}

function mapArtifactApprovals(d: unknown): ArtifactApprovals {
  const g = d as GArtifactApprovalsResponse;
  return {
    version: g.version,
    latest_version: g.latest_version,
    decided_count: g.decided_count,
    total_required: g.total_required,
    open_reviews: g.open_reviews.map((r: GOpenReview) => ({
      user_id: r.user_id ?? "",
      user_name: r.user_name ?? "",
      decided: r.decided,
    })),
    decisions: g.decisions.map((dec: GApprovalDecision) => ({
      user_name: dec.user_name,
      decision: dec.decision,
      decided: true,
    })),
  };
}

function mapArtifactReview(d: unknown): ArtifactReview {
  const g = d as GArtifactReviewOverview;
  return {
    version: g.version,
    review_state: g.review_state,
    reviewers: g.reviewers.map((r: GReviewerStatus) => ({
      user_id: r.user_id,
      user_name: r.user_name,
      status: r.status,
    })),
    review_artifacts: g.review_artifacts.map((a) => ({ title: a.title })),
    initiator: g.initiator ? { user_id: g.initiator.user_id, user_name: g.initiator.user_name } : null,
    review_started_at: g.review_started_at,
    review_deadline_at: g.review_deadline_at,
    is_initiator: g.is_initiator,
  };
}

// ---------------------------------------------------------------------------
// Factory: createDefaultAuraClient
// ---------------------------------------------------------------------------

/**
 * Build a production `HeyApiAuraClient` from environment defaults:
 * 1. Read `aura.baseUrl` from ~/.pi/agent/settings.json.
 * 2. Build a keyring via `createKeyring()`.
 * 3. Validate the PAT is present (clear error -> `/aura secrets discover`).
 * 4. Construct `HeyApiAuraClient({ keyring, baseUrl })`.
 *
 * Throws actionable errors for missing baseUrl or missing PAT.
 */
export async function createDefaultAuraClient(): Promise<AuraClient> {
  const settings = loadAuraClientSettings();
  if (!settings.baseUrl) {
    throw new Error(
      "Missing `aura.baseUrl` in ~/.pi/agent/settings.json. Add the Aura REST API base URL (e.g. \"https://aura.dev-anwalt.de/api\") to the `aura` block.",
    );
  }

  const keyring = await createKeyring();
  const pat = await keyring.getSecret({ service: "aura", name: "pat" });
  if (pat === null) {
    throw new Error(
      "No Aura PAT found in the OS keyring. Run `/aura secrets discover` to store one (service: \"aura\", name: \"pat\").",
    );
  }

  // Pass the validated PAT to avoid a double keyring read (open decision #3).
  return new HeyApiAuraClient({ keyring, baseUrl: settings.baseUrl, pat });
}

