// Shared types for the Aura morning-routine scripts.
//
// digest.json is the versioned contract between fetch.ts (producer of the
// preliminary draft), the orchestrator (fills `summary`, `corrections`,
// re-ranks `suggested_actions`), and render.ts (renderer).

// ---------------------------------------------------------------------------
// Aura API response shapes (subset we actually use).
// ---------------------------------------------------------------------------

export interface AuraHumanKey {
  human_key: string;
  title: string;
  level: string;
  rank: number | null;
}

export interface AuraCapacityTask {
  task_id: string;
  human_key: string;
  task_title: string;
  task_status: string;
  roles: string[];
  capacity_percent: number | null;
  task_level: string | null;
  hierarchy_path: { id: string; title: string; level: string }[];
}

export interface AuraCapacity {
  base_percent: number;
  committed_percent: number;
  free_percent: number;
  utilization_percent: number;
  over: boolean;
  base_capacity_note: string | null;
  tasks: AuraCapacityTask[];
}

export interface AuraPriorityQueueItem {
  id: string;
  human_key: string;
  title: string;
  status: string;
  status_type: string;
  level: string | null;
  block: string;
  rank: number | null;
  asap: boolean;
  blocked_by: string[];
  context_path: AuraHumanKey[];
  governing_date: string | null;
  capacity_percent: number | null;
}

export interface AuraPriorityQueue {
  items: AuraPriorityQueueItem[];
  total: number;
  unordered_count: number;
}

export interface AuraNotification {
  id: string;
  type: string;
  read: boolean;
  created_at: string;
  // Shape varies by type; we keep it loose and pull fields defensively.
  [key: string]: unknown;
}

export interface AuraNotificationList {
  items: AuraNotification[];
  total?: number;
}

export interface AuraArtifact {
  id: string;
  title: string;
  status?: string;
  current_version?: number;
  [key: string]: unknown;
}

export interface AuraArtifactList {
  items: AuraArtifact[];
  total?: number;
}

export interface AuraBoardBriefing {
  text?: string;
  generated_at?: string;
  [key: string]: unknown;
}

export interface AuraBoardSummaryItem {
  kind?: string; // e.g. "artifact_in_review"
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
  link?: string; // e.g. "/artifacts?artifact=<uuid>"
  approvals_pending?: number;
  [key: string]: unknown;
}

export interface AuraBoardSummaryBucket {
  count: number;
  items: AuraBoardSummaryItem[];
}

export interface AuraBoardSummary {
  overdue?: AuraBoardSummaryBucket;
  waiting_on_me?: AuraBoardSummaryBucket;
  waiting_on_others?: AuraBoardSummaryBucket;
  [key: string]: unknown;
}

export interface AuraAttentionItem {
  task_id?: string;
  human_key?: string;
  title?: string;
  task_title?: string;
  task_status?: string;
  status?: string;
  waiting_since?: string;
  days_waiting?: number;
  [key: string]: unknown;
}

export interface AuraTask {
  id: string;
  human_key: string;
  title: string;
  status: string;
  [key: string]: unknown;
}

export interface AuraTaskList {
  items: AuraTask[];
  total?: number;
}

/** Detail returned by aura-mcp-dev_getTaskByHumanKey. We only use the fields
 * the dev-links feature needs: human_key, title, description, jira_issues. */
export interface AuraTaskDetail {
  id: string;
  human_key: string;
  title: string;
  description?: string;
  jira_issues?: { issue_key: string; summary?: string }[];
  children?: { human_key: string; title?: string }[];
  [key: string]: unknown;
}

/** Response from aura-mcp-dev_getArtifactReview (the review overview). Used to
 * derive the "reviews I owe" list: filter to artifacts where my reviewer status
 * is ASSIGNED (not yet decided). */
export interface ArtifactReview {
  version: number;
  review_state: string; // IN_REVIEW | APPROVED | NEEDS_REVISION | UNCHECKED
  initiator?: { user_id: string; user_name: string } | null;
  review_started_at?: string | null;
  review_deadline_at?: string | null;
  is_initiator?: boolean;
  reviewers: Array<{
    user_id: string;
    user_name: string;
    status: string; // ASSIGNED | APPROVED | REJECTED | NEEDS_REVISION
    [k: string]: unknown;
  }>;
  review_artifacts?: Array<{ title?: string }>;
  [k: string]: unknown;
}
// ---------------------------------------------------------------------------
// Artifact-review verification (produced by the orchestrator, not fetch.ts).
// ---------------------------------------------------------------------------

