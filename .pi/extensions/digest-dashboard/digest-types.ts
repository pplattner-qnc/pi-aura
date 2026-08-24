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

export interface DigestNotifications {
  since_last_run: string[];
  older_unread: string[];
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
  decisions: string[];
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

export interface StateEvent {
  id: number;
  ts: string;
  dir: "page→agent" | "agent→page";
  type: "action_click" | "ack" | "update_view";
  payload: ActionClickPayload | unknown;
}
