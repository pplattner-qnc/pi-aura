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

import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { createDefaultAuraClient } from "@pi-aura/shared/aura-client";
import type {
  ApprovalDecision,
  AuraClient,
  BoardItem,
  Notification,
  PriorityQueueItem,
  Task,
  ArtifactListItem,
} from "@pi-aura/shared/aura-client";
import { buildAtlassianClient, fetchTaskDevLinks } from "./devlinks.js";
import { loadSettings } from "./settings.js";
import { buildActions } from "./build-actions.js";
import { writeDashboardDigest } from "./write-dashboard-digest.js";
import type {
  ArtifactToVerify,
  ArtifactVerification,
  AuraReport,
  Digest,
  DigestAttention,
  DigestAttentionItem,
  DigestCapacity,
  DigestDiff,
  DigestNotifications,
  DigestQueueRow,
  DigestReview,
  LastDigestStore,
  RawAuraData,
  TaskDevLinks,
  DigestReviewOwed,
} from "./types.js";

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
  // Exact hours (20% -> 1.6); the quarter-hour rounding + ~H:MM formatting
  // happens in fmtHours so the raw digest.json keeps a precise value.
  return (pct * WORKDAY_HOURS) / 100;
}

/** Format hours as "~H:MM" rounded to the nearest quarter hour.
 * null -> "—". */
