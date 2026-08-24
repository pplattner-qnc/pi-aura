import type {
  Digest,
  DigestAction,
  DigestAttentionItem,
  DigestCapacity,
  DigestQueueRow,
  DigestReviewOwed,
} from "./types.js";

/**
 * Build the ranked `actions[]` routing table for the interactive dashboard.
 *
 * Pure function over a Digest-shaped object. Output is deterministic and
 * capped at 6 actions, ordered by priority:
 *   1. overdue attention items
 *   2. items waiting on you
 *   3. reviews you owe (non-stale)
 *   4. over-commitment capacity flag
 *   5. warnings / setup prompt
 *   6. active queue rows with capacity
 */
export function buildActions(digest: Digest): DigestAction[] {
  const overdue = digest.attention?.overdue ?? [];
  const waitingOnYou = digest.attention?.waiting_on_you ?? [];
  const reviewsOwed = digest.reviews_owed ?? [];
  const corrections = digest.corrections ?? [];
  const capacity = digest.capacity;
  const warnings = digest.warnings ?? [];
  const queue = digest.queue ?? [];

  const staleArtifactIds = new Set(
    corrections.filter((c) => c.stale).map((c) => c.artifact_id)
  );

  const actions: DigestAction[] = [];

  // 1. Overdue attention items.
  for (const item of overdue.slice(0, 3)) {
    actions.push(buildOverdueAction(item));
  }

  // 2. Items waiting on you.
  for (const item of waitingOnYou.slice(0, 3)) {
    actions.push(buildWaitingAction(item));
  }

  // 3. Reviews owed, dropping any whose artifact has a stale correction.
  for (const review of reviewsOwed.slice(0, 3)) {
    if (staleArtifactIds.has(review.artifact_id)) continue;
    actions.push(buildReviewAction(review));
  }

  // 4. Over-commitment capacity flag.
  if (capacity?.over) {
    actions.push(buildCapacityAction(capacity));
  }

  // 5. Setup/auth warning prompt.
  if (warnings.length > 0) {
    actions.push(buildWarningAction(warnings[0]));
  }

  // 6. Active queue rows with capacity, filling to the global cap.
  const remaining = Math.max(0, 6 - actions.length);
  if (remaining > 0) {
    const activeQueue = queue.filter((row) => row.capacity_pct !== null && row.capacity_pct > 0);
    for (const row of activeQueue.slice(0, remaining)) {
      actions.push(buildQueueAction(row));
    }
  }

  // Apply the global ≤6 cap as the final ranking truncation.
  return actions.slice(0, 6);
}

function buildOverdueAction(item: DigestAttentionItem): DigestAction {
  const daySuffix = item.days !== undefined ? ` (${item.days}d)` : "";
  const instructionSuffix =
    item.days !== undefined ? ` (it's ${item.days} days overdue)` : "";
  return {
    section: "overdue",
    key: item.key,
    action: "advance",
    label: `Advance ${item.key} — ${item.title}${daySuffix}`,
    instruction: `Advance ${item.key} — ${item.title}${instructionSuffix}`,
    aura_use_case: "task-management",
  };
}

function buildWaitingAction(item: DigestAttentionItem): DigestAction {
  const text = `Unblock ${item.key} — ${item.title}`;
  return {
    section: "waiting_on_you",
    key: item.key,
    action: "unblock",
    label: text,
    instruction: text,
    aura_use_case: "task-management",
  };
}

function buildReviewAction(review: DigestReviewOwed): DigestAction {
  return {
    section: "reviews_owed",
    key: review.artifact_id,
    action: "review",
    label: `Review ${review.title} v${review.version}`,
    instruction: `Review artifact ${review.title} (v${review.version}) — you owe it`,
    aura_use_case: "artifact-management",
  };
}

function buildCapacityAction(capacity: DigestCapacity): DigestAction {
  const pct = capacity.utilization_pct;
  return {
    section: "capacity",
    key: "capacity",
    action: "flag_capacity",
    label: `Flag over-commitment (${pct}%)`,
    instruction: `Capacity is at ${pct}% committed — adjust or flag to manager`,
    aura_use_case: "capacity-planning",
  };
}

function buildWarningAction(warning: string): DigestAction {
  return {
    section: "warnings",
    key: "warnings",
    action: "run_setup",
    label: "Run setup / auth",
    instruction: `Run the digest setup — ${warning}`,
    aura_use_case: "aura-digest",
  };
}

function buildQueueAction(row: DigestQueueRow): DigestAction {
  return {
    section: "queue",
    key: row.key,
    action: "advance",
    label: `Advance ${row.key} — ${row.title} (${row.status})`,
    instruction: `Advance ${row.key} — ${row.title} (${row.status})`,
    aura_use_case: "task-management",
  };
}
