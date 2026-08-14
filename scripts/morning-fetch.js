// Aura morning digest — parallel data fetch via mcpScript.
// Run with: mcpScript({ code: <this file's contents> })
//
// Fetches all morning-routine data in parallel and returns structured JSON.
// The caller (aura-morning-fetcher agent) post-processes and augments.

const PREFIX = "aura_2d_mcp_2d_dev_";

async function safeCall(name, args = {}) {
  try {
    const result = await tools.call(PREFIX + name, args);
    if (!result.ok) return { error: result.error?.message ?? "unknown error" };
    return result.data;
  } catch (e) {
    return { error: String(e) };
  }
}

// Fire all fetches in parallel
const [
  briefing,
  summary,
  notifications,
  queue,
  capacity,
  pendingReviews,
  alignmentTasks,
  reviewTasks,
] = await Promise.all([
  safeCall("getBoardBriefing", { locale: "en" }),
  safeCall("getBoardSummary"),
  safeCall("listNotifications", {
    limit: 20,
    sort_by: "created_at",
    sort_dir: "desc",
  }),
  safeCall("getMyPriorityQueue"),
  safeCall("getMyCapacity"),
  safeCall("listArtifacts", { pending_review: true, limit: 10 }),
  safeCall("listTasks", {
    role: "STAKEHOLDER",
    view: "mine",
    status_slug: "IN_ALIGNMENT",
    limit: 5,
  }),
  safeCall("listTasks", {
    role: "STAKEHOLDER",
    view: "mine",
    status_slug: "IN_REVIEW",
    limit: 5,
  }),
]);

return {
  briefing,
  attention: summary,
  notifications,
  priority_queue: queue,
  capacity,
  pending_review_artifacts: pendingReviews,
  stakeholder_alignment_tasks: alignmentTasks,
  stakeholder_review_tasks: reviewTasks,
};
