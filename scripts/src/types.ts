// Shared types for the Aura morning-routine scripts.
//
// digest.json is the versioned contract between fetch.ts (producer of the
// preliminary draft), the orchestrator (fills `summary`, `corrections`,
// re-ranks `suggested_actions`), and render.ts (renderer).
//
// The Aura API-response shapes that were hand-maintained here have been
// replaced by the domain types in @pi-aura/shared/aura-client. This file now
// owns only the digest/report/diff/dev-link types that have no spec
// equivalent.

import type {
  ApprovalDecision,
  ArtifactApprovals,
  ArtifactList,
  BoardBriefing,
  BoardSummary,
  Capacity,
  NotificationList,
  PriorityQueue,
  TaskList,
} from "@pi-aura/shared/aura-client";

// ---------------------------------------------------------------------------
// Raw API bundle written by fetch.ts -> raw.json.
// ---------------------------------------------------------------------------

export interface RawAuraData {
  fetched_at: string; // ISO timestamp
  briefing: BoardBriefing;
  summary: BoardSummary;
  notifications: NotificationList;
  priority_queue: PriorityQueue;
  capacity: Capacity;
  pending_review_artifacts: ArtifactList;
  stakeholder_alignment_tasks: TaskList;
  stakeholder_review_tasks: TaskList;
}

// ---------------------------------------------------------------------------
// digest.json contract.
// ---------------------------------------------------------------------------

export interface DigestNotifications {
  /** Notifications that arrived since the last digest's `fetched_at` (minus a
   * small safety margin so nothing at the exact fetch instant slips through).
   * Includes both read and unread — "what happened while you were away", not
   * just what still needs a click. Bounded by a hard fetch cap. */
  since_last_run: string[];
  /** Unread notifications older than the since-last-run boundary. Computed by
   * fetching the newest N notifications at/older than the boundary (regardless
   * of read state) and dropping the read ones — so this surfaces only items
   * that still need attention. N is a small cap, not an unread count. */
  older_unread: string[];
}

export interface DigestAttention {
  overdue: DigestAttentionItem[];
  waiting_on_you: DigestAttentionItem[];
  waiting_on_others: DigestAttentionItem[]; // artifacts/tasks awaiting others' review
  notifications: DigestNotifications;
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
  decisions: ApprovalDecision[];
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
  current_decisions: ApprovalDecision[];
  stale: boolean;
  note: string;
}

/** A clickable next-action on the interactive dashboard. The routing table. */
export interface DigestAction {
  section: string; // "overdue" | "waiting_on_you" | "reviews_owed" | "capacity" | "warnings" | "queue"
  key: string; // human key ("AURA-42") or singleton id ("capacity", "warnings")
  action: string; // "advance" | "unblock" | "review" | "flag_capacity" | "run_setup"
  label: string; // button text, e.g. "Advance AURA-42 — Fix login (3d)"
  instruction: string; // human-readable form the agent shows + acts on
  aura_use_case: string; // "task-management" | "artifact-management" | "capacity-planning" | "aura-digest"
}

/** In-flight lock for one-action-at-a-time. The agent sets
 *  `currentlyWorkingOn` when it starts acting on a click; the SPA shows a
 *  spinner + "continue in pi" tooltip on the matching button and disables
 *  the others. `null` when idle. This task only owns the shape + default. */
export interface DigestFollowup {
  currentlyWorkingOn: string | null; // e.g. "overdue/AURA-42"; null when idle
}

export interface Digest {
  date: string; // YYYY-MM-DD
  summary: string | null; // orchestrator fills: 2-3 sentence situation
  attention: DigestAttention;
  queue: DigestQueueRow[];
  capacity: DigestCapacity;
  reviews: DigestReview[];
  suggested_actions: string[]; // derived from actions[].map(a => a.instruction)
  corrections: DigestCorrection[]; // orchestrator fills after verification
  dev_links: TaskDevLinks[]; // related PRs/branches per queue task (dev-links feature)
  reviews_owed: DigestReviewOwed[]; // reviews assigned to me I haven't decided yet
  /** Non-fatal degradation notices — features that were skipped or partially
   * run because a dependency was unavailable (e.g. keyring read failed so the
   * Teamwork Graph dev-links layer was skipped). Each entry is a short human-
   * readable string. Empty when everything ran fully. */
  warnings: string[];
  actions: DigestAction[]; // structured routing table (SPA renders)
  followup: DigestFollowup; // in-flight lock (default {currentlyWorkingOn: null})
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
  current: ArtifactApprovals | null; // null if the lookup failed
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
  /** Non-fatal degradation notices (mirrors Digest.warnings) — features that
   * were skipped because a dependency was unavailable. */
  warnings: string[];
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
