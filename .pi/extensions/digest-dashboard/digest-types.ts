// Browser-facing subset of the digest types.
// Re-declared here (NOT imported from scripts/src/types.ts) so the Vite
// browser bundle stays independent of the scripts workspace.

export interface DigestAction {
  section: string; // "overdue" | "waiting_on_you" | "reviews_owed" | "capacity" | "warnings" | "queue"
  key: string; // human key ("AURA-42") or singleton id ("capacity", "warnings")
  action: string; // "advance" | "unblock" | "review" | "flag_capacity" | "run_setup"
  label: string; // button text
  instruction: string; // human-readable instruction sent to the agent
  aura_use_case: string; // "task-management" | "artifact-management" | "capacity-planning" | "aura-digest"
}

export interface DigestFollowup {
  currentlyWorkingOn: string | null; // e.g. "overdue/AURA-42"; null when idle
}

export interface DigestNotificationItem {
  /** Pre-summarized human-readable line: "YYYY-MM-DD — <type> by <actor>: <target> v<version> (<decision>)". */
  line: string;
  /** Raw Aura notification type code (e.g. "task.status_changed") — drives the emoji badge + tooltip label. */
  type: string;
  /** Absolute URL to the originating task/artifact/comment in Aura, or null when the notification has no deep-link. */
  url: string | null;
}

export interface DigestNotifications {
  since_last_run: DigestNotificationItem[];
  older_unread: DigestNotificationItem[];
}

export interface DigestAttentionItem {
  key: string;
  title: string;
  days?: number;
  since?: string;
}

export interface DigestAttention {
  overdue: DigestAttentionItem[];
  waiting_on_you: DigestAttentionItem[];
  waiting_on_others: DigestAttentionItem[];
  notifications: DigestNotifications;
}

export interface DigestQueueRow {
  rank: number;
  key: string;
  title: string;
  status: string;
  role: string;
  capacity_pct: number | null;
  hours: number | null;
  git_summary?: string;
}

export interface DigestCapacity {
  base_pct: number;
  committed_pct: number;
  free_pct: number;
  utilization_pct: number;
  over: boolean;
  total_hours: number;
}

export interface DigestReview {
  artifact_id: string;
  title: string;
  version: number;
  reported_decision?: string;
  decisions: { user_name: string; decision: string; decided: boolean }[];
  /** Reviewers assigned to this run who have NOT yet decided. */
  open_reviews: { user_id: string; user_name: string; decided: boolean }[];
  decided_count: number;
  total_required: number;
}

export interface DigestReviewOwed {
  artifact_id: string;
  title: string;
  version: number;
  deadline: string | null;
  initiator: string | null;
  review_started_at: string | null;
}

export interface DigestCorrection {
  artifact_id: string;
  title: string;
  reported_version: number | null;
  reported_decision: string | null;
  current_version: number;
  current_decisions: string[];
  stale: boolean;
  note: string;
}

export interface DevLinkPullRequest {
  provider: string;
  id: string;
  title: string;
  state: string;
  url: string;
  source_branch?: string;
  destination_branch?: string;
  author?: string;
  found_via: string;
}

export interface DevLinkBranch {
  provider: string;
  repo: string;
  name: string;
  last_commit?: string;
  /** Provider browse URL for the branch (Bitbucket/GitHub); null/absent when none. */
  url?: string | null;
  found_via: string;
}

export interface TaskDevLinks {
  task_key: string;
  jira_keys: string[];
  pull_requests: DevLinkPullRequest[];
  branches: DevLinkBranch[];
  errors: string[];
}

export interface Digest {
  date: string; // YYYY-MM-DD
  summary: string | null;
  attention: DigestAttention;
  queue: DigestQueueRow[];
  capacity: DigestCapacity;
  reviews: DigestReview[];
  reviews_owed: DigestReviewOwed[];
  corrections: DigestCorrection[];
  dev_links?: TaskDevLinks[];
  warnings: string[];
  actions: DigestAction[];
  followup: DigestFollowup;
  meta: {
    generated_at: string;
    raw_path: string;
    report_path: string;
  };
}

export interface ActionClickPayload {
  section: string;
  key: string;
  action: string;
  label: string;
  instruction: string;
  aura_use_case: string;
}

/** Wire shape for a scheduler progress node, mirroring the scheduler's
 *  ProgressEvent (slice 1). The browser renders these as a live tree. */
export interface ProgressPayload {
  id: string;
  label: string;
  parentId?: string;
  status: "running" | "done" | "error";
  startedAt: number;
  endedAt?: number;
  kind: string;
}

/** Wire shape for a free-form agent log line rendered below the tree. */
export interface AgentLogPayload {
  message: string;
}

export interface StateEvent {
  id: number;
  ts: string;
  dir: "page→agent" | "agent→page";
  type: "action_click" | "ack" | "update_view" | "progress" | "agent_log";
  payload: ActionClickPayload | ProgressPayload | AgentLogPayload | unknown;
}