function fmtHours(hours: number | null): string {
  if (hours === null) return "—";
  // Round to nearest 0.25h, then express as H:MM.
  const rounded = Math.round(hours / 0.25) * 0.25;
  const h = Math.floor(rounded);
  const m = Math.round((rounded - h) * 60);
  return `~${h}:${String(m).padStart(2, "0")}`;
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

function fmtPct(pct: number | null): string {
  if (pct === null) return "—";
  return `${pct}%`;
}

function fail(msg: string, usage?: string, code = 2): never {
  console.error(msg);
  if (usage) console.error(usage);
  process.exit(code);
}

const USAGE = `Usage:
  node aura.mjs fetch                 create temp dir, fetch Aura data (+ verification), print path
  node aura.mjs render <dir> [out]    render <dir>/digest.json to markdown (stdout or <out>)
  node aura.mjs cleanup <dir>         delete <dir>
  node aura.mjs save <dir>            save <dir>/digest.json as the last presented digest
  node aura.mjs diff <dir>            print what changed since the last saved digest (JSON)
  node aura.mjs last                  print the last saved digest (JSON)`;

/** Path to the persistent last-digest store. */
const LAST_DIGEST_PATH = join(homedir(), ".pi", "aura", "last-digest.json");
/** Path to the live dashboard digest file (SPA data source). */
const DASHBOARD_DIGEST_PATH = join(homedir(), ".pi", "aura", "digest.json");
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

async function fetchAction(): Promise<void> {
  const outDir = join(tmpdir(), `aura-morning-${randomBytes(6).toString("hex")}`);
  mkdirSync(outDir, { recursive: true });

  const aura = await createDefaultAuraClient();
  const warnings: string[] = [];

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
        version: 0, // filled by the orchestrator from getArtifactApprovals
        decisions: [],
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

  // --- Dev links: related PRs / branches per queue task --------------------
  // Fetch each queue task's detail (for jira_issues + description), then fan
  // out across Teamwork Graph (primary) + GitHub `gh search` + Bitbucket. The
  // Aura client is still open for getTaskByHumanKey; the Atlassian client is
  // built separately (OAuth token from the keyring) and degrades to null if
  // unavailable. Disabled when no auraDigest settings are present.
  const settings = loadSettings();
  const devLinks: TaskDevLinks[] = [];
  if (!settings.digest) {
    warnings.push("Dev-links feature disabled: no `aura.digest` block in settings.json (set it to enable Teamwork Graph + GitHub + Bitbucket PR/branch lookup).");
  } else {
    const { client: atlassian, warning: atlWarning } = await buildAtlassianClient(settings.mcpServers.atlassian);
    if (atlWarning) warnings.push(atlWarning);
    try {
      // Fetch each queue task's detail, then also its children's details so we
      // collect subtask Jira keys too — PRs often live on a subtask's Jira key,
      // not the parent's (e.g. AURA-742's own Jira has no PRs; its sibling
      // AURA-932 -> ANW-8184 has the OTEL PR). Merge child jira_issues in.
      const taskDetails = await Promise.all(
        queueRows.map((row) =>
          aura.getTaskByHumanKey(row.key)
            .catch(() => null)
        )
      );
      for (const detail of taskDetails) {
        if (!detail) continue;
        // Pull in children's Jira keys (one getTaskByHumanKey per child).
        const childKeys = (detail.children ?? []).map((c) => c.human_key).filter(Boolean);
        if (childKeys.length > 0) {
          const childDetails = await Promise.all(
            childKeys.map((k) =>
              aura.getTaskByHumanKey(k).catch(() => null)
            )
          );
          const childJira = childDetails
            .filter((c): c is Task => c !== null)
            .flatMap((c) => c.jira_issues ?? []);
          if (childJira.length > 0) {
            detail.jira_issues = [...(detail.jira_issues ?? []), ...childJira];
          }
        }
        devLinks.push(await fetchTaskDevLinks(detail, settings.digest, settings.mcpServers, atlassian));
      }
    } finally {
      if (atlassian) await atlassian.close();
    }
  }

  // --- Reviews I owe: artifacts assigned to me as reviewer, not yet decided ---
  // Candidates come from the `artifact.review_assigned` notifications (they're
  // addressed to me by definition). For each, call getArtifactReview and keep
  // only those where my reviewer row is still ASSIGNED. My user_id is derived
  // from the first review I initiated (is_initiator: true) among the reviews
  // already in d.reviews; fallback: match reviewer by name "Plattner, Patric".
  const reviewsOwed: DigestReviewOwed[] = [];
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
  if (candidateIds.size > 0) {
    // Find my user id: from a review I initiated (my own artifact in d.reviews).
    let myUserId: string | null = null;
    for (const r of reviews) {
      try {
        const ar = await aura.getArtifactReview(r.artifact_id);
        if (ar.is_initiator && ar.initiator) { myUserId = ar.initiator.user_id; break; }
      } catch { /* ignore */ }
    }
    const myName = "Plattner, Patric";
    for (const id of candidateIds) {
      try {
        const ar = await aura.getArtifactReview(id);
        // Find my reviewer row by user_id (preferred) or name fallback.
        const me = ar.reviewers.find(
          (rv) => (myUserId && rv.user_id === myUserId) || rv.user_name === myName
        );
        if (me && me.status === "ASSIGNED") {
          reviewsOwed.push({
            artifact_id: id,
            title: ar.review_artifacts?.[0]?.title ?? titleById.get(id) ?? "",
            version: ar.version,
            deadline: ar.review_deadline_at ?? null,
            initiator: ar.initiator?.user_name ?? null,
            review_started_at: ar.review_started_at ?? null,
          });
        }
      } catch { /* ignore unreachable artifacts */ }
    }
  }
  // --- Enrich queue rows with a compact Git column from dev_links ----------
  const devLinksByTask = new Map(devLinks.map((l) => [l.task_key, l]));
  for (const row of queueRows) {
    row.git_summary = gitColumnSummary(devLinksByTask.get(row.key));
  }

  const rawPath = resolve(outDir, "raw.json");
  const digestPath = resolve(outDir, "digest.json");
  const reportPath = resolve(outDir, "report.json");

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
      raw_path: rawPath,
      report_path: reportPath,
    },
  };

  // --- Structured action routing table + markdown suggested actions --------
  const actions = buildActions(digest);
  digest.actions = actions;
  digest.suggested_actions = actions.map((a) => a.instruction);

  const report: AuraReport = {
    fetched_at: fetchedAt,
    warnings,
    raw_path: rawPath,
    artifacts_to_verify: artifactsToVerify,
    verifications,
    pending_review_summary: (pendingReviews.items ?? []).map((a) => ({
      artifact_id: a.id,
      title: a.title,
      current_version: a.latest_version,
    })),
    notification_review_events: notificationReviewEvents,
  };

  writeFileSync(rawPath, JSON.stringify(raw, null, 2) + "\n", "utf8");
  writeFileSync(digestPath, JSON.stringify(digest, null, 2) + "\n", "utf8");
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  // Write the full corrected digest to the stable dashboard path.
  // Failure is non-fatal: the temp-dir digest is the source of truth for
  // render/save/diff, and the dashboard file is a best-effort SPA data source.
  try {
    writeDashboardDigest(digest, DASHBOARD_DIGEST_PATH);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    warnings.push(`Could not write dashboard digest to ${DASHBOARD_DIGEST_PATH}: ${message}`);
  }

  // stdout: a single machine-parseable line. stderr: human progress.
  console.log(`output directory: ${outDir}/`);
  console.error(`fetched ${fetchedAt}`);
  console.error(`  raw:     ${rawPath}`);
  console.error(`  digest:  ${digestPath}`);
  console.error(`  report:  ${reportPath}`);
  console.error(`  queue rows: ${queueRows.length}, artifacts verified: ${verifications.length} (${verifications.filter((v) => v.stale).length} stale), dev links: ${devLinks.length} tasks`);
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