export interface ArtifactApprovalDecision {
  user_name: string;
  decision: string; // "APPROVED" | "REJECTED" | "NEEDS_REVISION" | …
  decided: boolean;
}

export interface ArtifactApprovalState {
  version: number;
  latest_version: number;
  decided_count: number;
  total_required: number;
  open_reviews: { user_id: string; user_name: string; decided: boolean }[];
  decisions: ArtifactApprovalDecision[];
}

// ---------------------------------------------------------------------------
// Raw API bundle written by fetch.ts -> raw.json.
// ---------------------------------------------------------------------------

export interface RawAuraData {
  fetched_at: string; // ISO timestamp
  briefing: AuraBoardBriefing;
  summary: AuraBoardSummary;
  notifications: AuraNotificationList;
  priority_queue: AuraPriorityQueue;
  capacity: AuraCapacity;
  pending_review_artifacts: AuraArtifactList;
  stakeholder_alignment_tasks: AuraTaskList;
  stakeholder_review_tasks: AuraTaskList;
}

// ---------------------------------------------------------------------------
// digest.json contract.
// ---------------------------------------------------------------------------

export interface DigestAttention {
  overdue: DigestAttentionItem[];
  waiting_on_you: DigestAttentionItem[];
  waiting_on_others: DigestAttentionItem[]; // artifacts/tasks awaiting others' review
  notifications: string[]; // human-readable notification summaries
}

export interface DigestAttentionItem {
  key: string;
  title: string;
  days?: number;
  since?: string;
}

export interface DigestQueueRow {
  rank: number;
  key: string;
  title: string;
  status: string; // human-readable, e.g. "In Review"
  role: string;
  capacity_pct: number | null;
  hours: number | null; // capacity_pct * 8 / 100, or null
  /** Compact dev-link summary for the Git column, e.g. "1: 🟢, 2: 🌿" —
   * counts of PRs (by state emoji) and branches. Empty when none. */
  git_summary?: string;
}

export interface DigestCapacity {
  base_pct: number;
  committed_pct: number;
  free_pct: number;
  utilization_pct: number;
  over: boolean;
  total_hours: number; // committed_pct * 8 / 100
}

export interface DigestReview {
  artifact_id: string;
  title: string;
  version: number;
  reported_decision?: string; // e.g. "REJECTED" from a notification
  decisions: ArtifactApprovalDecision[];
  decided_count: number;
  total_required: number;
}

/** A review I owe (artifact assigned to me as reviewer, not yet decided). */
export interface DigestReviewOwed {
  artifact_id: string;
  title: string;
  version: number;
  /** ISO deadline or null when none set. */
  deadline: string | null;
  /** Initiator display name. */
  initiator: string | null;
  /** Since when the review has been running (ISO). */
  review_started_at: string | null;
}

export interface DigestCorrection {
  artifact_id: string;
  title: string;
  reported_version: number | null;
  reported_decision: string | null;
  current_version: number;
  current_decisions: ArtifactApprovalDecision[];
  stale: boolean;
  note: string;
}

export interface Digest {
  date: string; // YYYY-MM-DD
  summary: string | null; // orchestrator fills: 2-3 sentence situation
  attention: DigestAttention;
  queue: DigestQueueRow[];
  capacity: DigestCapacity;
  reviews: DigestReview[];
  suggested_actions: string[]; // seeded rule-based, orchestrator re-ranks
  corrections: DigestCorrection[]; // orchestrator fills after verification
  dev_links: TaskDevLinks[]; // related PRs/branches per queue task (dev-links feature)
  reviews_owed: DigestReviewOwed[]; // reviews assigned to me I haven't decided yet
  meta: {
    generated_at: string;
    raw_path: string;
    report_path: string;
  };
}

// ---------------------------------------------------------------------------
// report.json: full raw data + the orchestrator's research basis.
// ---------------------------------------------------------------------------

export interface ArtifactToVerify {
  artifact_id: string;
  title: string;
  reported_version: number | null;
  reported_decision: string | null;
  source: string; // "notification" | "pending_review" | "waiting_on_others"
}

/** Result of verifying one artifact's reported review state against current. */
export interface ArtifactVerification {
  artifact_id: string;
  title: string;
  /** What the notification / pending-review list reported. */
  reported: {
    version: number | null;
    decision: string | null; // "APPROVED" | "REJECTED" | "NEEDS_REVISION" | null
    source: string;
  };
  /** What getArtifactApprovals returned for the current version. */
  current: ArtifactApprovalState | null; // null if the lookup failed
  error?: string; // present if the lookup failed (current is null)
  /** True iff a rejection/revision was reported on an older version and the
   * artifact has since been advanced (current version > reported). The
   * reported decision no longer applies to the current review run. */
  stale: boolean;
  /** Human-readable explanation of the stale verdict (empty when not stale). */
  note: string;
}

