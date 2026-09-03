// aura.ts — Aura digest script (fetch / render / cleanup / save / diff / last).
//
// Usage:
//   node dist/aura.mjs fetch                 Create a random /tmp/aura-morning-<hex>/
//                                            dir, fetch all Aura data (+ verify review
//                                            states), write raw.json + digest.json +
//                                            report.json, print "output directory:
//                                            <path>/" to stdout.
//   node dist/aura.mjs render <dir>          Read <dir>/digest.json and write the
//                                            rendered markdown to stdout.
//   node dist/aura.mjs render <dir> <out>     Write the rendered markdown to <out>
//                                            instead of stdout.
//   node dist/aura.mjs cleanup <dir>         Delete <dir> and its contents.
//   node dist/aura.mjs save <dir>            Save <dir>/digest.json as the last
//                                            presented digest (~/.pi/aura/last-digest.json).
//   node dist/aura.mjs diff <dir>            Print (JSON) what changed since the last
//                                            saved digest.
//   node dist/aura.mjs last                  Print the last saved digest (JSON).
//
// fetch is deterministic (same API state -> same files). It constructs an
// AuraClient (via createDefaultAuraClient) and calls the typed methods;
// a missing PAT/base URL fails fast at construction with a clear error.
// render renders whatever sections are present in digest.json, skipping nulls.
// cleanup removes the temp directory created by fetch. save/diff/last manage
// the persistent last-digest store at ~/.pi/aura/last-digest.json.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createDefaultAuraClient } from "@pi-aura/shared/aura-client";
import { loadAuraClientSettings } from "@pi-aura/shared/settings";
import type {
  ArtifactApprovals,
  AuraClient,
  BoardItem,
  Notification,
  PriorityQueueItem,
  Task,
  ArtifactListItem,
} from "@pi-aura/shared/aura-client";
import { buildAtlassianClient, fetchTaskDevLinks } from "./devlinks.js";
import { runTasks, type Kind, type KindMap, type TaskRef, type Hashable, type NodeHandle, type ProgressEvent } from "@pi-aura/shared/digest/scheduler";
import { loadSettings } from "@pi-aura/shared/digest/settings";
import { createKeyring } from "@pi-aura/shared/keyring";
import { buildActions } from "@pi-aura/shared/digest/build-actions";
import type {
  ArtifactToVerify,
  ArtifactVerification,
  AuraReport,
  Digest,
  DigestAttention,
  DigestAttentionItem,
  DigestCapacity,
  DigestNotifications,
  DigestNotificationItem,
  DigestQueueRow,
  DigestReview,
  LastDigestStore,
  RawAuraData,
  TaskDevLinks,
  DigestReviewOwed,
} from "@pi-aura/shared/digest/types";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const WORKDAY_HOURS = 8;

const NOTIF_PAGE_SIZE = 50;
const NOTIF_FETCH_CAP = 500; // hard safety cap; ~10 pages
const NOTIF_OLDER_FETCH = 20; // newest N older-than-boundary, then drop read
const NOTIF_BOUNDARY_MARGIN_MS = 5 * 60 * 1000; // fetched_at - 5min