function summarizeNotifications(items: Notification[]): string[] {
  const lines: string[] = [];
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
    lines.push(line);
  }
  return lines;
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
// render
// ===========================================================================

function attentionLine(emoji: string, label: string, items: DigestAttentionItem[]): string {
  if (items.length === 0) return `- ${emoji} **${label}:** None`;
  const parts = items.map((i) => {
    let s = `${i.key} — ${i.title}`;
    if (i.days) s += ` (${i.days}d)`;
    return s;
  });
  return `- ${emoji} **${label}:** ${parts.join("; ")}`;
}

function renderAttention(d: Digest): string {
  const lines: string[] = ["### Needs your attention"];
  lines.push(attentionLine("🔴", "Overdue", d.attention.overdue));
  lines.push(attentionLine("🟡", "Waiting on you", d.attention.waiting_on_you));
  lines.push(attentionLine("🔵", "Waiting on others", d.attention.waiting_on_others ?? []));
  const since = d.attention.notifications.since_last_run.length > 0
    ? d.attention.notifications.since_last_run.join("\n  - ")
    : "Nothing new since last run.";
  lines.push(`- 📬 **Since last run:** ${since}`);
  const older = d.attention.notifications.older_unread.length > 0
    ? d.attention.notifications.older_unread.join("\n  - ")
    : "No unread notifications.";
  lines.push(`- 📬 **Older unread:** ${older}`);
  return lines.join("\n");
}

function renderQueue(d: Digest): string {
  const lines: string[] = ["### Today's queue", ""];
  if (d.queue.length === 0) {
    lines.push("_No tasks in the queue._");
    return lines.join("\n");
  }
  lines.push("| # | Task [key] | Status | Role | Cap | Hours | Git |");
  lines.push("|---|-------------|--------|------|-----|------|-----|");
  for (const row of d.queue) {
    lines.push(
      `| ${row.rank} | ${row.title} [${row.key}] | ${row.status} | ${row.role} | ${fmtPct(row.capacity_pct)} | ${fmtHours(row.hours)} | ${row.git_summary ?? ""} |`
    );
  }
  const committedRows = d.queue.filter((r) => r.capacity_pct !== null && r.capacity_pct > 0);
  const totalPct = committedRows.reduce((s, r) => s + (r.capacity_pct ?? 0), 0);
  const totalHours = committedRows.reduce((s, r) => s + (r.hours ?? 0), 0);
  lines.push(
    `|   | **Committed** | | | **${totalPct}%** | **${fmtHours(totalHours)}** | |`
  );
  lines.push("");
  lines.push(`_8hr workday → hours = capacity% × ${WORKDAY_HOURS}, rounded to ¼h_`);
  return lines.join("\n");
}

function renderCapacity(d: Digest): string {
  const c = d.capacity;
  const warn = c.over ? " ⚠️ over-committed" : "";
  return [
    "### Capacity",
    "",
    `- Base: ${c.base_pct}% | Committed: ${c.committed_pct}% | Free: ${c.free_pct}% | Utilization: ${c.utilization_pct}%${warn}`,
    `- Committed hours: **${c.total_hours.toFixed(1)}h** / ${WORKDAY_HOURS}h workday`,
  ].join("\n");
}