export interface AuraReport {
  fetched_at: string;
  raw_path: string;
  artifacts_to_verify: ArtifactToVerify[];
  /** Full verification findings: original reported state + current state +
   * stale verdict per artifact. Produced by `fetch` so the orchestrator does
   * not need to call getArtifactApprovals itself. */
  verifications: ArtifactVerification[];
  // Surface a few convenience aggregates so the orchestrator rarely needs the
  // raw file.
  pending_review_summary: { artifact_id: string; title: string; current_version?: number }[];
  notification_review_events: {
    type: string;
    artifact_id: string | null;
    title: string | null;
    version: number | null;
    decision: string | null;
    created_at: string;
  }[];
}

// ---------------------------------------------------------------------------
// last-digest.json — persistent store of the most recently presented digest.
// Lives at ~/.pi/aura/last-digest.json. Used by future runs to surface what
// changed since the last digest (new tasks, capacity shifts, resolved
// reviews, stale corrections now current, etc.).
// ---------------------------------------------------------------------------

export interface LastDigestStore {
  /** Schema version of this store file, for forward-compatible migrations. */
  schema_version: number;
  /** When this digest was presented to the user (ISO timestamp). Set by the
   * orchestrator at present time. */
  presented_at: string;
  /** When the digest data was fetched (mirrors digest.meta.generated_at). */
  fetched_at: string;
  /** The full corrected Digest object from the last presented run. */
  digest: Digest;
}

// ---------------------------------------------------------------------------
// DigestDiff — structured delta between two digests, used to surface "what
// changed since last digest". Computed by `diff` against the previous
// LastDigestStore.digest and the current corrected digest.
// ---------------------------------------------------------------------------

export interface DigestDiff {
  /** Tasks that entered the queue (present now, absent last time). */
  queue_added: DigestQueueRow[];
  /** Tasks that left the queue (absent now, present last time). */
  queue_removed: DigestQueueRow[];
  /** Tasks whose status changed (e.g. Open -> In Review). */
  queue_status_changed: {
    key: string;
    title: string;
    from: string;
    to: string;
  }[];
  /** Committed capacity percentage delta (positive = more committed). */
  capacity_delta_pct: number;
  /** Committed hours delta. */
  capacity_delta_hours: number;
  /** Artifacts that newly entered review (present now, absent last time). */
  reviews_added: DigestReview[];
  /** Reviews whose decided_count increased. */
  reviews_progressed: {
    artifact_id: string;
    title: string;
    from_decided: number;
    to_decided: number;
    from_version: number;
    to_version: number;
  }[];
  /** Corrections that were stale last time but are now resolved/current. */
  corrections_resolved: DigestCorrection[];
  /** Corrections that are newly stale this run. */
  corrections_new: DigestCorrection[];
  /** Overdue items added since last time. */
  overdue_added: DigestAttentionItem[];
  /** Overdue items cleared since last time. */
  overdue_cleared: DigestAttentionItem[];
  /** Days between the two digests (0 = same day). */
  days_elapsed: number;
}

// ---------------------------------------------------------------------------
// Dev links — related PRs / branches for a task, found via Jira Teamwork
// Graph (primary) + GitHub `gh search` + Bitbucket per-repo fallbacks.
// ---------------------------------------------------------------------------

export interface DevLinkPullRequest {
  /** Provider: "github" | "bitbucket" | "teamwork-graph". */
  provider: string;
  /** PR number/id (string for uniformity). */
  id: string;
  title: string;
  state: string; // OPEN | MERGED | CLOSED | DECLINED
  url: string;
  source_branch?: string;
  destination_branch?: string;
  author?: string;
  /** How this PR was found: "teamwork-graph" | "github-search" | "bitbucket-search". */
  found_via: string;
}

export interface DevLinkBranch {
  provider: string; // "github" | "bitbucket"
  repo: string;
  name: string;
  last_commit?: string;
  found_via: string;
}

export interface TaskDevLinks {
  /** Aura task human key, e.g. "AURA-742". */
  task_key: string;
  /** Jira issue keys linked to this task (from Aura's jira_issues[]). */
  jira_keys: string[];
  pull_requests: DevLinkPullRequest[];
  branches: DevLinkBranch[];
  /** Errors encountered while fetching (per layer), so the orchestrator can
   * surface degradation rather than silently dropping links. */
  errors: string[];
}