function humanStatus(status: string): string {
  // "IN_REVIEW" -> "In Review", "READY_FOR_DEPLOYMENT" -> "Ready For Deployment"
  return status
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function pctToHours(pct: number | null): number | null {
  if (pct === null) return null;
  return (pct * WORKDAY_HOURS) / 100;
}

function stateEmoji(state: string): string {
  const s = state.toUpperCase();
  if (s === "OPEN") return "🟢";
  if (s === "MERGED") return "✅";
  if (s === "CLOSED" || s === "DECLINED") return "⚫";
  return "•";
}

/** Compact Git column summary for a queue row, e.g. "1: 🟢, 2: 🌿"
 * meaning 1 PR (open) + 2 branches. PRs grouped by state emoji. */
function gitColumnSummary(link: TaskDevLinks | undefined): string {
  if (!link) return "";
  if (link.pull_requests.length === 0 && link.branches.length === 0) return "";
  const parts: string[] = [];
  // PRs grouped by state emoji.
  const prByState = new Map<string, number>();
  for (const p of link.pull_requests) {
    const e = stateEmoji(p.state);
    prByState.set(e, (prByState.get(e) ?? 0) + 1);
  }
  for (const [e, n] of prByState) parts.push(`${n}: ${e}`);
  if (link.branches.length > 0) parts.push(`${link.branches.length}: 🌿`);
  return parts.join(", ");
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Path to the persistent last-digest store. */
const LAST_DIGEST_PATH = join(homedir(), ".pi", "aura", "last-digest.json");
const LAST_DIGEST_SCHEMA_VERSION = 1;

// ===========================================================================
// fetch
// ===========================================================================

// Statuses that count as "active open" for the queue table.
const ACTIVE_STATUS_TYPES = new Set([
  "ACTIVE", // IN_DEVELOPMENT / IN_REFINEMENT / IN_REVIEW / IN_ALIGNMENT
]);

function toAttentionItem(item: BoardItem): DigestAttentionItem {
  // item.title often already includes the human key prefix (e.g.
  // "AURA-1061 — Combined plan…"); use the bare task title to avoid
  // "AURA-1061 — AURA-1061 — …" duplication.
  const key = item.task?.human_key ?? "";
  const title = item.task?.title ?? item.title ?? "";
  return {
    key,
    title,
    days: item.waiting_days ?? undefined,
    since: item.since ?? undefined,
  };
}

async function fetchNotifications(
  aura: AuraClient,
  lastFetchedAt: string | null,
  warnings: string[]
): Promise<{ since: Notification[]; older: Notification[] }> {
  const sinceBoundary = lastFetchedAt
    ? new Date(Date.parse(lastFetchedAt) - NOTIF_BOUNDARY_MARGIN_MS).toISOString()
    : null;

  const since: Notification[] = [];
  const older: Notification[] = [];
  let page = 1;
  let totalFetched = 0;
  let crossedBoundary = false;

  while (totalFetched < NOTIF_FETCH_CAP) {
    const resp = await aura.listNotifications({
      sort_by: "created_at",
      sort_dir: "desc",
      page,
      limit: NOTIF_PAGE_SIZE,
    });
    const items = resp.items ?? [];
    if (items.length === 0) break;

    for (const item of items) {
      if (totalFetched >= NOTIF_FETCH_CAP) break;
      totalFetched++;

      if (sinceBoundary === null) {
        if (older.length < NOTIF_OLDER_FETCH) {
          older.push(item);
        }
        continue;
      }

      if (!crossedBoundary) {
        const createdAt = Date.parse(item.created_at);
        const boundaryTime = Date.parse(sinceBoundary);
        if (Number.isNaN(createdAt) || createdAt <= boundaryTime) {
          crossedBoundary = true;
        }
      }

      if (!crossedBoundary) {
        since.push(item);
      } else if (older.length < NOTIF_OLDER_FETCH) {
        older.push(item);
      }
    }

    // First run: a single page of the newest items is enough.
    if (sinceBoundary === null) break;
    if (crossedBoundary && older.length >= NOTIF_OLDER_FETCH) break;
    page++;
  }

  if (totalFetched >= NOTIF_FETCH_CAP) {
    warnings.push(
      `Notification fetch hit the hard cap of ${NOTIF_FETCH_CAP} items; some older items may have been skipped.`
    );
  }

  return { since, older };
}

export async function fetchAction(opts: {
  onProgress?: (e: ProgressEvent) => void;
  auraClient?: AuraClient;
} = {}): Promise<{ digest: Digest; report: AuraReport; raw: RawAuraData }> {
  const aura = opts.auraClient ?? await createDefaultAuraClient();
  const onProgress = opts.onProgress ?? (() => {});
  const warnings: string[] = [];

  // Emit a synthetic progress event (for inline phase nodes outside the
  // scheduler run). Stable ids prevent coalescing across phases.
  const emitPhase = (id: string, label: string, status: "running" | "done", startedAt: number, endedAt?: number): void => {
    onProgress({ id, label, status, startedAt, endedAt, kind: "fetchAction" });
  };

  // --- Notifications phase node (inline, before the parallel fetch) --------
  const notifStart = Date.now();
  emitPhase("phase-notifications", "Fetching notifications from Aura", "running", notifStart);

  // --- Capacity phase node (inline; capacity is one of the parallel fetches) -
  const capacityStart = Date.now();
  emitPhase("phase-capacity", "Fetching capacity", "running", capacityStart);

  // Parallel fetch of all base data.
  const [
    briefing,
    summary,
    priorityQueue,
    capacity,
    pendingReviews,
    alignmentTasks,
    reviewTasks,
  ] = await Promise.all([
    aura.getBoardBriefing({ locale: "en" }),
    aura.getBoardSummary(),
    aura.getMyPriorityQueue(),
    aura.getMyCapacity(),
    aura.listArtifacts({
      pending_review: true,
      limit: 10,
    }),
    aura.listTasks({
      role: "STAKEHOLDER",
      view: "mine",
      status_slug: "IN_ALIGNMENT",
      limit: 5,
    }),
    aura.listTasks({
      role: "STAKEHOLDER",
      view: "mine",
      status_slug: "IN_REVIEW",
      limit: 5,
    }),
  ]);

  // --- Finish capacity phase node (base fetch complete) ---
  emitPhase("phase-capacity", "Fetching capacity", "done", capacityStart, Date.now());

  // Paginate notifications newest→oldest and split into "since last run"
  // (read + unread) and "older unread" pools.
  const lastDigest = loadLastDigest();
  const lastFetchedAt = lastDigest?.fetched_at ?? null;
  const { since: sinceNotifs, older: olderNotifs } = await fetchNotifications(
    aura,
    lastFetchedAt,
    warnings
  );
  const allNotifs = [...sinceNotifs, ...olderNotifs];

  // --- Finish notifications phase node (base fetch complete) ---
  emitPhase("phase-notifications", "Fetching notifications from Aura", "done", notifStart, Date.now());

  const fetchedAt = new Date().toISOString();
  const date = fetchedAt.slice(0, 10);

  const raw: RawAuraData = {
    fetched_at: fetchedAt,
    briefing,
    summary,
    notifications: {
      items: allNotifs,
      pagination: { page: 1, limit: allNotifs.length, total: allNotifs.length },
    },
    priority_queue: priorityQueue,
    capacity,
    pending_review_artifacts: pendingReviews,
    stakeholder_alignment_tasks: alignmentTasks,
    stakeholder_review_tasks: reviewTasks,
  };

  // --- Build the queue table: committed tasks + active open tasks ---------
  const capTaskById = new Map<string, { pct: number | null; role: string }>();
  for (const t of capacity.tasks) {
    capTaskById.set(t.task_id, { pct: t.capacity_percent ?? null, role: t.roles[0] ?? "OWNER" });
  }

  const seenIds = new Set<string>();
  const queueRows: DigestQueueRow[] = [];
  let rank = 0;
  const addItem = (item: PriorityQueueItem): void => {
    if (seenIds.has(item.id)) return;
    const cap = capTaskById.get(item.id);
    const capacityPct = cap?.pct ?? item.capacity_percent ?? null;
    const role = cap?.role ?? "OWNER";
    queueRows.push({
      rank: ++rank,
      key: item.human_key,
      title: item.title,
      status: humanStatus(item.status),
      role,
      capacity_pct: capacityPct,
      hours: pctToHours(capacityPct),
    });
    seenIds.add(item.id);
  };

  // Committed tasks first (non-null capacity), in priority-queue order.
  for (const item of priorityQueue.items) {
    const cap = capTaskById.get(item.id)?.pct ?? item.capacity_percent ?? null;
    if (cap !== null && cap > 0) addItem(item);
  }
  // Then active open tasks (status_type ACTIVE) with null capacity.
  for (const item of priorityQueue.items) {
    const cap = capTaskById.get(item.id)?.pct ?? item.capacity_percent ?? null;
    if ((cap === null || cap === 0) && ACTIVE_STATUS_TYPES.has(item.status_type)) {
      addItem(item);
    }
  }
  // Finally, any capacity-bearing task from getMyCapacity missing from the
  // priority queue entirely (e.g. AURA-1061 IN_ALIGNMENT). These must be
  // added so the committed total in the table matches getMyCapacity.
  for (const t of capacity.tasks) {
    if (seenIds.has(t.task_id)) continue;
    const pct = t.capacity_percent ?? null;
    if (pct === null || pct === 0) continue;
    queueRows.push({
      rank: ++rank,
      key: t.human_key,
      title: t.task_title,
      status: humanStatus(t.task_status),
      role: t.roles[0] ?? "OWNER",
      capacity_pct: pct,
      hours: pctToHours(pct),
    });
    seenIds.add(t.task_id);
  }

  // --- Capacity summary ---------------------------------------------------
  const digestCapacity: DigestCapacity = {
    base_pct: capacity.base_percent,
    committed_pct: capacity.committed_percent,
    free_pct: capacity.free_percent,
    utilization_pct: capacity.utilization_percent,
    over: capacity.over,
    total_hours: pctToHours(capacity.committed_percent) ?? 0,
  };

  // --- Attention ----------------------------------------------------------
  const overdue = (summary.overdue?.items ?? []).map(toAttentionItem);
  const waitingOnYou = (summary.waiting_on_me?.items ?? []).map(toAttentionItem);
  const waitingOnOthers = (summary.waiting_on_others?.items ?? []).map(toAttentionItem);
  const notifSummaries: DigestNotifications = {
    since_last_run: summarizeNotifications(sinceNotifs),
    older_unread: summarizeNotifications(olderNotifs.filter((n) => !n.read)),
  };
  const attention: DigestAttention = {
    overdue,
    waiting_on_you: waitingOnYou,
    waiting_on_others: waitingOnOthers,
    notifications: notifSummaries,
  };

  // --- Reviews (from pending_review_artifacts + waiting_on_others) -----
  const reviews: DigestReview[] = [];
  const reviewById = new Map<string, DigestReview>();
  for (const a of pendingReviews.items ?? []) {
    const r: DigestReview = {
      artifact_id: a.id,
      title: a.title,
      version: a.latest_version ?? 0,
      decisions: [],
      open_reviews: [],
      decided_count: 0,
      total_required: 0,
    };
    reviews.push(r);
    reviewById.set(a.id, r);
  }
  for (const item of summary.waiting_on_others?.items ?? []) {
    const m = safeString(item.link).match(/artifact=([0-9a-f-]+)/i);
    if (m && !reviewById.has(m[1])) {
      const r: DigestReview = {
        artifact_id: m[1],
        title: item.title ?? "",
        version: 0, // filled below from getArtifactApprovals
        decisions: [],
        open_reviews: [],
        decided_count: 0,
        total_required: item.approvals_pending ?? 0,
      };
      reviews.push(r);
      reviewById.set(m[1], r);
    }
  }



  // --- Report: artifacts to verify ----------------------------------------
  const waitingOnOthersLinks = (summary.waiting_on_others?.items ?? []).map(
    (i) => safeString(i.link)
  );
  const { artifactsToVerify, notificationReviewEvents } = extractVerifyTargets(
    allNotifs,
    pendingReviews.items ?? [],
    waitingOnOthersLinks
  );

  // --- Verify review states against current API ---------------------------
  // Call getArtifactApprovals for each candidate and decide whether the
  // reported decision is stale (a rejection on an older version that has
  // since been advanced). The digest stays conservative (reported state
  // only, corrections=[]); the full findings live in report.json so the
  // orchestrator can reconcile without any extra MCP calls.
  const verifications = await verifyArtifacts(aura, artifactsToVerify);

  // --- Enrich digest.reviews with the live approvals state -----------------
  // verifyArtifacts already called getArtifactApprovals for every candidate
  // artifact (the same set that feeds digest.reviews). Write the current
  // version, decisions, open_reviews (pending reviewers), and counts back
  // into the matching DigestReview so the dashboard can show who is to
  // review and their state — not just who already decided. Reviews whose
  // getArtifactApprovals lookup failed keep their initialized empty state.
  const approvalsById = new Map<string, ArtifactApprovals>();
  for (const v of verifications) {
    if (v.current) approvalsById.set(v.artifact_id, v.current);
  }
  for (const r of reviews) {
    const ap = approvalsById.get(r.artifact_id);
    if (!ap) continue;
    r.version = ap.version;
    r.decisions = ap.decisions;
    r.open_reviews = ap.open_reviews;
    r.decided_count = ap.decided_count;
    r.total_required = ap.total_required;
  }

  // --- Dev links + reviews-owed: one bounded-concurrency scheduler run ---
  // Both fan-outs go through a single runTasks call with shared global state
  // { devLinks, reviewsOwed }. A single root task spawns the dev-link rows
  // (one per queue task) and the review-candidate tasks; the scheduler pumps
  // them under one global cap. The previous sequential loops here were the
  // dominant serial wait in the ~54s fetch.
  //
  // Task identity is (kind, input): kind -> {run, spawn, reduce} lives in a
  // registry; a task is just {kind, input} with a hashable input. Dedup is
  // first-seen-wins on (kind, keyOf(input)), so two parents spawning the same
  // work share one run. reduce folds each output into the shared state as it
  // completes; we read it back in deterministic key order afterwards.
  const settings = loadSettings();
  const devLinks: TaskDevLinks[] = [];
  const reviewsOwed: DigestReviewOwed[] = [];
  if (!settings.digest) {
    warnings.push("Dev-links feature disabled: no `aura.digest` block in settings.json (set it to enable Teamwork Graph + GitHub + Bitbucket PR/branch lookup).");
  } else {
    const { client: atlassian, warning: atlWarning } = await buildAtlassianClient(settings.mcpServers.atlassian);
    if (atlWarning) warnings.push(atlWarning);
    const keyring = await createKeyring();
    const digestSettings = settings.digest;

    // --- review-candidate prerequisites (small, sequential, breaks early) ---
    // My user_id comes from the first review I initiated. Candidates come from
    // `artifact.review_assigned` notifications. Both are computed before the
    // scheduler run and captured in the review kind's closure so the task
    // input stays a plain hashable id.
    const assignedNotif = allNotifs.filter(
      (n) => safeString(n.type) === "artifact.review_assigned"
    );
    const candidateIds = new Set<string>();
    const titleById = new Map<string, string>();
    for (const n of assignedNotif) {
      const p = (n.i18n_params as Record<string, unknown> | undefined) ?? {};
      const id = safeString(p.artifactUuid) || safeString(p.artifact_uuid);
      if (id) {
        candidateIds.add(id);
        const t = safeString(p.artifactTitle) || safeString(p.artifact_title);
        if (t) titleById.set(id, t);
      }
    }
    let myUserId: string | null = null;
    for (const r of reviews) {
      try {
        const ar = await aura.getArtifactReview(r.artifact_id);
        if (ar.is_initiator && ar.initiator) { myUserId = ar.initiator.user_id; break; }
      } catch { /* ignore */ }
    }
    const myName = "Plattner, Patric";

    // --- shared global state + kinds ---
    interface FanoutState {
      devLinks: Map<string, TaskDevLinks>; // keyed by task_key (deterministic read order)
      reviewsOwed: Map<string, DigestReviewOwed>; // keyed by artifact_id
    }
    const state: FanoutState = { devLinks: new Map(), reviewsOwed: new Map() };

    // dev-links-row: fetch a queue task's detail (+ children's Jira keys),
    // then fetchTaskDevLinks. Input is just the human key (hashable).
    const devLinksRow: Kind<string, TaskDevLinks | null, FanoutState> = {
      run: async (taskKey, ctx) => {
        try {
          const detail = await aura.getTaskByHumanKey(taskKey).catch(() => null);
          if (!detail) return null;
          const childKeys = (detail.children ?? []).map((c) => c.human_key).filter(Boolean);
          if (childKeys.length > 0) {
            const childDetails = await Promise.all(
              childKeys.map((k) => aura.getTaskByHumanKey(k).catch(() => null))
            );
            const childJira = childDetails
              .filter((c): c is Task => c !== null)
              .flatMap((c) => c.jira_issues ?? []);
            if (childJira.length > 0) {
              detail.jira_issues = [...(detail.jira_issues ?? []), ...childJira];
            }
          }
          return await fetchTaskDevLinks(detail, digestSettings, keyring, atlassian);
        } finally {
          // Finish this row's progress node so the deferred parent can
          // resolve once all rows are terminal.
          if (ctx.node) ctx.progress.finish(ctx.node);
        }
      },
      reduce: (s, out) => {
        if (out) s.devLinks.set(out.task_key, out);
      },
    };

    // review-candidate: getArtifactReview + keep if my row is ASSIGNED.
    // Input is just the artifact id (hashable).
    const reviewCandidate: Kind<string, DigestReviewOwed | null, FanoutState> = {
      run: async (id, ctx) => {
        try {
          const ar = await aura.getArtifactReview(id);
          const me = ar.reviewers.find(
            (rv) => (myUserId && rv.user_id === myUserId) || rv.user_name === myName
          );
          if (!me || me.status !== "ASSIGNED") return null;
          return {
            artifact_id: id,
            title: ar.review_artifacts?.[0]?.title ?? titleById.get(id) ?? "",
            version: ar.version,
            deadline: ar.review_deadline_at ?? null,
            initiator: ar.initiator?.user_name ?? null,
            review_started_at: ar.review_started_at ?? null,
          };
        } catch { /* unreachable artifact */ return null; }
        finally {
          // Finish this candidate's progress node so the deferred parent
          // can resolve once all candidates are terminal.
          if (ctx.node) ctx.progress.finish(ctx.node);
        }
      },
      reduce: (s, out) => {
        if (out) s.reviewsOwed.set(out.artifact_id, out);
      },
    };

    // start: the single root. Its run returns the known fan-out shape
    // (rows + candidates); its reduce sets the task cap from that (the first
    // reducer to set it wins), then its spawn enqueues the rows + candidates
    // under that cap. So the cap is learned from the base data, not guessed
    // at the call site.
    //
    // Live progress tree (slice 3): the run also creates two phase nodes
    // ("Fetching tasks from Aura" / "Fetching reviews") and a child node
    // per row / candidate attached under the matching phase. Each child
    // node is finished with deferCloseForChildren: true before spawning so
    // it stays spinning until the child task finishes its work (and then
    // the child task finishes its own ctx.node).
    interface StartOutput {
      rows: number;
      candidates: number;
    }
    // Closure: the node handles created in run() are stored here so spawn()
    // can thread them via TaskRef.node.
    let tasksPhaseNode: NodeHandle | undefined;
    let reviewsPhaseNode: NodeHandle | undefined;
    const rowNodes: NodeHandle[] = [];
    const candidateNodes: NodeHandle[] = [];
    const start: Kind<null, StartOutput, FanoutState> = {
      run: async (_input, ctx) => {
        // Create the two phase nodes at root level.
        tasksPhaseNode = ctx.progress.create(undefined, "Fetching tasks from Aura");
        reviewsPhaseNode = ctx.progress.create(undefined, "Fetching reviews");

        // Create a child node per dev-links row under the "tasks" phase node.
        for (const row of queueRows) {
          const node = ctx.progress.create(tasksPhaseNode, `dev-links ${row.key}`);
          rowNodes.push(node);
        }
        // Create a child node per review candidate under the "reviews" phase node.
        for (const id of [...candidateIds].sort()) {
          const node = ctx.progress.create(reviewsPhaseNode, `review ${id}`);
          candidateNodes.push(node);
        }

        // Leaf row/candidate nodes have NO children, so
        // deferCloseForChildren would resolve them to "done" immediately —
        // before the child task runs. Instead, leave them "running" (created
        // via ctx.progress.create) and let the child task finish them plainly
        // in its finally block (devLinksRow/reviewCandidate) so they stay
        // spinning until the child task completes (the desired UX).
        // The phase nodes (tasksPhaseNode/reviewsPhaseNode) DO have children,
        // so their deferCloseForChildren: true below is correct and stays.

        // Finish the phase nodes with deferCloseForChildren: true so they
        // stay spinning until all their child nodes are terminal.
        ctx.progress.finish(tasksPhaseNode, { deferCloseForChildren: true });
        ctx.progress.finish(reviewsPhaseNode, { deferCloseForChildren: true });

        return { rows: queueRows.length, candidates: candidateIds.size };
      },
      reduce: (_s, out) => {
        // Generous ceiling: 1 (start) + rows + candidates, times a 10x
        // buffer so the cap only trips on a real runaway spawn bug, not on
        // normal fan-out. Floored at 50 so tiny runs have headroom.
        const ceiling = Math.max(50, (1 + out.rows + out.candidates) * 10);
        return { setMaxTasks: ceiling };
      },
      spawn: () => [
        ...queueRows.map((row, i): TaskRef => ({ kind: "dev-links-row", input: row.key, node: rowNodes[i] })),
        ...[...candidateIds].sort().map((id, i): TaskRef => ({ kind: "review-candidate", input: id, node: candidateNodes[i] })),
      ],
    };

    const kinds: KindMap<FanoutState> = {
      "start": start as unknown as Kind<Hashable, unknown, FanoutState>,
      "dev-links-row": devLinksRow as unknown as Kind<Hashable, unknown, FanoutState>,
      "review-candidate": reviewCandidate as unknown as Kind<Hashable, unknown, FanoutState>,
    };

    let capped = false;
    let runWarnings: string[] = [];
    let finalCap = 0;
    try {
      const result = await runTasks<FanoutState>(
        { kind: "start", input: null }, kinds, state, {
          concurrency: 6,
          initialMaxTasks: 30,
          onProgress: (e: ProgressEvent) => onProgress(e),
        },
      );
      capped = result.capped;
      runWarnings = result.runWarnings;
      finalCap = result.maxTasks;
    } finally {
      if (atlassian) await atlassian.close();
    }
    if (capped) {
      warnings.push(
        `Digest task cap hit (${finalCap}); some dev-links/reviews work was dropped. This indicates a runaway spawn — please report it.`
      );
    }
    // Surface scheduler-level notices (e.g. a reducer tried to set the cap
    // after it was already set) — these are programming hints, not data loss.
    for (const w of runWarnings) warnings.push(w);

    // Read global state back in deterministic key order (queue order for
    // dev-links, sorted artifact id for reviews-owed).
    for (const row of queueRows) {
      const dl = state.devLinks.get(row.key);
      if (dl) devLinks.push(dl);
    }
    for (const id of [...candidateIds].sort()) {
      const ro = state.reviewsOwed.get(id);
      if (ro) reviewsOwed.push(ro);
    }
  }
  // --- Enrich queue rows with a compact Git column from dev_links ----------
  const devLinksByTask = new Map(devLinks.map((l) => [l.task_key, l]));
  for (const row of queueRows) {
    row.git_summary = gitColumnSummary(devLinksByTask.get(row.key));
  }

  const digest: Digest = {
    date,
    summary: null,
    attention,
    queue: queueRows,
    capacity: digestCapacity,
    reviews,
    suggested_actions: [],
    actions: [],
    corrections: [],
    dev_links: devLinks,
    reviews_owed: reviewsOwed,
    warnings,
    followup: { currentlyWorkingOn: null },
    meta: {
      generated_at: fetchedAt,
      raw_path: "",
      report_path: "",
    },
  };

  // --- Structured action routing table + markdown suggested actions --------
  const actions = buildActions(digest);
  digest.actions = actions;
  digest.suggested_actions = actions.map((a) => a.instruction);

  const report: AuraReport = {
    fetched_at: fetchedAt,
    warnings,
    raw_path: "",
    artifacts_to_verify: artifactsToVerify,
    verifications,
    pending_review_summary: (pendingReviews.items ?? []).map((a) => ({
      artifact_id: a.id,
      title: a.title,
      current_version: a.latest_version,
    })),
    notification_review_events: notificationReviewEvents,
  };

  return { digest, report, raw };
}

/**
 * Verify each candidate artifact's reported review state against the current
 * API state. A reported rejection/revision is "stale" when the artifact has
 * since been advanced to a newer version (current_version > reported_version):
 * the reported decision no longer applies to the current review run.
 *
 * Returns one ArtifactVerification per candidate, preserving the original
 * reported state alongside the current findings.
 */
async function verifyArtifacts(
  client: AuraClient,
  candidates: ArtifactToVerify[]
): Promise<ArtifactVerification[]> {
  const isActionable = (d: string | null) =>
    d === "REJECTED" || d === "NEEDS_REVISION";
  const results = await Promise.all(
    candidates.map(async (c): Promise<ArtifactVerification> => {
      try {
        const current = await client.getArtifactApprovals(c.artifact_id);
        const reportedVersion = c.reported_version;
        const currentVersion = current.version;
        const stale =
          isActionable(c.reported_decision) &&
          reportedVersion !== null &&
          currentVersion > reportedVersion;
        const note = stale
          ? `reported ${c.reported_decision} on v${reportedVersion}, but current is v${currentVersion} (${current.decided_count}/${current.total_required} decided) — already addressed`
          : "";
        return {
          artifact_id: c.artifact_id,
          title: c.title,
          reported: {
            version: reportedVersion,
            decision: c.reported_decision,
            source: c.source,
          },
          current,
          stale,
          note,
        };
      } catch (e) {
        return {
          artifact_id: c.artifact_id,
          title: c.title,
          reported: {
            version: c.reported_version,
            decision: c.reported_decision,
            source: c.source,
          },
          current: null,
          error: e instanceof Error ? e.message : String(e),
          stale: false,
          note: "",
        };
      }
    })
  );
  return results;
}

function summarizeNotifications(items: Notification[]): DigestNotificationItem[] {
  const { baseUrl } = loadAuraClientSettings();
  // The REST API base is e.g. "https://aura.dev-anwalt.de/api"; the app root
  // (where "/tasks?task=…" lives) is that without the "/api" suffix.
  const appRoot = baseUrl ? baseUrl.replace(/\/api\/?$/, "") : null;
  const out: DigestNotificationItem[] = [];
  for (const n of items) {
    const date = safeString(n.created_at).slice(0, 10);
    const type = safeString(n.type) || "notification";
    const p = (n.i18n_params as Record<string, unknown> | undefined) ?? {};
    const actor = safeString(p.actorName) || safeString(p.actor_name);
    const artifactTitle = safeString(p.artifactTitle) || safeString(p.artifact_title);
    const taskTitle = safeString(p.taskTitle) || safeString(p.task_title);
    const version = p.version as number | undefined;
    const decision = safeString(p.decision);
    const target = artifactTitle || taskTitle;
    let line = `${date} — ${type}`;
    if (actor) line += ` by ${actor}`;
    if (target) line += `: ${target}`;
    if (version) line += ` v${version}`;
    if (decision) line += ` (${decision})`;
    const link = safeString(n.link) || null;
    const url = link && appRoot ? `${appRoot}${link.startsWith("/") ? link : `/${link}`}` : null;
    out.push({ line, type, url });
  }
  return out;
}

function extractVerifyTargets(
  notifications: Notification[],
  pendingArtifacts: ArtifactListItem[],
  waitingOnOthersLinks: string[]
): {
  artifactsToVerify: ArtifactToVerify[];
  notificationReviewEvents: AuraReport["notification_review_events"];
} {
  // Aura notification types use dotted names (artifact.review_decided, …).
  const isReviewEvent = (type: string) => type.includes("artifact") && type.includes("review");
  const byId = new Map<string, ArtifactToVerify>();
  const events: AuraReport["notification_review_events"] = [];
  for (const n of notifications) {
    const type = safeString(n.type);
    const p = (n.i18n_params as Record<string, unknown> | undefined) ?? {};
    const artifactId = safeString(p.artifactUuid) || safeString(p.artifact_uuid);
    const artifactTitle = safeString(p.artifactTitle) || safeString(p.artifact_title);
    const version = (p.version as number | null) ?? null;
    const decision = safeString(p.decision) || null;
    if (isReviewEvent(type)) {
      events.push({
        type,
        artifact_id: artifactId || null,
        title: artifactTitle || null,
        version: version ?? null,
        decision,
        created_at: safeString(n.created_at),
      });
      if (artifactId) {
        const existing = byId.get(artifactId);
        // Keep the most "actionable" reported decision (rejection beats approval).
        const decisionRank = (d: string | null) =>
          d === "REJECTED" || d === "NEEDS_REVISION" ? 2 : d === "APPROVED" ? 1 : 0;
        if (!existing || decisionRank(decision) > decisionRank(existing.reported_decision)) {
          byId.set(artifactId, {
            artifact_id: artifactId,
            title: artifactTitle,
            reported_version: version,
            reported_decision: decision,
            source: "notification",
          });
        }
      }
    }
  }
  for (const a of pendingArtifacts) {
    if (!byId.has(a.id)) {
      byId.set(a.id, {
        artifact_id: a.id,
        title: a.title,
        reported_version: a.latest_version ?? null,
        reported_decision: null,
        source: "pending_review",
      });
    }
  }
  for (const link of waitingOnOthersLinks) {
    const m = link.match(/artifact=([0-9a-f-]+)/i);
    if (m && !byId.has(m[1])) {
      byId.set(m[1], {
        artifact_id: m[1],
        title: "",
        reported_version: null,
        reported_decision: null,
        source: "waiting_on_others",
      });
    }
  }
  return {
    artifactsToVerify: [...byId.values()],
    notificationReviewEvents: events,
  };
}

// ===========================================================================
// last-digest store: save / diff / last
// ===========================================================================

function loadLastDigest(): LastDigestStore | null {
  if (!existsSync(LAST_DIGEST_PATH)) return null;
  try {
    return JSON.parse(readFileSync(LAST_DIGEST_PATH, "utf8")) as LastDigestStore;
  } catch (e) {
    console.error(`warning: could not parse ${LAST_DIGEST_PATH}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export function saveLastDigest(
  digest: Digest,
  lastDigestPath?: string,
): void {
  const dest = lastDigestPath ?? join(homedir(), ".pi", "aura", "last-digest.json");
  const presentedAt = new Date().toISOString();
  const store: LastDigestStore = {
    schema_version: LAST_DIGEST_SCHEMA_VERSION,
    presented_at: presentedAt,
    fetched_at: digest.meta?.generated_at ?? presentedAt,
    digest,
  };
  mkdirSync(join(homedir(), ".pi", "aura"), { recursive: true });
  writeFileSync(dest, JSON.stringify(store, null, 2) + "\n", "utf8");
  console.error(`saved last digest to ${dest} (presented ${presentedAt})`);
}