function decisionEmoji(d: ApprovalDecision): string {
  if (!d.decided) return "⏳";
  const dec = d.decision.toUpperCase();
  if (dec === "APPROVED") return "✅";
  if (dec === "REJECTED" || dec === "NEEDS_REVISION") return "❌";
  return "•";
}

function renderReviews(d: Digest): string {
  const lines: string[] = ["### Reviews due", ""];
  if (d.reviews.length === 0) {
    lines.push("Nothing pending.");
    return lines.join("\n");
  }
  // Terse table: one row per artifact, one column per reviewer (emoji only,
  // all reviewers present). Column headers are first names to keep it narrow.
  const allReviewerNames: string[] = [];
  const seen = new Set<string>();
  for (const r of d.reviews) {
    for (const dec of r.decisions) {
      const first = dec.user_name.split(",")[0].trim();
      if (!seen.has(first)) { seen.add(first); allReviewerNames.push(first); }
    }
  }
  const header = ["Artifact", "v", ...allReviewerNames];
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`|${header.map(() => "---").join("|")}|`);
  for (const r of d.reviews) {
    const byName = new Map(r.decisions.map((dec) => [dec.user_name.split(",")[0].trim(), decisionEmoji(dec)]));
    const cells = allReviewerNames.map((n) => byName.get(n) ?? "");
    lines.push(`| ${r.title} | ${r.version} | ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

/** Render the "reviews I owe" list (artifacts assigned to me, not yet decided). */
function renderReviewsOwed(d: Digest): string {
  const lines: string[] = ["### Reviews I owe", ""];
  const owed = d.reviews_owed ?? [];
  if (owed.length === 0) {
    lines.push("_None — you're not blocking any reviews._");
    return lines.join("\n");
  }
  for (const r of owed) {
    const deadline = r.deadline ? ` (due ${r.deadline.slice(0, 10)})` : "";
    const initiator = r.initiator ? ` — from ${r.initiator}` : "";
    lines.push(`- **${r.title}** v${r.version}${deadline}${initiator}`);
  }
  return lines.join("\n");
}

function renderCorrections(d: Digest): string {
  const lines: string[] = ["### Corrections", ""];
  const stale = d.corrections.filter((c) => c.stale);
  if (stale.length === 0) {
    lines.push("_All reported review states match current versions._");
    return lines.join("\n");
  }
  for (const c of stale) {
    // The correction note is self-describing (it includes the reported state,
    // current version, and verdict), so we just prefix the title.
    lines.push(`- **${c.title}** — ${c.note}`);
  }
  return lines.join("\n");
}

function renderSuggestedActions(d: Digest): string {
  const lines: string[] = ["### Suggested actions", ""];
  if (d.suggested_actions.length === 0) {
    lines.push("_No suggestions._");
    return lines.join("\n");
  }
  d.suggested_actions.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
  return lines.join("\n");
}

/** Render a warnings block at the bottom when any non-fatal degradation happened
 * (e.g. Teamwork Graph skipped because the keyring read failed). Omitted when
 * everything ran fully, so a clean digest has no warnings block. */
function renderWarnings(d: Digest): string {
  const warnings = d.warnings ?? [];
  if (warnings.length === 0) return "";
  const lines: string[] = ["### ⚠️ Warnings", ""];
  for (const w of warnings) lines.push(`- ${w}`);
  return lines.join("\n");
}

function stateEmoji(state: string): string {
  const s = state.toUpperCase();
  if (s === "OPEN") return "🟢";
  if (s === "MERGED") return "✅";
  if (s === "CLOSED" || s === "DECLINED") return "⚫";
  return "•";
}

function renderDevLinks(d: Digest): string {
  const lines: string[] = ["### Dev links", ""];
  const links = d.dev_links ?? [];
  if (links.length === 0) {
    lines.push("_No dev-links configured (set auraDigest in settings to enable)._");
    return lines.join("\n");
  }
  const withPrs = links.filter((l) => l.pull_requests.length > 0 || l.branches.length > 0);
  if (withPrs.length === 0) {
    lines.push("_No related PRs or branches found for queue tasks._");
    return lines.join("\n");
  }
  // Numbered list; task key inlined into each line (no separate header).
  let n = 0;
  for (const l of withPrs) {
    for (const pr of l.pull_requests) {
      n++;
      const keyPart = `${l.task_key}: `;
      lines.push(
        `${n}. ${keyPart}${stateEmoji(pr.state)} [${pr.provider} #${pr.id}](${pr.url}) — ${pr.title} (${pr.state.toLowerCase()})`
      );
    }
    for (const b of l.branches) {
      n++;
      lines.push(`${n}. ${l.task_key}: 🌿 ${b.provider} \`${b.repo}\` **${b.name}**`);
    }
  }
  const errs = links.flatMap((l) => l.errors.map((e) => `${l.task_key}: ${e}`));
  if (errs.length > 0) {
    lines.push("");
    lines.push("_errors:_");
    for (const e of errs.slice(0, 3)) lines.push(`  - ${e}`);
  }
  return lines.join("\n");
}

function render(d: Digest): string {
  const sections: string[] = [];
  const day = new Date(d.date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  sections.push(`## Morning briefing — ${day}`, "");
  if (d.summary) {
    sections.push(`> ${d.summary.replace(/\n/g, "\n> ")}`, "");
  }
  sections.push(renderAttention(d), "");
  sections.push(renderQueue(d), "");
  sections.push(renderCapacity(d), "");
  sections.push(renderReviews(d), "");
  sections.push(renderReviewsOwed(d), "");
  sections.push(renderCorrections(d), "");
  sections.push(renderDevLinks(d), "");
  sections.push(renderSuggestedActions(d), "");
  const w = renderWarnings(d);
  if (w) sections.push(w, "");
  return sections.join("\n") + "\n";
}

function renderAction(): void {
  const dir = process.argv[3];
  const outPath = process.argv[4];
  if (!dir) fail("render: missing <dir> argument", USAGE);
  const digestPath = join(dir, "digest.json");
  if (!existsSync(digestPath)) fail(`render: ${digestPath} not found`);
  let d: Digest;
  try {
    d = JSON.parse(readFileSync(digestPath, "utf8")) as Digest;
  } catch (e) {
    fail(`render: failed to parse ${digestPath}: ${e instanceof Error ? e.message : String(e)}`, undefined, 1);
  }
  const md = render(d);
  if (outPath) {
    writeFileSync(outPath, md, "utf8");
    console.error(`rendered ${outPath}`);
  } else {
    process.stdout.write(md);
  }
}

// ===========================================================================
// cleanup
// ===========================================================================

function cleanupAction(): void {
  const dir = process.argv[3];
  if (!dir) fail("cleanup: missing <dir> argument", USAGE);
  if (!existsSync(dir)) fail(`cleanup: ${dir} not found`);
  rmSync(dir, { recursive: true, force: true });
  console.error(`cleaned up ${dir}`);
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

function saveAction(): void {
  const dir = process.argv[3];
  if (!dir) fail("save: missing <dir> argument", USAGE);
  const digestPath = join(dir, "digest.json");
  if (!existsSync(digestPath)) fail(`save: ${digestPath} not found`);
  const digest = JSON.parse(readFileSync(digestPath, "utf8")) as Digest;
  const presentedAt = new Date().toISOString();
  const store: LastDigestStore = {
    schema_version: LAST_DIGEST_SCHEMA_VERSION,
    presented_at: presentedAt,
    fetched_at: digest.meta?.generated_at ?? presentedAt,
    digest,
  };
  mkdirSync(join(homedir(), ".pi", "aura"), { recursive: true });
  writeFileSync(LAST_DIGEST_PATH, JSON.stringify(store, null, 2) + "\n", "utf8");
  console.error(`saved last digest to ${LAST_DIGEST_PATH} (presented ${presentedAt})`);
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso.slice(0, 10) + "T00:00:00").getTime();
  const b = new Date(bIso.slice(0, 10) + "T00:00:00").getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Compute a structured delta between a previous digest and the current one. */
function computeDiff(prev: Digest, cur: Digest): DigestDiff {
  const prevQueue = new Map(prev.queue.map((r) => [r.key, r]));
  const curQueue = new Map(cur.queue.map((r) => [r.key, r]));
  const queue_added = cur.queue.filter((r) => !prevQueue.has(r.key));
  const queue_removed = prev.queue.filter((r) => !curQueue.has(r.key));
  const queue_status_changed = cur.queue
    .filter((r) => prevQueue.has(r.key) && prevQueue.get(r.key)!.status !== r.status)
    .map((r) => ({ key: r.key, title: r.title, from: prevQueue.get(r.key)!.status, to: r.status }));

  const capacity_delta_pct = cur.capacity.committed_pct - prev.capacity.committed_pct;
  const capacity_delta_hours = cur.capacity.total_hours - prev.capacity.total_hours;

  const prevReviews = new Map(prev.reviews.map((r) => [r.artifact_id, r]));
  const reviews_added = cur.reviews.filter((r) => !prevReviews.has(r.artifact_id));
  const reviews_progressed = cur.reviews
    .filter((r) => prevReviews.has(r.artifact_id))
    .map((r) => {
      const p = prevReviews.get(r.artifact_id)!;
      return {
        artifact_id: r.artifact_id,
        title: r.title,
        from_decided: p.decided_count,
        to_decided: r.decided_count,
        from_version: p.version,
        to_version: r.version,
      };
    })
    .filter((d) => d.to_decided > d.from_decided || d.to_version > d.from_version);

  const prevCorr = new Map(prev.corrections.map((c) => [c.artifact_id, c]));
  const curCorr = new Map(cur.corrections.map((c) => [c.artifact_id, c]));
  // Resolved: was stale last time, not stale (or absent) now.
  const corrections_resolved = prev.corrections.filter(
    (c) => c.stale && (!curCorr.has(c.artifact_id) || !curCorr.get(c.artifact_id)!.stale)
  );
  const corrections_new = cur.corrections.filter(
    (c) => c.stale && !prevCorr.has(c.artifact_id)
  );

  const prevOverdue = new Map(prev.attention.overdue.map((i) => [i.key, i]));
  const curOverdue = new Map(cur.attention.overdue.map((i) => [i.key, i]));
  const overdue_added = cur.attention.overdue.filter((i) => !prevOverdue.has(i.key));
  const overdue_cleared = prev.attention.overdue.filter((i) => !curOverdue.has(i.key));

  return {
    queue_added,
    queue_removed,
    queue_status_changed,
    capacity_delta_pct,
    capacity_delta_hours,
    reviews_added,
    reviews_progressed,
    corrections_resolved,
    corrections_new,
    overdue_added,
    overdue_cleared,
    days_elapsed: daysBetween(prev.date, cur.date),
  };
}

function diffAction(): void {
  const dir = process.argv[3];
  if (!dir) fail("diff: missing <dir> argument", USAGE);
  const curPath = join(dir, "digest.json");
  if (!existsSync(curPath)) fail(`diff: ${curPath} not found`);
  const last = loadLastDigest();
  if (!last) {
    console.error(`no previous digest found at ${LAST_DIGEST_PATH}`);
    process.stdout.write(JSON.stringify({ first_run: true }, null, 2) + "\n");
    return;
  }
  const cur = JSON.parse(readFileSync(curPath, "utf8")) as Digest;
  const diff = computeDiff(last.digest, cur);
  process.stdout.write(JSON.stringify(diff, null, 2) + "\n");
}

function lastAction(): void {
  const last = loadLastDigest();
  if (!last) {
    console.error(`no last digest found at ${LAST_DIGEST_PATH}`);
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(last, null, 2) + "\n");
}

// ===========================================================================
// dispatch
// ===========================================================================

async function main(): Promise<void> {
  const action = process.argv[2];
  switch (action) {
    case "fetch":
      await fetchAction();
      return;
    case "render":
      renderAction();
      return;
    case "cleanup":
      cleanupAction();
      return;
    case "save":
      saveAction();
      return;
    case "diff":
      diffAction();
      return;
    case "last":
      lastAction();
      return;
    default:
      fail(
        action ? `unknown action: ${action}` : "missing action",
        USAGE
      );
  }
}

main().catch((e: unknown) => {
  console.error("aura failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
